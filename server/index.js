const path = require("path");
const fs = require("fs");
const http = require("http");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { Server } = require("socket.io");

const store = require("./roomStore");
const { rollFormula } = require("./dice");

const PORT = process.env.PORT || 4000;
const CLIENT_DIST = path.join(__dirname, "..", "client", "dist");
const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use("/uploads", express.static(UPLOAD_DIR));

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${store.newId()}${ext}`);
    },
  }),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only image uploads are allowed"));
  },
});

app.post("/api/upload", upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  res.json({ url: `/uploads/${req.file.filename}` });
});

if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get("*", (req, res) => {
    res.sendFile(path.join(CLIENT_DIST, "index.html"));
  });
}

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

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

function broadcast(room) {
  store.touch(room.code);
  io.to(room.code).emit("room:state", room);
}

function publicError(socket, message) {
  socket.emit("room:error", { message });
}

io.on("connection", (socket) => {
  socket.on("room:create", ({ name, playerId }, ack) => {
    try {
      const cleanName = clampText(name, 40).trim() || "Game Master";
      const room = store.createRoom();
      room.gmPlayerId = playerId;
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
      socket.data.playerId = playerId;

      broadcast(room);
      ack?.({ ok: true, code: room.code, role: "gm" });
    } catch (err) {
      ack?.({ ok: false, error: err.message });
    }
  });

  socket.on("room:join", ({ roomCode, name, playerId }, ack) => {
    try {
      const code = clampText(roomCode, 10).trim().toUpperCase();
      const room = store.ensureLoaded(code);
      if (!room) {
        ack?.({ ok: false, error: `No game found with code "${code}".` });
        return;
      }
      const cleanName = clampText(name, 40).trim() || "Player";
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
      socket.data.playerId = playerId;

      broadcast(room);
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

  socket.on("dice:roll", ({ formula, label }) => {
    const room = currentRoom();
    if (!room) return;
    const playerId = socket.data.playerId;
    const player = room.players[playerId];
    if (!player) return;

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
  });

  socket.on("chat:send", ({ text }) => {
    const room = currentRoom();
    if (!room) return;
    const playerId = socket.data.playerId;
    const player = room.players[playerId];
    if (!player) return;

    const cleanText = clampText(text, 500).trim();
    if (!cleanText) return;

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
  console.log(`Game Night server listening on port ${PORT}`);
});
