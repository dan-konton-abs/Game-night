import React, { useState, useMemo } from "react";
import Board from "./Board.jsx";
import ChatPanel from "./ChatPanel.jsx";
import DicePanel from "./DicePanel.jsx";
import CharacterSheet from "./CharacterSheet.jsx";
import PlayersPanel from "./PlayersPanel.jsx";
import GMPanel from "./GMPanel.jsx";

export default function GameScreen({ room, whispers, playerId, identity, onLeave }) {
  const me = room.players[playerId];
  const isGM = room.gmPlayerId === playerId;
  const [tab, setTab] = useState("chat");
  const [viewCharacterId, setViewCharacterId] = useState(playerId);

  const tabs = useMemo(() => {
    const base = [
      { id: "chat", label: "💬 Chat" },
      { id: "dice", label: "🎲 Dice" },
      { id: "character", label: "📜 Character" },
      { id: "players", label: "👥 Players" },
    ];
    if (isGM) base.push({ id: "gm", label: "🛠 GM Tools" });
    return base;
  }, [isGM]);

  function copyCode() {
    navigator.clipboard?.writeText(room.code).catch(() => {});
  }

  return (
    <div className="game-screen">
      <header className="top-bar">
        <div className="room-code" onClick={copyCode} title="Click to copy">
          Room: <strong>{room.code}</strong>
        </div>
        <div className="me">
          {me?.name || identity.name} {isGM ? "(Game Master)" : ""}
        </div>
        <button className="link-button" onClick={onLeave}>
          Leave
        </button>
      </header>

      <div className="game-body">
        <Board room={room} playerId={playerId} isGM={isGM} />

        <aside className="sidebar">
          <nav className="tabs">
            {tabs.map((t) => (
              <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>

          <div className="tab-content">
            {tab === "chat" && <ChatPanel room={room} whispers={whispers} playerId={playerId} />}
            {tab === "dice" && <DicePanel room={room} />}
            {tab === "character" && (
              <CharacterSheet
                room={room}
                playerId={playerId}
                isGM={isGM}
                viewCharacterId={viewCharacterId}
                onChangeViewCharacter={setViewCharacterId}
              />
            )}
            {tab === "players" && <PlayersPanel room={room} playerId={playerId} />}
            {tab === "gm" && isGM && <GMPanel room={room} />}
          </div>
        </aside>
      </div>
    </div>
  );
}
