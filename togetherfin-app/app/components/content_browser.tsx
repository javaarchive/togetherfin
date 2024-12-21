import type Room from "~/lib/room";
import { Input } from "./ui/input";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api/items-api";
import { useState } from "react";
import { Button } from "./ui/button";
import { getApi, jellyfinRelativePath } from "~/lib/jellyfin";

interface ContentBrowserProps {
    room: Room;
}

export function ContentBrowser(props: ContentBrowserProps) {

    let [searchTerm, setSearchTerm] = useState("");
    let [searchResults, setSearchResults] = useState<BaseItemDto[]>([]);

    async function search(){
        const api = getApi();
        const itemsApi = getItemsApi(api);
        const resp = await itemsApi.getItems({
            searchTerm: searchTerm,
            recursive: true,
            limit: 100
        });
        const results = resp.data.Items;
        if(results && results.length > 0){
            setSearchResults(results);
        }else{
            setSearchResults([]);
        }
        if(!results) console.warn("Results data null");
    }

    return <>
        {/* layout from https://ui.shadcn.com/docs/components/input */}
        <div className="flex w-full max-w-sm items-center space-x-2">
            <Input placeholder="Search for something" type="text" name="search" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}/>
            <Button onClick={search}>Search</Button>
        </div>
        <div>
            {
                searchResults.length > 0 && searchResults.map((item) => {
                    return <div key={item.Id} className="p-4">
                        {/* <img src={jellyfinRelativePath(`/Items/${item.Id}/Images/Primary?fillHeight=384&fillWidth=384`)} className="optimized-image" decoding="async" loading="lazy"  /> */}
                        <a className="text-default" href="#" onClick={console.log}>{item.Name}</a>
                        (<span className="text-sm text-neutral-500">{item.Type}</span>)
                    </div>
                })
            }
            {
                searchResults.length == 0 && <div>No results yet. Try searching something.</div>
            }
        </div>
    </>   
}