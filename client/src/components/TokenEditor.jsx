import React, { useState } from "react";
import { socket } from "../socket.js";

export default function TokenEditor({ token, room, isGM, onClose }) {
  const [label, setLabel] = useState(token.label);
  const [color, setColor] = useState(token.color);
  const [imageUrl, setImageUrl] = useState(token.imageUrl || "");
  const [size, setSize] = useState(token.size);
  const [ownerId, setOwnerId] = useState(token.ownerId || "");
  const [uploading, setUploading] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

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
        setImgFailed(false);
        setImageUrl(data.url);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  function save() {
    socket.emit("token:update", {
      tokenId: token.id,
      patch: { label, color, imageUrl, size, ...(isGM ? { ownerId: ownerId || null } : {}) },
    });
    onClose();
  }

  function remove() {
    if (!confirm(`Delete "${token.label}"? This can't be undone.`)) return;
    socket.emit("token:remove", { tokenId: token.id });
    onClose();
  }

  return (
    <div className="popover token-editor" style={{ left: `${token.x}%`, top: `${token.y}%` }} onPointerDown={(e) => e.stopPropagation()}>
      <label>
        Label
        <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={30} />
      </label>
      <label>
        Image URL
        <input
          value={imageUrl}
          onChange={(e) => {
            setImgFailed(false);
            setImageUrl(e.target.value);
          }}
          placeholder="https://…"
        />
      </label>
      <label className="file-label">
        Or upload an image
        <input type="file" accept="image/*" onChange={onFileChange} disabled={uploading} />
      </label>
      {uploading && <p className="hint">Uploading…</p>}
      {imageUrl && !uploading && (
        <div className="token-image-preview">
          {!imgFailed ? (
            <img src={imageUrl} alt="" onError={() => setImgFailed(true)} />
          ) : (
            <p className="hint">Couldn't load that image - check the link, or upload a file instead.</p>
          )}
        </div>
      )}
      <label>
        Color
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
      </label>
      <label>
        Size
        <input type="range" min="24" max="120" value={size} onChange={(e) => setSize(Number(e.target.value))} />
      </label>
      {isGM && (
        <label>
          Owner
          <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">Unowned (NPC / monster)</option>
            {Object.values(room.players).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="popover-actions">
        <button type="button" className="danger" onClick={remove}>
          Delete
        </button>
        <button type="button" onClick={onClose}>
          Close
        </button>
        <button type="button" className="primary" onClick={save}>
          Save
        </button>
      </div>
    </div>
  );
}
