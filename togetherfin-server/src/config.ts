import { config as configDotenv } from 'dotenv';
configDotenv();

if(!process.env.JWT_SECRET){
    throw new Error("JWT_SECRET is not set");
}

export const JWT_SECRET_STRING = process.env.JWT_SECRET;
// encode JWT_SECRET with TextEncoder
export const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);