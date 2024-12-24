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
        buffer.set(salt, 0); // 16
        buffer.set(iv, salt.byteLength); // 12 + 16
        buffer.set(ciphertext, salt.byteLength + iv.byteLength);
        return buffer;
    }

    async decrypt(ciphertext: Uint8Array, salt: Uint8Array, iv: Uint8Array, password: string){
        const key = await this.deriveKey(password, salt);
        const payload = await crypto.subtle.decrypt({
            name: "AES-GCM",
            iv: iv,
        }, key, ciphertext);
        return payload;
    }

    async decryptFromBuffer(buffer: Uint8Array, password: string){
        const salt = buffer.slice(0, 16);
        const iv = buffer.slice(16, 28);
        const ciphertext = buffer.slice(28);
        return (await this.decrypt(ciphertext, salt, iv, password));
    }

    toBuffer(str: string): Uint8Array {
        const encoder = new TextEncoder();
        return encoder.encode(str);
    }

    bufferToString(buffer: Uint8Array | ArrayBuffer): string {
        const decoder = new TextDecoder();
        return decoder.decode(buffer);
    }

    // https://gist.github.com/GaspardP/fffdd54f563f67be8944

    hex(buffer: ArrayBuffer): string {
        var digest = ''
        var view = new DataView(buffer)
        for(var i = 0; i < view.byteLength; i += 4) {
          // We use getUint32 to reduce the number of iterations (notice the `i += 4`)
          var value = view.getUint32(i)
          // toString(16) will transform the integer into the corresponding hex string
          // but will remove any initial "0"
          var stringValue = value.toString(16)
          // One Uint32 element is 4 bytes or 8 hex chars (it would also work with 4
          // chars for Uint16 and 2 chars for Uint8)
          var padding = '00000000'
          var paddedValue = (padding + stringValue).slice(-padding.length)
          digest += paddedValue
        }
        
        return digest
    }

    async hash(content: ArrayBuffer, algorithm: string = "SHA-512"): Promise<string> {
        const digest = await crypto.subtle.digest(algorithm, content);
        return this.hex(digest);
    }

    async hashString(content: string, algorithm: string = "SHA-512"): Promise<string> {
        const contentUint8 = new TextEncoder().encode(content);
        return this.hash(contentUint8, algorithm);
    }

    async selftest(){
        const testKey = "abc123test";
        const testPlaintext = "Sample text to encrypt!";;
        const encrypted = await this.encryptToBuffer(this.toBuffer(testPlaintext), testKey);
        const decrypted = await this.decryptFromBuffer(encrypted, testKey);
        if(this.bufferToString(decrypted) != testPlaintext){
            throw new Error("Self test failed");
        }
        console.log("self test ok");
    }
}

const cryptoHelper = new CryptoHelper();
export default cryptoHelper;
export {CryptoHelper}