import type { BaseItemDto, MediaStream, MediaSourceInfo } from "@jellyfin/sdk/lib/generated-client/models";
import cryptoHelper from "./crypto";
import {io, Socket} from "socket.io-client";
import type { PlyrInstance } from "plyr-react";
import type { Stream } from "stream";
import { getProfiles, Streamer } from "./jellyfin";

export interface HostPlayableItem {
    libraryItem: BaseItemDto;
    mediaSource: MediaSourceInfo;
    audioTrack: MediaStream;
};

// shared def across client and server
export interface PlayingItem { 
    name: string;
    year?: number;
    duration: number;
};

export class Room extends EventTarget {
    id: string;
    key?: string;
    sessionKey?: string;
    socket?: Socket;
    // only avali on host
    queue: HostPlayableItem[] = [];
    // current item host edition
    currentItemHost: HostPlayableItem | null = null;

    currentItem: PlayingItem | null = null;

    plyr?: PlyrInstance;

    // only on host
    streamers: Streamer[] = [];

    hostingFlag: boolean = false;

    constructor(id: string, key?: string) {
        super();
        this.id = id;
        this.key = key;
        this.addEventListener("queue_update", this.queueChanged.bind(this));
        this.addEventListener("current_item_update", this.currentItemChangedHandler.bind(this));
    }

    setHosting(hosting: boolean){
        this.hostingFlag = hosting;
        return this;
    }

    get hosting(): boolean{
        return this.sessionKey != null || this.hostingFlag;
    }

    queueChanged(){
        if(this.hosting){
            if(this.socket) this.syncQueue();
        }
    }

    serializeQueue(): any[] {
        // TODO: redact sensitive info
        return [];
    }

    syncQueue(){
        if(!this.socket) throw new Error("Room socket not setup");
        // send broadcast payload
    }

    add(item: HostPlayableItem) {
        if(this.currentItemHost){
            this.addQueue(item);
        }else{
            this.currentItemHost = item;
            this.currentItemChanged();
        }
    }

    advanceQueue(){
        const shifted = this.queue.shift();
        if(!shifted) return false;
        this.currentItemHost = shifted;
        this.currentItemChanged();
        this.dispatchEvent(new CustomEvent("queue_update", {
            detail: {
                type: "shift",
                item: this.currentItem
            }
        }));
        return true;
    }

    serializeCurrentItem(item: HostPlayableItem): PlayingItem {
        return {
            name: item.libraryItem.Name || "Unknown Media",
            year: item.libraryItem.ProductionYear || -1,
            duration: (item.libraryItem.RunTimeTicks || 0) / 10000000
        };
    }

    async currentItemChanged(){
        if(!this.currentItemHost) return;
        this.currentItem = this.serializeCurrentItem(this.currentItemHost);
        this.dispatchEvent(new CustomEvent("current_item_update", {
            detail: {
                type: "update",
                item: this.currentItem
            }
        }));
        // TODO; annouce this over network
    }

    cancelStreaming(){
        for(let streamer of this.streamers){
            streamer.cancel();
        }

        this.streamers = [];
    }

    async currentItemChangedHandler(){
        console.log("current item changed");
        if(!this.currentItemHost) return; // unreachable
        // actually do the playing
        if(this.hosting){
            // enumerate profiles and build a streamer for each
            // TODO: filter out profiles that are not applicable for the current item, e.g. higher resolution than source profiles
            this.cancelStreaming();
            const profiles = getProfiles();
            for(const profile of profiles){
                this.streamers.push(new Streamer(profile, this.currentItemHost));
            }
            await Promise.all(this.streamers.map((streamer) => streamer.waitInit()));
            this.dispatchEvent(new Event("streamers_inited"));
            await this.syncPlaylists();
        }
    }

    async syncPlaylists(){
        const uploadPromises = [];
        for(const streamer of this.streamers){
            const playlist = streamer.getPublicPlaylist();
            uploadPromises.push(this.uploadString(streamer.id, playlist));
        }
        await Promise.all(uploadPromises);
        // create root
        await this.uploadString("root", JSON.stringify({
            profiles: this.streamers.map((streamer) => {
                const profile = streamer.profile; 
                return {
                    name: profile.name,
                    maxWidth: profile.maxWidth,
                    videoBitRate: profile.videoBitRate,
                    audioCodec: profile.audioCodec,
                    audioBitRate: profile.audioBitRate,
                    id: streamer.id
                }
            })
        }));
    }

