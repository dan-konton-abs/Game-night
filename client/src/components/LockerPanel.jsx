import React, { useState } from "react";
import { socket } from "../socket.js";

const PALETTE = ["#5b8def", "#e2574c", "#4caf7d", "#e8a83c", "#9b6bd9", "#41b3c2"];

function SwatchPicker({ color, onChange }) {
  return (
    <div className="swatches">
      {PALETTE.map((c) => (
        <button
          type="button"
          key={c}
          className={`swatch ${color === c ? "selected" : ""}`}
          style={{ backgroundColor: c }}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}

export default function LockerPanel({ room }) {
  const tokens = Object.values(room.locker.tokens).sort((a, b) => a.label.localeCompare(b.label));
  const maps = Object.values(room.locker.maps).sort((a, b) => a.name.localeCompare(b.name));
  const monsters = Object.values(room.locker.monsters).sort((a, b) => a.name.localeCompare(b.name));

  const [tokenLabel, setTokenLabel] = useState("");
  const [tokenColor, setTokenColor] = useState(PALETTE[0]);
  const [tokenImageUrl, setTokenImageUrl] = useState("");
  const [tokenSize, setTokenSize] = useState(48);

  function saveTokenPreset(e) {
    e.preventDefault();
    if (!tokenLabel.trim()) return;
    socket.emit(
      "locker:saveToken",
      { label: tokenLabel, color: tokenColor, imageUrl: tokenImageUrl, size: tokenSize },
      (ack) => {
        if (ack?.ok) {
          setTokenLabel("");
          setTokenImageUrl("");
          setTokenSize(48);
        }
      }
    );
  }
  function placeToken(id) {
    socket.emit("locker:placeToken", { id });
  }
  function renameTokenPreset(id, current) {
    const name = prompt("Rename token preset", current);
    if (name === null) return;
    socket.emit("locker:renameToken", { id, label: name });
  }
  function deleteTokenPreset(id, label) {
    if (!confirm(`Delete token preset "${label}"? This can't be undone.`)) return;
    socket.emit("locker:deleteToken", { id });
  }

  const [mapName, setMapName] = useState("");
  const [mapUrl, setMapUrl] = useState("");
  const [mapUploading, setMapUploading] = useState(false);

  function saveMapPreset(e) {
    e.preventDefault();
    if (!mapName.trim() || !mapUrl.trim()) return;
    socket.emit("locker:saveMap", { name: mapName, backgroundUrl: mapUrl }, (ack) => {
      if (ack?.ok) {
        setMapName("");
        setMapUrl("");
      }
    });
  }
  async function onMapFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMapUploading(true);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (data.url) setMapUrl(data.url);
    } catch (err) {
      console.error(err);
    } finally {
      setMapUploading(false);
      e.target.value = "";
    }
  }
  function applyMap(id) {
    socket.emit("locker:applyMap", { id });
  }
  function renameMapPreset(id, current) {
    const name = prompt("Rename map preset", current);
    if (name === null) return;
    socket.emit("locker:renameMap", { id, name });
  }
  function deleteMapPreset(id, name) {
    if (!confirm(`Delete map preset "${name}"? This can't be undone.`)) return;
    socket.emit("locker:deleteMap", { id });
  }

  const [monsterName, setMonsterName] = useState("");
  const [monsterColor, setMonsterColor] = useState(PALETTE[1]);
  const [monsterImageUrl, setMonsterImageUrl] = useState("");
  const [monsterSize, setMonsterSize] = useState(48);
  const [monsterNotes, setMonsterNotes] = useState("");

  function saveMonsterPreset(e) {
    e.preventDefault();
    if (!monsterName.trim()) return;
    socket.emit(
      "locker:saveMonster",
      { name: monsterName, color: monsterColor, imageUrl: monsterImageUrl, size: monsterSize, notes: monsterNotes },
      (ack) => {
        if (ack?.ok) {
          setMonsterName("");
          setMonsterImageUrl("");
          setMonsterSize(48);
          setMonsterNotes("");
        }
      }
    );
  }
  function placeMonster(id) {
    socket.emit("locker:placeMonster", { id });
  }
  function renameMonsterPreset(id, current) {
    const name = prompt("Rename monster preset", current);
    if (name === null) return;
    socket.emit("locker:renameMonster", { id, name });
  }
  function deleteMonsterPreset(id, name) {
    if (!confirm(`Delete monster preset "${name}"? This can't be undone.`)) return;
    socket.emit("locker:deleteMonster", { id });
  }

  return (
    <div className="panel locker-panel">
      <h3>Token Presets</h3>
      <p className="hint">
        Save a reusable token appearance, then place a fresh copy on the board any time instead of
        rebuilding it from scratch.
      </p>
      {tokens.length === 0 && <p className="hint">No saved token presets yet.</p>}
      {tokens.length > 0 && (
        <ul className="locker-list">
          {tokens.map((t) => (
            <li key={t.id} className="locker-list-item">
              <div className="locker-item-main">
                <span
                  className="locker-swatch"
                  style={{ backgroundColor: t.color, backgroundImage: t.imageUrl ? `url(${t.imageUrl})` : undefined }}
                />
                <span className="locker-name">{t.label}</span>
              </div>
              <div className="locker-actions">
                <button type="button" onClick={() => placeToken(t.id)}>
                  Place
                </button>
                <button type="button" onClick={() => renameTokenPreset(t.id, t.label)}>
                  Rename
                </button>
                <button type="button" className="danger" onClick={() => deleteTokenPreset(t.id, t.label)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={saveTokenPreset}>
        <label>
          Label
          <input value={tokenLabel} onChange={(e) => setTokenLabel(e.target.value)} placeholder="e.g. Xenomorph" maxLength={30} />
        </label>
        <label>
          Image URL (optional)
          <input value={tokenImageUrl} onChange={(e) => setTokenImageUrl(e.target.value)} placeholder="https://…" />
        </label>
        <label>
          Color
          <SwatchPicker color={tokenColor} onChange={setTokenColor} />
        </label>
        <label>
          Size
          <input type="range" min="24" max="120" value={tokenSize} onChange={(e) => setTokenSize(Number(e.target.value))} />
        </label>
        <button type="submit" className="primary">
          Save token preset
        </button>
      </form>

      <h3>Map Presets</h3>
      <p className="hint">
        Save a background image as a reusable map, then apply it to the live board any time - lighter
        than a full Scene, which also snapshots token positions.
      </p>
      {maps.length === 0 && <p className="hint">No saved map presets yet.</p>}
      {maps.length > 0 && (
        <ul className="locker-list">
          {maps.map((m) => (
            <li key={m.id} className="locker-list-item">
              <div className="locker-item-main">
                <span
                  className="locker-swatch"
                  style={{ backgroundImage: m.backgroundUrl ? `url(${m.backgroundUrl})` : undefined }}
                />
                <span className="locker-name">{m.name}</span>
              </div>
              <div className="locker-actions">
                <button type="button" onClick={() => applyMap(m.id)}>
                  Apply
                </button>
                <button type="button" onClick={() => renameMapPreset(m.id, m.name)}>
                  Rename
                </button>
                <button type="button" className="danger" onClick={() => deleteMapPreset(m.id, m.name)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={saveMapPreset}>
        <label>
          Name
          <input value={mapName} onChange={(e) => setMapName(e.target.value)} placeholder="e.g. Derelict Cargo Bay" maxLength={60} />
        </label>
        <label>
          Image URL
          <input value={mapUrl} onChange={(e) => setMapUrl(e.target.value)} placeholder="https://…" />
        </label>
        <label className="file-label">
          Or upload an image
          <input type="file" accept="image/*" onChange={onMapFileChange} disabled={mapUploading} />
        </label>
        {mapUploading && <p className="hint">Uploading…</p>}
        <button type="submit" className="primary">
          Save map preset
        </button>
      </form>

      <h3>Monster Presets</h3>
      <p className="hint">
        Save a recurring NPC/monster's appearance and notes, then drop a fresh copy on the board
        whenever it shows up again.
      </p>
      {monsters.length === 0 && <p className="hint">No saved monster presets yet.</p>}
      {monsters.length > 0 && (
        <ul className="locker-list">
          {monsters.map((m) => (
            <li key={m.id} className="locker-list-item">
              <div className="locker-item-main">
                <span
                  className="locker-swatch"
                  style={{ backgroundColor: m.color, backgroundImage: m.imageUrl ? `url(${m.imageUrl})` : undefined }}
                />
                <div className="locker-name-notes">
                  <span className="locker-name">{m.name}</span>
                  {m.notes && <span className="muted small locker-notes">{m.notes}</span>}
                </div>
              </div>
              <div className="locker-actions">
                <button type="button" onClick={() => placeMonster(m.id)}>
                  Place
                </button>
                <button type="button" onClick={() => renameMonsterPreset(m.id, m.name)}>
                  Rename
                </button>
                <button type="button" className="danger" onClick={() => deleteMonsterPreset(m.id, m.name)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={saveMonsterPreset}>
        <label>
          Name
          <input
            value={monsterName}
            onChange={(e) => setMonsterName(e.target.value)}
            placeholder="e.g. Warrior Xenomorph"
            maxLength={30}
          />
        </label>
        <label>
          Image URL (optional)
          <input value={monsterImageUrl} onChange={(e) => setMonsterImageUrl(e.target.value)} placeholder="https://…" />
        </label>
        <label>
          Color
          <SwatchPicker color={monsterColor} onChange={setMonsterColor} />
        </label>
        <label>
          Size
          <input type="range" min="24" max="120" value={monsterSize} onChange={(e) => setMonsterSize(Number(e.target.value))} />
        </label>
        <label>
          Notes (stat block, tactics, etc.)
          <textarea value={monsterNotes} onChange={(e) => setMonsterNotes(e.target.value)} rows={3} maxLength={2000} />
        </label>
        <button type="submit" className="primary">
          Save monster preset
        </button>
      </form>
    </div>
  );
}
