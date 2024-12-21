import cryptoHelper from "./crypto";
import {io, Socket} from "socket.io-client";


export class Room extends EventTarget {
    id: string;
    key?: string;
    sessionKey?: string;
    socket?: Socket;

    constructor(id: string, key?: string) {
        super();
        this.id = id;
        this.key = key;
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