import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useEffect, useState } from "react";
import type Room from "~/lib/room";

interface QueueProps {
    room: Room;
}

export function Queue(props: QueueProps) {

    let [queue, setQueue] = useState<BaseItemDto[]>([]);

    // add effect that subscribes and unsubscribes on exit to room queue updates
    useEffect(() => {
        const listener = (ev: CustomEvent) => {
            setQueue([
                // copy queue
                ...props.room.queue
            ]);
        };
        props.room.addEventListener("queue_update", listener as any);
        return () => {
            props.room.removeEventListener("queue_update", listener as any);
        };
    }, [props.room]);

    return <>
        <span className="text-2xl font-bold text-default">
            Queue
        </span>
        <div className="border">
        {
            queue.length > 0 && queue.map((item) => {
                return <div key={item.Id}>{item.Name}</div>
            })
        }
        {
            queue.length == 0 && <>Queue is empty.</>
        }
        </div>
    </>
}