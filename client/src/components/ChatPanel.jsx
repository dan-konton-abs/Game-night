import React, { useEffect, useMemo, useRef, useState } from "react";
import { socket } from "../socket.js";

function timeAgo(ts) {
  const diff = Math.max(0, Date.now() - ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

export default function ChatPanel({ room, whispers, playerId }) {
  const [text, setText] = useState("");
  const [activeThread, setActiveThread] = useState("everyone");
  const listRef = useRef(null);

  const others = useMemo(
    () => Object.values(room.players).filter((p) => p.id !== playerId),
    [room.players, playerId]
  );

  const isPrivate = activeThread !== "everyone";
  const otherPlayer = isPrivate ? room.players[activeThread] : null;
  const messages = isPrivate ? whispers[activeThread] || [] : room.chat;

  // If whoever we were whispering with is no longer in the room, fall back to Everyone.
  useEffect(() => {
    if (isPrivate && !otherPlayer) setActiveThread("everyone");
  }, [isPrivate, otherPlayer]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, activeThread]);

  function send(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    socket.emit("chat:send", isPrivate ? { text: trimmed, toPlayerId: activeThread } : { text: trimmed });
    setText("");
  }

  return (
    <div className="panel chat-panel">
      <label className="chat-thread-select">
        Conversation
        <select value={activeThread} onChange={(e) => setActiveThread(e.target.value)}>
          <option value="everyone">💬 Everyone</option>
          {others.map((p) => (
            <option key={p.id} value={p.id}>
              🔒 Whisper: {p.name}
              {p.id === room.gmPlayerId ? " (GM)" : ""}
            </option>
          ))}
        </select>
      </label>

      {isPrivate && (
        <div className="chat-private-banner">🔒 Private — only you and {otherPlayer?.name} can see this.</div>
      )}

      <ul className={`chat-messages ${isPrivate ? "private" : ""}`} ref={listRef}>
        {messages.length === 0 && (
          <li className="muted">{isPrivate ? `No messages with ${otherPlayer?.name} yet.` : "No messages yet — say hi."}</li>
        )}
        {messages.map((msg) => {
          const senderId = isPrivate ? msg.fromId : msg.playerId;
          const senderName = isPrivate ? msg.fromName : msg.name;
          return (
            <li key={msg.id} className={`chat-message ${senderId === playerId ? "mine" : ""}`}>
              <div className="chat-message-head">
                <strong>{senderName}</strong>
                <span className="muted small"> · {timeAgo(msg.timestamp)}</span>
              </div>
              <div className="chat-message-text">{msg.text}</div>
            </li>
          );
        })}
      </ul>

      <form className={`chat-input-form ${isPrivate ? "private" : ""}`} onSubmit={send}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={isPrivate ? `Whisper ${otherPlayer?.name}…` : "Message the table…"}
          maxLength={500}
        />
        <button type="submit" className="primary">
          Send
        </button>
      </form>
    </div>
  );
}
