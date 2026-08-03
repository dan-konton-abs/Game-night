const path = require("path");
const fs = require("fs");
const http = require("http");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const { Server } = require("socket.io");

const store = require("./roomStore");
const userStore = require("./userStore");
const { signToken, verifyToken } = require("./auth");
const { sendPasswordResetEmail } = require("./mailer");
const { rollFormula, rollAlienPool, rollBladeRunner, pushBladeRunner } = require("./dice");
const { askRulesKeeper, MAX_HISTORY: RULES_KEEPER_MAX_HISTORY } = require("./rulesKeeper");

const PORT = process.env.PORT || 4000;
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;

// Admin accounts are just regular accounts whose email is on this list - no
// stored/mutable "isAdmin" flag to accidentally tamper with, and revoking is
// as simple as editing this env var and restarting.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

function isAdminEmail(email) {
  return ADMIN_EMAILS.includes(String(email || "").toLowerCase());
}
const CLIENT_DIST = path.join(__dirname, "..", "client", "dist");
const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(UPLOAD_DIR));

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${store.newId()}${ext}`);
    },
  }),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^(image|audio)\//.test(file.mimetype) || file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Only image, audio, or PDF uploads are allowed"));
  },
});

app.post("/api/upload", upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  res.json({ url: `/uploads/${req.file.filename}` });
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts - please wait a while and try again." },
});

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const payload = token && verifyToken(token);
  if (!payload) return res.status(401).json({ error: "Not signed in." });
  // Re-checked against the live account (not just the JWT) on every request,
  // so disabling/deleting an account takes effect immediately rather than
  // waiting for its long-lived token to expire.
  const user = userStore.findById(payload.id);
  if (!user || user.disabled) return res.status(401).json({ error: "This account is no longer active." });
  req.user = payload;
  next();
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!isAdminEmail(req.user.email)) return res.status(403).json({ error: "Admins only." });
    next();
  });
}

function withIsAdmin(user) {
  return { ...userStore.publicUser(user), isAdmin: isAdminEmail(user.email) };
}

app.post("/api/auth/signup", authLimiter, async (req, res) => {
  try {
    const name = clampText(req.body.name, 40).trim();
    const email = clampText(req.body.email, 200).trim();
    const password = String(req.body.password || "");

    if (!name) return res.status(400).json({ error: "Name is required." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }

    const user = await userStore.createUser({ name, email, password });
    res.json({ token: signToken(user), user: withIsAdmin(user) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  const email = clampText(req.body.email, 200).trim();
  const password = String(req.body.password || "");

  const user = userStore.findByEmail(email);
  if (!user || !(await userStore.verifyPassword(user, password))) {
    return res.status(401).json({ error: "Incorrect email or password." });
  }
  if (user.disabled) return res.status(403).json({ error: "This account has been disabled." });
  res.json({ token: signToken(user), user: withIsAdmin(user) });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  const user = userStore.findById(req.user.id);
  if (!user) return res.status(401).json({ error: "Account no longer exists." });
  res.json({ user: withIsAdmin(user), games: store.listRoomsForUser(user.id) });
});

app.post("/api/auth/forgot-password", authLimiter, async (req, res) => {
  const email = clampText(req.body.email, 200).trim();
  const user = userStore.findByEmail(email);
  if (user) {
    const rawToken = userStore.createResetToken(user);
    const resetUrl = `${PUBLIC_URL}/reset-password?uid=${user.id}&token=${rawToken}`;
    sendPasswordResetEmail(user.email, resetUrl).catch((err) =>
      console.error("Failed to send reset email:", err.message)
    );
  }
  // Same response whether or not the email exists - avoids leaking who has an account.
  res.json({ ok: true });
});

app.post("/api/auth/reset-password", authLimiter, async (req, res) => {
  const newPassword = String(req.body.newPassword || "");
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }

  const user = userStore.consumeResetToken(String(req.body.uid || ""), String(req.body.token || ""));
  if (!user) return res.status(400).json({ error: "That reset link is invalid or has expired." });

  await userStore.setPassword(user, newPassword);
  res.json({ ok: true });
});

app.patch("/api/games/:code", requireAuth, (req, res) => {
  const room = store.ensureLoaded(req.params.code);
  if (!room) return res.status(404).json({ error: "Game not found." });
  if (room.gmPlayerId !== req.user.id) {
    return res.status(403).json({ error: "Only the Game Master can rename this game." });
  }

  room.name = clampText(req.body.name, 60).trim() || null;
  store.touch(room.code);
  const { whispers, ...publicState } = room;
  io.to(room.code).emit("room:state", publicState);
  res.json({ ok: true });
});

app.delete("/api/games/:code", requireAuth, (req, res) => {
  const room = store.ensureLoaded(req.params.code);
  if (!room) return res.status(404).json({ error: "Game not found." });
  if (room.gmPlayerId !== req.user.id) {
    return res.status(403).json({ error: "Only the Game Master can delete this game." });
  }

  io.to(room.code).emit("room:deleted", { reason: "The Game Master deleted this game." });
  io.in(room.code).socketsLeave(room.code);
  store.deleteRoom(room.code);
  res.json({ ok: true });
});

app.post("/api/games/:code/leave", requireAuth, (req, res) => {
  const room = store.ensureLoaded(req.params.code);
  if (!room) return res.status(404).json({ error: "Game not found." });
  const userId = req.user.id;
  if (!room.players[userId]) return res.status(404).json({ error: "You're not part of this game." });
  if (room.gmPlayerId === userId) {
    return res.status(400).json({ error: "Transfer or delete the game instead of leaving as GM." });
  }

  delete room.players[userId];
  delete room.characters[userId];
  store.touch(room.code);

  const targetSocketId = playerSockets.get(userId);
  if (targetSocketId) {
    io.to(targetSocketId).emit("room:deleted", { reason: "You left this game." });
    io.sockets.sockets.get(targetSocketId)?.leave(room.code);
  }

  const { whispers, ...publicState } = room;
  io.to(room.code).emit("room:state", publicState);
  res.json({ ok: true });
});

// Forces an already-connected socket to reconnect, which re-runs the
// io.use auth middleware below - since that middleware now rejects
// disabled/deleted accounts, this is what makes admin actions take effect
// immediately instead of waiting for the account's next natural reconnect.
function kickPlayerSocket(userId) {
  const socketId = playerSockets.get(userId);
  const sock = socketId && io.sockets.sockets.get(socketId);
  sock?.disconnect(true);
}

app.get("/api/admin/users", requireAdmin, (req, res) => {
  const users = userStore
    .listAll()
    .map((u) => ({ ...userStore.adminUserView(u), gameCount: store.listRoomsForUser(u.id).length }))
    .sort((a, b) => b.createdAt - a.createdAt);
  res.json({ users });
});

app.post("/api/admin/users/:id/disable", requireAdmin, (req, res) => {
  const user = userStore.findById(req.params.id);
  if (!user) return res.status(404).json({ error: "Account not found." });
  if (isAdminEmail(user.email)) return res.status(400).json({ error: "Can't disable an admin account." });

  userStore.setDisabled(user, true);
  kickPlayerSocket(user.id);
  res.json({ ok: true });
});

app.post("/api/admin/users/:id/enable", requireAdmin, (req, res) => {
  const user = userStore.findById(req.params.id);
  if (!user) return res.status(404).json({ error: "Account not found." });

  userStore.setDisabled(user, false);
  res.json({ ok: true });
});

app.post("/api/admin/users/:id/reset-password", requireAdmin, (req, res) => {
  const user = userStore.findById(req.params.id);
  if (!user) return res.status(404).json({ error: "Account not found." });

  const rawToken = userStore.createResetToken(user);
  const resetUrl = `${PUBLIC_URL}/reset-password?uid=${user.id}&token=${rawToken}`;
  sendPasswordResetEmail(user.email, resetUrl).catch((err) =>
    console.error("Failed to send admin-triggered reset email:", err.message)
  );
  // Handed back directly (not just emailed) since this is a personal deployment -
  // handy to relay the link yourself if SMTP isn't set up, or isn't working.
  res.json({ ok: true, resetUrl });
});

app.delete("/api/admin/users/:id", requireAdmin, (req, res) => {
  const user = userStore.findById(req.params.id);
  if (!user) return res.status(404).json({ error: "Account not found." });
  if (isAdminEmail(user.email)) return res.status(400).json({ error: "Can't delete an admin account." });

  const gmOf = store.listRoomsForUser(user.id).filter((g) => g.role === "gm");
  if (gmOf.length > 0) {
    return res.status(400).json({
      error: `They're the GM of ${gmOf.length} game(s) (${gmOf.map((g) => g.name || g.code).join(", ")}) - transfer or delete those first.`,
    });
  }

  userStore.deleteUser(user.id);
  kickPlayerSocket(user.id);
  res.json({ ok: true });
});

