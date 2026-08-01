import { io } from "socket.io-client";
import { getToken } from "./auth.js";

export const socket = io({ autoConnect: false });

/** (Re)connects the socket using the current stored auth token. */
export function connectSocket() {
  socket.auth = { token: getToken() };
  if (socket.connected) socket.disconnect();
  socket.connect();
}
