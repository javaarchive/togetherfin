const AES_KEY_LENGTH = 256;

class CryptoHelper {
    constructor() {

    }

    generateSalt(): Uint8Array {
        return crypto.getRandomValues(new Uint8Array(16));
    }

    generateIV(): Uint8Array {
        return crypto.getRandomValues(new Uint8Array(12));
    }

    async deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
        const passworduint8 = new TextEncoder().encode(password);
        const passwordKey = await crypto.subtle.importKey('raw', passworduint8, {
            name: 'PBKDF2'
        }, false, ['deriveKey'])

        const cryptoKey = crypto.subtle.deriveKey({
            name: "PBKDF2",
            hash: "SHA-512",
            iterations: 100000,
            salt: salt,
        }, passwordKey, {
            name: "AES-GCM",
            length: AES_KEY_LENGTH
        }, true, ["encrypt", "decrypt"]); 

        return cryptoKey;
    }

    async encrypt(payload: Uint8Array, password: string){
        const salt = this.generateSalt();
        const iv = this.generateIV();
        const key = await this.deriveKey(password, salt);
        const ciphertext = await crypto.subtle.encrypt({
            name: "AES-GCM",
            iv: iv,
        }, key, payload);
        return {
            salt: salt,
            iv: iv,
            ciphertext: new Uint8Array(ciphertext),
        };
    }
    
    async encryptToBuffer(payload: Uint8Array, password: string){
        const bundle = await this.encrypt(payload, password);
        const salt = bundle.salt;
        const iv = bundle.iv;
        const ciphertext = bundle.ciphertext;
        const buffer = new Uint8Array(salt.byteLength + iv.byteLength + ciphertext.byteLength);
        buffer.set(salt, 0);
        buffer.set(iv, salt.byteLength);
        buffer.set(ciphertext, salt.byteLength + iv.byteLength);
        return buffer;
    }

    async decrypt(buffer: Uint8Array, password: string){
        const salt = buffer.slice(0, 16);
        const iv = buffer.slice(16, 32);
        const ciphertext = buffer.slice(32);
        const key = await this.deriveKey(password, salt);
        const payload = await crypto.subtle.decrypt({
            name: "AES-GCM",
            iv: iv,
        }, key, ciphertext);
        return payload;
    }

    async decryptFromBuffer(buffer: Uint8Array, password: string){
        const salt = buffer.slice(0, 16);
        const iv = buffer.slice(16, 32);
        const ciphertext = buffer.slice(32);
        const key = await this.deriveKey(password, salt);
        const payload = await crypto.subtle.decrypt({
            name: "AES-GCM",
            iv: iv,
        }, key, ciphertext);
        return payload;
    }

    toBuffer(str: string): Uint8Array {
        const encoder = new TextEncoder();
        return encoder.encode(str);
    }

    bufferToString(buffer: Uint8Array | ArrayBuffer): string {
        const decoder = new TextDecoder();
        return decoder.decode(buffer);
    }
}

const cryptoHelper = new CryptoHelper();
export default cryptoHelper;
export {CryptoHelper}