import type { Route } from "./+types/home";
import { Welcome } from "../welcome/welcome";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import Room from "~/lib/room";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Player } from "~/components/player";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Togetherfin Room" },
    { name: "description", content: "Togetherfin let's you easily host watch parties with your Jellyfin library." },
  ];
}

enum RoomLoadStatusState {
  Checking = 1,
  DetectKeyOverride = 2,
  DetectKey = 3,
  Challenge = 4,
  Connecting = 5,
  Syncing = 6
}

export default function RoomPage() {

  const {roomId} = useParams(); 

  let [room, setRoom] = useState<Room>(() => {
    if(!roomId) return new Room("");
    return new Room(roomId).setHosting(false);
  });

  let [isActive, setIsActive] = useState(false);
  let [isErroring, setIsErroring] = useState(false);
  let [errorText, setErrorText] = useState("");
  let [roomLoadState, setRoomLoadState] = useState<RoomLoadStatusState>(RoomLoadStatusState.Checking);
  let shouldConfigure = useMemo(() => {
    return !isActive || isErroring;
  }, [isActive, isErroring]);
  let [password, setPassword] = useState("");

  async function check(){
    try{
      setRoomLoadState(RoomLoadStatusState.Checking);
      room.setKey(password);
      const roomJson = await room.fetch();
      setRoomLoadState(RoomLoadStatusState.DetectKey);
      if(typeof location != "undefined"){
        if(password.length == 0 && location.hash.length > 1){
          room.setKey(location.hash.substring(1));
          setPassword(location.hash.substring(1));
        }
      }
      setRoomLoadState(RoomLoadStatusState.Challenge);
      try{
        if(await room.validateKey(room.key!, roomJson)){
          console.log("Challenge solved, connecting with socket");
          setRoomLoadState(RoomLoadStatusState.Connecting);
          await room.connect();
          setRoomLoadState(RoomLoadStatusState.Syncing);
          setIsActive(true);
          setIsErroring(false);
        }else{
          throw new Error("Invalid password");
        }
      }catch(ex){
        setRoomLoadState(RoomLoadStatusState.DetectKeyOverride);
        setPassword(""); // clear previous value
        setErrorText("Please specify the correct password to the room.");
        setIsErroring(true);
      }
    }catch(ex){
      setErrorText("Failed to check room status: " + ex + " does the room exist?");
      setIsErroring(true);
    }
  }

  useEffect(() => {
    if(roomId){
      // check room
      check();
    }else{
      console.warn("No room id?");
    }
  }, []);


  if(!roomId) return <>
    <span className="text-2xl font-bold">
      Room not specified.
    </span>
  </>;

  return <>
    <div style={{
      display: shouldConfigure ? "block": "none"
    }} className="m-auto max-w-xl">
      {/* loader */}
      {/* TODO: make this flow look better otherwise people are going to judge this*/}
      <div className="text-default">
        Debug: state {roomLoadState}
      </div>
      <div className = "text-default">
        {roomLoadState == RoomLoadStatusState.Checking ? "Checking room status..." : "Room registered on server."}
      </div>
      {
        roomLoadState == RoomLoadStatusState.DetectKeyOverride && <div className = "text-default">
          Enter room password manually:
          <Input placeholder = "Room key/password" type="password" name="password" value={password} onChange={(e) => setPassword(e.target.value)}/>
          <Button onClick={check} className="w-full">Check</Button>
        </div>
      }
      <div className = "text-default">
        {roomLoadState <= RoomLoadStatusState.DetectKey ? "Checking password..." : "Password correct."}
      </div>
      <div className = "text-default">
        {roomLoadState < RoomLoadStatusState.Syncing ? "Waiting for room join to start syncing" : "Syncing with host"}
      </div>
    </div>
    <div style={{
      display: isActive ? "block": "none"
    }} className="w-full h-full">
        <Player host={false} room={room} />
    </div>
    <div>
      
    </div>
    <div style={{display: isErroring ? "block": "none"}}>
      {errorText} <br />
      Reload or reopen the activity to try again.
    </div>
  </>;
}
