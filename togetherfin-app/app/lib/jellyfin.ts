// mostly pasted from https://github.com/javaarchive/syncfin/blob/main/src/jellyfin_helper.ts
import { Jellyfin } from "@jellyfin/sdk";
import type { Api } from "@jellyfin/sdk";
import { getMediaInfoApi } from "@jellyfin/sdk/lib/utils/api/media-info-api";
import { getDynamicHlsApi } from "@jellyfin/sdk/lib/utils/api/dynamic-hls-api";
import type { BaseItemDto, MediaSourceInfo } from "@jellyfin/sdk/lib/generated-client/models";
import type { Profile } from "./device_profile";
import type { HostPlayableItem } from "./room";
import { parse, types, stringify } from 'hls-parser';
import type { MasterPlaylist, MediaPlaylist, Segment } from "hls-parser/types";
import cryptoHelper from "./crypto";

// TODO: get the app to never try SSRing but vite wants to do this for some reason
if(typeof localStorage == "undefined"){
    console.warn("localStorage is undefined, injecting a shim");
    const localStorageMap = new Map<string, string>();
    // @ts-ignore
    globalThis["localStorage"] = {
        getItem(key: string){
            return localStorageMap.get(key) || null;
        },
        setItem(key: string, value: string){
            localStorageMap.set(key, value);
        },
        removeItem(key: string){
            localStorageMap.delete(key);
        }
    };
}

export function getPerDeviceRandID(): string{
    if(typeof localStorage.getItem('device-id') == "string"){
        return (localStorage.getItem('device-id') as string);
    }
    const id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('device-id', id);
    return id;
}

export function getServerUrl(){
    return localStorage.getItem('server-url');
}
  
export function getAuth(){
    return localStorage.getItem('api-key');
}

export function hasCredentials(){
    return getServerUrl() && getAuth() && true;
}

export const jellyfin = new Jellyfin({
    clientInfo: {
        name: 'Togetherfin Client',
        version: '1.0.0'
    },
    deviceInfo: {
        name: 'Togetherfin',
        id: getPerDeviceRandID()
    }
});

let globalApi: Api | null = null;

export function getApi(): Api {
    if(globalApi == null){
        globalApi = jellyfin.createApi(getServerUrl() as string, localStorage.getItem('api-key') as string); // this can be null and it'll be unauthenticxated
    }
    return globalApi;
}

export function jellyfinRelativePath(path: string): string{
    return getServerUrl() + path;
}

export function updateCachedUserID(userId: string){
    localStorage.setItem('user-id', userId);
}

export function getUserID(){
    const userID = localStorage.getItem('user-id');
    if(userID && userID.length > 0){
        return userID;
    }else{
        throw new Error("No cached user id in local storage");
    }
}

export async function tryLogin(serverUrl: string, username: string, password: string): Promise<boolean> {
    const api = jellyfin.createApi(serverUrl);
    const authResp = await api.authenticateUserByName(username, password);
    const authData = authResp.data;
    if(typeof authData["AccessToken"] == "string"){
        localStorage.setItem('api-key', authData["AccessToken"]);
        localStorage.setItem('server-url', serverUrl);
        if(authData["User"] && authData["User"]["Id"] && authData["User"]["Id"].length > 0){
            const userId = authData["User"]["Id"];
            updateCachedUserID(userId);
        }else{
            console.warn("No user id in auth response?");
        }
        // reset global api
        globalApi = null;
        getApi();
        return true;
    }else{
        console.warn("Got bad auth response from jellyfin", authData, JSON.stringify(authResp,null,4));
        return false;
    }
}

export function getWsUrl(){
    const api = getApi();
    // https://github.com/jellyfin/jellyfin-vue/blob/master/frontend/src/plugins/remote/socket.ts
    const socketParameters = new URLSearchParams({
        api_key: api.accessToken,
        deviceId: getPerDeviceRandID(),
      }).toString();

      return `${api.basePath}/socket?${socketParameters}`
        .replace('https:', 'wss:')
        .replace('http:', 'ws:');
}

export function createWebsocket(){
    const ws = new WebSocket(getWsUrl());
    return ws;
}

let globalWebsocket: WebSocket | null = null;

export function getWebsocket(): WebSocket {
    if(globalWebsocket == null){
        globalWebsocket = createWebsocket();
    }
    return globalWebsocket;
}

export function getMediaPrettyName(item: BaseItemDto): string {
    if(item.Type == "Episode"){
        return item.SeriesName + " " + item.SeasonName + " - " + item.Name;
    }else if(item.Type == "Movie"){
        return item.Name || "Unknown Movie";
    }else{
        return item.Name || "Unknown Media";
    }
}

function formatBitrate(bytesPerSecond: number): string {
    if(bytesPerSecond < 1000){
        return bytesPerSecond + " bytes/s";
    }else if(bytesPerSecond < 1000000){
        return (bytesPerSecond / 1000).toFixed(2) + " kbps";
    }else{
        return (bytesPerSecond / 1000000).toFixed(2) + " mbps";
    }
}

