import React, { useState } from "react";
import { socket } from "../socket.js";

export default function InitiativePanel({ room, playerId, isGM }) {
  const initiative = room.initiative || { active: false, round: 1, currentIndex: 0, entries: [], notifyTurns: true };
  const [name, setName] = useState("");
  const [value, setValue] = useState(10);

  const currentEntry = initiative.active ? initiative.entries[initiative.currentIndex] : null;
  const canAdvance = initiative.active && (isGM || currentEntry?.playerId === playerId);

  function start() {
    socket.emit("initiative:start");
  }
  function next() {
    socket.emit("initiative:next");
  }
  function end() {
    socket.emit("initiative:end");
  }
  function clearAll() {
    if (!confirm("Clear the initiative list entirely?")) return;
    socket.emit("initiative:clear");
  }
  function addEntry(e) {
    e.preventDefault();
    if (!name.trim()) return;
    socket.emit("initiative:addEntry", { name: name.trim(), value });
    setName("");
  }
  function updateValue(entryId, newValue) {
    socket.emit("initiative:updateEntry", { entryId, patch: { value: newValue } });
  }
  function updateName(entryId, newName) {
    socket.emit("initiative:updateEntry", { entryId, patch: { name: newName } });
  }
  function removeEntry(entryId) {
    socket.emit("initiative:removeEntry", { entryId });
  }
  function setNotifyTurns(enabled) {
    socket.emit("initiative:setNotify", { enabled });
  }

  return (
    <div className="panel initiative-panel">
      <h3>
        Initiative {initiative.active && <span className="muted small">· Round {initiative.round}</span>}
      </h3>

      {isGM && (
        <label className="inline-row turn-notify-toggle">
          <input
            type="checkbox"
            checked={initiative.notifyTurns}
            onChange={(e) => setNotifyTurns(e.target.checked)}
          />
          Pop up a "Your Turn" reminder on the map when it's someone's turn
        </label>
      )}
      {!isGM && !initiative.notifyTurns && initiative.active && (
        <p className="hint">Turn reminders are off - keep track of your own turn.</p>
      )}

      {initiative.entries.length === 0 && (
        <p className="muted">
          {isGM
            ? "No combatants yet — add some below, or start with everyone currently in the game."
            : "Waiting for the Game Master to set up initiative."}
        </p>
      )}

      {initiative.entries.length > 0 && (
        <ul className="initiative-list">
          {initiative.entries.map((entry, i) => {
            const isCurrent = initiative.active && i === initiative.currentIndex;
            return (
              <li key={entry.id} className={isCurrent ? "current-turn" : ""}>
                {isGM ? (
                  <input
                    type="number"
                    className="initiative-value-input"
                    value={entry.value}
                    onChange={(e) => updateValue(entry.id, e.target.value)}
                  />
                ) : (
                  <span className="initiative-value">{entry.value}</span>
                )}
                {isGM ? (
                  <input
                    className="initiative-name-input"
                    value={entry.name}
                    onChange={(e) => updateName(entry.id, e.target.value)}
                    maxLength={40}
                  />
                ) : (
                  <span className="initiative-name">{entry.name}</span>
                )}
                {isCurrent && <span className="badge">Now</span>}
                {isGM && (
                  <button type="button" className="link-button small" onClick={() => removeEntry(entry.id)}>
                    ✕
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {isGM && (
        <form className="inline-row initiative-add-form" onSubmit={addEntry}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add combatant" maxLength={40} />
          <input
            type="number"
            className="initiative-value-input"
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
          />
          <button type="submit">Add</button>
        </form>
      )}

      <div className="initiative-actions">
        {!initiative.active && isGM && (
          <button type="button" className="primary" onClick={start}>
            {initiative.entries.length > 0 ? "Start / Restart Combat" : "Start Combat"}
          </button>
        )}
        {canAdvance && (
          <button type="button" className="primary" onClick={next}>
            Next Turn
          </button>
        )}
        {initiative.active && isGM && (
          <button type="button" className="danger" onClick={end}>
            End Combat
          </button>
        )}
        {!initiative.active && isGM && initiative.entries.length > 0 && (
          <button type="button" className="link-button small" onClick={clearAll}>
            Clear list
          </button>
        )}
      </div>
    </div>
  );
}
