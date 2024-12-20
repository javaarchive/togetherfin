import cryptoHelper from "./crypto";



class Room {
    id: string;
    constructor(id: string, key: string) {
        this.id = id;
    }

    async validate(): Promise<boolean> {
        return "challenge" in (await this.fetch());
    }

    async fetch(): Promise<any> {
        const resp = await fetch("/api/room/" + encodeURIComponent(this.id));
        const json = await resp.json();
        return json;
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
}