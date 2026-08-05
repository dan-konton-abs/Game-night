const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { nanoid } = require("nanoid");

const DATA_DIR = path.join(__dirname, "data");
const USERS_PATH = path.join(DATA_DIR, "users.json");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

/** @type {Map<string, object>} in-memory users, keyed by userId */
let users = new Map();
let saveTimer = null;

function load() {
  try {
    const raw = fs.readFileSync(USERS_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    users = new Map(Object.entries(parsed));
    // Backfill for accounts created before the disabled flag existed.
    for (const user of users.values()) {
      if (user.disabled === undefined) user.disabled = false;
    }
  } catch {
    users = new Map();
  }
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const obj = Object.fromEntries(users);
    fs.writeFile(USERS_PATH, JSON.stringify(obj, null, 2), (err) => {
      if (err) console.error("Failed to persist users:", err.message);
    });
  }, 250);
}

load();

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function findByEmail(email) {
  const target = normalizeEmail(email);
  for (const user of users.values()) {
    if (user.email === target) return user;
  }
  return null;
}

function findById(userId) {
  return users.get(userId) || null;
}

async function createUser({ name, email, password }) {
  const cleanEmail = normalizeEmail(email);
  if (findByEmail(cleanEmail)) {
    throw new Error("An account with that email already exists.");
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id: nanoid(),
    name,
    email: cleanEmail,
    passwordHash,
    createdAt: Date.now(),
    resetTokenHash: null,
    resetTokenExpires: null,
    disabled: false,
  };
  users.set(user.id, user);
  scheduleSave();
  return user;
}

function listAll() {
  return Array.from(users.values());
}

function setDisabled(user, disabled) {
  user.disabled = !!disabled;
  scheduleSave();
}

function deleteUser(userId) {
  const existed = users.delete(userId);
  if (existed) scheduleSave();
  return existed;
}

async function verifyPassword(user, password) {
  return bcrypt.compare(password, user.passwordHash);
}

/** Generates a one-time password-reset token, stores only its hash, returns the raw token to email. */
function createResetToken(user) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  user.resetTokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  user.resetTokenExpires = Date.now() + 60 * 60 * 1000; // 1 hour
  scheduleSave();
  return rawToken;
}

function consumeResetToken(userId, rawToken) {
  const user = findById(userId);
  if (!user || !user.resetTokenHash || !user.resetTokenExpires) return null;
  if (Date.now() > user.resetTokenExpires) return null;
  const hash = crypto.createHash("sha256").update(rawToken).digest("hex");
  if (hash !== user.resetTokenHash) return null;
  return user;
}

async function setPassword(user, newPassword) {
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.resetTokenHash = null;
  user.resetTokenExpires = null;
  scheduleSave();
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

/** Everything an admin needs to see about an account - never passwordHash/resetToken*. */
function adminUserView(user) {
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt, disabled: user.disabled };
}

module.exports = {
  findByEmail,
  findById,
  createUser,
  verifyPassword,
  createResetToken,
  consumeResetToken,
  setPassword,
  publicUser,
  adminUserView,
  listAll,
  setDisabled,
  deleteUser,
};
