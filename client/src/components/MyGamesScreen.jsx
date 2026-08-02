import React, { useState } from "react";
import { socket, connectSocket } from "../socket.js";
import { renameGame, deleteGame, leaveGame } from "../games.js";
import { THEMES } from "../themes.js";

function timeAgo(ts) {
  const diff = Math.max(0, Date.now() - ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function MyGamesScreen({ user, games, onLogout, onRefreshGames }) {
  const [gameName, setGameName] = useState("");
  const [theme, setTheme] = useState("default");
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
    socket.emit("room:create", { gameName: gameName.trim(), theme }, (ack) => {
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

  async function renameGameRow(g) {
    const next = window.prompt("Rename this game", g.name || "");
    if (next === null) return;
    setError(null);
    try {
      await renameGame(g.code, next.trim());
      onRefreshGames();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteGameRow(g) {
    const label = g.name || `Game ${g.code}`;
    if (!window.confirm(`Delete "${label}" for everyone? This can't be undone.`)) return;
    setError(null);
    try {
      await deleteGame(g.code);
      onRefreshGames();
    } catch (err) {
      setError(err.message);
    }
  }

  async function leaveGameRow(g) {
    const label = g.name || `Game ${g.code}`;
    if (!window.confirm(`Leave "${label}"? You can rejoin later with the room code.`)) return;
    setError(null);
    try {
      await leaveGame(g.code);
      onRefreshGames();
    } catch (err) {
      setError(err.message);
    }
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
              <div className="game-list-actions">
                {g.role === "gm" ? (
                  <>
                    <button type="button" className="small" disabled={busy} onClick={() => renameGameRow(g)}>
                      Rename
                    </button>
                    <button type="button" className="small danger" disabled={busy} onClick={() => deleteGameRow(g)}>
                      Delete
                    </button>
                  </>
                ) : (
                  <button type="button" className="small danger" disabled={busy} onClick={() => leaveGameRow(g)}>
                    Leave
                  </button>
                )}
                <button type="button" className="primary small" disabled={busy} onClick={() => resumeGame(g.code)}>
                  Resume
                </button>
              </div>
            </li>
          ))}
        </ul>

        <h3>Start a new game</h3>
        <form onSubmit={createGame}>
          <label>
            Theme
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              {THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <div className="inline-row">
            <input
              value={gameName}
              onChange={(e) => setGameName(e.target.value)}
              placeholder="Game name, e.g. Aliens - Campaign 2"
              maxLength={60}
            />
            <button type="submit" className="primary" disabled={busy}>
              Create
            </button>
          </div>
        </form>
        <p className="hint">You'll be the Game Master for this one. Themes can be changed later from GM Tools.</p>

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
