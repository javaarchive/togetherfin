# togetherfin
watch together jellyfin server with end to end encryption of content (note: there is some metadata sent, see header below). objective is to try to have the server know as less as possible about the content in the room and only manage relaying data.

## usage

## deploying
This repository uses a monorepo structure for the frontend and backend. It is configured out of the box to work with the monorepo structure, however on deploying to a server you may wish to only deploy the backend with a prebuilt version of the server.

### frontend
The frontend app is a react app with React Router, Vite built with TailwindCSS + Shadcn UI. It utilizes the Jellyfin Typescript SDK for most of the jellyfin interactions.
```bash
cd togetherfin-app
npm install # install dependencies, replace with your favorite package manager
npm run build # build the frontend
```
If you want to try discord integration which does not work you may see `.env.example` on how to set your discord client id.

### server
The server is a hono server with a socket.io realtime server that serves the SPA app and api endpoints.
```bash
cd togetherfin-server
npm install # install dependencies, replace with your favorite package manager
npm run build # build the server
npm run start # start the server
```
Alternatively after installing dependencies you can do `npm run dev` which will start the server in watch mode however all your rooms are wiped on the slightest change to the code due to the nature of the reload functionality.
You may wish to take a look at `.env.example`
```bash
# needs to be random per server
JWT_SECRET=superrandomstring
# comma seperated host codes
HOST_CODES=a,b,c
# where to find the prebuilt frontend, useful for running in production
FRONTEND_ROOT=./client
# uncomment and edit to enable discord activity integration
# VITE_DISCORD_CLIENT_ID=123456789
# DISCORD_CLIENT_SECRET=example
```

### backend

## protocol
### What the host does
1. Make a POST request to /api/room with a json payload containing the room id and a challenge (room metadata encrypted with the set password/key), and also a host code if applicable. The server validates the host code and generates a session key which is a JWT. If there is already a room with the same id but the same host code "owns" the room, the server will allow that host to use the room id, otherwise it will reject the request.
2. The challenge and id is stored serverside for reference later. The client now makes it's realtime socket.io connect and "upgrades" using the session key given on connect so it gains permissions like being able to broadcast it's own messages to the room.
3. Client chooses it's media and starts broadcasting it's current item and playback state as an encrypted broadcast message to the room over the socket.io socket.
4. In addition the client uploads the streaming data encrypted to the server through the special file upload endpoint. There are two different types of "channels" files can go under, `special` and `default`. Time sensitive files, mostly video segments are stored in `default` whereas files that need to like longer like subtitles are stored in `special`. The server indicates which files are special if the key of a file starts with `_`. The server uses these channels while rotating the files because each channel has a different max files limit, exceeding this limit will cause the oldest files to be deleted, ensuring that the server does not use an absurd amount of memory accumulating the encrypted segments by only storing the most likely needed files.

### What the guest does
1. Make a GET request to /api/room/:roomId with the room id to ensure the room exists.
2. Client downloads the challenge from the server and attempts to solve it by decrypting with the provided password/key provided by the user.
3. If the challenge is solved, the client makes a socket.io connection to join the room so it can start receiving encrypted messages from the host.
4. The client recieves a "sync" event with the current item and playback state from the host, and if it detects it needs to switch to a new item, loads the new item's master playlist and starts playing it.

### file uploads
the server serves all files with `application/octet-stream` mime type for security even though the files are encrypted. However, a current limitation of the system is that the host actively tells the server the mimetype of the file being transmited so the server can provide it to the client for ease of implementation. This is to be addressed in later revisions of the protocol.

## currently known issues and things being worked on
* stability on bad internet connections + servers with very thin bandwidth
* some subtitles are unable to be selected.
* ass subtitles are an entire rabbit hole of implementation, low priority, basically you can ship a entire font with subtitles now.
* oops this might only work on Chromium browsers due to other browsers not implemented enough media related things.
* there is currently a profile system in which when a video is being streamed a playback session is created per profile configuration allowing different qualities of video to be streamed, however the ui for using these profiles has not been implemented yet.
* queue is buggy.