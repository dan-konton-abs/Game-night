import React, { useEffect, useRef, useState } from "react";
import { socket } from "../socket.js";

function timeAgo(ts) {
  const diff = Math.max(0, Date.now() - ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

export default function ChatPanel({ room, playerId }) {
  const [text, setText] = useState("");
  const listRef = useRef(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [room.chat.length]);

  function send(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    socket.emit("chat:send", { text: trimmed });
    setText("");
  }

  return (
    <div className="panel chat-panel">
      <ul className="chat-messages" ref={listRef}>
        {room.chat.length === 0 && <li className="muted">No messages yet — say hi.</li>}
        {room.chat.map((msg) => (
          <li key={msg.id} className={`chat-message ${msg.playerId === playerId ? "mine" : ""}`}>
            <div className="chat-message-head">
              <strong>{msg.name}</strong>
              <span className="muted small"> · {timeAgo(msg.timestamp)}</span>
            </div>
            <div className="chat-message-text">{msg.text}</div>
          </li>
        ))}
      </ul>

      <form className="chat-input-form" onSubmit={send}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message the table…"
          maxLength={500}
        />
        <button type="submit" className="primary">
          Send
        </button>
      </form>
    </div>
  );
}
