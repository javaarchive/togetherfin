import { zValidator } from "@hono/zod-validator";
import { z } from 'zod';

import { Hono } from "hono";
import globalRoomManager from "./rooms.js";
import globalHostCodeManager from "./host_codes.js";
import { SignJWT } from "jose";
import { JWT_SECRET, JWT_SECRET_STRING } from "./config.js";

const app = new Hono();

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