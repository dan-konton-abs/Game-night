const fs = require("fs");
const path = require("path");
const { nanoid, customAlphabet } = require("nanoid");

const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const roomCodeId = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 5);

/** @type {Map<string, object>} in-memory authoritative room state, keyed by room code */
const rooms = new Map();
const saveTimers = new Map();

function dataPath(code) {
  return path.join(DATA_DIR, `${code}.json`);
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
    createdAt: Date.now(),
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
  };
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
    rooms.set(code, loaded);
    return loaded;
  }
  return null;
}

function touch(code) {
  scheduleSave(code);
}

module.exports = {
  rooms,
  getRoom,
  createRoom,
  ensureLoaded,
  touch,
  newId: nanoid,
};
