import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useEffect, useState } from "react";
import { getMediaPrettyName } from "~/lib/jellyfin";
import type { HostPlayableItem } from "~/lib/room";
import type Room from "~/lib/room";

interface QueueProps {
    room: Room;
}

export function Queue(props: QueueProps) {

    let [queue, setQueue] = useState<HostPlayableItem[]>([]);

    function syncQueue(){
        setQueue([
            // copy queue
            ...props.room.queue
        ]);
    }

    // add effect that subscribes and unsubscribes on exit to room queue updates
    useEffect(() => {
        const listener = (ev: CustomEvent) => {
            syncQueue();
        };
        props.room.addEventListener("queue_update", listener as any);
        return () => {
            props.room.removeEventListener("queue_update", listener as any);
        };
    }, [props.room]);

    // initial sync
    useEffect(() => {
        syncQueue();
    }, []);

    return <>
        <span className="text-2xl font-bold text-default">
            Queue
        </span>
        <div className="p-2">
        {
            queue.length > 0 && queue.map((item, index) => {
                return <div key={item.libraryItem.Id}>{index + 1}. {getMediaPrettyName(item.libraryItem)}</div>
            })
        }
        {
            queue.length == 0 && <>Queue is empty.</>
        }
        </div>
    </>
}