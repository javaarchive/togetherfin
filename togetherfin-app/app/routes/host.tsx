import type { Route } from "./+types/home";
import { Welcome } from "../welcome/welcome";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Player } from "~/components/player";
import { Dialog, DialogContent, DialogHeader, DialogTrigger } from "../components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs"
import Room from "~/lib/room";
import { Configurator } from "~/components/configurator";
import { DialogTitle } from "@radix-ui/react-dialog";
import { ContentBrowser } from "~/components/content_browser";
import { Queue } from "~/components/host_queue";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Host a room." },
    { name: "description", content: "Host a new Togetherfin room." },
  ];
}

export default function Host() {

  const {roomId} = useParams(); 

  if(!roomId) return <>
    <span className="text-2xl font-bold">
      Room not specified.
    </span>
  </>;

  let [room, setRoom] = useState<Room>(() => {
    return new Room(roomId);
  });

  let [hosting, setHosting] = useState(false);
  let [hostButtonText, setHostButtonText] = useState("Host");
  let [hostCode, setHostCode] = useState("");
  let [password, setPassword] = useState("");

  async function startHosting(){
    // host with code
    room.setKey(password);
    try{
      setHostButtonText("Checking with server...");
      await room.host(hostCode);
      setHostButtonText("Hosting!");
      setHosting(true);
      room.connect();
    }catch(ex){
      console.error(ex);
      setHostButtonText("Hosting failed");
      setHosting(false);
    }
  }

  useEffect(() => {
    room.addEventListener("room_realtime_connect_repeatable", () => {
        setHostButtonText("Authing with Session Key...");
    });

    room.addEventListener("room_realtime_upgrade_ok", () => {
      setHostButtonText("Connected");
    });

    room.addEventListener("room_realtime_disconnect_repeatable", () => {
      setHostButtonText("Reconnecting...");
    });
  }, [room]);

  return <>
    <div className="m-auto max-w-7xl">
      <div className="text-2xl font-bold text-default">
        Room: {roomId}
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Input placeholder = "Host Code" type="password" name="hostcode" value={hostCode} onChange={(e) => setHostCode(e.target.value)}/>
        </div>
        <div>
        <Input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}/>
        </div>
        <div>
          <Button className="w-full" disabled={hosting} name="password" onClick={startHosting}>{hostButtonText}</Button>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <div className="col-span-3 custom-card">
          Player
          <Player host={true}/>
        </div>
        <div className="custom-card">
          Controls...
          <Tabs defaultValue="stream">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="stream">Stream</TabsTrigger>
              <TabsTrigger value="queue">Queue</TabsTrigger>
            </TabsList>
            <TabsContent value="stream">
              Network statistics
            </TabsContent>
            <TabsContent value="queue">
              <ContentBrowser room={room} />
              <Queue room={room} />
              
            </TabsContent>
          </Tabs>
          <Dialog>
            <DialogTrigger asChild>
              <Button className="w-full">Configure</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle className="text-default">Configure</DialogTitle></DialogHeader>
              <Configurator room={room} />
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  </>;
}
