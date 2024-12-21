import { Server, Socket } from "socket.io";
import type { ServerType } from "@hono/node-server";
import { Server as HttpServer } from "http";
import { jwtVerify } from "jose";
import { JWT_SECRET } from "./config.js";
import globalRoomManager, { type RoomClaim } from "./rooms.js";
import { join } from "path";

async function realtime(server_retyped: ServerType) {
    const server = server_retyped as HttpServer;
    const io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST", "PUT", "DELETE"],
        },
    });

    const idToRoomID = new Map<string, string>();

    function joinToRoom(socket: Socket, roomID: string, host: boolean){
        if(!globalRoomManager.getRoom(roomID)) throw new Error("Room not found");
        if(idToRoomID.has(socket.id)){
            const existingRoomID = idToRoomID.get(socket.id);
            if(existingRoomID != roomID && existingRoomID){ // pov: typescript strict on types the second expression is never null
                socket.leave(existingRoomID);
                socket.leave(existingRoomID + "/host"); // idk if this errors if you're not in the room anyways
            }
        }
        idToRoomID.set(socket.id, roomID);
        socket.join(roomID);
        if(host){
            socket.join(roomID + "/host");
        }
    }

    io.on("connection", (socket) => {
        console.log("connected",socket.id);
        socket.on("disconnect", () => {
            console.log("disconnected",socket.id);
        });

        socket.on("upgrade", async (sessionKey) => {
            try{
                const verified = await jwtVerify(sessionKey, JWT_SECRET, {
                    issuer: "Togetherfin",
                    algorithms: ["HS256"]
                });
                const claim = verified.payload as any as RoomClaim;
                if(verified.payload){
                    const room = globalRoomManager.getRoom(claim.id);
                    if(!room) throw new Error("Room not found");
                    if(room.owner && room.owner != claim.owner) throw new Error("Room is not owned by you");
                    // upgrade
                    joinToRoom(socket, claim.id, true);
                    console.log("upgraded to room " + claim.id + " by " + socket.id);
                    socket.emit("upgrade_ok");
                }
            }catch(ex){
                console.warn(socket.id, " failed to upgrade with session key " , sessionKey, ex);
                socket.emit("upgrade_error", "Something went wrong. Please try again. Ensure your session key is valid.");
            }
        });

        socket.on("join", async (roomID) => {
            try{
                joinToRoom(socket, roomID, false);
            }catch(ex){
                socket.emit("join_error", "Something went wrong. Please try again.");
            }
        });

        socket.on("send_host", async (message) => {
            const roomID = idToRoomID.get(socket.id);
            if(roomID){
                const room = globalRoomManager.getRoom(roomID);
                io.to(roomID + "/host").emit("send_host",socket.id,message);
            }
        });

        socket.on("broadcast", async (message) => {
            const roomID = idToRoomID.get(socket.id);
            
            // check if sender is host
            if(roomID && socket.rooms.has(roomID + "/host")){
                io.to(roomID).emit("broadcast",message);
                return;
            }else{
                console.warn("Attempted to broadcast to room without host " + socket.id);
            }
        });

        socket.on("send_to", async (socket_id, message) => {
            const roomID = idToRoomID.get(socket.id);
            
            // check if sender is host
            if(roomID && socket.rooms.has(roomID + "/host") && idToRoomID.get(socket_id) == roomID){
                io.to(socket_id).emit("host_message",message);
                return;
            }else{
                console.warn("Attempted to send to room without host " + socket.id + " target: " + socket_id);
            }
        })
    });
}

export {realtime};
export default realtime;