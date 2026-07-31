import React, { useRef, useState, useCallback } from "react";
import { socket } from "../socket.js";
import TokenEditor from "./TokenEditor.jsx";

const PALETTE = ["#5b8def", "#e2574c", "#4caf7d", "#e8a83c", "#9b6bd9", "#41b3c2"];

export default function Board({ room, playerId, isGM }) {
  const containerRef = useRef(null);
  const [dragTokenId, setDragTokenId] = useState(null);
  const [dragPos, setDragPos] = useState(null);
  const [editingTokenId, setEditingTokenId] = useState(null);
  const [addingToken, setAddingToken] = useState(false);

  const canControl = useCallback(
    (token) => isGM || token.ownerId === playerId,
    [isGM, playerId]
  );

  function posFromEvent(e) {
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    return { x: Math.min(Math.max(x, 0), 100), y: Math.min(Math.max(y, 0), 100) };
  }

  function onTokenPointerDown(e, token) {
    if (!canControl(token)) return;
    e.preventDefault();
    e.stopPropagation();
    e.target.setPointerCapture(e.pointerId);
    setDragTokenId(token.id);
    setDragPos({ x: token.x, y: token.y });
  }

  function onPointerMove(e) {
    if (!dragTokenId) return;
    setDragPos(posFromEvent(e));
  }

  function onPointerUp(e) {
    if (!dragTokenId) return;
    const pos = posFromEvent(e);
    socket.emit("token:move", { tokenId: dragTokenId, x: pos.x, y: pos.y });
    setDragTokenId(null);
    setDragPos(null);
  }

  function addToken(form) {
    socket.emit("token:add", {
      x: 50,
      y: 50,
      label: form.label,
      color: form.color,
      imageUrl: form.imageUrl,
      size: form.size,
    });
    setAddingToken(false);
  }

  const board = room.board;
  const gridStyle = board.showGrid
    ? {
        backgroundImage:
          "linear-gradient(to right, rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.12) 1px, transparent 1px)",
        backgroundSize: `${board.gridSize}px ${board.gridSize}px`,
      }
    : {};

  const tokens = Object.values(room.tokens);

  return (
    <div className="board-wrap">
      <div
        className="board"
        ref={containerRef}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          backgroundImage: board.backgroundUrl ? `url(${board.backgroundUrl})` : undefined,
        }}
      >
        <div className="board-grid" style={gridStyle} />

        {!board.backgroundUrl && (
          <div className="board-empty-hint">
            {isGM ? "Set a background image from GM Tools to begin." : "Waiting for the Game Master to set the map…"}
          </div>
        )}

        {tokens.map((token) => {
          const dragging = dragTokenId === token.id;
          const pos = dragging ? dragPos : token;
          const mine = canControl(token);
          return (
            <div
              key={token.id}
              className={`token ${mine ? "mine" : ""} ${dragging ? "dragging" : ""}`}
              style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                width: token.size,
                height: token.size,
                backgroundColor: token.imageUrl ? "transparent" : token.color,
                backgroundImage: token.imageUrl ? `url(${token.imageUrl})` : undefined,
              }}
              onPointerDown={(e) => onTokenPointerDown(e, token)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (mine) setEditingTokenId(token.id);
              }}
              title={token.label}
            >
              {!token.imageUrl && <span className="token-label">{token.label.slice(0, 2).toUpperCase()}</span>}
              <span className="token-name">{token.label}</span>
            </div>
          );
        })}

        {editingTokenId && room.tokens[editingTokenId] && (
          <TokenEditor
            token={room.tokens[editingTokenId]}
            room={room}
            isGM={isGM}
            onClose={() => setEditingTokenId(null)}
          />
        )}
      </div>

      <div className="board-toolbar">
        <button className="primary small" onClick={() => setAddingToken((v) => !v)}>
          + Add Token
        </button>
        {addingToken && <AddTokenForm onSubmit={addToken} onCancel={() => setAddingToken(false)} />}
      </div>
    </div>
  );
}

function AddTokenForm({ onSubmit, onCancel }) {
  const [label, setLabel] = useState("");
  const [color, setColor] = useState(PALETTE[Math.floor(Math.random() * PALETTE.length)]);
  const [imageUrl, setImageUrl] = useState("");
  const [size, setSize] = useState(48);

  return (
    <form
      className="popover add-token-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ label: label || "Token", color, imageUrl, size });
      }}
    >
      <label>
        Label
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Hicks" maxLength={30} />
      </label>
      <label>
        Image URL (optional)
        <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" />
      </label>
      <label>
        Color
        <div className="swatches">
          {PALETTE.map((c) => (
            <button
              type="button"
              key={c}
              className={`swatch ${color === c ? "selected" : ""}`}
              style={{ backgroundColor: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      </label>
      <label>
        Size
        <input type="range" min="24" max="120" value={size} onChange={(e) => setSize(Number(e.target.value))} />
      </label>
      <div className="popover-actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary">
          Add
        </button>
      </div>
    </form>
  );
}