export function describeMediaSource(item: MediaSourceInfo): string {
    if(!item.MediaStreams) return "Unknown Media Source";
    const videoStream = item.MediaStreams.find((stream) => stream.Type == "Video") || {BitRate: 0};
    const audioTypes = item.MediaStreams.filter((stream) => stream.Type == "Audio").map((stream) => stream.Language + " " + stream.Codec);
    return item.Container + " " + formatBitrate(videoStream.BitRate || 0) + " audio: " + audioTypes.join(", ");
}


export const defaultProfiles = [
    {
        name: "My wifi is mid",
        maxWidth: 1920,
        videoBitRate: 6 * 1024 * 1024
        // maybe opus codec? not sure if this works.
    },
    // TODO: 720p my wifi is shit
]

export function getProfiles(): Profile[] {
    try{
        const json = JSON.parse(localStorage.getItem('profiles') || "[]");
        if(json.length > 0){
            return json;
        }else{
            throw new Error("No profiles in local storage");
        }
    }catch(ex){
        console.warn("Failed to parse profiles from localStorage, resetting to default", ex);
        localStorage.setItem('profiles', JSON.stringify(defaultProfiles));
        return defaultProfiles;
    }
}

const defaultSegmentOptions = {
    minSegments: 1,
    segmentLength: 5
}

interface SegmentWrapper {
    segment: Segment;
    start: number;
    end: number;
    duration: number;
    id: string;
}

// TODO: write a better describeMeidaSource
export class Streamer {

    profile: Profile;
    item: HostPlayableItem;
    PlaySessionId: string | null = null;
    mediaBaseTime: number = 0;
    masterPlaylist?: MasterPlaylist;
    mainPlaylist?: MediaPlaylist;
    active: boolean = true;
    segments: SegmentWrapper[] = [];
    publicToPrivate: Map<string, SegmentWrapper> = new Map();
    publicHlsPlaylistString: string = "";
    initPromise: Promise<void>;
    id: string = "_";

    constructor(profile: Profile, item: HostPlayableItem){
        this.profile = profile;
        this.item = item;
        this.mediaBaseTime = Date.now();
        this.initPromise = this.init();
    }

    waitInit(): Promise<void> {
        return this.initPromise;
    }

    async init(){
        // random hex
        this.id = "_" + (await cryptoHelper.hash(cryptoHelper.generateSalt(), "SHA-256"));

        const api = getApi();
        const mediaInfoApi = getMediaInfoApi(api);
        const resp = await mediaInfoApi.getPlaybackInfo({
            itemId: this.item.libraryItem.Id || "",
            userId: getUserID(),
        });
        if(resp.data.PlaySessionId){
            this.PlaySessionId = resp.data.PlaySessionId;
        }else{
            console.warn("No PlaySessionId in playback info response, tracking may not work");
        }
        // build payload
        const playlistRequestPayload = {
            itemId: this.item.libraryItem.Id || "",
            mediaSourceId: this.item.mediaSource.Id || "",
            deviceId: getPerDeviceRandID(),
            ...defaultSegmentOptions,
            ...this.profile
        };
        // fetch master playlist
        const dynamicHlsApi = getDynamicHlsApi(api);
        const masterPlaylistResp = await dynamicHlsApi.getMasterHlsVideoPlaylist(playlistRequestPayload);
        const masterPlaylistStr = masterPlaylistResp.data as any as string; // smh types wrong
        const masterPlaylist = parse(masterPlaylistStr) as MasterPlaylist;
        // fetch main playlist
        const mainPlaylistResp = await dynamicHlsApi.getVariantHlsVideoPlaylist(playlistRequestPayload)
        const mainPlaylistStr = mainPlaylistResp.data as any as string; // smh types wrong
        this.mainPlaylist = parse(mainPlaylistStr) as MediaPlaylist;
        console.log("loaded playlists for streamer of profile", this.profile);

        // process segments
        let curStart = 0;
        for(const segment of this.mainPlaylist.segments){
            const start = curStart + 0;
            const end = curStart + segment.duration;
            const networkID = await cryptoHelper.hashString(segment.uri);
            const segmentWrapper: SegmentWrapper = {
                segment: segment,
                start: start,
                end: end,
                duration: segment.duration,
                id: networkID
            };
            this.segments.push(segmentWrapper);
            this.publicToPrivate.set(networkID, segmentWrapper);
            curStart += segment.duration;
        }

        const publicPlaylist = parse(mainPlaylistStr) as MediaPlaylist;
        publicPlaylist.segments = publicPlaylist.segments.map((segment, i) => {
            segment.uri = this.segments[i].id || segment.uri;
            return segment;
        });
        const publicPlaylistStr = stringify(publicPlaylist);
        this.publicHlsPlaylistString = publicPlaylistStr;
        // @ts-ignore
        window["streamer"] = this;
    }

    getPublicPlaylist(): string {
        return this.publicHlsPlaylistString;
    }

    seek(time: number){
        this.mediaBaseTime = time;
    }

    tick(){

    }

    cancel(){
        this.active = false;
    }

    async fetchPrivateUrl(path: string): Promise<Blob> {
        const url = new URL(path, getServerUrl() || "http://localhost:8096");
        const resp = await fetch(url.toString(), {
            method: "GET",
            headers: {
                "Authorization": "Bearer " + getAuth()
            }
        });
        if(!resp.ok){
            throw new Error("Failed to get private file: " + (await resp.text()));
        }
        return (await resp.blob());
    }
}