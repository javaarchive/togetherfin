import type { BaseItemDto, MediaStream, MediaSourceInfo } from "@jellyfin/sdk/lib/generated-client/models";
import cryptoHelper from "./crypto";
import {io, Socket} from "socket.io-client";
import type { PlyrInstance } from "plyr-react";
import { getProfiles, Streamer } from "./jellyfin";
import { apiPath, detectDiscordActivity } from "./utils";

export interface HostPlayableItem {
    libraryItem: BaseItemDto;
    mediaSource: MediaSourceInfo;
    audioTrack: MediaStream;
    subtitleTrack?: MediaStream;
};

// shared def across client and server
export interface PlayingItem { 
    name: string;
    year?: number;
    duration: number;
    sourceID: string;
};

export interface ProfileReference {
    name: string;
    id: string;
    maxWidth?: number;
    videoBitRate?: number;
    audioCodec?: string;
    audioBitRate?: number;
}

export interface ProfileListing {
    profiles: ProfileReference[];
}



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

    root: ProfileListing = {
        profiles: []
    };

    pendingFilePromises: Map<string, Promise<Blob>> = new Map();

    constructor(id: string, key?: string) {
        super();
        this.id = id;
        this.key = key;
        this.addEventListener("queue_update", this.queueChanged.bind(this));
        this.addEventListener("current_item_update", this.currentItemChangedHandler.bind(this));
        this.addEventListener("broadcast_raw", this.handleEncryptedBroadcast.bind(this));
        this.addEventListener("broadcast", this.handleBroadcast.bind(this));
    }

    decrypt(buffer: ArrayBuffer): any {
        if(!this.key) throw new Error("Room key not set");
        return cryptoHelper.decryptFromBuffer(new Uint8Array(buffer), this.key);
    }

    async handleEncryptedBroadcast(ev: any){
        const message: ArrayBuffer = ev.detail;
        console.log("decrypting message", message);
        const decrypted = await this.decrypt(message);
        const decryptedStr = cryptoHelper.bufferToString(decrypted);
        this.dispatchEvent(new CustomEvent("broadcast", {
            detail: {
                message: JSON.parse(decryptedStr),
                time: Date.now()
            }
        }));
    }

    async handleBroadcast(ev: any){
        const { message, time } = ev.detail;
        if(message.type == "sync"){
            const {root, currentItem} = message.data;
            if(currentItem == null){
                if(this.streamers.length){
                    this.cancelStreaming();
                }
            }else if((this.currentItem == null && currentItem) || (this.currentItem?.sourceID != currentItem.sourceID)){
                // new item queued up
                this.currentItem = currentItem;
                this.root = root;
                this.dispatchEvent(new CustomEvent("current_item_update", {
                    detail: {
                        type: "update",
                        item: currentItem
                    }
                }));
                // send root_update as well, works for client ig
                this.dispatchEvent(new CustomEvent("root_updated", {
                    detail: {
                        root: root
                    }
                }));
            }
            if(message.data.currentItem != null){
                console.log("dispatch sync");
                this.dispatchEvent(new CustomEvent("sync", {
                    detail: {
                        type: "sync",
                        item: currentItem,
                        message: message
                    }
                }));
            }
        }
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

    async broadcast(message: any){
        if(!this.socket) throw new Error("Room socket not setup");
        if(!this.key) throw new Error("Room key not set");
        const messageBuf = cryptoHelper.toBuffer(JSON.stringify(message));
        const encrypted = await cryptoHelper.encryptToBuffer(messageBuf, this.key);
        console.log("broadcasting message", encrypted);
        this.socket.emit("broadcast", encrypted);
    }

    status(){
        const streamer = this.streamers[0];
        return {
            currentItem: this.currentItem,
            queueLength: this.queue.length,
            root: this.root,
            playback: streamer ? {
                paused: streamer.paused,
                currentTime: streamer.currentTimeControlled,
                mediaBaseTime: streamer.mediaBaseTime
            }: null
            
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

    async serializeCurrentItem(item: HostPlayableItem): Promise<PlayingItem> {
        return {
            name: item.libraryItem.Name || "Unknown Media",
            year: item.libraryItem.ProductionYear || -1,
            duration: (item.libraryItem.RunTimeTicks || 0) / 10000000,
            sourceID: (await cryptoHelper.hashString("jf:" + item.mediaSource.Id))
        };
    }

    async currentItemChanged(){
        if(!this.currentItemHost) return;
        this.currentItem = await this.serializeCurrentItem(this.currentItemHost);
        this.dispatchEvent(new CustomEvent("current_item_update", {
            detail: {
                type: "update",
                item: this.currentItem
            }
        }));
    }

    cancelStreaming(){
        for(let streamer of this.streamers){
            streamer.cancel();
        }

        this.streamers = [];
    }

    tick(){
        if(this.hosting){
            for(let streamer of this.streamers){
                streamer.tick();
            }
            this.broadcast({
                type: "sync",
                data: this.status()
            });
        }
    }

    async currentItemChangedHandler(ev: any){
        console.log("current item changed");
        // actually do the playing
        if(this.hosting){
            if(!this.currentItemHost) return; // unreachable
            // enumerate profiles and build a streamer for each
            // TODO: filter out profiles that are not applicable for the current item, e.g. higher resolution than source profiles
            this.cancelStreaming();
            const profiles = getProfiles();
            for(const profile of profiles){
                this.streamers.push(new Streamer(profile, this.currentItemHost, this));
            }
            await Promise.all(this.streamers.map((streamer) => streamer.waitInit()));
            this.dispatchEvent(new Event("streamers_inited"));
            await this.syncPlaylists();
        }else{
            const item = ev.detail.item;
            if(item){
                if(typeof document != "undefined"){
                    document.title = item.name + " - Togetherfin";
                }
            }
        }
    }

    async syncPlaylists(){
        const uploadPromises = [];
        for(const streamer of this.streamers){
            const playlist = streamer.getPublicMasterPlaylist();
            uploadPromises.push(this.uploadString(streamer.id, playlist, "application/vnd.apple.mpegurl"));
            const mainPlaylists = streamer.getTagged("main");
            for(const mainPlaylist of mainPlaylists){
                // TODO: handle multiple correctly if even possible
                uploadPromises.push(this.uploadString(mainPlaylist.id, streamer.getPublicMainPlaylist(), "application/vnd.apple.mpegurl"));
            }
        }
        await Promise.all(uploadPromises);
        // create root
        const root: ProfileListing = {
            profiles: this.streamers.map((streamer) => {
                const profile = streamer.profile; 
                return {
                    name: profile.name || "",
                    maxWidth: profile.maxWidth,
                    videoBitRate: profile.videoBitRate,
                    audioCodec: profile.audioCodec,
                    audioBitRate: profile.audioBitRate,
                    id: streamer.id
                }
            })
        };
        this.root = root;
        await this.uploadString("root", JSON.stringify(root));
        this.dispatchEvent(new Event("host_root_updated"));
        this.dispatchEvent(new Event("root_updated"));
        
    }

    async getRoot(): Promise<ProfileListing> {
        const file = await this.downloadFile("root");
        return JSON.parse(new TextDecoder().decode(await file.arrayBuffer()));
    }

    async updateRootHost(){
        const root = await this.getRoot();
        this.root = root;
        this.dispatchEvent(new CustomEvent("root_updated", {
            detail: root
        }));
        return root;
    }

    // TODO; progress bar these
    async uploadFile(file_id: string, buffer: ArrayBuffer, hintMimetype: string = "application/octet-stream"){
        if(!this.key) throw new Error("Room key not set");
        const encrypted = await cryptoHelper.encryptToBuffer(new Uint8Array(buffer), this.key);
        const resp = await fetch(apiPath("/api/room/" + encodeURIComponent(this.id) + "/" + file_id), {
            method: "POST",
            headers: {
                "Content-Type": hintMimetype,
                "Authorization": "Bearer " + this.sessionKey
            },
            body: encrypted
        });
        if(!resp.ok){
            throw new Error("Failed to upload file: " + (await resp.text()));
        }
        return (await resp.json()).ok;
    }

    async downloadFile(file_id: string): Promise<Blob> {
        if(!this.key) throw new Error("Room key not set");
        const resp = await fetch(apiPath("/api/room/" + encodeURIComponent(this.id) + "/" + file_id));
        if(!resp.ok){
            throw new Error("Failed to download file: " + (await resp.text()));
        }
        const arrayBuffer = await resp.arrayBuffer();
        // decrypt
        const decrypted = await cryptoHelper.decryptFromBuffer(new Uint8Array(arrayBuffer), this.key);
        return new Blob([decrypted], {
            type: resp.headers.get("X-Real-Content-Type") || "application/octet-stream"
        }); // TODO: filetype?
    }

    uploadString(key: string, str: string, type?: string) {
        return this.uploadFile(key, new TextEncoder().encode(str), type);
    }

    async validate(): Promise<boolean> {
        return "challenge" in (await this.fetch());
    }

    async fetch(): Promise<any> {
        const resp = await fetch(apiPath("/api/room/" + encodeURIComponent(this.id)));
        if(!resp.ok){
            throw new Error("Failed to fetch room: " + (await resp.text()) + " may not exist.");
        }
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
        console.log("encrypt with", this.key, payload);
        const challenge = await cryptoHelper.encryptToBuffer(payload, this.key);
        // base64 encode challenge
        const challengeStr = btoa(String.fromCharCode(...challenge));
        return challengeStr;
    }

    async host(hostcode?: string): Promise<void> {
        if(!this.key) throw new Error("Room key not set");
        const challenge = await this.generateChallenge();
        const resp = await fetch(apiPath("/api/room"), {
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

    pause(){
        this.streamers.forEach((streamer) => {
            streamer.pause();
        });
    }

    seek(time: number){
        this.streamers.forEach((streamer) => {
            streamer.seek(time);
        });
    }

    pauseAt(time: number){
        this.pause();
        this.seek(time);
    }

    resume(){
        this.streamers.forEach((streamer) => {
            streamer.unpause();
        });
    }

    resumeAt(time: number){
        this.resume();
        this.seek(time);
    }

    async connect(): Promise<void> {
        // connect to the socket
        const socket = io(detectDiscordActivity() ? "/.proxy": "/",{
            autoConnect: false,
            path: detectDiscordActivity() ? "/.proxy/socket.io/" : "/socket.io/",
        });
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

        socket.on("broadcast", (message) => {
            this.dispatchEvent(new CustomEvent("broadcast_raw", {
                detail: message
            }));
            // console.log("recv broadcasted message encrypted", message);
        });

        socket.on("filePut", async (key: string) => {
            this.dispatchEvent(new CustomEvent("file_put", {
                detail: key
            }));
            if(this.pendingFilePromises.has(key)){
                const promise = this.pendingFilePromises.get(key);
                if(promise){
                    this.pendingFilePromises.delete(key); // prevent from timeout
                    // @ts-ignore
                    if(promise["resolve"]){
                        // @ts-ignore
                        promise["resolve"](await this.getChunk(key));
                    }else{
                        console.warn("No resolve for promise", promise, key);
                    }
                }
            }
        });

        console.log("connect started to room " + this.id);
        await socket.connect();
    }

    waitForFile(file_id: string): Promise<Blob> {
        if(this.pendingFilePromises.has(file_id)){
            const promise = this.pendingFilePromises.get(file_id);
            if(promise) return promise;
        }
        const promise = new Promise<Blob>((resolve, reject) => {
            const promise = this.pendingFilePromises.get(file_id);
            // @ts-ignore
            promise["resolve"] = resolve;
            setTimeout(() => {
                if(this.pendingFilePromises.has(file_id)){
                    const promise = this.pendingFilePromises.get(file_id);
                    if(promise){
                        console.warn("Timeout waiting for file " + file_id);
                        this.pendingFilePromises.delete(file_id);
                        reject(promise);
                    }
                }
            }, 30 * 1000);
        });

        this.pendingFilePromises.set(file_id, promise);
        return promise;
    }

    async getChunk(file_id: string, fallback: boolean = false): Promise<Blob> {
        if(file_id.endsWith(".m3u8")){
            file_id = file_id.substring(0, file_id.length - ".m3u8".length);
        }
        if(file_id.startsWith("_")){
            const streamer = this.streamers.find((streamer) => streamer.id == file_id);
            if(streamer){
                // kickstarts host side video player
                const contents: string = streamer.getPublicMasterPlaylist();
                return new Blob([contents], {type: "application/vnd.apple.mpegurl"});
            }
        }
        if(this.hosting){
            const streamer = this.streamers.find((streamer) => streamer.has(file_id));
            if(streamer){
                const blob = await streamer.fetchChunk(file_id);
                return blob;
            }else{
                throw new Error("No streamer found to handle " + file_id);
            }
        }else{
            // fetch and decrypt
            try{
                return (await this.downloadFile(file_id));
            }catch(ex){
                if(fallback){
                    return (await this.waitForFile(file_id));
                }else{
                    throw ex;
                }
            }
        }
    }
}

export default Room;