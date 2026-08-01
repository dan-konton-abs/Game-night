import React from "react";
import { socket } from "../socket.js";

export default function PlayersPanel({ room, playerId, isGM }) {
  const players = Object.values(room.players).sort((a, b) => a.name.localeCompare(b.name));

  function makeGM(p) {
    if (!confirm(`Make ${p.name} the Game Master? You'll become a regular player.`)) return;
    socket.emit("game:transferGM", { toPlayerId: p.id });
  }

  return (
    <div className="panel players-panel">
      <h3>In this game</h3>
      <ul className="player-list">
        {players.map((p) => {
          const character = room.characters[p.characterId];
          return (
            <li key={p.id} className={p.id === playerId ? "me" : ""}>
              <span className={`status-dot ${p.online ? "online" : "offline"}`} />
              <div className="player-info">
                <div className="player-name">
                  {p.name} {p.id === room.gmPlayerId && <span className="badge">GM</span>}
                </div>
                {character?.name && (
                  <div className="muted small">
                    {character.name}
                    {character.hp !== undefined ? ` · HP ${character.hp}/${character.maxHp}` : ""}
                  </div>
                )}
              </div>
              {isGM && p.id !== playerId && (
                <button type="button" className="link-button small" onClick={() => makeGM(p)}>
                  Make GM
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
