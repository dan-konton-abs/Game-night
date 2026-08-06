# The Ante-Chamber

A bespoke, shared online game board for tabletop-style sessions — one Game
Master sets the map, everyone sees and moves tokens in real time, plus a
shared dice roller and a basic per-player character sheet.

This is an MVP: enough to run a real session, deliberately not
over-engineered. Ideate and extend from here.

## What's in the MVP

- **Rooms.** One person creates a room (becomes the Game Master) and shares
  the 5-character room code. Everyone else joins with that code. A theme is
  picked at creation time (currently Classic/default or a Sci-Fi ship-cockpit
  look) and applies for everyone in the room; the GM can change it later from
  GM Tools. Adding another theme is just a CSS block plus a registry entry -
  see `client/src/themes.js`. The sidebar (Chat/Dice/Character/etc.) can be
  dragged wider or narrower from its left edge if the tabs ever feel cramped
  for your screen/font - it remembers your chosen width next time.
- **Shared board.** The GM sets a background map (paste an image URL, or
  upload an image file). An optional grid overlay can be toggled/resized,
  and switched between square and hexagonal (better for tactical line-of-
  sight) from GM Tools. Anyone can independently zoom in/out on their own
  view (buttons, or
  Ctrl/Cmd+scroll wheel, trackpad pinch, or a two-finger touch pinch on
  tablet/phone) and pan around by scrolling or one-finger dragging on touch —
  purely a personal viewing preference, so one player zooming in doesn't
  change what anyone else sees. The grid and tokens scale together with
  zoom, so alignment with the GM's configured grid size is never thrown off.
  On a tablet, pinch and drag are scoped to the board itself rather than
  zooming the whole page. A separate GM-only "Map scale" slider (GM Tools →
  Grid) resizes just the map image, independent of everyone's personal zoom
  and of the grid/token sizes - handy when a map's own printed grid doesn't
  quite match this app's grid size: set token sizes against the grid first,
  then scale the map image to line its squares up, without disturbing either.
- **Fog of war.** The GM can toggle a fog layer over the map from the
  "🌫 Fog of War" control above the board, then drag to paint areas hidden or
  revealed (pick a brush size, or Reveal All/Hide All to clear the whole
  map at once). Turning it on for the first time hides the whole map by
  default - the usual "reveal as the party explores" flow - and toggling it
  off and back on later preserves whatever's already been painted instead of
  resetting it. Hidden areas are fully opaque for players (covering tokens
  underneath too) but only dimmed for the GM, who always sees the full board
  while painting. Fog is saved as part of each Scene, so switching locations
  brings back that location's own fog state.
