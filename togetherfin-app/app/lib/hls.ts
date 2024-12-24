import type Room from "./room";
import Hls, { type HlsConfig } from "hls.js";

export function createLoaderFactory(room: Room) {
    return function (config: HlsConfig) {
        let loader: any = {};
        loader.aborted = false;
        loader.parsing = {start:1, end: 1};
        loader.loading = {start:1,end:1,first:1};
        loader.buffering = {start:1,end:1,first:1};
        loader.chunkCount = 1;
        loader.innerLoader = new Hls.DefaultConfig.loader(config);
        loader.stats = {
            aborted: loader.aborted,
            parsing: loader.parsing,
            loading: loader.loading,
            buffering: loader.buffering,
            chunkCount: loader.chunkCount
        }
        loader.load = async (context: any, config: any, callbacks: any) => {
            console.log("fake load", context.url);
            if(!context.url.startsWith("blob:")){
                let filename = context.url;
                if(filename.startsWith("http://fake.localhost/")){
                    filename = filename.substring("http://fake.localhost/".length);
                }
                if(filename.endsWith(".m3u8")){
                    filename = filename.substring(0, filename.length - ".m3u8".length);
                }
                if(filename.endsWith(".ts")){
                    filename = filename.substring(0, filename.length - ".ts".length);
                }
                if(filename.endsWith(".mp4")){
                    filename = filename.substring(0, filename.length - ".mp4".length);
                }
                
                try{
                    const blob = await room.getChunk(filename, true);
                    const url = URL.createObjectURL(blob);

                    console.log(filename, "->", url)
                    // context.url = url;
                    
                    loader.innerLoader.load({
                        ...context,
                        url: url
                    }, config, callbacks);
                }catch(ex){
                    callbacks.onError({
                        code: 1,
                        message: "segment not avali yet or errored: " + ex
                    })
                }
            }else{
                // passthrough
                loader.innerLoader.load(context, config, callbacks);
            }
        }

        loader.abort = (...args: any[]) => loader.innerLoader.abort(...args);
        loader.destroy = (...args: any[]) => loader.innerLoader.destroy(...args);
        return loader;
    }
}