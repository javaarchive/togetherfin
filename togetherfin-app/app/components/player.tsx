
import Plyr, { type APITypes, type PlyrInstance } from "plyr-react";
import "plyr-react/plyr.css"
import { useRef, useState } from "react";

interface PlayerProps {
    host?: boolean;
    className?: string;
}

const HOST_CONTROLS = ["play", "progress", "current-time","rewind", "mute", "volume", "settings", "pip", "airplay", "fullscreen"];
const GUEST_CONTROLS = ["play", "current-time", "mute", "volume", "pip", "airplay", "fullscreen"];

export function Player(props: PlayerProps) {
    const ref = useRef<APITypes>(null);


    return <Plyr source={null} ref={ref} options={{
        controls: props.host ? HOST_CONTROLS : GUEST_CONTROLS,
        speed: {
            selected: 1,
            options: [1]
        },
        settings: ["captions", "quality"],
    }} />;
}