- **Tokens.** Anyone can add a token (their own); the GM can add tokens for
  anyone or unowned NPCs/monsters. A token's image can be set by pasting a
  URL or uploading a file directly, same as the map background — a preview
  shows before you add it, and a link that fails to load falls back to the
  token's color and initials instead of rendering as a blank circle. Tokens
  are dragged directly on the board and everyone sees moves instantly.
  Double-click your own token (or any token, if you're the GM) to rename it,
  recolor it, set an image, resize it,
  or reassign its owner.
- **Dice.** Three rolling modes, toggled per-player:
  - **D&D-style**: quick buttons for d4/d6/d8/d10/d12/d20/d100 (pick one,
    then a count stepper appears to roll several at once, e.g. 4d6), or
    type a formula like `2d6+3` for modifiers.
  - **Alien RPG**: a base dice + stress dice pool (both d6). Each 6 rolled
    is a success (stress dice are visually flagged in the tray so you can
    tell them apart); a 1 on any stress die is flagged as a Panic trigger.
  - **Blade Runner**: an attribute die + skill die, each sized by level
    (A-D → D12/D10/D8/D6) — pick both levels, an Advantage/Disadvantage/none
    modifier, and whether the roller is a Replicant. 6+ on a die succeeds
    (10+ counts as two, shown with a distinct gold highlight); rolling two or
    more successes is a critical. A "Push the roll" button appears after a
    settled roll (only to whoever rolled it) and re-rolls anything that
    isn't already showing a 1 — humans get one push, Replicants get two —
    reporting how many points of damage or stress (intelligence/empathy
    rolls, or any Replicant roll, cost stress instead) each push inflicts.
  Every roll plays an animated tumble for everyone currently on the Dice
  tab — d6 shows real pip faces — landing on the real server-computed
  result, then joins the shared log. On the Sci-Fi theme, a per-player
  "Dice skin" picker swaps the die look between Classic, an LED numeral
  readout, a translucent holographic projection, or an angular hex panel -
  purely cosmetic and local to your browser, doesn't affect anyone else's
  view.
- **Chat.** A shared text log alongside the board, for anything easier to
  type than say over voice (links, OOC notes, etc). A selector at the top
  switches between the shared "Everyone" channel and a private 1:1 whisper
  with any other player — the GM can quietly pass a player secret
  instructions, and players can scheme without the GM seeing. Whispers are
  enforced server-side (only ever sent to the two people involved, never
  broadcast to the room), not just hidden in the UI — though if whoever
  hosts the server is also a player, they'd still have disk access to the
  stored messages, so it's private from the table, not from the host.
  History persists with the room. Unread messages show a badge on the Chat
  tab (and per-thread in the conversation selector) whenever you're looking
  elsewhere, plus a `(n)` count in the browser tab title.
- **Character sheets.** Each person gets one sheet: name, class/role, level,
  HP/max HP, defense, a free-form list of attributes (add/rename/remove
  rows — so it fits a non-D&D system), inventory, and notes. The GM can view
  and edit everyone's sheet; players edit their own. An amount field plus
  Damage/Heal buttons adjust HP by that much in one click instead of typing
  a new total, and always stay clamped between 0 and Max HP.
- **Initiative tracker.** "Start Combat" auto-adds everyone currently in the
  game; the GM can also explicitly link any player to a turn with a custom
  value (a dropdown lists whoever isn't linked yet), and add NPCs/monsters
  with their own initiative value and no player attached. The list is
  grouped into "Players" and "GM's Monsters" so it's obvious at a glance
  what the GM has in the fight, while the actual turn order underneath
  still runs as one correctly-interleaved sequence by value. Order locks in
  once combat starts (editing a value mid-fight doesn't reshuffle turn
  order, matching how it works at a real table). Either the GM or whoever's
  turn it currently is can advance to the next turn, with round tracked
  automatically; a badge appears on the Initiative tab for whoever's turn
  it is if they're looking at a different tab. Ending combat keeps the
  combatant list around so the same lineup can be reused for the next
  encounter. The GM can toggle "Turn reminders" on/off (on by default):
  when on, whoever's turn it is gets a themed pop-up in the top-right
  corner of the map itself - "Your Turn!" plus a Complete Turn button that
  advances initiative without needing to switch to the Initiative tab.
  Since the GM plays every monster/NPC, they get that same pop-up whenever
  it's one of their unlinked entries' turn too - the sequence flows player
  → player → GM (for each monster in turn) → next player, and so on.
  Switched off, the table just tracks turns themselves off the visible
  list, same as before this existed.
- **Accounts.** Name, email, and password — a real login rather than a
  browser-local identity, so you can pick up any game from any device.
  Forgotten passwords are reset via an emailed link (server-side SMTP,
  configured with the env vars below).
- **Scenes.** The GM can save the current map (background + grid + every
  token's position/appearance) as a named scene from GM Tools, then switch
  locations without scrambling the layout - loading a different scene later
  restores each one's own board and tokens exactly as saved. Scenes can be
  updated (re-saved over themselves), renamed, or deleted; switching prompts
  a reminder to save first if you want to keep the current setup, since
  loading replaces the live board/tokens.
- **Locker.** A GM-only tab for reusable assets that outlive any one scene:
  save a token's appearance (label/image/color/size) as a preset and place a
  fresh copy on the board any time; save a background image as a reusable
  map preset and apply it to the live board whenever that location comes
  back up (lighter-weight than a Scene, which also snapshots token
  positions); save a recurring monster/NPC's appearance plus free-form notes
  (stat block, tactics, whatever's useful) and drop it in whenever it shows
  up again. Everything in the Locker can be renamed or deleted.
- **Rules Keeper.** The GM uploads this game's rulebook as a PDF from GM
  Tools, and anyone can then ask "📖 Instructions" (top bar, always visible)
  questions about it - answered in-character by a grumpy AI archivist who
  resents being woken up but is meticulous about getting the rules right.
  Good for picking up a new system's rules as you play instead of stopping
  to look them up. Each person's conversation is their own (not shared with
  the table, like whispers), and the Keeper only ever sees the rulebook
  itself plus that person's own past questions - it has no access to the
  live game (tokens, chat, character sheets, etc.) and never will unless
  that's deliberately built later. Requires a `GEMINI_API_KEY` (see below);
  without one, asking just explains that to whoever asks.
- **My Games dashboard.** After logging in you land on a list of every game
  you're part of (as GM or player), each with a name the GM can set (and
  rename any time), so you can run more than one game at a time and resume
  any of them later without needing to remember room codes. The GM can
  delete a game entirely (for everyone, with a confirmation — anyone still
  actively in it gets bounced back to their own dashboard with a notice);
  a non-GM player can leave a game to drop it from just their own list
  without affecting anyone else. GM duties aren't permanent either — the
  current GM can hand the role to any other player in the game (Players
  tab, "Make GM"), keeping the board/tokens/characters/history intact.
- **Reconnect resilience.** A WiFi blip, laptop sleep, or brief server hiccup
  drops the live connection; when it comes back, the app automatically
  rejoins the room you were in server-side (not just a client-side
  illusion) rather than leaving you looking at a board that's quietly
  stopped syncing. A banner shows while reconnecting so it's never silent.
- **Admin accounts.** Emails listed in `ADMIN_EMAILS` (see below) land on a
  dedicated admin screen instead of the game dashboard — no game-playing UI
  at all, just a table of every registered account. From there you can
  disable an account (kicks them immediately and blocks login until
  re-enabled), re-enable one, trigger a password reset (hands you the reset
  link directly, useful if email isn't set up), or delete an account outright
  (blocked while they're still GM of a game, so you transfer or delete that
  first). Admin status is computed from the env var on every request, not
  stored on the account, so there's nothing to accidentally leave lying
  around with elevated access.
- **3D dice pop-up.** Any roll (D&D-style, Alien RPG stress pools, Blade
  Runner) can briefly play a real 3D dice-tumble animation over the map,
  visible to everyone in the room regardless of which tab they're on —
  landed on the same result the 2D tray/log already show (the animation is
  purely presentational; the server still decides the actual roll). A
  setting next to the dice-skin picker (Off / Potato / High) controls it per
  person, since it's a WebGL canvas and not every laptop at the table needs
  to render it. Off keeps everything exactly as before.
- **Sci-fi cockpit surround.** The sci-fi theme's board and sidebar sit
  inside an armoured console housing — rivets, a rounded CRT bezel with a
  slow refresh sweep, grime overlay — layered on top of the existing
  terminal-green styling rather than replacing it. Classic theme is
  completely unaffected.

Not in the MVP (good candidates for v2+): measuring/rulers, map layers,
per-token vision, richer character sheet templates per system. See
[ROADMAP.md](ROADMAP.md) for these plus longer-term ideas (a VR/Quest 3
client, a local-LLM GM assistant) and the planned self-host/hosted split.

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
  state and accounts) and `server/uploads` (uploaded map/token images) if you
  want those to survive a redeploy — without one, everything resets each
  time the service restarts, which is fine for a single session but
  annoying across weeks.

Environment variables worth setting for a real deployment (all optional for
local dev, where sensible defaults/fallbacks kick in with a console warning):
- `JWT_SECRET` — signs login tokens. Without one, a random secret is
  generated at startup, which invalidates everyone's login on every restart.
  Generate a real one with `openssl rand -hex 32`.
- `PUBLIC_URL` — the site's real public URL (e.g. `https://game.yourdomain.com`),
  used to build the link in password-reset emails. Defaults to
  `http://localhost:<PORT>`, which is wrong for anything but local dev.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`,
  `MAIL_FROM` — your mail server, for sending password-reset emails. Without
  `SMTP_HOST` set, reset links are just logged to the server console instead
  of emailed — fine for local dev, not for real use.
- `GEMINI_API_KEY` — powers the Rules Keeper (see below). Without one, asking
  the Keeper a question fails with a message pointing at this variable
  instead of an error. Get a key from
  [Google AI Studio](https://aistudio.google.com/apikey).
- `GEMINI_MODEL` — which Gemini model the Keeper uses. Defaults to
  `gemini-2.5-flash`, a good balance of cost and quality for this.
- `ADMIN_EMAILS` — comma-separated list of email addresses that get an admin
  account instead of a playing one (see below). Without it, nobody is an
  admin. Revoking access is just removing the email and restarting.

Then share the public URL with the group instead of `localhost:5173`, same
Discord call as always, new tab pointed at the board.

Self-hosting on your own hardware (e.g. a Proxmox LXC) instead of a cloud
host? See [DEPLOY.md](DEPLOY.md) for a full runbook, including exposing it
publicly via Cloudflare Tunnel without opening any ports on your router.

## Notes on the data model

Everything lives in one JSON blob per room (`server/data/rooms/<CODE>.json`):
board settings, tokens, characters, players, a capped dice log, and private
whisper threads. Accounts live separately in `server/data/users.json`
(bcrypt-hashed passwords, never plaintext). There's no database — for a
handful of friends this is simpler to reason about and easy to hand-edit if
you ever need to.

Permissions are enforced server-side: only the GM can change the map/grid, a
token can only be moved/edited/deleted by its owner or the GM, and every
socket connection is authenticated by a signed login token (JWT) — a
player's identity is derived from that token, never trusted from whatever
the client claims. Joining a room by code is still how someone gets in the
first time; after that, their account remembers which games they're part
of.
