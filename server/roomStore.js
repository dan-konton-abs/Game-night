const fs = require("fs");
const path = require("path");
const { nanoid, customAlphabet } = require("nanoid");

const DATA_DIR = path.join(__dirname, "data");
const ROOMS_DIR = path.join(DATA_DIR, "rooms");
if (!fs.existsSync(ROOMS_DIR)) fs.mkdirSync(ROOMS_DIR, { recursive: true });

const roomCodeId = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 5);

/** @type {Map<string, object>} in-memory authoritative room state, keyed by room code */
const rooms = new Map();
const saveTimers = new Map();

function dataPath(code) {
  return path.join(ROOMS_DIR, `${code}.json`);
}

function scheduleSave(code) {
  if (saveTimers.has(code)) return;
  const timer = setTimeout(() => {
    saveTimers.delete(code);
    const room = rooms.get(code);
    if (!room) return;
    fs.writeFile(dataPath(code), JSON.stringify(room, null, 2), (err) => {
      if (err) console.error(`Failed to persist room ${code}:`, err.message);
    });
  }, 250);
  saveTimers.set(code, timer);
}

function loadRoomFromDisk(code) {
  try {
    const raw = fs.readFileSync(dataPath(code), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function blankRoom(code) {
  return {
    code,
    name: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    gmPlayerId: null,
    board: {
      backgroundUrl: null,
      gridSize: 50,
      showGrid: true,
    },
    tokens: {},
    characters: {},
    players: {},
    diceLog: [],
    chat: [],
    whispers: {},
  };
}

/** Canonical, order-independent key for a private thread between two players. */
function whisperKey(playerIdA, playerIdB) {
  return [playerIdA, playerIdB].sort().join("|");
}

function getRoom(code) {
  return rooms.get(code) || null;
}

function createRoom() {
  let code;
  do {
    code = roomCodeId();
  } while (rooms.has(code));
  const room = blankRoom(code);
  rooms.set(code, room);
  scheduleSave(code);
  return room;
}

/** Load an existing room's persisted state into memory if not already present. */
function ensureLoaded(code) {
  code = code.toUpperCase();
  if (rooms.has(code)) return rooms.get(code);
  const loaded = loadRoomFromDisk(code);
  if (loaded) {
    // Mark everyone offline on server restart; sockets will reconnect fresh.
    for (const p of Object.values(loaded.players)) p.online = false;
    if (!loaded.chat) loaded.chat = [];
    if (!loaded.whispers) loaded.whispers = {};
    if (!loaded.name) loaded.name = null;
    if (!loaded.updatedAt) loaded.updatedAt = loaded.createdAt || Date.now();
    rooms.set(code, loaded);
    return loaded;
  }
  return null;
}

function touch(code) {
  const room = rooms.get(code);
  if (room) room.updatedAt = Date.now();
  scheduleSave(code);
}

/** Permanently removes a room: cancels any pending save, deletes it from memory and disk. */
function deleteRoom(code) {
  const timer = saveTimers.get(code);
  if (timer) clearTimeout(timer);
  saveTimers.delete(code);
  rooms.delete(code);
  try {
    fs.unlinkSync(dataPath(code));
  } catch {
    // Already gone, or never made it to disk - either way, nothing left to do.
  }
}

/** Every room code that has ever been persisted, whether or not it's currently in memory. */
function allRoomCodes() {
  const onDisk = fs
    .readdirSync(ROOMS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
  return Array.from(new Set([...onDisk, ...rooms.keys()]));
}

/** Summaries of every game a given user belongs to (as GM or player), newest activity first. */
function listRoomsForUser(userId) {
  const summaries = [];
  for (const code of allRoomCodes()) {
    const room = ensureLoaded(code);
    if (!room || !room.players[userId]) continue;
    summaries.push({
      code: room.code,
      name: room.name,
      role: room.gmPlayerId === userId ? "gm" : "player",
      playerCount: Object.keys(room.players).length,
      updatedAt: room.updatedAt,
    });
  }
  summaries.sort((a, b) => b.updatedAt - a.updatedAt);
  return summaries;
}

module.exports = {
  rooms,
  getRoom,
  createRoom,
  ensureLoaded,
  touch,
  deleteRoom,
  whisperKey,
  listRoomsForUser,
  newId: nanoid,
};