if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get("*", (req, res) => {
    res.sendFile(path.join(CLIENT_DIST, "index.html"));
  });
}

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Keep in sync with client/src/themes.js - server is the source of truth for
// what's actually allowed, since theme id is client-supplied input.
const VALID_THEMES = ["default", "scifi"];

const DEFAULT_ATTRIBUTES = [
  "Strength",
  "Agility",
  "Intellect",
  "Willpower",
  "Perception",
  "Charisma",
].map((label) => ({ id: store.newId(), label, value: 10 }));

function clampText(value, max) {
  if (typeof value !== "string") return "";
  return value.slice(0, max);
}

function blankCharacter(playerId, name) {
  return {
    id: playerId,
    ownerId: playerId,
    ownerName: name,
    name: "",
    className: "",
    level: 1,
    hp: 10,
    maxHp: 10,
    defense: 10,
    attributes: DEFAULT_ATTRIBUTES.map((a) => ({ ...a, id: store.newId() })),
    notes: "",
    inventory: "",
  };
}

function isGM(room, playerId) {
  return room.gmPlayerId === playerId;
}

// Tracks each player's current socket so whispers can be delivered to exactly
// the two people involved, instead of the room-wide state broadcast.
const playerSockets = new Map();
// Simple in-memory per-player cooldown for Rules Keeper questions - not
// persisted, just a guard against accidental double-submits hitting the
// paid Gemini API twice for the same question.
const rulesKeeperCooldowns = new Map();

function broadcast(room) {
  store.touch(room.code);
  // Whispers are deliberately excluded here - they're delivered by direct
  // socket targeting instead, so they never pass through everyone's client.
  // Rules Keeper conversations get the same treatment (each player's Q&A
  // history is their own), but the rulebook's fileName/uploadedAt stay
  // public so everyone can see one is loaded.
  const { whispers, rulesKeeper, ...publicState } = room;
  const { conversations, ...publicRulesKeeper } = rulesKeeper;
  io.to(room.code).emit("room:state", { ...publicState, rulesKeeper: publicRulesKeeper });
}

function sendWhisperHistory(socket, room, playerId) {
  const threads = {};
  for (const [key, messages] of Object.entries(room.whispers || {})) {
    if (!key.includes(playerId)) continue;
    const [a, b] = key.split("|");
    const otherId = a === playerId ? b : a;
    threads[otherId] = messages;
  }
  socket.emit("chat:whisperHistory", { threads });
}

function sendRulesKeeperHistory(socket, room, playerId) {
  socket.emit("rulesKeeper:history", { messages: room.rulesKeeper.conversations[playerId] || [] });
}

function publicError(socket, message) {
  socket.emit("room:error", { message });
}

// Every socket must present a valid JWT from a real account - playerId is
// derived from the verified token, never trusted from client-sent payloads.
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  const payload = token && verifyToken(token);
  const user = payload && userStore.findById(payload.id);
  if (!user || user.disabled) return next(new Error("unauthorized"));
  socket.data.playerId = user.id;
  socket.data.playerName = user.name;
  socket.data.playerEmail = user.email;
  next();
});

