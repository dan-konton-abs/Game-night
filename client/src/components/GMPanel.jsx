import React, { useState } from "react";
import { socket } from "../socket.js";
import { deleteGame } from "../games.js";
import { THEMES } from "../themes.js";

export default function GMPanel({ room }) {
  const [bgUrl, setBgUrl] = useState(room.board.backgroundUrl || "");
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [newSceneName, setNewSceneName] = useState("");
  const [rulebookUploading, setRulebookUploading] = useState(false);
  const [musicUrl, setMusicUrl] = useState(room.music.url || "");
  const [musicUploading, setMusicUploading] = useState(false);

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

  async function onRulebookFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setRulebookUploading(true);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (data.url) {
        socket.emit("rulesKeeper:setRulebook", { url: data.url, fileName: file.name });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRulebookUploading(false);
      e.target.value = "";
    }
  }

  function removeRulebook() {
    if (!confirm("Remove the loaded rulebook? This also clears everyone's conversation with the Keeper.")) return;
    socket.emit("rulesKeeper:remove");
  }

  function trackNameFromUrl(url) {
    try {
      return decodeURIComponent(url.split("/").pop().split("?")[0]) || "Track";
    } catch {
      return "Track";
    }
  }

  function applyMusicUrl(url) {
    socket.emit("music:update", { url, name: url ? trackNameFromUrl(url) : null });
  }

  async function onMusicFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMusicUploading(true);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (data.url) {
        setMusicUrl(data.url);
        socket.emit("music:update", { url: data.url, name: file.name });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setMusicUploading(false);
      e.target.value = "";
    }
  }

  function clearAllTokens() {
    if (!confirm("Remove every token from the board?")) return;
    Object.keys(room.tokens).forEach((tokenId) => socket.emit("token:remove", { tokenId }));
  }

  const scenes = Object.values(room.scenes || {}).sort((a, b) => b.updatedAt - a.updatedAt);

  function saveNewScene() {
    const name = newSceneName.trim();
    socket.emit("scene:save", { name }, (ack) => {
      if (ack?.ok) setNewSceneName("");
    });
  }

  function updateScene(id) {
    const scene = room.scenes[id];
    if (!confirm(`Overwrite "${scene?.name}" with the current map and tokens?`)) return;
    socket.emit("scene:save", { id });
  }

  function loadScene(id) {
    const scene = room.scenes[id];
    if (!confirm(`Switch to "${scene?.name}"? Save the current map first if you want to keep it - loading a scene replaces the board and tokens.`)) return;
    socket.emit("scene:load", { id });
  }

  function renameScene(id, currentName) {
    const name = prompt("Rename scene", currentName);
    if (name === null) return;
    socket.emit("scene:rename", { id, name });
  }

  function deleteScene(id, name) {
    if (!confirm(`Delete saved scene "${name}"? This can't be undone.`)) return;
    socket.emit("scene:delete", { id });
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
      <h3>Theme</h3>
      <label>
        Table look &amp; feel
        <select value={room.theme || "default"} onChange={(e) => socket.emit("room:setTheme", { theme: e.target.value })}>
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <p className="hint">{THEMES.find((t) => t.id === (room.theme || "default"))?.description}</p>

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
        Grid shape
        <select
          value={room.board.gridShape || "square"}
          onChange={(e) => socket.emit("board:update", { gridShape: e.target.value })}
        >
          <option value="square">Square</option>
          <option value="hex">Hexagonal</option>
        </select>
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
      <label>
        Map scale ({Math.round((room.board.mapScale ?? 1) * 100)}%)
        <input
          type="range"
          min="20"
          max="400"
          value={Math.round((room.board.mapScale ?? 1) * 100)}
          onChange={(e) => socket.emit("board:update", { mapScale: Number(e.target.value) / 100 })}
        />
      </label>
      <p className="hint">
        Scales just the map image, leaving the grid and token sizes alone - use this to line up
        the map's own printed grid (if it has one) with the grid above, independent of everyone's
        personal zoom.
      </p>

      <h3>Ambient Music</h3>
      <p className="hint">
        Set a soundtrack for the table - it loops quietly in the background for everyone. Playback
        controls live in a small bar at the top of the screen once a track is set.
      </p>
      <label>
        Audio URL
        <div className="inline-row">
          <input value={musicUrl} onChange={(e) => setMusicUrl(e.target.value)} placeholder="https://…" />
          <button type="button" onClick={() => applyMusicUrl(musicUrl)}>
            Set
          </button>
        </div>
      </label>
      <label className="file-label">
        Or upload an audio file
        <input type="file" accept="audio/*" onChange={onMusicFileChange} disabled={musicUploading} />
      </label>
      {musicUploading && <p className="hint">Uploading…</p>}
      {room.music.url && (
        <p className="hint">
          Now set: {room.music.name || "Track"}{" "}
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setMusicUrl("");
              applyMusicUrl("");
            }}
          >
            Remove
          </button>
        </p>
      )}
      <label className="inline-row">
        <input
          type="checkbox"
          checked={room.music.loop}
          onChange={(e) => socket.emit("music:update", { loop: e.target.checked })}
        />
        Loop
      </label>

      <h3>Scenes</h3>
      <p className="hint">
        Save the current map + tokens as a named scene, so you can switch locations without
        losing the layout. Loading a scene replaces the board and tokens - save first if you
        want to keep what's there now.
      </p>
      {scenes.length === 0 && <p className="hint">No saved scenes yet.</p>}
      {scenes.length > 0 && (
        <ul className="scene-list">
          {scenes.map((scene) => (
            <li key={scene.id} className="scene-list-item">
              <span className="scene-name">{scene.name}</span>
              <div className="scene-actions">
                <button type="button" onClick={() => loadScene(scene.id)}>
                  Load
                </button>
                <button type="button" onClick={() => updateScene(scene.id)}>
                  Update
                </button>
                <button type="button" onClick={() => renameScene(scene.id, scene.name)}>
                  Rename
                </button>
                <button type="button" className="danger" onClick={() => deleteScene(scene.id, scene.name)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="inline-row">
        <input
          value={newSceneName}
          onChange={(e) => setNewSceneName(e.target.value)}
          placeholder="New scene name…"
        />
        <button type="button" onClick={saveNewScene}>
          Save current map as scene
        </button>
      </div>

      <h3>Rules Keeper</h3>
      <p className="hint">
        Upload this game's rulebook so anyone can ask the Keeper of the Rules about it any time from
        the "📖 Instructions" button - handy for learning the rules as you play. It only answers rules
        questions from the book itself; it never sees anything about the live game.
      </p>
      {room.rulesKeeper.fileName ? (
        <p className="hint">
          Loaded: {room.rulesKeeper.fileName}{" "}
          <button type="button" className="link-button" onClick={removeRulebook}>
            Remove
          </button>
        </p>
      ) : (
        <p className="hint">No rulebook loaded yet.</p>
      )}
      <label className="file-label">
        {room.rulesKeeper.fileName ? "Replace rulebook PDF" : "Upload rulebook PDF"}
        <input type="file" accept="application/pdf" onChange={onRulebookFileChange} disabled={rulebookUploading} />
      </label>
      {rulebookUploading && <p className="hint">Uploading…</p>}

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
