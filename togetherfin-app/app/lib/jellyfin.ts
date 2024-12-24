// mostly pasted from https://github.com/javaarchive/syncfin/blob/main/src/jellyfin_helper.ts
import { Jellyfin } from "@jellyfin/sdk";
import type { Api } from "@jellyfin/sdk";
import { getMediaInfoApi } from "@jellyfin/sdk/lib/utils/api/media-info-api";
import { getDynamicHlsApi } from "@jellyfin/sdk/lib/utils/api/dynamic-hls-api";
import { SubtitleDeliveryMethod, type BaseItemDto, type MediaSourceInfo } from "@jellyfin/sdk/lib/generated-client/models";
import { defaultDeviceProfile, type Profile } from "./device_profile";
import type { HostPlayableItem, Room } from "./room";
import { parse, types, stringify } from 'hls-parser';
import type { MasterPlaylist, MediaPlaylist, Rendition, Segment, Variant } from "hls-parser/types";
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

export function generateAuthorizationHeader(): string {
    let value = `MediaBrowser Client="Togetherfin", Device="Togetherfin Client", DeviceId="${getPerDeviceRandID()}", Version="1.0.0"`;
    value += `, Token="${encodeURIComponent(getAuth() || "")}"`;
    return value;
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
    segmentLength: 5,
    segmentContainer: "mp4",
    subtitleMethod: SubtitleDeliveryMethod.Hls
}

interface SegmentWrapper {
    segment: Segment;
    start: number;
    end: number;
    duration: number;
    id: string;
    tag?: string;
}

export const PAST_BUFFER = 15 * 1000; // 15 seconds
export const FUTURE_BUFFER = 60 * 1000; // 60 seconds
export const FUTURE_BUFFER_NONHOST = 20 * 1000; // 20 seconds


