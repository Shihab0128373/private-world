# Our Private World — 3D multiplayer for two

A private browser world for exactly two people: a **museum** that hangs your photos, a **house** (living room, kitchen, bedroom, balcony, lawn) and a moonlit **garden**. Real-time multiplayer (Socket.IO), real peer-to-peer voice (WebRTC), desktop + mobile controls.

Your 29 photos are bundled in `seed-photos/` and are loaded into the museum's four exhibition rooms the first time the server starts.

## Run it locally
```bash
npm install
npm start            # http://localhost:3000
```
Open the URL in two browser windows (or two devices on the same network). Window 1: **Create Room** → copy the invitation link. Window 2: paste the link (or the 6-letter code) → **Join Room**. Microphone access works on `localhost` and on any `https://` site.

## Deploy so two people can use one URL
The app is one Node process (Express + Socket.IO) that also serves the game. **It must run on a host with HTTPS** (microphone access requires it) and, to keep uploaded photos after restarts, **a persistent disk**.

**Render (example)**
1. Push this folder to a GitHub repo.
2. New → *Web Service* → connect the repo. Build: `npm install`. Start: `npm start`.
3. Add a **Disk** (e.g. 1 GB) mounted at `/data`, and an env var `DATA_DIR=/data`. (Free instances have no disk → photos reset on every deploy.)
4. Share the `https://…onrender.com` URL. Create a room, send the invitation link to your partner.

**Railway / Fly.io:** same idea — create a volume, mount it, set `DATA_DIR` to the mount path. Any VPS also works: `npm install && PORT=80 DATA_DIR=/var/lib/world npm start` behind Caddy/nginx for HTTPS (proxy WebSocket upgrades).

**Voice on strict networks:** voice uses Google STUN by default, which works for most home/mobile connections. If voice fails between two networks, add a TURN server via env var, e.g.
`ICE_SERVERS='[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:YOUR_TURN_HOST:3478","username":"u","credential":"p"}]'`

## Controls
| Desktop | Mobile |
|---|---|
| WASD move · Shift run · Space jump | Left joystick · Run toggle · Jump button |
| Drag mouse to look · scroll to zoom | Drag anywhere to look |
| E interact (sit, doors, travel, photos) · click a photo | ● action button · tap a photo |
| 1–5 gestures · V mute/unmute | Gestures menu · mic button |

## Features → where they live
- **Private rooms** (`server/rooms.js`, `server/index.js`): 6-char code + invite link, max 2 players, server rejects a third, players keep their seat via a private token so they can reconnect; rooms survive server restarts.
- **Sync** (`public/js/net.js`, `main.js`): position/rotation/animation/emotes/doors/appearance at ~15 Hz with interpolation; connect/disconnect notices; automatic reconnect + resume.
- **Voice** (`public/js/voice.js`): WebRTC audio, socket-relayed signalling, mic permission handling, mute button + live level ring, partner-speaking indicator, connection status, automatic ICE restart/renegotiation.
- **Characters** (`avatar.js`, `customize.js`): male/female bodies, face shapes, skin/hair/eye colours, hairstyles, eyebrows, mouth, nose, outfits & colours, accessories — each player customizes their own, with live 3D preview. Procedural walk/run/jump/sit/wave/dance/clap/bow/hug/heart animations.
- **Museum + photos** (`world.js`, `gallery.js`, `server/photos.js`): 4 rooms × 12 frames; frames resize to each photo's aspect ratio. *Photos* button: upload, replace, move between rooms, remove — no code changes. JPG/PNG/WebP, resized server-side (thumbnail for frames, 1800 px for the viewer), stored in `DATA_DIR`.
- **House / Garden**: sit on sofas, chairs, beds, benches; open/close doors (synced); balcony with a view; night garden with pond, lamps, fireflies, stars. Travel by walking through doors/gates or the *Travel* menu, with a cinematic fade.
- **Audio** (`audio.js`): generated ambient music and per-location sounds (no audio files).

## Project layout
```
server/index.js  server/rooms.js  server/photos.js
public/index.html  public/css/style.css
public/js/{main,world,avatar,net,voice,audio,controls,gallery,customize}.js
seed-photos/   (your 29 photos)    data/   (created at runtime: photos, rooms)
```

## Notes & limits
- Characters and the whole world are generated in code (no downloaded GLB assets), so the project is fully self-contained and loads fast. Swapping in GLB models would mean replacing `avatar.js`.
- Photos are accessible only to members of a room (API is token-checked); media file names are unguessable but served as static files.

### Photo captions
Open **Photos**, type a caption under a photo's thumbnail and press **Save** (or Enter). The caption appears on a small plaque under the frame in the museum and in the big photo viewer, for both players, and is stored with the photo.

### Chat (Roblox-style)
Press **Enter** (or `/`, or the Chat button on phones) to type; Enter sends, Esc cancels. Messages appear in the chat box and as speech bubbles above the players' heads. Up to 200 characters, 6 messages per 8 seconds; the last 30 messages are shown to someone who joins later.

### Permanent captions (stored in your GitHub repo)
Open `seed-photos/captions.json` and write each photo's file name and caption:
```json
{ "photo01.jpg": "Our first trip", "photo02.jpg": { "caption": "Dhaka, 2024", "room": 1 } }
```
`room` (0–3) is optional. Commit and push — the server applies the captions on every start, so they survive redeploys even without a disk. New photos: drop the file into `seed-photos/` and add its line; it is added automatically on the next start. Captions typed inside the app are kept on the server's disk (`DATA_DIR`) until you change that photo's text in `captions.json`.
