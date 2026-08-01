import { api } from "./apiClient.js";

export const renameGame = (code, name) =>
  api(`/api/games/${code}`, { method: "PATCH", body: JSON.stringify({ name }) });

export const deleteGame = (code) => api(`/api/games/${code}`, { method: "DELETE" });

export const leaveGame = (code) => api(`/api/games/${code}/leave`, { method: "POST" });
