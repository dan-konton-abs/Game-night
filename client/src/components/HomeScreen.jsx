import React, { useState } from "react";

export default function HomeScreen({ connected, onCreate, onJoin, error }) {
  const [mode, setMode] = useState("join");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState(error);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setLocalError("Enter your name first.");
      return;
    }
    setBusy(true);
    setLocalError(null);
    const ack =
      mode === "create" ? await onCreate(name.trim()) : await onJoin(code.trim(), name.trim());
    setBusy(false);
    if (!ack.ok) setLocalError(ack.error);
  }

  return (
    <div className="home-screen">
      <div className="home-card">
        <h1>🎲 Game Night</h1>
        <p className="subtitle">A shared game board for your online sessions.</p>

        <div className="mode-toggle">
          <button className={mode === "join" ? "active" : ""} onClick={() => setMode("join")} type="button">
            Join a Game
          </button>
          <button
            className={mode === "create" ? "active" : ""}
            onClick={() => setMode("create")}
            type="button"
          >
            Start a Game (GM)
          </button>
        </div>

        <form onSubmit={submit}>
          <label>
            Your name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ripley" maxLength={40} />
          </label>

          {mode === "join" && (
            <label>
              Room code
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. AB3C9"
                maxLength={10}
              />
            </label>
          )}

          {localError && <div className="error-text">{localError}</div>}

          <button type="submit" className="primary" disabled={!connected || busy}>
            {!connected ? "Connecting…" : busy ? "Please wait…" : mode === "create" ? "Create Room" : "Join Room"}
          </button>
        </form>

        {mode === "create" && (
          <p className="hint">
            You'll be the Game Master: set the map, add tokens, and share the room code with your players.
          </p>
        )}
      </div>
    </div>
  );
}
