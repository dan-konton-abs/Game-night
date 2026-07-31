# Game Night

A bespoke, shared online game board for tabletop-style sessions — one Game
Master sets the map, everyone sees and moves tokens in real time, plus a
shared dice roller and a basic per-player character sheet.

This is an MVP: enough to run a real session, deliberately not
over-engineered. Ideate and extend from here.

## What's in the MVP

- **Rooms.** One person creates a room (becomes the Game Master) and shares
  the 5-character room code. Everyone else joins with that code.
- **Shared board.** The GM sets a background map (paste an image URL, or
  upload an image file). An optional grid overlay can be toggled/resized.
- **Tokens.** Anyone can add a token (their own); the GM can add tokens for
  anyone or unowned NPCs/monsters. Tokens are dragged directly on the board
  and everyone sees moves instantly. Double-click your own token (or any
  token, if you're the GM) to rename it, recolor it, set an image, resize it,
  or reassign its owner.
- **Dice.** Quick buttons for d4/d6/d8/d10/d12/d20/d100, or type a formula
  like `2d6+3`. Every roll is posted to a shared log everyone can see.
- **Chat.** A shared text log alongside the board, for anything easier to
  type than say over voice (links, OOC notes, etc). A selector at the top
  switches between the shared "Everyone" channel and a private 1:1 whisper
  with any other player — the GM can quietly pass a player secret
  instructions, and players can scheme without the GM seeing. Whispers are
  enforced server-side (only ever sent to the two people involved, never
  broadcast to the room), not just hidden in the UI — though if whoever
  hosts the server is also a player, they'd still have disk access to the
  stored messages, so it's private from the table, not from the host.
  History persists with the room.
- **Character sheets.** Each person gets one sheet: name, class/role, level,
  HP/max HP, defense, a free-form list of attributes (add/rename/remove
  rows — so it fits a non-D&D system), inventory, and notes. The GM can view
  and edit everyone's sheet; players edit their own.
- **Reconnect-friendly.** Your name/room/character persist in the browser, so
  a refresh or dropped connection rejoins you to the same seat.

Not in the MVP (good candidates for v2+): fog of war, initiative
tracker/turn order, measuring/rulers, layers, per-token vision, richer
character sheet templates per system, authentication beyond a room code.

## Project layout

```
server/   Node + Express + Socket.IO — authoritative game state, dice rolls,
          image uploads. Persists each room to a JSON file so a restart
          doesn't wipe a session.
client/   React + Vite frontend — the board, sidebar tabs (Dice, Character,
          Players, GM Tools), all synced over Socket.IO.
```

State is broadcast as one consistent snapshot per room on every change —
simple to reason about, plenty fast for a handful of players.

## Running it locally

Requires Node 18+.

```bash
npm install          # installs both workspaces
npm run dev:server   # starts the API/socket server on :4000
npm run dev:client   # in another terminal, starts Vite on :5173
```

Open `http://localhost:5173`. One tab/browser = one seat: the first person
should choose "Start a Game (GM)"; everyone else picks "Join a Game" with the
room code shown at the top of the GM's screen.

To try it solo, open a second tab in an incognito/private window (regular
tabs share the same browser storage/identity).

## Running it for an actual online session

Everyone connects over the internet, so the server needs to be reachable
somewhere other than your laptop's `localhost`. Simplest path: deploy the
whole app as a single Node service (it serves the built React app itself, so
there's only one thing to host).

```bash
npm run build     # builds client/dist
npm start         # runs the server, which also serves client/dist
```

Any small Node host works (Render, Railway, Fly.io, a cheap VPS, etc.):
- Build command: `npm install && npm run build`
- Start command: `npm start`
- Expose port via the `PORT` env var (defaults to 4000)
- Give the service a **persistent volume** mounted at `server/data` (room
  state) and `server/uploads` (uploaded map/token images) if you want those
  to survive a redeploy — without one, rooms and uploaded images reset each
  time the service restarts, which is fine for a single session but
  annoying across weeks.

Then share the public URL with the group instead of `localhost:5173`, same
Discord call as always, new tab pointed at the board.

Self-hosting on your own hardware (e.g. a Proxmox LXC) instead of a cloud
host? See [DEPLOY.md](DEPLOY.md) for a full runbook, including exposing it
publicly via Cloudflare Tunnel without opening any ports on your router.

## Notes on the data model

Everything lives in one JSON blob per room (`server/data/<CODE>.json`):
board settings, tokens, characters, players, and a capped dice log. There's
no database — for a handful of friends this is simpler to reason about and
easy to hand-edit if you ever need to.

Permissions are enforced server-side: only the GM can change the
map/grid, and a token can only be moved/edited/deleted by its owner or the
GM. There's no account system — the room code is the only "auth", which
matches how Owlbear-style boards are typically used within a trusted group.
