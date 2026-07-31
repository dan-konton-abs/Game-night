import React, { useEffect, useState, useCallback } from "react";
import { socket, getOrCreatePlayerId, saveIdentity, loadIdentity, clearIdentity } from "./socket.js";
import HomeScreen from "./components/HomeScreen.jsx";
import GameScreen from "./components/GameScreen.jsx";

export default function App() {
  const [playerId] = useState(getOrCreatePlayerId);
  const [identity, setIdentity] = useState(loadIdentity);
  const [room, setRoom] = useState(null);
  const [connected, setConnected] = useState(false);
  const [joinError, setJoinError] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    socket.connect();

    function onConnect() {
      setConnected(true);
      const stored = loadIdentity();
      if (stored?.roomCode) {
        socket.emit(
          "room:join",
          { roomCode: stored.roomCode, name: stored.name, playerId },
          (ack) => {
            if (!ack.ok) {
              clearIdentity();
              setIdentity(null);
              setJoinError(ack.error);
            }
          }
        );
      }
    }
    function onDisconnect() {
      setConnected(false);
    }
    function onRoomState(nextRoom) {
      setRoom(nextRoom);
    }
    function onRoomError({ message }) {
      setToast(message);
      setTimeout(() => setToast(null), 4000);
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room:state", onRoomState);
    socket.on("room:error", onRoomError);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("room:state", onRoomState);
      socket.off("room:error", onRoomError);
    };
  }, [playerId]);

  const handleCreate = useCallback(
    (name) =>
      new Promise((resolve) => {
        socket.emit("room:create", { name, playerId }, (ack) => {
          if (ack.ok) {
            const nextIdentity = { roomCode: ack.code, name, role: ack.role };
            saveIdentity(nextIdentity);
            setIdentity(nextIdentity);
          }
          resolve(ack);
        });
      }),
    [playerId]
  );

  const handleJoin = useCallback(
    (roomCode, name) =>
      new Promise((resolve) => {
        socket.emit("room:join", { roomCode, name, playerId }, (ack) => {
          if (ack.ok) {
            const nextIdentity = { roomCode: ack.code, name, role: ack.role };
            saveIdentity(nextIdentity);
            setIdentity(nextIdentity);
          }
          resolve(ack);
        });
      }),
    [playerId]
  );

  const handleLeave = useCallback(() => {
    clearIdentity();
    setIdentity(null);
    setRoom(null);
    socket.disconnect();
    socket.connect();
  }, []);

  return (
    <div className="app-root">
      {toast && <div className="toast">{toast}</div>}
      {!identity || !room ? (
        <HomeScreen
          connected={connected}
          onCreate={handleCreate}
          onJoin={handleJoin}
          error={joinError}
        />
      ) : (
        <GameScreen room={room} playerId={playerId} identity={identity} onLeave={handleLeave} />
      )}
    </div>
  );
}
