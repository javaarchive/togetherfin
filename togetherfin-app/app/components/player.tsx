
// import Plyr, { type APITypes, type PlyrInstance } from "plyr-react";
// import "plyr-react/plyr.css"
import Plyr from "plyr";
import "plyr/dist/plyr.css";
import { useEffect, useRef, useState } from "react";
import type Room from "~/lib/room";
import Hls from "hls.js";
import { createLoaderFactory } from "~/lib/hls";
import { TranscodingInfoTranscodeReasonsEnum } from "@jellyfin/sdk/lib/generated-client/models";
import { FUTURE_BUFFER, FUTURE_BUFFER_NONHOST, PAST_BUFFER } from "~/lib/jellyfin";

interface PlayerProps {
    host?: boolean;
    className?: string;
    room: Room;
}

const HOST_CONTROLS = ["play", "progress", "current-time","rewind", "mute", "volume", "settings", "pip", "airplay", "fullscreen"];
const GUEST_CONTROLS = ["play", "current-time", "mute", "volume", "settings","pip", "airplay", "fullscreen"];
const MAX_DRIFT_MS = 5 * 1000;
const MAX_DRIFT_PAUSED_MS = 2 * 1000;
const RESYNC_MIN_MS = 500;

export function Player(props: PlayerProps) {
    // const ref = useRef<APITypes>(null);
    const ref = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if(ref.current){
            // init plyr
            const videoEl = ref.current;
            const plyr = new Plyr(videoEl, {
                controls: props.host ? HOST_CONTROLS : GUEST_CONTROLS,
                speed: {
                    selected: 1,
                    options: [1]
                },
                settings: ["captions", "quality"],
                captions: {
                    active: true,
                    update: true
                }
            });

            // @ts-ignore
            window["plyr"] = plyr;

            plyr.on("waiting", () => props.room.tick());
            plyr.on("playing", () => props.room.tick());
            plyr.on("progress", () => props.room.tick());
            plyr.on("pause", () => {
                console.log("invoking pause");
                props.room.tick();
                props.room.pauseAt(plyr.currentTime * 1000);
                props.room.tick();
            })
            plyr.on("play", () => {
                console.log("invoking play after pause");
                props.room.tick();
                props.room.resumeAt(plyr.currentTime * 1000);
                props.room.tick();
            });
            plyr.on("seeked", () => {
            props.room.tick();
                props.room.seek(plyr.currentTime * 1000);
                props.room.tick();
            });

            let lastResyncTime = 0;
            plyr.on("timeupdate", () => {
                if(Date.now() - lastResyncTime > RESYNC_MIN_MS){
                    props.room.tick();
                }
            });

            // init hls
            const HLS_BUFFER = props.host ? FUTURE_BUFFER : FUTURE_BUFFER_NONHOST;
            const hls = new Hls({
                loader: createLoaderFactory(props.room) as any,
                debug: true,
                autoStartLoad: true,
                lowLatencyMode: false,
                fragLoadingMaxRetry: 3, // do i rlly need this?
                maxBufferLength: HLS_BUFFER / 1000,
                maxMaxBufferLength: HLS_BUFFER / 1000,
                backBufferLength: HLS_BUFFER / 1000,
                frontBufferFlushThreshold: PAST_BUFFER / 1000
            });
            // @ts-ignore
            window["hls"] = hls;
            hls.attachMedia(videoEl);
            // not sure if actually needed
            // @ts-ignore
            plyr.media = videoEl;
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                plyr.play();
            });


            const rootUpdatedHandler = () => {
                console.log("loading new root =)");
                hls.loadSource(props.room.root.profiles[0].id + ".m3u8");
            };

            const syncHandler = (ev: any) => {
                console.log("sync", ev.detail);
                if(ev.detail.type == "sync" && !props.room.hosting){
                    console.log(ev.detail);
                    const {message} = ev.detail;
                    const {playback, currentItem} = message.data;
                    if(plyr.paused != playback.paused){
                        if(playback.paused){
                            plyr.pause();
                        }else{
                            plyr.play();
                        }
                    }
                    // sync position
                    if(playback.paused){
                        // use absolute relative to file playback time
                        const drift = Math.abs(plyr.currentTime * 1000 - playback.currentTime);
                        if(drift > MAX_DRIFT_PAUSED_MS){
                            console.log("too much drift in paused playback", drift, playback.currentTime, plyr.currentTime);
                            console.log("exec seek to ", playback.currentTime / 1000);
                            hls.stopLoad();
                            plyr.currentTime = playback.currentTime / 1000;
                            hls.startLoad();
                        }
                        
                    }else{
                        // use computer clock
                        const desiredPos = Date.now() - playback.mediaBaseTime;
                        const drift = Math.abs(plyr.currentTime * 1000 - desiredPos);
                        if(drift > MAX_DRIFT_MS){
                            console.log("too much drift in playback", drift, desiredPos, plyr.currentTime, playback.mediaBaseTime);
                            console.log("exec seek to ", desiredPos / 1000);
                            hls.stopLoad();
                            plyr.currentTime = desiredPos / 1000;
                            hls.startLoad();
                        }
                    }
                }
            }

            props.room.addEventListener("root_updated", rootUpdatedHandler);
            props.room.addEventListener("sync", syncHandler);

            return () => {
                props.room.removeEventListener("root_updated", rootUpdatedHandler);
                props.room.removeEventListener("sync", syncHandler);
                hls.destroy();
                plyr.destroy();
            };
        }
    }, []);    

    // old:
    /*return <Plyr source={null} ref={ref} options={{
        controls: props.host ? HOST_CONTROLS : GUEST_CONTROLS,
        speed: {
            selected: 1,
            options: [1]
        },
        settings: ["captions", "quality"],
    }} />;*/
    return <video ref={ref} className={props.className}></video>;
}