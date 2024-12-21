class Room {
    id: string;
    challenge: string;
    owner: string | null = null;
    // server does not know key
    // one can use the challenge to check their key

    constructor(id: string, challenge: string) {
        this.id = id;
        this.challenge = challenge;
    }
}

class RoomManager {
    rooms: Map<string, Room> = new Map();

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
        return room;
    }

    getRoom(id: string): Room | null {
        return this.rooms.get(id) || null;
    }

    closeRoom(id: string): void {
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
    RoomManager,
    globalRoomManager
};

