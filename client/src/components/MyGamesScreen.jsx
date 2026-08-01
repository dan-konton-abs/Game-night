import React, { useState } from "react";
import { socket, connectSocket } from "../socket.js";

function timeAgo(ts) {
  const diff = Math.max(0, Date.now() - ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function MyGamesScreen({ user, games, onLogout }) {
  const [gameName, setGameName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function ensureConnected() {
    if (!socket.connected) connectSocket();
  }

  function createGame(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    ensureConnected();
    socket.emit("room:create", { gameName: gameName.trim() }, (ack) => {
      setBusy(false);
      // On success, the server's room:state broadcast is what actually moves us
      // into the game (handled up in App.jsx) - nothing more to do here.
      if (!ack.ok) setError(ack.error);
    });
  }

  function joinGame(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    ensureConnected();
    socket.emit("room:join", { roomCode: joinCode.trim() }, (ack) => {
      setBusy(false);
      if (!ack.ok) setError(ack.error);
    });
  }

  function resumeGame(code) {
    setError(null);
    setBusy(true);
    ensureConnected();
    socket.emit("room:join", { roomCode: code }, (ack) => {
      setBusy(false);
      if (!ack.ok) setError(ack.error);
    });
  }

  return (
    <div className="home-screen">
      <div className="home-card games-card">
        <div className="games-header">
          <div>
            <h1>🎲 Game Night</h1>
            <p className="subtitle">Signed in as {user.name}</p>
          </div>
          <button type="button" className="link-button" onClick={onLogout}>
            Log out
          </button>
        </div>

        {error && <div className="error-text">{error}</div>}

        <h3>Your games</h3>
        {games.length === 0 && <p className="muted">No games yet — start or join one below.</p>}
        <ul className="game-list">
          {games.map((g) => (
            <li key={g.code}>
              <div>
                <div className="game-list-name">{g.name || `Game ${g.code}`}</div>
                <div className="muted small">
                  {g.role === "gm" ? "Game Master" : "Player"} · {g.playerCount}{" "}
                  {g.playerCount === 1 ? "person" : "people"} · active {timeAgo(g.updatedAt)}
                </div>
              </div>
              <button type="button" className="primary small" disabled={busy} onClick={() => resumeGame(g.code)}>
                Resume
              </button>
            </li>
          ))}
        </ul>

        <h3>Start a new game</h3>
        <form onSubmit={createGame} className="inline-row">
          <input
            value={gameName}
            onChange={(e) => setGameName(e.target.value)}
            placeholder="Game name, e.g. Aliens - Campaign 2"
            maxLength={60}
          />
          <button type="submit" className="primary" disabled={busy}>
            Create
          </button>
        </form>
        <p className="hint">You'll be the Game Master for this one.</p>

        <h3>Join with a code</h3>
        <form onSubmit={joinGame} className="inline-row">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="e.g. AB3C9"
            maxLength={10}
          />
          <button type="submit" className="primary" disabled={busy}>
            Join
          </button>
        </form>
      </div>
    </div>
  );
}
