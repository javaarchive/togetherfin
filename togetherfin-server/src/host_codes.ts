import { config as configDotenv } from 'dotenv';

class HostCodeManager {
    codes: Set<string> = new Set();

    constructor(){
        this.reload();
    }

    reload(){
        // I feel a bit insecure about this one
        const newCodes = new Set<string>();
        configDotenv({
            override: true
        });
        if(process.env.HOST_CODES){
            const codes = process.env.HOST_CODES.split(",");
            for(const code of codes){
                newCodes.add(code);
            }
        }
        console.log("reloading host codes");
        this.codes = newCodes;
    }

    check(code: string): boolean {
        return this.codes.has(code);
    }

    enabled(){
        return this.codes.size > 0;
    }
}

const globalHostCodeManager = new HostCodeManager();

export default globalHostCodeManager;

export {
    HostCodeManager,
    globalHostCodeManager
};