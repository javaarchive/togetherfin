import type Room from "~/lib/room";
import { Input } from "./ui/input";
import type { BaseItemDto, MediaSourceInfo, MediaStream, UserItemDataDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api/items-api";
import { getTvShowsApi } from "@jellyfin/sdk/lib/utils/api/tv-shows-api";
import { getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api/user-library-api";
import { useState } from "react";
import { Button } from "./ui/button";
import { describeMediaSource, getApi, getMediaPrettyName, getUserID, jellyfinRelativePath } from "~/lib/jellyfin";
import { Dialog, DialogContent, DialogHeader, DialogDescription, DialogTitle } from "./ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "./ui/select";

interface ContentBrowserProps {
    room: Room;
}

const emptyItem: BaseItemDto = {
    Name: "",
    Id: "",
}

export function ContentBrowser(props: ContentBrowserProps) {

    let [searchTerm, setSearchTerm] = useState("");
    let [searchResults, setSearchResults] = useState<BaseItemDto[]>([]);
    let [chooseTVShowSeasonOpen, setChooseTVShowSeasonOpen] = useState(false);
    let [chooseTVShowEpisodeOpen, setChooseTVShowEpisodeOpen] = useState(false);
    let [chooseMediaOptionsOpen, setChooseMediaOptionsOpen] = useState(false);
    let [currentItem, setCurrentItem] = useState<BaseItemDto>();
    let [seasonData, setSeasonData] = useState<BaseItemDto[]>([]);
    let [chosenSeason, setChosenSeason] = useState<BaseItemDto>(emptyItem);
    let [chosenEpisode, setChosenEpisode] = useState<BaseItemDto>(emptyItem);
    let [episodeData, setEpisodeData] = useState<BaseItemDto[]>([]);
    let [chosenMedia, setChosenMedia] = useState<BaseItemDto>(emptyItem);
    let [chosenMediaSource, setChosenMediaSource] = useState<MediaSourceInfo>({});
    let [chosenAudioTrack, setChosenAudioTrack] = useState<MediaStream>({}); 
    let [chosenSubtitleTrack, setChosenSubtitleTrack] = useState<MediaStream>({});

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
        if(!results) console.warn("Results data null?");
    }

    async function selectSearchResult(item: BaseItemDto){
        if(item.Type == "Series"){
            loadSeasonsChooser(item);
        }else if(item.Type == "Movie" || item.Type == "Episode" || item.Type == "Video"){
            loadMediaOptions(item);
        }else{
            console.log("Unknown item type", item.Type);
        }
    }

    async function loadSeasonsChooser(item: BaseItemDto){  
        setChosenSeason(emptyItem);
        setCurrentItem(item);
        const api = getApi();
        const tvShowsApi = getTvShowsApi(api);
        const resp = await tvShowsApi.getSeasons({
            seriesId: item.Id || "" // this should always be a string anyways
        });
        setSeasonData(resp.data.Items || []);
        setChooseTVShowSeasonOpen(true);
    }

    async function loadEpisodeChooser(item: BaseItemDto){
        setChosenEpisode(emptyItem);
        const api = getApi();
        const tvShowsApi = getTvShowsApi(api);
        const seriesItem = currentItem;
        const resp = await tvShowsApi.getEpisodes({
            seriesId: (seriesItem && seriesItem.Id) || "", // this should always be a string anyways
            seasonId: item.Id || ""
        });
        // set to season, tbh kinda optional
        setCurrentItem(item);
        setEpisodeData(resp.data.Items || []);
        setChooseTVShowEpisodeOpen(true);
    }

    async function loadMediaOptions(item: BaseItemDto){
        setCurrentItem(item);
        const api = getApi();
        const userLibraryApi = getUserLibraryApi(api);
        const resp = await userLibraryApi.getItem({
            itemId: item.Id || "",
            userId: getUserID()
        })
        if(resp.data){
            console.log(resp.data);
            setChosenMedia(resp.data);
            if(resp.data.MediaSources && resp.data.MediaSources[0].Id){
                setChosenMediaSource(resp.data.MediaSources[0]);
                if(resp.data.MediaSources[0].MediaStreams){
                    const defaultAudioTrack = resp.data.MediaSources[0].MediaStreams.find((stream) => stream.Type == "Audio");
                    if(defaultAudioTrack) setChosenAudioTrack(defaultAudioTrack);
                    setChosenSubtitleTrack({});
                }
            }
            setChooseMediaOptionsOpen(true);
        }else{
            // TODO: toast
        }
    }

    function addToQueue(){
        props.room.add({
            libraryItem: chosenMedia,
            mediaSource: chosenMediaSource,
            audioTrack: chosenAudioTrack,
            subtitleTrack: chosenSubtitleTrack
        });
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
                        <a className="text-default" href="#" onClick={() => selectSearchResult(item)}>{item.Name}</a>
                        (<span className="text-sm text-neutral-500">{item.Type}</span>)
                    </div>
                })
            }
            {
                searchResults.length == 0 && <div>No results yet. Try searching something in your libraries.</div>
            }
        </div>
        {/* potential dialogs here for on selection, TODO: refactor to use ids instead of  names */}
        <Dialog open={chooseTVShowSeasonOpen} onOpenChange={(open) => setChooseTVShowSeasonOpen(open)} defaultOpen={false}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Choose a season from {currentItem ? currentItem.Name: "Unknown TV Show"}</DialogTitle>
                </DialogHeader>
                <DialogDescription>
                    <Select value={(chosenSeason.Name || "").toString()} onValueChange={(value) => {
                        const chosen = seasonData.find((item) => item.Name == value);
                        if(chosen) setChosenSeason(chosen);
                    }}>
                        <SelectTrigger className="w-full text-default">
                            <SelectValue placeholder="Select a season to browse." className="text-default" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectGroup>
                                <SelectLabel>Seasons</SelectLabel>
                                {seasonData.map((item) => {
                                    return <SelectItem key={item.Name || ""} value={(item.Name || "").toString()}>{item.Name}</SelectItem>
                                })}
                            </SelectGroup>
                        </SelectContent>
                    </Select>
                    <Button variant={"secondary"} onClick={() => setChooseTVShowSeasonOpen(false)} className="w-1/2">Cancel</Button>
                    <Button className="w-1/2" onClick={() => {
                        setChooseTVShowSeasonOpen(false);
                        if(chosenSeason) loadEpisodeChooser(chosenSeason);
                    }} disabled={!chosenSeason}>Browse</Button>
                    
                </DialogDescription>
            </DialogContent>
        </Dialog>

        <Dialog open={chooseTVShowEpisodeOpen} onOpenChange={(open) => setChooseTVShowEpisodeOpen(open)} defaultOpen={false}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Choose an episode from {currentItem ? currentItem.Name: "Unknown TV Show"}</DialogTitle>
                </DialogHeader>
                <DialogDescription>
                    <Select value={(chosenEpisode ? (chosenEpisode.Name || "") : "").toString()} onValueChange={(value) => {
                        const chosen = episodeData.find((item) => item.Name == value);
                        if(chosen) setChosenEpisode(chosen);
                    }}>
                        <SelectTrigger className="w-full text-default">
                            <SelectValue placeholder="Select an episode to browse." className="text-default" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectGroup>
                                <SelectLabel>Episodes</SelectLabel>
                                {episodeData.map((item) => {
                                    return <SelectItem key={item.Name || ""} value={(item.Name || "").toString()}>{item.Name}</SelectItem>
                                })}
                            </SelectGroup>
                        </SelectContent>
                    </Select>
                    <Button variant={"secondary"} onClick={() => setChooseTVShowEpisodeOpen(false)} className="w-1/2">Cancel</Button>
                    <Button className="w-1/2" onClick={() => {
                        setChooseTVShowEpisodeOpen(false);
                        if(chosenEpisode) loadMediaOptions(chosenEpisode);
                    }} disabled={!chosenEpisode}>Next</Button>
                </DialogDescription>
            </DialogContent>
        </Dialog>
        {/* mediao options dialog */}
        <Dialog open={chooseMediaOptionsOpen} onOpenChange={(open) => setChooseMediaOptionsOpen(open)} defaultOpen={false}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Choose how you want to play {getMediaPrettyName(chosenMedia)}   </DialogTitle>
                </DialogHeader>
                <DialogDescription>
                    <Select value={chosenMediaSource.Id || ""} onValueChange={(value) => {
                        const chosen = (chosenMedia.MediaSources || []).find((item) => item.Id == value);
                        if(chosen){
                            if(chosen.MediaStreams) setChosenAudioTrack(chosen.MediaStreams.find((stream) => stream.Type == "Audio") || {});
                            setChosenMediaSource(chosen);
                        }
                    }} defaultValue={chosenMediaSource.Id || ""}>
                        <img src={jellyfinRelativePath(`/Items/${chosenMedia.Id}/Images/Primary?fillHeight=384&fillWidth=384`)} className="optimized-image" decoding="async" loading="lazy"  />
                        <SelectTrigger className="w-full text-default">
                            <SelectValue placeholder="Select a media source to play." className="text-default" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectGroup>
                                <SelectLabel>Media Sources</SelectLabel>
                                {(chosenMedia.MediaSources || []).map((item) => {
                                    return <SelectItem key={item.Id || ""} value={item.Id || ""}>{describeMediaSource(item)}</SelectItem>
                                })}
                            </SelectGroup>
                        </SelectContent>
                    </Select>
                    Please also select the audio track to play.
                    <Select value={chosenAudioTrack.Index?.toString() || ""} onValueChange={(value) => {
                        const idx =  parseInt(value);
                        const chosen = (chosenMediaSource.MediaStreams || []).find((stream) => stream.Type == "Audio" && stream.Index == idx);
                        if(chosen) setChosenAudioTrack(chosen);
                    }} defaultValue={chosenAudioTrack.Index?.toString() || ""}>
                        <SelectTrigger className="w-full text-default">
                            <SelectValue placeholder="Select an audio track to play." className="text-default" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectGroup>
                                <SelectLabel>Audio Tracks</SelectLabel>
                                {(chosenMediaSource.MediaStreams || []).filter((stream) => stream.Type == "Audio").map((stream) => {
                                    return <SelectItem key={stream.Index?.toString() || ""} value={stream.Index?.toString() || ""}>{stream.DisplayTitle} ({stream.Codec} {stream.ChannelLayout})</SelectItem>
                                })}
                            </SelectGroup>
                        </SelectContent>
                    </Select>
                    You may also optionally add a subtitle track, which may be displayed if possible.
                    <Select value={chosenSubtitleTrack.Index ? chosenSubtitleTrack.Index.toString() : "-1"} onValueChange={(value) => {
                        if(parseInt(value) < 0) setChosenSubtitleTrack({});
                        const idx =  parseInt(value);
                        const chosen = (chosenMediaSource.MediaStreams || []).find((stream) => stream.Type == "Subtitle" && stream.Index == idx);
                        if(chosen){
                            setChosenSubtitleTrack(chosen);
                        }
                    }}>
                        <SelectTrigger className="w-full text-default">
                            <SelectValue placeholder="Select a subtitle track to play." className="text-default" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectGroup>
                                <SelectLabel>Subtitle Tracks</SelectLabel>
                                {(chosenMediaSource.MediaStreams || []).filter((stream) => stream.Type == "Subtitle").map((stream) => {
                                    return <SelectItem key={stream.Index?.toString() || ""} value={stream.Index?.toString() || ""}>{stream.DisplayTitle} ({stream.Codec} {stream.Index})</SelectItem>
                                })}
                                <SelectLabel>Misc</SelectLabel>
                                <SelectItem value="-1">None</SelectItem>
                            </SelectGroup>
                        </SelectContent>
                    </Select>
                    <Button variant={"secondary"} onClick={() => setChooseMediaOptionsOpen(false)} className="w-1/2">Cancel</Button>
                    <Button className="w-1/2" onClick={() => {
                        addToQueue();
                        setChooseMediaOptionsOpen(false);
                    }} disabled={!chosenMediaSource}>Play</Button>
                </DialogDescription>
            </ DialogContent>
        </Dialog>
    </>   
}