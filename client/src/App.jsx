import React, { useEffect, useState, useCallback, useRef } from "react";
import { socket, connectSocket } from "./socket.js";
import { getToken, setToken, clearToken, fetchMe } from "./auth.js";
import AuthScreen from "./components/AuthScreen.jsx";
import ResetPasswordScreen from "./components/ResetPasswordScreen.jsx";
import MyGamesScreen from "./components/MyGamesScreen.jsx";
import GameScreen from "./components/GameScreen.jsx";
import AdminScreen from "./components/AdminScreen.jsx";

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
  const [whisperHistoryLoaded, setWhisperHistoryLoaded] = useState(false);
  const [rulesKeeperMessages, setRulesKeeperMessages] = useState([]);
  const [toast, setToast] = useState(null);
  const [connected, setConnected] = useState(true);
  const roomRef = useRef(null);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

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
      setWhisperHistoryLoaded(true);
    }
    function onWhisper(message) {
      const otherId = message.fromId === user?.id ? message.toId : message.fromId;
      setWhispers((prev) => ({ ...prev, [otherId]: [...(prev[otherId] || []), message] }));
    }
    function onRulesKeeperHistory({ messages }) {
      setRulesKeeperMessages(messages || []);
    }
    function onConnectError(err) {
      if (err?.message === "unauthorized") {
        // Token was rejected by the server (deleted account, corrupted token, etc).
        clearToken();
        setUser(null);
        setRoom(null);
      }
    }
    function onRoomDeleted({ reason }) {
      setToast(reason || "This game is no longer available.");
      setTimeout(() => setToast(null), 4000);
      setRoom(null);
      setWhispers({});
      setRulesKeeperMessages([]);
      refreshGames();
    }

    socket.on("room:state", onRoomState);
    socket.on("room:error", onRoomError);
    socket.on("chat:whisperHistory", onWhisperHistory);
    socket.on("chat:whisper", onWhisper);
    socket.on("rulesKeeper:history", onRulesKeeperHistory);
    socket.on("connect_error", onConnectError);
    socket.on("room:deleted", onRoomDeleted);

    return () => {
      socket.off("room:state", onRoomState);
      socket.off("room:error", onRoomError);
      socket.off("chat:whisperHistory", onWhisperHistory);
      socket.off("chat:whisper", onWhisper);
      socket.off("rulesKeeper:history", onRulesKeeperHistory);
      socket.off("connect_error", onConnectError);
      socket.off("room:deleted", onRoomDeleted);
    };
  }, [user?.id, refreshGames]);

  useEffect(() => {
    if (user) connectSocket();
    else if (socket.connected) socket.disconnect();
  }, [user]);

  // Socket.IO reconnects its transport automatically after a network blip, but
  // that only restores the raw connection - the server has no memory of which
  // room this fresh socket belongs to, since that's only ever set inside the
  // room:join/create handlers. Without this, a WiFi hiccup or laptop sleep
  // would silently strand you looking at a board you're no longer actually
  // subscribed to, with no error to explain why nothing's syncing.
  useEffect(() => {
    function onConnect() {
      setConnected(true);
      const activeRoom = roomRef.current;
      if (!activeRoom) return;
      socket.emit("room:join", { roomCode: activeRoom.code }, (ack) => {
        if (!ack.ok) {
          setToast("Couldn't rejoin the game after reconnecting - it may have been deleted.");
          setTimeout(() => setToast(null), 5000);
          setRoom(null);
          setWhispers({});
          setWhisperHistoryLoaded(false);
          setRulesKeeperMessages([]);
          refreshGames();
        }
      });
    }
    function onDisconnect(reason) {
      setConnected(false);
      if (reason === "io server disconnect") {
        // The server forcibly closed this socket (e.g. an admin just disabled
        // or deleted the account) - Socket.IO only auto-reconnects after
        // transport-level drops, not server-initiated ones, so we have to
        // retry manually. That retry re-runs the io.use auth check, and if
        // the account really is no longer valid it comes back as
        // connect_error, which the handler above already logs out on.
        socket.connect();
      }
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, [refreshGames]);

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
    setWhisperHistoryLoaded(false);
    setRulesKeeperMessages([]);
    socket.disconnect();
  }, []);

  const handleBackToGames = useCallback(() => {
    socket.emit("room:leave");
    setRoom(null);
    setWhispers({});
    setWhisperHistoryLoaded(false);
    setRulesKeeperMessages([]);
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
      ) : user.isAdmin ? (
        <AdminScreen user={user} onLogout={handleLogout} />
      ) : !room ? (
        <MyGamesScreen user={user} games={games} onLogout={handleLogout} onRefreshGames={refreshGames} />
      ) : (
        <GameScreen
          room={room}
          whispers={whispers}
          whisperHistoryLoaded={whisperHistoryLoaded}
          rulesKeeperMessages={rulesKeeperMessages}
          playerId={user.id}
          identity={user}
          onLeave={handleBackToGames}
          connected={connected}
        />
      )}
    </div>
  );
}
