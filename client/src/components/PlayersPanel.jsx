import React from "react";

export default function PlayersPanel({ room, playerId }) {
  const players = Object.values(room.players).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="panel players-panel">
      <h3>In this game</h3>
      <ul className="player-list">
        {players.map((p) => {
          const character = room.characters[p.characterId];
          return (
            <li key={p.id} className={p.id === playerId ? "me" : ""}>
              <span className={`status-dot ${p.online ? "online" : "offline"}`} />
              <div>
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
            </li>
          );
        })}
      </ul>
    </div>
  );
}
