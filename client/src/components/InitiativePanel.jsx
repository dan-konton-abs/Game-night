import React, { useState } from "react";
import { socket } from "../socket.js";

export default function InitiativePanel({ room, playerId, isGM }) {
  const initiative = room.initiative || { active: false, round: 1, currentIndex: 0, entries: [], notifyTurns: true };
  const [monsterName, setMonsterName] = useState("");
  const [monsterValue, setMonsterValue] = useState(10);
  const [addPlayerId, setAddPlayerId] = useState("");
  const [addPlayerValue, setAddPlayerValue] = useState(10);

  const currentEntry = initiative.active ? initiative.entries[initiative.currentIndex] : null;
  const canAdvance = initiative.active && (isGM || currentEntry?.playerId === playerId);

  // Players already linked to an entry shouldn't clutter the "add a player"
  // dropdown - Start Combat also relies on this same distinction to avoid
  // ever adding someone twice.
  const linkedPlayerIds = new Set(initiative.entries.filter((e) => e.playerId).map((e) => e.playerId));
  const availablePlayers = Object.values(room.players).filter((p) => !linkedPlayerIds.has(p.id));

  const entriesWithMeta = initiative.entries.map((entry, i) => ({
    ...entry,
    isCurrent: initiative.active && i === initiative.currentIndex,
  }));
  const playerEntries = entriesWithMeta.filter((e) => e.playerId);
  // No playerId means it's a monster/NPC - the GM personally plays these, so
  // grouping them apart from the linked players makes it obvious at a glance
  // what the GM currently has in the fight.
  const monsterEntries = entriesWithMeta.filter((e) => !e.playerId);

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
  function addMonsterEntry(e) {
    e.preventDefault();
    if (!monsterName.trim()) return;
    socket.emit("initiative:addEntry", { name: monsterName.trim(), value: monsterValue });
    setMonsterName("");
  }
  function addPlayerEntry(e) {
    e.preventDefault();
    if (!addPlayerId) return;
    socket.emit("initiative:addEntry", { value: addPlayerValue, playerId: addPlayerId });
    setAddPlayerId("");
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

  function renderEntry(entry) {
    return (
      <li key={entry.id} className={entry.isCurrent ? "current-turn" : ""}>
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
        {entry.isCurrent && <span className="badge">Now</span>}
        {isGM && (
          <button type="button" className="link-button small" onClick={() => removeEntry(entry.id)}>
            ✕
          </button>
        )}
      </li>
    );
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

      {playerEntries.length > 0 && (
        <>
          <h4 className="initiative-group-label">Players</h4>
          <ul className="initiative-list">{playerEntries.map(renderEntry)}</ul>
        </>
      )}

      {monsterEntries.length > 0 && (
        <>
          <h4 className="initiative-group-label">GM's Monsters</h4>
          <ul className="initiative-list">{monsterEntries.map(renderEntry)}</ul>
        </>
      )}

      {isGM && (
        <>
          {availablePlayers.length > 0 && (
            <form className="inline-row initiative-add-form" onSubmit={addPlayerEntry}>
              <select value={addPlayerId} onChange={(e) => setAddPlayerId(e.target.value)}>
                <option value="">Add a player…</option>
                {availablePlayers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.id === room.gmPlayerId ? " (GM)" : ""}
                  </option>
                ))}
              </select>
              <input
                type="number"
                className="initiative-value-input"
                value={addPlayerValue}
                onChange={(e) => setAddPlayerValue(Number(e.target.value))}
              />
              <button type="submit">Add</button>
            </form>
          )}
          <form className="inline-row initiative-add-form" onSubmit={addMonsterEntry}>
            <input
              value={monsterName}
              onChange={(e) => setMonsterName(e.target.value)}
              placeholder="Monster/NPC name"
              maxLength={40}
            />
            <input
              type="number"
              className="initiative-value-input"
              value={monsterValue}
              onChange={(e) => setMonsterValue(Number(e.target.value))}
            />
            <button type="submit">Add</button>
          </form>
        </>
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
