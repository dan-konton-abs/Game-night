import React, { useEffect, useRef, useState } from "react";
import { socket } from "../socket.js";

export default function RulesKeeperModal({ room, playerId, isGM, messages, onClose }) {
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, asking]);

  const hasRulebook = !!room.rulesKeeper.fileName;

  function ask(e) {
    e.preventDefault();
    const text = question.trim();
    if (!text || asking) return;
    setAsking(true);
    setError(null);
    socket.emit("rulesKeeper:ask", { question: text }, (ack) => {
      setAsking(false);
      if (ack?.ok) setQuestion("");
      else setError(ack?.error || "The Keeper didn't answer. Try again.");
    });
  }

  function clearConversation() {
    if (!confirm("Clear your conversation with the Keeper? This can't be undone.")) return;
    socket.emit("rulesKeeper:clearMine");
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal rules-keeper-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>📖 Keeper of the Rules</h3>
          <button type="button" className="link-button" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="hint rules-keeper-subtitle">
          {hasRulebook
            ? `Rulebook loaded: ${room.rulesKeeper.fileName}`
            : isGM
            ? "No rulebook loaded yet - upload one from GM Tools to wake the Keeper."
            : "No rulebook loaded yet - ask your GM to upload one from GM Tools."}
        </p>

        <div className="rules-keeper-messages" ref={listRef}>
          {messages.length === 0 && (
            <div className="rules-keeper-empty">
              {hasRulebook ? "Ask the Keeper anything about the rules." : "…"}
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`rules-keeper-message rules-keeper-${m.role}`}>
              {m.text}
            </div>
          ))}
          {asking && <div className="rules-keeper-message rules-keeper-model rules-keeper-thinking">The Keeper grumbles while it thinks…</div>}
        </div>

        {error && <p className="error-text">{error}</p>}

        <form className="rules-keeper-form" onSubmit={ask}>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={hasRulebook ? "Ask about the rules…" : "No rulebook loaded yet"}
            maxLength={500}
            disabled={!hasRulebook || asking}
          />
          <button type="submit" className="primary" disabled={!hasRulebook || asking || !question.trim()}>
            Ask
          </button>
        </form>
        {messages.length > 0 && (
          <button type="button" className="link-button rules-keeper-clear" onClick={clearConversation}>
            Clear conversation
          </button>
        )}
      </div>
    </div>
  );
}
