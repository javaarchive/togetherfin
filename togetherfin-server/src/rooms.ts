import EventEmitter from "node:events";

interface StoreFile {
    time: number;
    channel: string;
    data: Blob;
    type?: string;
}

interface JournalEntry {
    time: number;
    key: string;
}

const MAX_SPECIAL = 100;
const MAX_DEFAULT = 400;

class Room extends EventEmitter {
    id: string;
    challenge: string;
    owner: string | null = null;
    // server does not know key
    // one can use the challenge to check their key

    constructor(id: string, challenge: string) {
        super();
        this.id = id;
        this.challenge = challenge;
    }

    files: Map<string, StoreFile> = new Map();

    special_journal: JournalEntry[] = [];
    default_journal: JournalEntry[] = [];

    put(key: string, value: Blob, type?: string){
        const isSpecial = key.startsWith("_");
        const channel = isSpecial ? "special" : "default";
        this.files.set(key, {
            time: Date.now(),
            channel: channel,
            data: value,
            type: type
        });
        if(isSpecial){
            this.special_journal.push({
                time: Date.now(),
                key: key
            });
        }else{
            this.default_journal.push({
                time: Date.now(),
                key: key
            });
        }
        this.gc();
        this.emit("put", key, this.files.get(key));
        return this.files.get(key);
    }

    gc(){
        // repair journal if inconsistent
        this.special_journal = this.special_journal.filter((entry) => {
            entry.time == this.files.get(entry.key)?.time;
        });
        this.default_journal = this.default_journal.filter((entry) => {
            entry.time == this.files.get(entry.key)?.time;
        });

        // gc
        while(this.special_journal.length > MAX_SPECIAL){
            const toDelete = this.special_journal.shift()!;
            this.emit("predelete", toDelete.key);
            this.files.delete(toDelete.key);
        }
        while(this.default_journal.length > MAX_DEFAULT){
            const toDelete = this.default_journal.shift()!;
            this.emit("predelete", toDelete.key);
            this.files.delete(toDelete.key);
        }
    }

    get(key: string): Blob | null {
        const file = this.files.get(key);
        if(file){
            return file.data;
        }else{
            return null;
        }
    }

    type(key: string): string | null {
        const file = this.files.get(key);
        if(file){
            return file.type ? file.type : null;
        }else{
            return null;
        }
    }
}

class RoomManager extends EventEmitter {
    rooms: Map<string, Room> = new Map();

    constructor(){
        super();
    }

    openRoom(id: string, challenge: string, owner?: string): Room {
        if(this.rooms.has(id)){
            const room = this.rooms.get(id);
            if(room && room.owner && room.owner == owner){
                return room;
            }
            throw new Error("Room already exists and is owned by someone else.");
        }
        const room = new Room(id, challenge);
        if(owner){
            room.owner = owner;
        }
        this.rooms.set(id, room);
        this.emit("newRoom", room);
        return room;
    }

    getRoom(id: string): Room | null {
        return this.rooms.get(id) || null;
    }

    closeRoom(id: string): void {
        this.emit("closeRoom", this.rooms.get(id), id);
        this.rooms.delete(id);
    }
}

const globalRoomManager = new RoomManager();

export interface RoomClaim {
    id: string;
    owner: string | null;
}

export default globalRoomManager;

export {
    Room,
    RoomManager,
    globalRoomManager
};

