import { zValidator } from "@hono/zod-validator";
import { z } from 'zod';

import { Hono } from "hono";
import globalRoomManager, { type RoomClaim } from "./rooms.js";
import globalHostCodeManager from "./host_codes.js";
import { jwtVerify, SignJWT } from "jose";
import { JWT_SECRET, JWT_SECRET_STRING } from "./config.js";

import { bearerAuth } from 'hono/bearer-auth'

const app = new Hono();

async function verifyJWT(sessionKey: string): Promise<RoomClaim> {
    const jwt = await jwtVerify(sessionKey, JWT_SECRET, {
        issuer: "Togetherfin",
        algorithms: ["HS256"]
    });
    return jwt.payload as any as RoomClaim;
}

app.get("/check", (c) => {
  return c.text("api ok");
});

app.put("/room", zValidator("json", z.object({
    id: z.string(),
    challenge: z.string(),
    owner: z.string().optional()
})), async (c) => {
    const json = c.req.valid("json");

    if(globalHostCodeManager.enabled()){
        // console.log("checking host code " + json.owner + " " + globalHostCodeManager.codes);
        if(!globalHostCodeManager.check(json.owner || "")){
            c.status(401);
            return c.json({
                ok: false,
                error: "Invalid host code. These are required to host rooms on this instance. Contact the administrator to obtain one."
            });
        }
    }

    const room = globalRoomManager.openRoom(json.id, json.challenge, json.owner);
    const sessionKey = await new SignJWT({
        id: room.id,
        owner: room.owner
    }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").setIssuer("Togetherfin").sign(JWT_SECRET);

    return c.json({
        ok: true,
        sessionKey: sessionKey
    });
});

app.get("/room/:id", async (c) => {
    const room = globalRoomManager.getRoom(c.req.param("id"));
    if(room){
        return c.json({
            ok: true,
            challenge: room.challenge,
            id: room.id,
        });
    }else{
        c.status(404);
        return c.json({
            ok: false,
            error: "Room not found. Please try again."
        });
    }
});

app.post("/room/:id/:key", async (c) => {
    // get session key from headers
    const authorization = c.req.header("Authorization");
    if(authorization && authorization.startsWith("Bearer ")){
        const sessionKey = authorization.substring("Bearer ".length);
        const claim = await verifyJWT(sessionKey);
        if(claim.id != c.req.param("id")){
            c.status(401);
            return c.json({
                ok: false,
                error: "Invalid session key. Please try again."
            });
        }
        // authorized, now upload file
        const key = c.req.param("key");
        // get room
        const room = globalRoomManager.getRoom(claim.id);
        if(room){
            const file = await c.req.blob();
            room.put(key, file, c.req.header("Content-Type"));
            return c.json({
                ok: true,
                time: Date.now()
            });
        }else{
            c.status(404);
            return c.json({
                ok: false,
                error: "Room not found. Please try again."
            });
        }
    }
});

app.get("/room/:id/:key", async (c) => {
    const room = globalRoomManager.getRoom(c.req.param("id"));
    if(room){
        const file = room.get(c.req.param("key"));
        const type = room.type(c.req.param("key"));
        if(file){
            c.header("Content-Type", "application/octet-stream");
            c.header("Content-Disposition", "attachment; filename=" + c.req.param("key") + ".bin");
            if(type){
                c.header("X-Real-Content-Type", type);
            }
            return c.body(file.stream());
        }else{
            c.status(404);
            return c.json({
                ok: false,
                error: "File not found. Please try again."
            });
        }
    }else{
        c.status(404);
        return c.json({
            ok: false,
            error: "Room not found. Please try again."
        });
    }
});

app.post("/hostcode", zValidator("json", z.object({
    code: z.string()
})), async (c) => {
    const json = c.req.valid("json");
    if(!globalHostCodeManager.enabled()){
        c.status(400);
        return c.json({
            ok: false,
            error: "Host codes are not enabled on this instance. You should not need one to start a room."
        });
    }
    if(!globalHostCodeManager.check(json.code)){
        c.status(401);
        return c.json({
            ok: false,
            error: "Invalid host code. These are required to host rooms on this instance. Contact the administrator to obtain one."
        });
    }
    return c.json({
        ok: true
    });
});

export default app;