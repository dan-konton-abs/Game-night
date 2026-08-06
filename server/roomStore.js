const fs = require("fs");
const path = require("path");
const { nanoid, customAlphabet } = require("nanoid");

const DATA_DIR = path.join(__dirname, "data");
const ROOMS_DIR = path.join(DATA_DIR, "rooms");
if (!fs.existsSync(ROOMS_DIR)) fs.mkdirSync(ROOMS_DIR, { recursive: true });

const roomCodeId = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 5);

// Fog is a fixed-resolution grid of cells overlaid on the board, independent
// of the visual grid (which is just a movement aid and can be off or a
// different size). 32x20 is fine-enough brush granularity without pushing
// the DOM node count for a fully-hidden map into the thousands.
const FOG_COLS = 32;
const FOG_ROWS = 20;

function blankFog() {
  return { enabled: false, initialized: false, cols: FOG_COLS, rows: FOG_ROWS, cells: new Array(FOG_COLS * FOG_ROWS).fill(false) };
}

/** Backfills a missing/malformed fog block - e.g. a room or scene saved before this feature existed. */
function ensureFog(board) {
  if (!board.fog || !Array.isArray(board.fog.cells) || board.fog.cells.length !== board.fog.cols * board.fog.rows) {
    board.fog = blankFog();
  }
  return board;
}

// The Rules Keeper is room-level, not tied to any one Scene/board - one
// rulebook per game. localPath is kept alongside the public-facing fileName
// so the Gemini File API reference can be silently re-uploaded from disk if
// it's ever missing or past its ~48h expiry. Conversations are per-player
// and never broadcast to the rest of the room (same treatment as whispers)
// - each player's Q&A history is their own.
function blankRulesKeeper() {
  return {
    fileName: null,
    localPath: null,
    uploadedAt: null,
    geminiFileUri: null,
    geminiFileExpiresAt: null,
    conversations: {},
  };
}

// Ambient music is room-level, not tied to a Scene/board - it's the sound of
// the table itself for the whole session, not any one location, so it isn't
// reset by switching maps. startedAt is a server timestamp; clients derive
// their own playback position from how long ago that was, which is what
// lets someone who joins (or reconnects) mid-track sync into the right spot.
function blankMusic() {
  return { url: null, name: null, playing: false, loop: true, startedAt: null };
}

// The soundboard is nine fixed one-shot SFX slots, room-level like music.
// Unlike music there's no "playing" state to track here - a play is a
// one-off event broadcast straight to the room (see index.js), not
// something that needs to survive a reconnect or a page reload.
const SOUNDBOARD_SLOTS = 9;

function blankSoundboardSlot(index) {
  return { label: `Slot ${index + 1}`, audioPath: null, fileName: null };
}

function blankSoundboard() {
  return Array.from({ length: SOUNDBOARD_SLOTS }, (_, i) => blankSoundboardSlot(i));
}

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
      gridShape: "square",
      // Independent of gridSize/zoom - calibrates the map image itself (e.g.
      // a battlemap whose own printed grid doesn't quite match this app's
      // grid size) without touching the grid or token scale.
      mapScale: 1,
      fog: blankFog(),
    },
    music: blankMusic(),
    soundboard: blankSoundboard(),
    tokens: {},
    characters: {},
    players: {},
    diceLog: [],
    chat: [],
    whispers: {},
    scenes: {},
    initiative: { active: false, round: 1, currentIndex: 0, entries: [], notifyTurns: true },
    theme: "default",
    locker: { tokens: {}, maps: {}, monsters: {} },
    rulesKeeper: blankRulesKeeper(),
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
    if (!loaded.scenes) loaded.scenes = {};
    if (!loaded.name) loaded.name = null;
    if (!loaded.updatedAt) loaded.updatedAt = loaded.createdAt || Date.now();
    if (!loaded.initiative) loaded.initiative = { active: false, round: 1, currentIndex: 0, entries: [], notifyTurns: true };
    if (loaded.initiative.notifyTurns === undefined) loaded.initiative.notifyTurns = true;
    if (!loaded.theme) loaded.theme = "default";
    if (!loaded.locker) loaded.locker = { tokens: {}, maps: {}, monsters: {} };
    if (!loaded.rulesKeeper) loaded.rulesKeeper = blankRulesKeeper();
    ensureFog(loaded.board);
    for (const scene of Object.values(loaded.scenes)) ensureFog(scene.board);
    if (loaded.board.mapScale === undefined) loaded.board.mapScale = 1;
    if (!loaded.board.gridShape) loaded.board.gridShape = "square";
    for (const scene of Object.values(loaded.scenes)) {
      if (scene.board.mapScale === undefined) scene.board.mapScale = 1;
      if (!scene.board.gridShape) scene.board.gridShape = "square";
    }
    if (!loaded.music) loaded.music = blankMusic();
    if (!Array.isArray(loaded.soundboard) || loaded.soundboard.length !== SOUNDBOARD_SLOTS) {
      loaded.soundboard = blankSoundboard();
    }
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
  ensureFog,
  blankRulesKeeper,
  blankSoundboardSlot,
  newId: nanoid,
};
