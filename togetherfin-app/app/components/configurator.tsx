
import { useEffect, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs"
import type Room from "~/lib/room";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { getApi, hasCredentials, tryLogin, updateCachedUserID } from "~/lib/jellyfin";
import { getUserApi } from "@jellyfin/sdk/lib/utils/api/user-api";
import type { UserDto } from "@jellyfin/sdk/lib/generated-client/models";

interface ConfiguratorProps {
    room: Room;
}

export function Configurator(props: ConfiguratorProps) {

    let [authStatus, setAuthStatus] = useState("Loading...");
    let [serverUrl, setServerUrl] = useState(""); // TODO: restore from local storage if possible
    let [username, setUsername] = useState("");
    let [password, setPassword] = useState("");

    async function checkCredentials(){
        if(hasCredentials()){
            const api = getApi();
            const userApi = getUserApi(api);
            setAuthStatus("Checking stored access token...");
            (async () => {
                const usersResp = await userApi.getCurrentUser();
                const user: UserDto = usersResp.data;
                setAuthStatus("Authenticated as " + user["Name"] + "!");
                if(user["Id"] && user["Id"].length > 0){
                    updateCachedUserID(user["Id"]);
                }else{
                    console.warn("No user id in get current user response for check?");
                }
            })();
        }else{
            setAuthStatus("No credentials stored.");
        }
    }

    useEffect(() => {
        checkCredentials();
    }, []);

    function updateCredentials(){
        if(serverUrl && username && password){
            setAuthStatus("Performing login...");
            (async () => {
                const success = await tryLogin(serverUrl, username, password);
                if(success){
                    setAuthStatus("Successfully logged in! Now rechecking credentials..."); // this text prob never shows up cause too fast
                    await checkCredentials();
                }else{
                    setAuthStatus("Failed to log in. Check your credentials and server connection.");
                }
            })();
        }else{
            alert("Please complete all the fields to update credentials.");
        }
    }

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
                <Input id="server" placeholder="https://example.com" type="url" name="jellyfinserver" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)}/>
            </div>
            <div className="grid w-full max-w-sm items-center gap-1.5">
                <Label htmlFor="username">
                    Username
                </Label>
                <Input id="username" placeholder="Username" type="text" name="username" value={username} onChange={(e) => setUsername(e.target.value)}/>
            </div>
            <div className="grid w-full max-w-sm items-center gap-1.5">
                <Label htmlFor="password">
                    Password
                </Label>
                <Input id="password" placeholder="Password" type="password" name="password" value={password} onChange={(e) => setPassword(e.target.value)}/>
            </div>
            <Button className="w-full" onClick={updateCredentials}>Update Credentials</Button>
            <Button className="w-full" onClick={checkCredentials} variant={"secondary"}>Check Credentials</Button>
            <div className="text-center p-4">
                {authStatus}
            </div>
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