    // TODO; progress bar these
    async uploadFile(file_id: string, buffer: ArrayBuffer){
        if(!this.key) throw new Error("Room key not set");
        const encrypted = await cryptoHelper.encryptToBuffer(new Uint8Array(buffer), this.key);
        const resp = await fetch("/api/room/" + this.id + "/" + file_id, {
            method: "POST",
            headers: {
                "Content-Type": "application/octet-stream",
                "Authorization": "Bearer " + this.sessionKey
            },
            body: encrypted
        });
        if(!resp.ok){
            throw new Error("Failed to upload file: " + (await resp.text()));
        }
        return (await resp.json()).ok;
    }

    uploadString(key: string, str: string) {
        return this.uploadFile(key, new TextEncoder().encode(str));
    }

    async validate(): Promise<boolean> {
        return "challenge" in (await this.fetch());
    }

    async fetch(): Promise<any> {
        const resp = await fetch("/api/room/" + encodeURIComponent(this.id));
        const json = await resp.json();
        return json;
    }

    setKey(key: string){
        this.key = key;
    }

    async validateKey(key: string, roomJson: any): Promise<boolean> {
        try{
            // https://stackoverflow.com/a/41106346
            const decrypted = await cryptoHelper.decryptFromBuffer(Uint8Array.from(atob(roomJson.challenge), c => c.charCodeAt(0)), key);
            const payload = JSON.parse(cryptoHelper.bufferToString(decrypted));
            return roomJson.id == payload.id;
        }catch(ex){
            console.warn("Failed to validate room key, likely key incorrect", ex);
            return false;
        }
    }

    async generateChallenge(){
        if(!this.key) throw new Error("Room key not set");
        const payload = cryptoHelper.toBuffer(JSON.stringify({id: this.id}));
        const challenge = await cryptoHelper.encryptToBuffer(payload, this.key);
        // base64 encode challenge
        return btoa(String.fromCharCode(...challenge));
    }

    async host(hostcode?: string): Promise<void> {
        if(!this.key) throw new Error("Room key not set");
        const challenge = await this.generateChallenge();
        const resp = await fetch("/api/room", {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                id: this.id,
                challenge: challenge,
                owner: hostcode
            })
        });
        if(!resp.ok){
            throw new Error("Failed to host room: " + (await resp.text()));
        }
        const json = await resp.json();
        if(!json.ok) {
            throw new Error("Failed to host room: " + json.error);
        }
        this.sessionKey = json.sessionKey; // a jwt allowing us connect to the socket
        return json;
    }

    addQueue(item: HostPlayableItem){
        this.queue.push(item);
        this.dispatchEvent(new CustomEvent("queue_update", {
            detail: {
                type: "add",
                item: item
            }
        }));
    }

    upgrade(){
        if(!this.socket) throw new Error("Room socket not connected");
        if(!this.sessionKey) throw new Error("Room session key not set");
        this.socket.emit("upgrade", this.sessionKey);
    }

    join(){
        if(!this.socket) throw new Error("Room socket not connected");
        this.socket.emit("join", this.id);
    }

    async connect(): Promise<void> {
        // connect to the socket
        const socket = io();
        this.socket = socket;
        // tODO: change event names
        socket.on("connect", () => {
            if(this.sessionKey){
                this.upgrade();
            }else{
                this.join();
            }
            this.dispatchEvent(new Event("room_realtime_connect_repeatable"));
        });

        socket.once("connect", () => {
            this.dispatchEvent(new Event("room_realtime_connect"));
        });
        
        socket.once("disconnect", () => {
            this.dispatchEvent(new Event("room_realtime_disconnect"));
        });

        socket.on("disconnect", () => {
            this.dispatchEvent(new Event("room_realtime_disconnect_repeatable"));
        });

        socket.on("upgrade_ok", () => {
            this.dispatchEvent(new Event("room_realtime_upgrade_ok"));
        });
        console.log("connect started to room " + this.id);
    }
}

export default Room;