// mostly pasted from https://github.com/javaarchive/syncfin/blob/main/src/jellyfin_helper.ts
import { Jellyfin } from "@jellyfin/sdk";
import type { Api } from "@jellyfin/sdk";
import { } from "@jellyfin/sdk/";

// TODO: get the app to never try SSRing but vite wants to do this for some reason
if(typeof localStorage == "undefined"){
    console.warn("localStorage is undefined, injecting a shim");
    const localStorageMap = new Map<string, string>();
    // @ts-ignore
    globalThis["localStorage"] = {
        getItem(key: string){
            return localStorageMap.get(key) || null;
        },
        setItem(key: string, value: string){
            localStorageMap.set(key, value);
        },
        removeItem(key: string){
            localStorageMap.delete(key);
        }
    };
}

export function getPerDeviceRandID(): string{
    if(typeof localStorage.getItem('device-id') == "string"){
        return (localStorage.getItem('device-id') as string);
    }
    const id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('device-id', id);
    return id;
}

export function getServerUrl(){
    return localStorage.getItem('server-url');
}
  
export function getAuth(){
    return localStorage.getItem('api-key');
}

export function hasCredentials(){
    return getServerUrl() && getAuth() && true;
}

export const jellyfin = new Jellyfin({
    clientInfo: {
        name: 'Togetherfin Client',
        version: '1.0.0'
    },
    deviceInfo: {
        name: 'Togetherfin',
        id: getPerDeviceRandID()
    }
});

let globalApi: Api | null = null;

export function getApi(): Api {
    if(globalApi == null){
        globalApi = jellyfin.createApi(getServerUrl() as string, localStorage.getItem('api-key') as string); // this can be null and it'll be unauthenticxated
    }
    return globalApi;
}

export function jellyfinRelativePath(path: string): string{
    return getServerUrl() + path;
}

export async function tryLogin(serverUrl: string, username: string, password: string): Promise<boolean> {
    const api = jellyfin.createApi(serverUrl);
    const authResp = await api.authenticateUserByName(username, password);
    const authData = authResp.data;
    if(typeof authData["AccessToken"] == "string"){
        localStorage.setItem('api-key', authData["AccessToken"]);
        localStorage.setItem('server-url', serverUrl);
        // reset global api
        globalApi = null;
        getApi();
        return true;
    }else{
        console.warn("Got bad auth response from jellyfin", authData, JSON.stringify(authResp,null,4));
        return false;
    }
}

export function getWsUrl(){
    const api = getApi();
    // https://github.com/jellyfin/jellyfin-vue/blob/master/frontend/src/plugins/remote/socket.ts
    const socketParameters = new URLSearchParams({
        api_key: api.accessToken,
        deviceId: getPerDeviceRandID(),
      }).toString();

      return `${api.basePath}/socket?${socketParameters}`
        .replace('https:', 'wss:')
        .replace('http:', 'ws:');
}

export function createWebsocket(){
    const ws = new WebSocket(getWsUrl());
    return ws;
}

let globalWebsocket: WebSocket | null = null;

export function getWebsocket(): WebSocket {
    if(globalWebsocket == null){
        globalWebsocket = createWebsocket();
    }
    return globalWebsocket;
}