// TODO: write a better describeMediaSource
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
    publicHlsMainPlaylistString: string = "";
    publicHlsMasterPlaylistString: string = "";
    initPromise: Promise<void>;
    id: string = "_";
    paused = false;
    currentTime = 0;
    room: Room;
    cache = new Map<string, Blob>();

    constructor(profile: Profile, item: HostPlayableItem, room: Room){
        this.profile = profile;
        this.item = item;
        this.mediaBaseTime = Date.now();
        this.initPromise = this.init();
        this.room = room;
    }

    waitInit(): Promise<void> {
        return this.initPromise;
    }

    async init(){
        // random hex
        this.id = "_" + (await cryptoHelper.hash(cryptoHelper.generateSalt(), "SHA-256"));

        const api = getApi();
        const mediaInfoApi = getMediaInfoApi(api);
        const audioStreamIndex = this.item.audioTrack.Index || 0;
        const subtitleTrackIndex = this.item.subtitleTrack ? this.item.subtitleTrack.Index : null;
        /*const resp = await mediaInfoApi.getPlaybackInfo({
            itemId: this.item.libraryItem.Id || "",
            userId: getUserID(),
        });*/
        const resp = await mediaInfoApi.getPostedPlaybackInfo({
            ...(this.profile as any),
            itemId: this.item.libraryItem.Id || "",
            userId: getUserID(),
            autoOpenLiveStream: true,
            audioStreamIndex: audioStreamIndex,
            playbackInfoDto: {
                DeviceProfile: defaultDeviceProfile.DeviceProfile as any, // TODO; check types tbh
            },
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
            ...this.profile,
            audioStreamIndex: audioStreamIndex,
            subtitleStreamIndex: subtitleTrackIndex ? subtitleTrackIndex : undefined
        };
        // fetch master playlist
        const dynamicHlsApi = getDynamicHlsApi(api);
        const masterPlaylistResp = await dynamicHlsApi.getMasterHlsVideoPlaylist(playlistRequestPayload);
        const masterPlaylistStr = masterPlaylistResp.data as any as string; // smh types wrong
        const masterPlaylist = parse(masterPlaylistStr) as MasterPlaylist;
        this.masterPlaylist = masterPlaylist;
        // fetch main playlist
        const mainPlaylistResp = await dynamicHlsApi.getVariantHlsVideoPlaylist(playlistRequestPayload);
        const mainPlaylistStr = mainPlaylistResp.data as any as string; // smh types wrong
        this.mainPlaylist = parse(mainPlaylistStr) as MediaPlaylist;
        console.log("loaded playlists for streamer of profile", this.profile);

        // process segments
        this.publicHlsMainPlaylistString = await this.rewritePlaylist(mainPlaylistStr, jellyfinRelativePath("/videos/" + this.item.libraryItem.Id + "/main.m3u8"));
        this.publicHlsMasterPlaylistString = await this.rewritePlaylist(masterPlaylistStr, jellyfinRelativePath("/videos/" + this.item.libraryItem.Id + "/master.m3u8"));
        // modify cache of these segments
        // TODO: hook fetch to modify on demand if needed

        // @ts-ignore
        window["streamer"] = this;
    }

    intersects(segment: SegmentWrapper, min: number, max: number): boolean {
        if((segment.end*1000) < min || (segment.start*1000) > max){
            return false;
        }
        return true;
    }

    getPublicMainPlaylist(): string {
        return this.publicHlsMainPlaylistString;
    }

    getPublicMasterPlaylist(): string {
        return this.publicHlsMasterPlaylistString;
    }

    seek(time: number){
        this.mediaBaseTime = Date.now() - time;
        this.currentTime = time;
    }

    async tick() {
        if(this.paused) {
            this.mediaBaseTime = Date.now() - this.currentTime;
        }else{
            this.currentTime = Date.now() - this.mediaBaseTime;
        }
        if(this.active){
            await this.manageSegments();
        }
    }

    async manageSegments(){
        const currentTime = this.currentTimeControlled;
        const lower = currentTime - PAST_BUFFER;
        const upper = currentTime + FUTURE_BUFFER;
        const activeSegments = this.segments.filter((segment) => {
            return this.intersects(segment, lower, upper);
        });
        // TODO: remove segments that are no longer needed
        const activeSegmentIDs = new Set<string>();
        for(const segment of activeSegments){
            activeSegmentIDs.add(segment.id);
        }
        // remove segments no longer needed
        for(let key of this.cache.keys()){
            if(key.startsWith("_")) continue; // special segments are never removed
            if(!activeSegmentIDs.has(key)){
                this.cache.delete(key);
            }
        }
        // add segments needed
        for(const segment of activeSegments){
            if(!this.cache.has(segment.id)){
                await this.fetchChunk(segment.id);
                if(!this.active) return;
            }
        }
    }

    get currentTimeControlled(): number {
        if(this.paused){
            return this.currentTime;
        }else{
            const mediaDuration = (this.item.libraryItem.RunTimeTicks || 0) / 10000; // ms
            return Math.min(Date.now() - this.mediaBaseTime, mediaDuration);
        }
    }

    pause(){
        this.paused = true;
        this.currentTime = Date.now() - this.mediaBaseTime;
    }

    unpause(){
        this.paused = false;
    }

    cancel(){
        this.active = false;
    }

    async fetchPrivateUrl(privateUrl: string): Promise<Blob> {
        const authedUrl = privateUrl.includes("api_key=") ? privateUrl : privateUrl + "&api_key=" + getAuth();
        const url = new URL(authedUrl, getServerUrl() || "http://localhost:8096");
        const resp = await fetch(url.toString(), {
            method: "GET",
            headers: {
                "Authorization": generateAuthorizationHeader()
            }
        });
        if(!resp.ok){
            throw new Error("Failed to get private file: " + (await resp.text()));
        }
        const blob = (await resp.blob());
        console.log("fetched",privateUrl, "->", blob.type);
        if(blob.type == "application/vnd.apple.mpegurl" || blob.type == "application/x-mpegURL"){
            // rewrite
            const origM3U8Str = await blob.text();
            const newM3U8Str = await this.rewritePlaylist(origM3U8Str, url.toString());
            return new Blob([newM3U8Str], {type: blob.type});
        }
        return blob;
    }

    has(id: string): boolean {
        return this.publicToPrivate.has(id);
    }

    getTagged(tag: string): SegmentWrapper[] {
        return Array.from(this.publicToPrivate.values()).filter((wrapper) => wrapper.tag == tag);
    }

    // promise dedupers

    pendingFetchPromises: Map<string, Promise<Blob>> = new Map();
    fetchChunk(id: string): Promise<Blob> {
        const possiblePromise = this.pendingFetchPromises.get(id);
        if(possiblePromise){
            return possiblePromise;
        }else{
            const promise = this.fetchChunkInternal(id);
            this.pendingFetchPromises.set(id, promise);
            promise.finally(() => {
                this.pendingFetchPromises.delete(id);
            });
            return promise;
        }
    }

    async uploadChunk(id: string, blob: Blob){
        await this.room.uploadFile(id, await blob.arrayBuffer(), blob.type);
    }

    async fetchChunkInternal(id: string, mirror: boolean = true): Promise<Blob> {
        const segment_wrapper = this.publicToPrivate.get(id);
        if(!segment_wrapper) throw new Error("No private url for " + id);
        const blob = await this.fetchPrivateUrl(segment_wrapper.segment.uri);
        if(mirror){
            // async!
            this.uploadChunk(id, blob);
        }
        this.cache.set(id, blob);
        return blob;
    }

    async generateMiscPublicID(path: string, special: boolean = false, tag?: string): Promise<string> {
        const hash = await cryptoHelper.hashString(path);
        const networkID = special ? "_" + hash : hash;
        if(!this.has(networkID)){
            this.publicToPrivate.set(networkID, {
                segment: {
                    uri: path
                },
                start: -1,
                end: -1,
                duration: 0,
                id: networkID,
                tag: tag
            } as any);
        }
        if(!special) console.warn("Nonspecial url data may be evicted from cache by other segments by the automatic segment manager");
        return networkID;
    }

    async rewritePlaylist(playlistStr: string, contextUrl: string): Promise<string> {
        const playlistParsedOrig = parse(playlistStr);
        if(playlistParsedOrig.isMasterPlaylist){
            const playlistParsed = playlistParsedOrig as MasterPlaylist;
            // rewrite
            playlistParsed.variants = await Promise.all(playlistParsed.variants.map(async (variant) => {
                const newVariant: Variant = {
                    ...variant,
                };
                // convert to absolute
                variant.uri = (new URL(variant.uri, contextUrl)).toString();
                newVariant.uri = "http://fake.localhost/" + (await this.generateMiscPublicID(variant.uri, true, "main")) + ".m3u8";
                // rewrite subtitles
                if(variant.subtitles && variant.subtitles.length > 0){
                    newVariant.subtitles = await Promise.all(variant.subtitles.map(async (subtitle) => {
                        let newSubtitle: Rendition = {
                            ...subtitle,
                        };
                        if(subtitle.uri) {
                            // convert to absolute
                            subtitle.uri = (new URL(subtitle.uri, contextUrl)).toString();
                            newSubtitle.uri = "http://fake.localhost/" + (await this.generateMiscPublicID(subtitle.uri, true)); 
                        }
                        return newSubtitle;
                    })) as any;
                }
                return newVariant;
            }));
            return stringify(playlistParsed);
        }else{
            const playlistParsed = playlistParsedOrig as MediaPlaylist;
            let curStart = 0;
            let newSegments: Segment[] = [];
            for(const segment of playlistParsed.segments){

                // hacky subtitle fix
                if(segment.uri){
                    if(segment.uri.includes("stream.vtt") || segment.uri.includes("AddVttTimeMap=true")){
                        segment.uri = segment.uri.replace("AddVttTimeMap=true", "AddVttTimeMap=false");
                    }
                }

                const start = curStart + 0;
                const end = curStart + segment.duration;
                segment.uri = (new URL(segment.uri, contextUrl)).toString();
                const networkID = await cryptoHelper.hashString(segment.uri);
                const newSegment: Segment = {
                    ...segment,
                };

                if(!this.publicToPrivate.has(networkID)){
                    // add to segments
                    const segmentWrapper: SegmentWrapper = {
                        segment: segment,
                        start: start,
                        end: end,
                        duration: segment.duration,
                        id: networkID
                    };
                    this.segments.push(segmentWrapper);
                    this.publicToPrivate.set(networkID, segmentWrapper);
                    // HANDLE MAP CASE IF NEEDED
                    if(segment.map && segment.map.uri && !segment.map.uri.startsWith("http://fake.localhost")){ // this shouldn't run too much to make this high complexity lol
                        // const mapNetworkID = "_" + (await cryptoHelper.hashString(segment.map.uri)); // special must remain cached longer
                        const mapNetworkID = await this.generateMiscPublicID((new URL(segment.map.uri, contextUrl)).toString(), true);
                        /*const existing = this.publicToPrivate.get(mapNetworkID);
                        if(!existing){
                            const mapWrapper: SegmentWrapper = {
                                segment: {
                                    uri: segment.map.uri,
                                } as any, // fuck ts here this let's me hack this in
                                start: -1,
                                end: -1,
                                duration: 0,
                                id: mapNetworkID
                            };
                            this.segments.push(mapWrapper);
                            this.publicToPrivate.set(mapNetworkID, mapWrapper);
                        }*/
                        // rewrite segment
                        // segment.map.uri = "http://fake.localhost/" + mapNetworkID + ".mp4";
                        newSegment.map = {
                            ...segment.map,
                            uri: "http://fake.localhost/" + mapNetworkID + ".mp4"
                        }
                    }
                    // rewrite segment itself
                    if(!segment.uri.startsWith("http://fake.localhost")){
                        newSegment.uri = "http://fake.localhost/" + networkID + ".mp4";
                    }
                }

                newSegments.push(newSegment);
                curStart += segment.duration;
            }
            playlistParsed.segments = newSegments;
            return stringify(playlistParsed);    
        }
    }
}