import type { Route } from "./+types/home";
import { Welcome } from "../welcome/welcome";
import { useEffect, useState } from "react";

import {DiscordSDK} from '@discord/embedded-app-sdk';

export function meta({}: Route.MetaArgs) {
  return [
    { title: "New React Router App" },
    { name: "description", content: "Welcome to React Router!" },
  ];
}

export default function Home() {
  
  let [isMagic, setIsMagic] = useState(false);
  
  async function init(){
    const discordSdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID, {
      disableConsoleLogOverride: false
    });

    try{
      await discordSdk.ready();
      // @ts-ignore
      window["dsdk"] = discordSdk; // sandbox test
      // https://discord.com/developers/docs/developer-tools/embedded-app-sdk#authorize
      await discordSdk.commands.authorize({
        client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
        response_type: "code",
        state: "",
        prompt: "none",
        scope: [
          // "applications.builds.upload",
          // "applications.builds.read",
          // "applications.store.update",
          // "applications.entitlements",
          // "bot",
          "identify",
          // "connections",
          // "email",
          // "gdm.join",
          "guilds",
          // "guilds.join",
          // "guilds.members.read",
          // "messages.read",
          // "relationships.read",
          // 'rpc.activities.write',
          // "rpc.notifications.read",
          // "rpc.voice.write",
          // "rpc.voice.read",
          // "webhook.incoming",
        ],
      });
      const channel = await discordSdk.commands.getChannel({
        channel_id: discordSdk.channelId || "",
      });
      console.log("channel", channel);
    }catch(ex){
      console.warn("Failed to initialize discord sdk", ex);
    }
  }

  useEffect(() => {
    
    init();
  }, [])
  
  return <>
    {isMagic && <div>Doing some magic to route you to a room automatically for the activity.</div>}
    <Welcome />
  </>;
}
