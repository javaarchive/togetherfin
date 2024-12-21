
import { useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs"
import type Room from "~/lib/room";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";

interface ConfiguratorProps {
    room: Room;
}

export function Configurator(props: ConfiguratorProps) {
    return <>
       <Tabs defaultValue="credentials">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="credentials">Credentials</TabsTrigger>
          <TabsTrigger value="presets">Presets</TabsTrigger>
          <TabsTrigger value="room">Room</TabsTrigger>
        </TabsList>
        <TabsContent value="credentials">
            {/*label input from shadcn docs currently, todo: tweak this*/}
            <div className="grid w-full max-w-sm items-center gap-1.5">
                <Label htmlFor="server">
                    Jellyfin Server URL:
                </Label>
                <Input id="server" placeholder="https://example.com" type="url" name="jellyfinserver" value=""/> 
            </div>
            <div className="grid w-full max-w-sm items-center gap-1.5">
                <Label htmlFor="username">
                    Username
                </Label>
                <Input id="username" placeholder="Username" type="text" name="username" value=""/>
            </div>
            <div className="grid w-full max-w-sm items-center gap-1.5">
                <Label htmlFor="password">
                    Password
                </Label>
                <Input id="password" placeholder="Password" type="password" name="username" value=""/>
            </div>
            <Button className="w-full">Update</Button>

        </TabsContent>
        <TabsContent value="presets">
            Configure Presets
        </TabsContent>
        <TabsContent value="room">
            Room
        </TabsContent>
       </Tabs>
    </>
}