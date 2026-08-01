import React, { useEffect, useState, useCallback } from "react";
import { socket, connectSocket } from "./socket.js";
import { getToken, setToken, clearToken, fetchMe } from "./auth.js";
import AuthScreen from "./components/AuthScreen.jsx";
import ResetPasswordScreen from "./components/ResetPasswordScreen.jsx";
import MyGamesScreen from "./components/MyGamesScreen.jsx";
import GameScreen from "./components/GameScreen.jsx";

function getResetParams() {
  if (window.location.pathname !== "/reset-password") return null;
  const params = new URLSearchParams(window.location.search);
  const uid = params.get("uid");
  const token = params.get("token");
  return uid && token ? { uid, token } : null;
}

export default function App() {
  const [bootstrapping, setBootstrapping] = useState(true);
  const [resetParams] = useState(getResetParams);
  const [user, setUser] = useState(null);
  const [games, setGames] = useState([]);
  const [room, setRoom] = useState(null);
  const [whispers, setWhispers] = useState({});
  const [toast, setToast] = useState(null);

  const refreshGames = useCallback(() => {
    fetchMe()
      .then(({ games: nextGames }) => setGames(nextGames))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (resetParams) {
      setBootstrapping(false);
      return;
    }
    const token = getToken();
    if (!token) {
      setBootstrapping(false);
      return;
    }
    fetchMe()
      .then(({ user: me, games: myGames }) => {
        setUser(me);
        setGames(myGames);
      })
      .catch(() => clearToken())
      .finally(() => setBootstrapping(false));
  }, [resetParams]);

  useEffect(() => {
    function onRoomState(nextRoom) {
      setRoom(nextRoom);
    }
    function onRoomError({ message }) {
      setToast(message);
      setTimeout(() => setToast(null), 4000);
    }
    function onWhisperHistory({ threads }) {
      setWhispers(threads || {});
    }
    function onWhisper(message) {
      const otherId = message.fromId === user?.id ? message.toId : message.fromId;
      setWhispers((prev) => ({ ...prev, [otherId]: [...(prev[otherId] || []), message] }));
    }
    function onConnectError() {
      // Token was rejected by the server (deleted account, corrupted token, etc).
      clearToken();
      setUser(null);
      setRoom(null);
    }

    socket.on("room:state", onRoomState);
    socket.on("room:error", onRoomError);
    socket.on("chat:whisperHistory", onWhisperHistory);
    socket.on("chat:whisper", onWhisper);
    socket.on("connect_error", onConnectError);

    return () => {
      socket.off("room:state", onRoomState);
      socket.off("room:error", onRoomError);
      socket.off("chat:whisperHistory", onWhisperHistory);
      socket.off("chat:whisper", onWhisper);
      socket.off("connect_error", onConnectError);
    };
  }, [user?.id]);

  useEffect(() => {
    if (user) connectSocket();
    else if (socket.connected) socket.disconnect();
  }, [user]);

  const handleAuthenticated = useCallback((token, authedUser) => {
    setToken(token);
    setUser(authedUser);
    fetchMe()
      .then(({ games: myGames }) => setGames(myGames))
      .catch(() => setGames([]));
  }, []);

  const handleLogout = useCallback(() => {
    clearToken();
    setUser(null);
    setGames([]);
    setRoom(null);
    setWhispers({});
    socket.disconnect();
  }, []);

  const handleBackToGames = useCallback(() => {
    socket.emit("room:leave");
    setRoom(null);
    setWhispers({});
    refreshGames();
  }, [refreshGames]);

  if (resetParams) {
    return (
      <div className="app-root">
        <ResetPasswordScreen uid={resetParams.uid} token={resetParams.token} />
      </div>
    );
  }

  if (bootstrapping) {
    return <div className="app-root" />;
  }

  return (
    <div className="app-root">
      {toast && <div className="toast">{toast}</div>}
      {!user ? (
        <AuthScreen onAuthenticated={handleAuthenticated} />
      ) : !room ? (
        <MyGamesScreen user={user} games={games} onLogout={handleLogout} />
      ) : (
        <GameScreen
          room={room}
          whispers={whispers}
          playerId={user.id}
          identity={user}
          onLeave={handleBackToGames}
        />
      )}
    </div>
  );
}
