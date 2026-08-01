import React, { useState, useMemo, useEffect, useRef } from "react";
import Board from "./Board.jsx";
import ChatPanel from "./ChatPanel.jsx";
import DicePanel from "./DicePanel.jsx";
import CharacterSheet from "./CharacterSheet.jsx";
import PlayersPanel from "./PlayersPanel.jsx";
import GMPanel from "./GMPanel.jsx";

export default function GameScreen({ room, whispers, whisperHistoryLoaded, playerId, identity, onLeave }) {
  const me = room.players[playerId];
  const isGM = room.gmPlayerId === playerId;
  const [tab, setTab] = useState("chat");
  const [viewCharacterId, setViewCharacterId] = useState(playerId);
  const [activeThread, setActiveThread] = useState("everyone");
  const [seenCounts, setSeenCounts] = useState({ everyone: 0, whispers: {} });
  const baselineCapturedRef = useRef(false);

  // Treat all history that already exists once we've fully loaded (including
  // whisper history, which arrives a moment after room:state) as "seen", so
  // resuming a game doesn't retroactively flag old messages as unread.
  useEffect(() => {
    if (baselineCapturedRef.current || !whisperHistoryLoaded) return;
    baselineCapturedRef.current = true;
    setSeenCounts({
      everyone: room.chat.length,
      whispers: Object.fromEntries(Object.entries(whispers).map(([id, msgs]) => [id, msgs.length])),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whisperHistoryLoaded]);

  // Whatever thread is currently open on the Chat tab counts as read, live.
  useEffect(() => {
    if (tab !== "chat") return;
    const count = activeThread === "everyone" ? room.chat.length : (whispers[activeThread] || []).length;
    setSeenCounts((prev) => ({ ...prev, [activeThread]: count }));
  }, [tab, activeThread, room.chat.length, whispers]);

  const unreadEveryone = Math.max(0, room.chat.length - (seenCounts.everyone || 0));
  const unreadWhispers = useMemo(() => {
    const result = {};
    for (const [otherId, msgs] of Object.entries(whispers)) {
      result[otherId] = Math.max(0, msgs.length - (seenCounts[otherId] || 0));
    }
    return result;
  }, [whispers, seenCounts]);
  const totalUnread = unreadEveryone + Object.values(unreadWhispers).reduce((a, b) => a + b, 0);

  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) Game Night` : "Game Night";
    return () => {
      document.title = "Game Night";
    };
  }, [totalUnread]);

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
        <div className="room-code" onClick={copyCode} title="Click to copy the room code">
          {room.name ? `${room.name} · ` : "Room: "}
          <strong>{room.code}</strong>
        </div>
        <div className="me">
          {me?.name || identity.name} {isGM ? "(Game Master)" : ""}
        </div>
        <button className="link-button" onClick={onLeave}>
          My Games
        </button>
      </header>

      <div className="game-body">
        <Board room={room} playerId={playerId} isGM={isGM} />

        <aside className="sidebar">
          <nav className="tabs">
            {tabs.map((t) => (
              <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
                {t.label}
                {t.id === "chat" && totalUnread > 0 && <span className="tab-badge">{totalUnread}</span>}
              </button>
            ))}
          </nav>

          <div className="tab-content">
            {tab === "chat" && (
              <ChatPanel
                room={room}
                whispers={whispers}
                playerId={playerId}
                activeThread={activeThread}
                onChangeThread={setActiveThread}
                unreadEveryone={unreadEveryone}
                unreadWhispers={unreadWhispers}
              />
            )}
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
