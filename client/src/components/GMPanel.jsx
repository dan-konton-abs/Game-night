import React, { useState } from "react";
import { socket } from "../socket.js";
import { deleteGame } from "../games.js";

export default function GMPanel({ room }) {
  const [bgUrl, setBgUrl] = useState(room.board.backgroundUrl || "");
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function applyBackground(url) {
    socket.emit("board:update", { backgroundUrl: url });
  }

  async function onFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (data.url) {
        setBgUrl(data.url);
        applyBackground(data.url);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  function clearAllTokens() {
    if (!confirm("Remove every token from the board?")) return;
    Object.keys(room.tokens).forEach((tokenId) => socket.emit("token:remove", { tokenId }));
  }

  async function deleteThisGame() {
    const label = room.name || `Game ${room.code}`;
    if (!confirm(`Delete "${label}" for everyone? This can't be undone.`)) return;
    setDeleting(true);
    try {
      await deleteGame(room.code);
      // The server's room:deleted broadcast (handled in App.jsx) takes it from here.
    } catch (err) {
      alert(err.message);
      setDeleting(false);
    }
  }

  return (
    <div className="panel gm-panel">
      <h3>Map background</h3>
      <label>
        Image URL
        <div className="inline-row">
          <input value={bgUrl} onChange={(e) => setBgUrl(e.target.value)} placeholder="https://…" />
          <button type="button" onClick={() => applyBackground(bgUrl)}>
            Set
          </button>
        </div>
      </label>
      <label className="file-label">
        Or upload an image
        <input type="file" accept="image/*" onChange={onFileChange} disabled={uploading} />
      </label>
      {uploading && <p className="hint">Uploading…</p>}

      <h3>Grid</h3>
      <label className="inline-row">
        <input
          type="checkbox"
          checked={room.board.showGrid}
          onChange={(e) => socket.emit("board:update", { showGrid: e.target.checked })}
        />
        Show grid overlay
      </label>
      <label>
        Grid size ({room.board.gridSize}px)
        <input
          type="range"
          min="10"
          max="200"
          value={room.board.gridSize}
          onChange={(e) => socket.emit("board:update", { gridSize: Number(e.target.value) })}
        />
      </label>

      <h3>Danger zone</h3>
      <button type="button" className="danger" onClick={clearAllTokens}>
        Clear all tokens
      </button>{" "}
      <button type="button" className="danger" onClick={deleteThisGame} disabled={deleting}>
        {deleting ? "Deleting…" : "Delete this game"}
      </button>
    </div>
  );
}
