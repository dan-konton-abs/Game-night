# Roadmap

Where this project might go after the MVP. Nothing here is committed or
scheduled — it's a running list of ideas worth remembering, roughly ordered
by how well-scoped they are.

## Near-term (small, self-contained features)

Good candidates for the next few PRs, same shape as everything shipped so
far:

- Measuring/rulers
- Map layers
- Per-token vision
- Richer character sheet templates per system (beyond the free-form
  attribute list)

## Bigger bets (long-term, multi-PR projects)

### VR tabletop (Quest 3)

A second client alongside the existing 2D web app - not a replacement.
Regular players keep using the flat board exactly as now; anyone on a Quest
3 could instead join the same room in VR and see the map as a physical
table with 3D "hologram" tokens, using the Quest's native hand tracking to
pick up and move them.

Feasible because Quest 3's browser supports WebXR (including the hand-input
API), so this doesn't need a native app or App Lab release - a three.js +
WebXR client can connect to the same Socket.IO room and render the same
state everyone else sees, just as a 3D scene instead of a 2D canvas. The
room-state schema barely changes; this is purely an additional renderer/
client, not a rework of the server.

The real cost is VR-specific: comfortable table scale/calibration to the
player's real space, mapping pinch-grab-and-release to the same x/y token
coordinates the 2D board already uses, and performance on Quest's mobile
chipset. Realistically months of part-time work, not a single feature PR.

Suggested path in, in order:
1. Read-only 3D viewer - render the live board as a diorama, no interaction.
2. Add token movement via the Quest's normal pointer/trigger (not hands).
3. Add hand-tracking as the final step, once the above works.

### Local LLM Game Master assistant

An in-app assistant the GM can load campaign notes/rules into and ask
improv questions like "Player 1 enters the cargo bay - what happens?", or
use as a writing aid for plot beats.

Model size matters less than feeding it the right context. An 8B-class
local model (Llama 3.1 8B, Qwen2.5 7B/8B, Mistral 7B) via Ollama is a
reasonable starting point - decent creative-writing quality, and it'll run
on CPU alone at a readable (not instant) pace if the host box has no GPU.
The bigger lever is retrieval: chunk the GM's notes and pull in the
relevant bits per question (basic RAG) rather than expecting a small model
to "remember" a whole campaign unprompted. If quality isn't good enough
after that, a 13-14B model (e.g. Qwen2.5 14B) is the next step up, but
worth trying the smaller option with good context retrieval first.

### Voice chat

An open in-app voice room per game, so the table doesn't need Discord (or
anything else) open alongside it - not because Discord voice doesn't work
fine today, but because one app is nicer than two, and GM-side mute
control is something Discord doesn't give you as easily. Purely a nice-to-
have, not solving a real pain point, so this sits behind the near-term
features rather than ahead of them.

Mesh WebRTC (every participant connects directly to every other
participant) rather than an SFU media server - right call at table-sized
groups (4-8 people), and means no new server infrastructure beyond a
handful of new Socket.IO events for signaling (offer/answer/ICE candidate
exchange between peers in the same room). The server never touches actual
audio in this model, just small JSON handshake messages, reusing the same
per-room socket plumbing already in place for everything else.

- **Mute / push-to-talk**: fully client-side - each browser just flips its
  own outgoing audio track's `enabled` flag. No server involvement.
- **GM mute-all / mute-individual**: WebRTC only gives you control over
  your *own* mic, not anyone else's, so this has to work as a request
  relayed through the server ("GM asks the server to ask Player 3's
  browser to mute itself") rather than a hard, unbypassable mute. That's
  fine for a trusted friend group - same trust model the rest of the app
  already runs on - but worth remembering it's a polite request, not
  enforcement.
- **The real risk**: WebRTC needs a STUN server to punch through NAT, which
  free public ones handle for most home networks - but some networks
  (symmetric NAT, some corporate/hotel/CGNAT setups) need a TURN relay
  server as a fallback, or that one person's audio silently never connects.
  Self-hosting a TURN server (coturn) on the same box is a solid, moderate-
  effort mitigation, not an expensive one - but this class of bug is
  invisible in local testing and only shows up against everyone's real home
  networks. Whatever gets built here needs a real soak-test with the whole
  group well before a session that actually matters, not a live debug on
  game night itself.

## Business model direction

Intent: release this publicly on GitHub, free to self-host, with a paid
hosted option and/or a subscription tier unlocking extra features (the AI
GM assistant, VR client, etc. above).

Architecture note for the hosted tier: the current server keeps room state
in memory plus one JSON file per room, on a single process. That's fine for
one instance but does **not** horizontally scale as-is - two instances
behind a load balancer would each have their own view of the world, so a
group split across instances would silently diverge. Scaling out (not just
up) requires moving room state to something shared first (Redis, with
Socket.IO's Redis adapter for cross-instance broadcast) - that's a
prerequisite piece of work, not a hosting-provider setting.

Given expected load (a hosted tier for a niche self-hosted tabletop app,
not a mass-market app), the planned sequencing is:

1. **Now, and for a good while**: one instance, scaled vertically if ever
   needed. A tabletop session is tiny traffic (a handful of sockets, small
   JSON payloads) - one modest box goes a long way before this is the
   bottleneck.
2. **If hosted demand actually justifies it**: do the Redis/shared-state
   rework, then run multiple instances behind a load balancer (with sticky
   sessions). Reach for a platform built around small stateful/WebSocket
   apps - Fly.io, Render, or Railway - rather than raw AWS EC2 with
   hand-rolled Auto Scaling Groups. Those give scale-to-zero and simple
   deploys without taking on load balancer/health-check/patching ops work
   as a solo maintainer.
3. **Raw EC2 + ASG** is not the recommended starting point - only worth
   revisiting if a specific need (cost at real scale, compliance) outgrows
   what a PaaS offers.