/** Leaves whatever room this socket was previously in, marking the player offline there. */
function leaveCurrentRoom(socket) {
  const prevCode = socket.data.roomCode;
  if (!prevCode) return;
  // Leave the Socket.IO room FIRST - otherwise this socket is still subscribed
  // when we broadcast below and receives its own "you're offline now" update,
  // which would immediately overwrite the client's transition back out.
  socket.leave(prevCode);
  socket.data.roomCode = null;
  const prevRoom = store.getRoom(prevCode);
  if (prevRoom) {
    const player = prevRoom.players[socket.data.playerId];
    if (player) player.online = false;
    broadcast(prevRoom);
  }
}

io.on("connection", (socket) => {
  // Tracked from the moment the socket authenticates, not just once they join
  // a room - an admin disabling/deleting someone still logged in but sitting
  // on the My Games screen needs to be able to kick that socket too.
  playerSockets.set(socket.data.playerId, socket.id);

  socket.on("room:leave", () => {
    leaveCurrentRoom(socket);
  });

  socket.on("room:create", (payload, ack) => {
    try {
      if (isAdminEmail(socket.data.playerEmail)) {
        return ack?.({ ok: false, error: "Admin accounts can't play games." });
      }
      leaveCurrentRoom(socket);
      const playerId = socket.data.playerId;
      const cleanName = socket.data.playerName;
      const room = store.createRoom();
      room.gmPlayerId = playerId;
      room.name = clampText(payload?.gameName, 60).trim() || null;
      room.theme = VALID_THEMES.includes(payload?.theme) ? payload.theme : "default";
      room.players[playerId] = {
        id: playerId,
        name: cleanName,
        role: "gm",
        characterId: playerId,
        online: true,
      };
      room.characters[playerId] = blankCharacter(playerId, cleanName);

      socket.join(room.code);
      socket.data.roomCode = room.code;
      playerSockets.set(playerId, socket.id);

      broadcast(room);
      sendWhisperHistory(socket, room, playerId);
      sendRulesKeeperHistory(socket, room, playerId);
      ack?.({ ok: true, code: room.code, role: "gm" });
    } catch (err) {
      ack?.({ ok: false, error: err.message });
    }
  });

  socket.on("room:join", ({ roomCode }, ack) => {
    try {
      if (isAdminEmail(socket.data.playerEmail)) {
        return ack?.({ ok: false, error: "Admin accounts can't play games." });
      }
      const code = clampText(roomCode, 10).trim().toUpperCase();
      const room = store.ensureLoaded(code);
      if (!room) {
        ack?.({ ok: false, error: `No game found with code "${code}".` });
        return;
      }
      leaveCurrentRoom(socket);
      const playerId = socket.data.playerId;
      const cleanName = socket.data.playerName;
      const role = playerId === room.gmPlayerId ? "gm" : "player";

      let player = room.players[playerId];
      if (!player) {
        player = {
          id: playerId,
          name: cleanName,
          role,
          characterId: playerId,
          online: true,
        };
        room.players[playerId] = player;
      } else {
        player.name = cleanName;
        player.online = true;
      }
      if (!room.characters[playerId]) {
        room.characters[playerId] = blankCharacter(playerId, cleanName);
      } else {
        room.characters[playerId].ownerName = cleanName;
      }

      socket.join(room.code);
      socket.data.roomCode = room.code;
      playerSockets.set(playerId, socket.id);

      broadcast(room);
      sendWhisperHistory(socket, room, playerId);
      sendRulesKeeperHistory(socket, room, playerId);
      ack?.({ ok: true, code: room.code, role });
    } catch (err) {
      ack?.({ ok: false, error: err.message });
    }
  });

  function currentRoom() {
    const code = socket.data.roomCode;
    if (!code) return null;
    return store.getRoom(code);
  }

  socket.on("board:update", (patch) => {
    const room = currentRoom();
    if (!room) return;
    const playerId = socket.data.playerId;
    if (!isGM(room, playerId)) return publicError(socket, "Only the Game Master can edit the map.");

    if ("backgroundUrl" in patch) room.board.backgroundUrl = clampText(patch.backgroundUrl, 2000) || null;
    if ("gridSize" in patch) room.board.gridSize = Math.min(Math.max(Number(patch.gridSize) || 50, 10), 300);
    if ("showGrid" in patch) room.board.showGrid = !!patch.showGrid;
    if ("gridShape" in patch) room.board.gridShape = patch.gridShape === "hex" ? "hex" : "square";
    if ("mapScale" in patch) room.board.mapScale = Math.min(Math.max(Number(patch.mapScale) || 1, 0.2), 4);

    broadcast(room);
  });

  // Fog of war: a fixed-resolution grid of cells (see roomStore's FOG_COLS/
  // FOG_ROWS) that the GM paints hidden/revealed. Enabling it for the first
  // time defaults to fully hidden - the usual "reveal as the party explores"
  // workflow - but re-toggling it off and back on afterwards preserves
  // whatever the GM already painted instead of wiping it every time.
  socket.on("fog:toggle", ({ enabled }) => {
    const room = currentRoom();
    if (!room) return;
    if (!isGM(room, socket.data.playerId)) return publicError(socket, "Only the Game Master can control fog of war.");

    const fog = room.board.fog;
    fog.enabled = !!enabled;
    if (fog.enabled && !fog.initialized) {
      fog.cells = fog.cells.map(() => true);
      fog.initialized = true;
    }
    broadcast(room);
  });

  socket.on("fog:paint", ({ cells, hidden }) => {
    const room = currentRoom();
    if (!room) return;
    if (!isGM(room, socket.data.playerId)) return publicError(socket, "Only the Game Master can control fog of war.");
    if (!Array.isArray(cells)) return;

    const fog = room.board.fog;
    const value = !!hidden;
    for (const raw of cells) {
      const i = Number(raw);
      if (Number.isInteger(i) && i >= 0 && i < fog.cells.length) fog.cells[i] = value;
    }
    fog.initialized = true;
    broadcast(room);
  });

  socket.on("fog:setAll", ({ hidden }) => {
    const room = currentRoom();
    if (!room) return;
    if (!isGM(room, socket.data.playerId)) return publicError(socket, "Only the Game Master can control fog of war.");

    const fog = room.board.fog;
    fog.cells = fog.cells.map(() => !!hidden);
    fog.initialized = true;
    broadcast(room);
  });

  // The Keeper of the Rules: a grumpy AI rules assistant grounded in
  // whatever rulebook PDF the GM has loaded. Deliberately kept separate
  // from every other room-state handler - it never reads tokens, chat,
  // character sheets, or initiative, only the rulebook and the asking
  // player's own past questions.
  socket.on("rulesKeeper:setRulebook", ({ url, fileName }) => {
    const room = currentRoom();
    if (!room) return;
    if (!isGM(room, socket.data.playerId)) return publicError(socket, "Only the Game Master can set the rulebook.");
    const cleanUrl = clampText(url, 500);
    if (!cleanUrl.startsWith("/uploads/")) return publicError(socket, "Upload a PDF file first.");

    room.rulesKeeper.fileName = clampText(fileName, 200) || "Rulebook.pdf";
    room.rulesKeeper.localPath = path.join(UPLOAD_DIR, path.basename(cleanUrl));
    room.rulesKeeper.uploadedAt = Date.now();
    // The old file reference (if any) belonged to the previous rulebook -
    // force a fresh Gemini upload next time someone asks, and start every
    // player's conversation over since it referenced the old book.
    room.rulesKeeper.geminiFileUri = null;
    room.rulesKeeper.geminiFileExpiresAt = null;
    room.rulesKeeper.conversations = {};

    broadcast(room);
  });

  socket.on("rulesKeeper:remove", () => {
    const room = currentRoom();
    if (!room) return;
    if (!isGM(room, socket.data.playerId)) return publicError(socket, "Only the Game Master can remove the rulebook.");
    room.rulesKeeper = store.blankRulesKeeper();
    broadcast(room);
  });

  socket.on("rulesKeeper:clearMine", () => {
    const room = currentRoom();
    if (!room) return;
    delete room.rulesKeeper.conversations[socket.data.playerId];
    broadcast(room);
    sendRulesKeeperHistory(socket, room, socket.data.playerId);
  });

  socket.on("rulesKeeper:ask", async ({ question }, ack) => {
    const room = currentRoom();
    if (!room) return ack?.({ ok: false, error: "Not in a game." });
    const playerId = socket.data.playerId;
    const player = room.players[playerId];
    if (!player) return ack?.({ ok: false, error: "Not in a game." });

    const cleanQuestion = clampText(question, 500).trim();
    if (!cleanQuestion) return ack?.({ ok: false, error: "Ask an actual question." });
    if (!room.rulesKeeper.fileName) {
      return ack?.({ ok: false, error: "No rulebook has been loaded yet - ask your GM to upload one from GM Tools." });
    }

    // A light per-player cooldown, mostly to stop an accidental double-click
    // from firing two paid API calls for the same question.
    const now = Date.now();
    const lastAsk = rulesKeeperCooldowns.get(playerId) || 0;
    if (now - lastAsk < 3000) return ack?.({ ok: false, error: "Give the Keeper a moment to catch their breath." });
    rulesKeeperCooldowns.set(playerId, now);

    const history = room.rulesKeeper.conversations[playerId] || [];
    const userMessage = { id: store.newId(), role: "user", text: cleanQuestion, timestamp: now };

    try {
      const answer = await askRulesKeeper(room.rulesKeeper, history, cleanQuestion);
      const modelMessage = { id: store.newId(), role: "model", text: answer, timestamp: Date.now() };
      const updated = [...history, userMessage, modelMessage].slice(-RULES_KEEPER_MAX_HISTORY);
      room.rulesKeeper.conversations[playerId] = updated;

      broadcast(room);
      sendRulesKeeperHistory(socket, room, playerId);
      ack?.({ ok: true });
    } catch (err) {
      const messages = {
        NO_API_KEY: "The Keeper isn't reachable - ask whoever hosts this server to set up a Gemini API key.",
        NO_RULEBOOK: "No rulebook has been loaded yet - ask your GM to upload one from GM Tools.",
        FILE_PROCESSING_FAILED: "The Keeper couldn't make sense of that rulebook file. Try re-uploading it.",
        EMPTY_RESPONSE: "The Keeper grumbled something unintelligible. Try asking again.",
      };
      console.error("Rules Keeper error:", err.message);
      ack?.({ ok: false, error: messages[err.message] || "The Keeper is unreachable right now - try again in a moment." });
    }
  });

  // Ambient music: the GM sets a track (URL or upload, same as any other
  // media in this app) and everyone's client plays the same file in sync,
  // computed from a server timestamp rather than a played-so-far position -
  // simpler than round-tripping playback position, and it's what lets
  // someone who joins mid-track land in the right spot automatically.
  socket.on("music:update", (patch) => {
    const room = currentRoom();
    if (!room) return;
    if (!isGM(room, socket.data.playerId)) return publicError(socket, "Only the Game Master can control the music.");

    if ("url" in patch) {
      room.music.url = clampText(patch.url, 2000) || null;
      room.music.name = clampText(patch.name, 120) || null;
      room.music.playing = false;
      room.music.startedAt = null;
    }
    if ("loop" in patch) room.music.loop = !!patch.loop;

    broadcast(room);
  });

  socket.on("music:play", () => {
    const room = currentRoom();
    if (!room) return;
    if (!isGM(room, socket.data.playerId)) return publicError(socket, "Only the Game Master can control the music.");
    if (!room.music.url) return;

    room.music.playing = true;
    room.music.startedAt = Date.now();
    broadcast(room);
  });

  socket.on("music:stop", () => {
    const room = currentRoom();
    if (!room) return;
    if (!isGM(room, socket.data.playerId)) return publicError(socket, "Only the Game Master can control the music.");

    room.music.playing = false;
    room.music.startedAt = null;
    broadcast(room);
  });

  socket.on("token:add", (token) => {
    const room = currentRoom();
    if (!room) return;
    const playerId = socket.data.playerId;
    const gm = isGM(room, playerId);

    const id = store.newId();
    const ownerId = gm ? token.ownerId ?? null : playerId;

    room.tokens[id] = {
      id,
      x: Math.min(Math.max(Number(token.x) || 50, 0), 100),
      y: Math.min(Math.max(Number(token.y) || 50, 0), 100),
      size: Math.min(Math.max(Number(token.size) || 48, 16), 200),
      label: clampText(token.label, 30) || "Token",
      color: clampText(token.color, 20) || "#5b8def",
      imageUrl: clampText(token.imageUrl, 2000) || null,
      ownerId,
    };

    broadcast(room);
  });

  function canControlToken(room, playerId, token) {
    return isGM(room, playerId) || token.ownerId === playerId;
  }

  socket.on("token:move", ({ tokenId, x, y }) => {
    const room = currentRoom();
    if (!room) return;
    const token = room.tokens[tokenId];
    if (!token) return;
    const playerId = socket.data.playerId;
    if (!canControlToken(room, playerId, token)) return publicError(socket, "You can't move that token.");

    token.x = Math.min(Math.max(Number(x) || 0, 0), 100);
    token.y = Math.min(Math.max(Number(y) || 0, 0), 100);
    broadcast(room);
  });

  socket.on("token:update", ({ tokenId, patch }) => {
    const room = currentRoom();
    if (!room) return;
    const token = room.tokens[tokenId];
    if (!token) return;
    const playerId = socket.data.playerId;
    const gm = isGM(room, playerId);
    if (!canControlToken(room, playerId, token)) return publicError(socket, "You can't edit that token.");

    if ("label" in patch) token.label = clampText(patch.label, 30) || "Token";
    if ("color" in patch) token.color = clampText(patch.color, 20) || "#5b8def";
    if ("imageUrl" in patch) token.imageUrl = clampText(patch.imageUrl, 2000) || null;
    if ("size" in patch) token.size = Math.min(Math.max(Number(patch.size) || 48, 16), 200);
    if (gm && "ownerId" in patch) token.ownerId = patch.ownerId || null;

    broadcast(room);
  });

  socket.on("token:remove", ({ tokenId }) => {
    const room = currentRoom();
    if (!room) return;
    const token = room.tokens[tokenId];
    if (!token) return;
    const playerId = socket.data.playerId;
    if (!canControlToken(room, playerId, token)) return publicError(socket, "You can't remove that token.");

    delete room.tokens[tokenId];
    broadcast(room);
  });

  socket.on("character:upsert", ({ character }) => {
    const room = currentRoom();
    if (!room) return;
    const playerId = socket.data.playerId;
    const gm = isGM(room, playerId);
    const target = room.characters[character?.id];
    if (!target) return;
    if (!gm && target.ownerId !== playerId) return publicError(socket, "You can only edit your own character.");

    target.name = clampText(character.name, 40);
    target.className = clampText(character.className, 40);
    target.level = Math.min(Math.max(Number(character.level) || 1, 0), 99);
    target.hp = Math.min(Math.max(Number(character.hp) || 0, 0), 9999);
    target.maxHp = Math.min(Math.max(Number(character.maxHp) || 0, 0), 9999);
    target.defense = Math.min(Math.max(Number(character.defense) || 0, 0), 999);
    target.notes = clampText(character.notes, 4000);
    target.inventory = clampText(character.inventory, 4000);
    if (Array.isArray(character.attributes)) {
      target.attributes = character.attributes.slice(0, 20).map((a) => ({
        id: a.id || store.newId(),
        label: clampText(a.label, 24),
        value: clampText(String(a.value ?? ""), 10),
      }));
    }

    broadcast(room);
  });

  socket.on("game:transferGM", ({ toPlayerId }) => {
    const room = currentRoom();
    if (!room) return;
    const playerId = socket.data.playerId;
    if (!isGM(room, playerId)) return publicError(socket, "Only the Game Master can transfer that role.");
    const target = room.players[toPlayerId];
    if (!target || toPlayerId === playerId) return publicError(socket, "Can't transfer GM to that person.");

    room.gmPlayerId = toPlayerId;
    target.role = "gm";
    room.players[playerId].role = "player";

    broadcast(room);
  });

  socket.on("room:setTheme", ({ theme }) => {
    const room = currentRoom();
    if (!room) return;
    const playerId = socket.data.playerId;
    if (!isGM(room, playerId)) return publicError(socket, "Only the Game Master can change the theme.");
    if (!VALID_THEMES.includes(theme)) return publicError(socket, "Unknown theme.");

    room.theme = theme;
    broadcast(room);
  });

  // Scenes are independent snapshots of board+tokens the GM can save and
  // switch between, so moving to a new location doesn't scramble whatever
  // token layout was set up for the last one.
  socket.on("scene:save", ({ id, name }, ack) => {
    const room = currentRoom();
    if (!room) return;
    const playerId = socket.data.playerId;
    if (!isGM(room, playerId)) return publicError(socket, "Only the Game Master can save scenes.");

    const existing = id && room.scenes[id];
    const sceneId = existing ? id : store.newId();
    const cleanName = clampText(name, 60).trim() || existing?.name || `Scene ${Object.keys(room.scenes).length + 1}`;

    room.scenes[sceneId] = {
      id: sceneId,
      name: cleanName,
      board: JSON.parse(JSON.stringify(room.board)),
      tokens: JSON.parse(JSON.stringify(room.tokens)),
      updatedAt: Date.now(),
    };

    broadcast(room);
    ack?.({ ok: true, id: sceneId });
  });

  socket.on("scene:load", ({ id }) => {
    const room = currentRoom();
    if (!room) return;
    const playerId = socket.data.playerId;
    if (!isGM(room, playerId)) return publicError(socket, "Only the Game Master can switch scenes.");
    const scene = room.scenes[id];
    if (!scene) return publicError(socket, "That scene no longer exists.");

    room.board = JSON.parse(JSON.stringify(scene.board));
    room.tokens = JSON.parse(JSON.stringify(scene.tokens));
    store.ensureFog(room.board);
    broadcast(room);
  });

  socket.on("scene:rename", ({ id, name }) => {
    const room = currentRoom();
    if (!room) return;
    const playerId = socket.data.playerId;
    if (!isGM(room, playerId)) return publicError(socket, "Only the Game Master can rename scenes.");
    const scene = room.scenes[id];
    if (!scene) return;

    scene.name = clampText(name, 60).trim() || scene.name;
    broadcast(room);
  });

  socket.on("scene:delete", ({ id }) => {
    const room = currentRoom();
    if (!room) return;
    const playerId = socket.data.playerId;
    if (!isGM(room, playerId)) return publicError(socket, "Only the Game Master can delete scenes.");
    if (!room.scenes[id]) return;

    delete room.scenes[id];
    broadcast(room);
  });

  // The Locker is the GM's reusable asset library - token/monster appearance
  // presets and map backgrounds that outlive any one scene, so a favorite
  // prop or recurring villain doesn't need to be rebuilt from scratch every
  // time it comes up again.
  socket.on("locker:saveToken", ({ id, label, color, imageUrl, size }, ack) => {
    const room = currentRoom();
    if (!room) return;
    const playerId = socket.data.playerId;
    if (!isGM(room, playerId)) return publicError(socket, "Only the Game Master can save Locker presets.");

    const existing = id && room.locker.tokens[id];
    const presetId = existing ? id : store.newId();
    room.locker.tokens[presetId] = {
      id: presetId,
      label: clampText(label, 30) || existing?.label || "Token",
      color: clampText(color, 20) || existing?.color || "#5b8def",
      imageUrl: clampText(imageUrl, 2000) || null,
      size: Math.min(Math.max(Number(size) || 48, 16), 200),
    };

    broadcast(room);
    ack?.({ ok: true, id: presetId });
  });

  socket.on("locker:renameToken", ({ id, label }) => {
    const room = currentRoom();
    if (!room) return;
    const playerId = socket.data.playerId;
    if (!isGM(room, playerId)) return publicError(socket, "Only the Game Master can rename Locker presets.");
    const preset = room.locker.tokens[id];
    if (!preset) return;

    preset.label = clampText(label, 30).trim() || preset.label;
    broadcast(room);
  });

  socket.on("locker:deleteToken", ({ id }) => {
    const room = currentRoom();
    if (!room) return;
    const playerId = socket.data.playerId;
    if (!isGM(room, playerId)) return publicError(socket, "Only the Game Master can delete Locker presets.");
    if (!room.locker.tokens[id]) return;

    delete room.locker.tokens[id];
    broadcast(room);
  });

  socket.on("locker:placeToken", ({ id }) => {
    const room = currentRoom();
    if (!room) return;
    const playerId = socket.data.playerId;
    if (!isGM(room, playerId)) return publicError(socket, "Only the Game Master can place Locker tokens.");
    const preset = room.locker.tokens[id];
    if (!preset) return publicError(socket, "That token preset no longer exists.");

    const tokenId = store.newId();
    room.tokens[tokenId] = {
      id: tokenId,
      x: 50,
      y: 50,
      size: preset.size,
      label: preset.label,
      color: preset.color,
      imageUrl: preset.imageUrl,
      ownerId: null,
    };

    broadcast(room);
  });

  socket.on("locker:saveMap", ({ id, name, backgroundUrl }, ack) => {
    const room = currentRoom();
    if (!room) return;
    const playerId = socket.data.playerId;
    if (!isGM(room, playerId)) return publicError(socket, "Only the Game Master can save Locker presets.");

    const existing = id && room.locker.maps[id];
    const presetId = existing ? id : store.newId();
    room.locker.maps[presetId] = {
      id: presetId,
      name: clampText(name, 60).trim() || existing?.name || `Map ${Object.keys(room.locker.maps).length + 1}`,
      backgroundUrl: clampText(backgroundUrl, 2000) || existing?.backgroundUrl || null,
    };

    broadcast(room);
    ack?.({ ok: true, id: presetId });
  });

  socket.on("locker:renameMap", ({ id, name }) => {
    const room = currentRoom();
    if (!room) return;
    const playerId = socket.data.playerId;
    if (!isGM(room, playerId)) return publicError(socket, "Only the Game Master can rename Locker presets.");
    const preset = room.locker.maps[id];
    if (!preset) return;

    preset.name = clampText(name, 60).trim() || preset.name;
    broadcast(room);
  });

  socket.on("locker:deleteMap", ({ id }) => {
    const room = currentRoom();
    if (!room) return;
    const playerId = socket.data.playerId;
    if (!isGM(room, playerId)) return publicError(socket, "Only the Game Master can delete Locker presets.");
    if (!room.locker.maps[id]) return;

    delete room.locker.maps[id];
    broadcast(room);
  });

  socket.on("locker:applyMap", ({ id }) => {
    const room = currentRoom();
    if (!room) return;
    const playerId = socket.data.playerId;
    if (!isGM(room, playerId)) return publicError(socket, "Only the Game Master can change the map.");
    const preset = room.locker.maps[id];
    if (!preset) return publicError(socket, "That map preset no longer exists.");

    room.board.backgroundUrl = preset.backgroundUrl;
    broadcast(room);
  });

  socket.on("locker:saveMonster", ({ id, name, color, imageUrl, size, notes }, ack) => {
    const room = currentRoom();
    if (!room) return;
    const playerId = socket.data.playerId;
    if (!isGM(room, playerId)) return publicError(socket, "Only the Game Master can save Locker presets.");

    const existing = id && room.locker.monsters[id];
    const presetId = existing ? id : store.newId();
    room.locker.monsters[presetId] = {
      id: presetId,
      name: clampText(name, 30) || existing?.name || "Monster",
      color: clampText(color, 20) || existing?.color || "#e2574c",
      imageUrl: clampText(imageUrl, 2000) || null,
      size: Math.min(Math.max(Number(size) || 48, 16), 200),
      notes: clampText(notes, 2000),
    };

    broadcast(room);
    ack?.({ ok: true, id: presetId });
  });

  socket.on("locker:renameMonster", ({ id, name }) => {
    const room = currentRoom();
    if (!room) return;
    const playerId = socket.data.playerId;
    if (!isGM(room, playerId)) return publicError(socket, "Only the Game Master can rename Locker presets.");
    const preset = room.locker.monsters[id];
    if (!preset) return;

    preset.name = clampText(name, 30).trim() || preset.name;
    broadcast(room);
  });

  socket.on("locker:deleteMonster", ({ id }) => {
    const room = currentRoom();
    if (!room) return;
    const playerId = socket.data.playerId;
    if (!isGM(room, playerId)) return publicError(socket, "Only the Game Master can delete Locker presets.");
    if (!room.locker.monsters[id]) return;

    delete room.locker.monsters[id];
    broadcast(room);
  });

  socket.on("locker:placeMonster", ({ id }) => {
    const room = currentRoom();
    if (!room) return;
    const playerId = socket.data.playerId;
    if (!isGM(room, playerId)) return publicError(socket, "Only the Game Master can place Locker monsters.");
    const preset = room.locker.monsters[id];
    if (!preset) return publicError(socket, "That monster preset no longer exists.");

    const tokenId = store.newId();
    room.tokens[tokenId] = {
      id: tokenId,
      x: 50,
      y: 50,
      size: preset.size,
      label: preset.name,
      color: preset.color,
      imageUrl: preset.imageUrl,
      ownerId: null,
    };

    broadcast(room);
  });

  function ensureInitiative(room) {
    if (!room.initiative) room.initiative = { active: false, round: 1, currentIndex: 0, entries: [], notifyTurns: true };
    return room.initiative;
  }

  socket.on("initiative:start", () => {
    const room = currentRoom();
    if (!room) return;
    if (!isGM(room, socket.data.playerId)) return publicError(socket, "Only the Game Master can start initiative.");

    const initiative = ensureInitiative(room);
    // Add any current players missing an entry (e.g. someone joined after NPCs
    // were already added, or this is the very first start) without disturbing
    // entries the GM already set up.
    const existingPlayerIds = new Set(initiative.entries.filter((e) => e.playerId).map((e) => e.playerId));
    for (const p of Object.values(room.players)) {
      if (existingPlayerIds.has(p.id)) continue;
      initiative.entries.push({
        id: store.newId(),
        name: room.characters[p.characterId]?.name || p.name,
        value: 10,
        playerId: p.id,
      });
    }
    initiative.entries.sort((a, b) => b.value - a.value);
    initiative.active = true;
    initiative.round = 1;
    initiative.currentIndex = 0;

    broadcast(room);
  });

  socket.on("initiative:addEntry", ({ name, value, playerId: linkPlayerId }) => {
    const room = currentRoom();
    if (!room) return;
    if (!isGM(room, socket.data.playerId)) return publicError(socket, "Only the Game Master can add to initiative.");

    const initiative = ensureInitiative(room);
    // Linking to a real player (rather than a free-text NPC/monster name) is
    // what lets the turn-notification popup ever reach that specific player -
    // an unlinked entry is understood to be a monster the GM personally plays.
    const linkedPlayer = linkPlayerId && room.players[linkPlayerId] ? room.players[linkPlayerId] : null;
    const cleanName = clampText(name, 40).trim();
    initiative.entries.push({
      id: store.newId(),
      name: cleanName || (linkedPlayer ? room.characters[linkedPlayer.characterId]?.name || linkedPlayer.name : "Unnamed"),
      value: Math.min(99, Math.max(-99, Math.round(Number(value)) || 0)),
      playerId: linkedPlayer?.id || null,
    });
    if (!initiative.active) initiative.entries.sort((a, b) => b.value - a.value);

    broadcast(room);
  });

  socket.on("initiative:updateEntry", ({ entryId, patch }) => {
    const room = currentRoom();
    if (!room?.initiative) return;
    if (!isGM(room, socket.data.playerId)) return publicError(socket, "Only the Game Master can edit initiative.");

    const entry = room.initiative.entries.find((e) => e.id === entryId);
    if (!entry) return;
    if ("name" in patch) entry.name = clampText(patch.name, 40);
    if ("value" in patch) entry.value = Math.min(99, Math.max(-99, Math.round(Number(patch.value)) || 0));
    // Order is locked in once combat is active, matching how initiative
    // works at a real table - only auto-resort during setup.
    if (!room.initiative.active) room.initiative.entries.sort((a, b) => b.value - a.value);

    broadcast(room);
  });

  socket.on("initiative:removeEntry", ({ entryId }) => {
    const room = currentRoom();
    if (!room?.initiative) return;
    if (!isGM(room, socket.data.playerId)) return publicError(socket, "Only the Game Master can remove from initiative.");

    const idx = room.initiative.entries.findIndex((e) => e.id === entryId);
    if (idx === -1) return;
    room.initiative.entries.splice(idx, 1);
    if (room.initiative.currentIndex >= room.initiative.entries.length) room.initiative.currentIndex = 0;

    broadcast(room);
  });

  socket.on("initiative:next", () => {
    const room = currentRoom();
    if (!room?.initiative?.active || room.initiative.entries.length === 0) return;
    const playerId = socket.data.playerId;
    const current = room.initiative.entries[room.initiative.currentIndex];
    const isCurrentTurnPlayer = current && current.playerId === playerId;
    if (!isGM(room, playerId) && !isCurrentTurnPlayer) {
      return publicError(socket, "Only the GM or whoever's turn it is can advance initiative.");
    }

    room.initiative.currentIndex += 1;
    if (room.initiative.currentIndex >= room.initiative.entries.length) {
      room.initiative.currentIndex = 0;
      room.initiative.round += 1;
    }

    broadcast(room);
  });

  socket.on("initiative:end", () => {
    const room = currentRoom();
    if (!room?.initiative) return;
    if (!isGM(room, socket.data.playerId)) return publicError(socket, "Only the Game Master can end initiative.");
    room.initiative.active = false;
    broadcast(room);
  });

  socket.on("initiative:clear", () => {
    const room = currentRoom();
    if (!room) return;
    if (!isGM(room, socket.data.playerId)) return publicError(socket, "Only the Game Master can clear initiative.");
    // Clearing the combatant list is a fresh start for the fight, but it
    // shouldn't silently reset the GM's notification preference along with it.
    const notifyTurns = room.initiative?.notifyTurns ?? true;
    room.initiative = { active: false, round: 1, currentIndex: 0, entries: [], notifyTurns };
    broadcast(room);
  });

  socket.on("initiative:setNotify", ({ enabled }) => {
    const room = currentRoom();
    if (!room) return;
    if (!isGM(room, socket.data.playerId)) return publicError(socket, "Only the Game Master can change this setting.");

    const initiative = ensureInitiative(room);
    initiative.notifyTurns = !!enabled;
    broadcast(room);
  });

  socket.on(
    "dice:roll",
    ({ formula, label, mode, baseDice, stressDice, attributeLevel, skillLevel, modifier, attributeType, replicant }) => {
      const room = currentRoom();
      if (!room) return;
      const playerId = socket.data.playerId;
      const player = room.players[playerId];
      if (!player) return;

      if (mode === "alien") {
        const result = rollAlienPool(baseDice, stressDice);
        if (!result.ok) return publicError(socket, result.error);

        room.diceLog.unshift({
          id: store.newId(),
          playerId,
          name: player.name,
          label: clampText(label, 40),
          mode: "alien",
          baseRolls: result.baseRolls,
          stressRolls: result.stressRolls,
          successes: result.successes,
          panic: result.panic,
          timestamp: Date.now(),
        });
        room.diceLog = room.diceLog.slice(0, 50);

        broadcast(room);
        return;
      }

      if (mode === "br") {
        const levels = ["A", "B", "C", "D"];
        const aLevel = levels.includes(attributeLevel) ? attributeLevel : "D";
        const sLevel = levels.includes(skillLevel) ? skillLevel : "D";
        const mod = ["advantage", "disadvantage"].includes(modifier) ? modifier : null;
        const attrTypes = ["strength", "agility", "intelligence", "empathy"];
        const attrType = attrTypes.includes(attributeType) ? attributeType : "strength";

        const result = rollBladeRunner({ attributeLevel: aLevel, skillLevel: sLevel, modifier: mod });

        room.diceLog.unshift({
          id: store.newId(),
          playerId,
          name: player.name,
          label: clampText(label, 40),
          mode: "br",
          attributeType: attrType,
          replicant: !!replicant,
          rolls: result.rolls,
          successes: result.successes,
          critical: result.critical,
          pushCount: 0,
          harm: null,
          timestamp: Date.now(),
        });
        room.diceLog = room.diceLog.slice(0, 50);

        broadcast(room);
        return;
      }

      const result = rollFormula(clampText(formula, 30));
      if (!result.ok) return publicError(socket, result.error);

      room.diceLog.unshift({
        id: store.newId(),
        playerId,
        name: player.name,
        label: clampText(label, 40),
        formula: result.formula,
        rolls: result.rolls,
        modifier: result.modifier,
        total: result.total,
        timestamp: Date.now(),
      });
      room.diceLog = room.diceLog.slice(0, 50);

      broadcast(room);
    }
  );

  // Pushing re-rolls whatever an existing Blade Runner roll hasn't already
  // locked in as a 1, so it mutates that same diceLog entry in place rather
  // than creating a new one - the client re-renders the same tray with the
  // updated dice instead of a fresh roll animation.
  socket.on("dice:pushBR", ({ entryId }) => {
    const room = currentRoom();
    if (!room) return;
    const playerId = socket.data.playerId;
    const entry = room.diceLog.find((e) => e.id === entryId);
    if (!entry || entry.mode !== "br") return;
    if (entry.playerId !== playerId) return publicError(socket, "You can only push your own roll.");

    const maxPushes = entry.replicant ? 2 : 1;
    if (entry.pushCount >= maxPushes) return publicError(socket, "No more pushes left for this roll.");

    const result = pushBladeRunner(entry.rolls);
    entry.rolls = result.rolls;
    entry.successes = result.successes;
    entry.critical = result.critical;
    entry.harm = result.harm;
    entry.pushCount += 1;

    broadcast(room);
  });

  socket.on("chat:send", ({ text, toPlayerId }) => {
    const room = currentRoom();
    if (!room) return;
    const playerId = socket.data.playerId;
    const player = room.players[playerId];
    if (!player) return;

    const cleanText = clampText(text, 500).trim();
    if (!cleanText) return;

    if (toPlayerId) {
      const recipient = room.players[toPlayerId];
      if (!recipient || toPlayerId === playerId) {
        return publicError(socket, "Can't send a whisper to that person.");
      }

      const key = store.whisperKey(playerId, toPlayerId);
      const thread = room.whispers[key] || [];
      const message = {
        id: store.newId(),
        fromId: playerId,
        fromName: player.name,
        toId: toPlayerId,
        toName: recipient.name,
        text: cleanText,
        timestamp: Date.now(),
      };
      room.whispers[key] = [...thread, message].slice(-200);
      store.touch(room.code);

      // Deliver only to the two people involved - never the room-wide broadcast.
      const targetSocketIds = new Set([socket.id, playerSockets.get(toPlayerId)].filter(Boolean));
      targetSocketIds.forEach((sid) => io.to(sid).emit("chat:whisper", message));
      return;
    }

    room.chat.push({
      id: store.newId(),
      playerId,
      name: player.name,
      text: cleanText,
      timestamp: Date.now(),
    });
    room.chat = room.chat.slice(-200);

    broadcast(room);
  });

  socket.on("disconnect", () => {
    // Only clear the mapping if it's still this socket - a reconnect can
    // register its new socket.id before the old one's disconnect fires.
    if (playerSockets.get(socket.data.playerId) === socket.id) {
      playerSockets.delete(socket.data.playerId);
    }
    const room = currentRoom();
    if (!room) return;
    const player = room.players[socket.data.playerId];
    if (player) {
      player.online = false;
      broadcast(room);
    }
  });
});

server.listen(PORT, () => {
  console.log(`The Ante-Chamber server listening on port ${PORT}`);
});
