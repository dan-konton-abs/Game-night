import { io } from "socket.io-client";

export const socket = io({ autoConnect: false });

const PLAYER_ID_KEY = "gamenight:playerId";
const IDENTITY_KEY = "gamenight:identity";

export function getOrCreatePlayerId() {
  let id = localStorage.getItem(PLAYER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(PLAYER_ID_KEY, id);
  }
  return id;
}

export function saveIdentity(identity) {
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
}

export function loadIdentity() {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearIdentity() {
  localStorage.removeItem(IDENTITY_KEY);
}
