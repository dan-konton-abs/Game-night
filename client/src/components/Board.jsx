import React, { useRef, useState, useCallback, useEffect } from "react";
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
  // Once a drag ends, the server hasn't confirmed the new position yet, so
  // falling straight back to room.tokens would flash the token back to its
  // old spot for a frame. Each pending override holds the just-dropped
  // position until the room state broadcast catches up to it.
  const [pendingPositions, setPendingPositions] = useState({});
  const [editingTokenId, setEditingTokenId] = useState(null);
  const [addingToken, setAddingToken] = useState(false);
  const [zoom, setZoom] = useState(1);
  const pointersRef = useRef(new Map());
  const pinchRef = useRef(null);

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
    const tokenId = dragTokenId;
    socket.emit("token:move", { tokenId, x: pos.x, y: pos.y });
    setPendingPositions((prev) => ({ ...prev, [tokenId]: pos }));
    setDragTokenId(null);
    setDragPos(null);
  }

  // Clears a pending override only once the room broadcast actually confirms
  // that position - not on just any broadcast, since an unrelated update
  // (e.g. a chat message) would otherwise clear it early and bring back the
  // old-then-new flash this is meant to prevent.
  useEffect(() => {
    setPendingPositions((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      let changed = false;
      const next = { ...prev };
      for (const [tokenId, target] of Object.entries(prev)) {
        const token = room.tokens[tokenId];
        if (!token || (Math.abs(token.x - target.x) < 0.05 && Math.abs(token.y - target.y) < 0.05)) {
          delete next[tokenId];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [room.tokens]);

  function distanceBetween(pts) {
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  function onViewportPointerDown(e) {
    if (e.pointerType !== "touch") return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      pinchRef.current = { distance: distanceBetween([...pointersRef.current.values()]), zoom };
    }
  }

  function onViewportPointerMove(e) {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2 && pinchRef.current) {
      e.preventDefault();
      const pts = [...pointersRef.current.values()];
      const ratio = distanceBetween(pts) / pinchRef.current.distance;
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      zoomTo(pinchRef.current.zoom * ratio, midX, midY);
    }
  }

  function onViewportPointerEnd(e) {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) {
      pinchRef.current = null;
    }
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
        <div
          className="board-viewport"
          ref={viewportRef}
          onWheel={onWheel}
          onPointerDown={onViewportPointerDown}
          onPointerMove={onViewportPointerMove}
          onPointerUp={onViewportPointerEnd}
          onPointerCancel={onViewportPointerEnd}
        >
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
              const pending = pendingPositions[token.id];
              const pos = dragging ? dragPos : pending || token;
              const mine = canControl(token);
              return (
                <TokenView
                  key={token.id}
                  token={token}
                  mine={mine}
                  dragging={dragging}
                  pos={pos}
                  zoom={zoom}
                  onPointerDown={(e) => onTokenPointerDown(e, token)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (mine) setEditingTokenId(token.id);
                  }}
                />
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

// A background-image div can't tell you when the URL fails to load, so a bad
// link just rendered as an empty circle with no feedback at all. An <img>
// with onError lets a broken/hotlink-blocked URL fall back to the plain
// color+initials look instead of silently showing nothing.
function TokenView({ token, mine, dragging, pos, zoom, onPointerDown, onDoubleClick }) {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [token.imageUrl]);

  const showImage = !!token.imageUrl && !imgFailed;

  return (
    <div
      className={`token ${mine ? "mine" : ""} ${dragging ? "dragging" : ""}`}
      style={{
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        width: token.size * zoom,
        height: token.size * zoom,
        backgroundColor: showImage ? "transparent" : token.color,
      }}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      title={token.label}
    >
      {showImage && (
        <img className="token-image" src={token.imageUrl} alt="" draggable={false} onError={() => setImgFailed(true)} />
      )}
      {!showImage && <span className="token-label">{token.label.slice(0, 2).toUpperCase()}</span>}
      <span className="token-name">{token.label}</span>
    </div>
  );
}

async function uploadTokenImage(file) {
  const form = new FormData();
  form.append("image", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  const data = await res.json();
  return data.url;
}

function AddTokenForm({ onSubmit, onCancel }) {
  const [label, setLabel] = useState("");
  const [color, setColor] = useState(PALETTE[Math.floor(Math.random() * PALETTE.length)]);
  const [imageUrl, setImageUrl] = useState("");
  const [size, setSize] = useState(48);
  const [uploading, setUploading] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  async function onFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadTokenImage(file);
      if (url) {
        setImgFailed(false);
        setImageUrl(url);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

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
