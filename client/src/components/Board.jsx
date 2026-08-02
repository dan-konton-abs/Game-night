import React, { useRef, useState, useCallback } from "react";
import { socket } from "../socket.js";
import TokenEditor from "./TokenEditor.jsx";

const PALETTE = ["#5b8def", "#e2574c", "#4caf7d", "#e8a83c", "#9b6bd9", "#41b3c2"];
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

export default function Board({ room, playerId, isGM }) {
  const containerRef = useRef(null);
  const viewportRef = useRef(null);
  const [dragTokenId, setDragTokenId] = useState(null);
  const [dragPos, setDragPos] = useState(null);
  const [editingTokenId, setEditingTokenId] = useState(null);
  const [addingToken, setAddingToken] = useState(false);
  const [zoom, setZoom] = useState(1);

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

  // Zooms toward a specific screen point (cursor, or the viewport center for the
  // +/- buttons), keeping whatever's under that point visually stable instead of
  // jumping to the top-left corner - this is what makes zoom feel navigable
  // rather than disorienting.
  function zoomTo(nextZoom, anchorClientX, anchorClientY) {
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(nextZoom * 100) / 100));
    const viewport = viewportRef.current;
    if (!viewport || clamped === zoom) return;

    const rect = viewport.getBoundingClientRect();
    const originX = anchorClientX - rect.left;
    const originY = anchorClientY - rect.top;
    const ratio = clamped / zoom;
    const newScrollLeft = (viewport.scrollLeft + originX) * ratio - originX;
    const newScrollTop = (viewport.scrollTop + originY) * ratio - originY;

    setZoom(clamped);
    requestAnimationFrame(() => {
      viewport.scrollLeft = newScrollLeft;
      viewport.scrollTop = newScrollTop;
    });
  }

  function zoomByButton(delta) {
    const rect = viewportRef.current?.getBoundingClientRect();
    const cx = rect ? rect.left + rect.width / 2 : 0;
    const cy = rect ? rect.top + rect.height / 2 : 0;
    zoomTo(zoom + delta, cx, cy);
  }

  // Ctrl/Cmd+wheel (and trackpad pinch, which browsers report as ctrlKey wheel
  // events) zooms; a plain wheel/trackpad scroll pans normally via the browser's
  // native overflow scrolling, so both gestures stay available and don't conflict.
  function onWheel(e) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    zoomTo(zoom + (e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP), e.clientX, e.clientY);
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

  const initiative = room.initiative;
  const currentEntry = initiative?.active ? initiative.entries[initiative.currentIndex] : null;
  // An entry with no playerId is a monster/NPC the GM personally plays, so
  // the GM is who should get prompted for it - not nobody, which is what a
  // plain playerId match would give you every time a monster's turn came up.
  const isMyTurn = !!(
    initiative?.notifyTurns &&
    currentEntry &&
    (currentEntry.playerId === playerId || (currentEntry.playerId === null && isGM))
  );

  function completeTurn() {
    socket.emit("initiative:next");
  }

  const board = room.board;
  const gridLineColor = room.theme === "scifi" ? "rgba(51,255,122,0.35)" : "rgba(255,255,255,0.12)";
  const gridStyle = board.showGrid
    ? {
        backgroundImage: `linear-gradient(to right, ${gridLineColor} 1px, transparent 1px), linear-gradient(to bottom, ${gridLineColor} 1px, transparent 1px)`,
        backgroundSize: `${board.gridSize * zoom}px ${board.gridSize * zoom}px`,
      }
    : {};

  const tokens = Object.values(room.tokens);

  return (
    <div className="board-wrap">
      <div className="board-viewport-wrap">
        <div className="board-viewport" ref={viewportRef} onWheel={onWheel}>
          <div
            className="board-canvas"
            ref={containerRef}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            style={{
              width: `${zoom * 100}%`,
              height: `${zoom * 100}%`,
              backgroundImage: board.backgroundUrl ? `url(${board.backgroundUrl})` : undefined,
            }}
          >
            <div className="board-grid" style={gridStyle} />

            {!board.backgroundUrl && (
              <div className="board-empty-hint">
                {isGM
                  ? "Set a background image from GM Tools to begin."
                  : "Waiting for the Game Master to set the map…"}
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
                    width: token.size * zoom,
                    height: token.size * zoom,
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
        </div>

        {isMyTurn && (
          <div className="turn-notification">
            <div className="turn-notification-text">⚔ Your Turn!</div>
            <button type="button" className="primary" onClick={completeTurn}>
              Complete Turn
            </button>
          </div>
        )}

        <div className="zoom-controls">
          <button type="button" onClick={() => zoomByButton(-ZOOM_STEP)} title="Zoom out">
            −
          </button>
          <span className="zoom-level">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => zoomByButton(ZOOM_STEP)} title="Zoom in">
            +
          </button>
          {zoom !== 1 && (
            <button type="button" className="small" onClick={() => zoomByButton(1 - zoom)} title="Reset zoom">
              Reset
            </button>
          )}
        </div>
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
