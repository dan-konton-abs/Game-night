import React, { useState } from "react";
import { socket } from "../socket.js";

const QUICK_DICE = [4, 6, 8, 10, 12, 20, 100];

function timeAgo(ts) {
  const diff = Math.max(0, Date.now() - ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

export default function DicePanel({ room }) {
  const [formula, setFormula] = useState("1d20");
  const [label, setLabel] = useState("");

  function roll(f) {
    socket.emit("dice:roll", { formula: f, label });
  }

  return (
    <div className="panel dice-panel">
      <h3>Roll dice</h3>
      <div className="quick-dice">
        {QUICK_DICE.map((sides) => (
          <button key={sides} type="button" onClick={() => roll(`1d${sides}`)}>
            d{sides}
          </button>
        ))}
      </div>

      <form
        className="dice-formula-form"
        onSubmit={(e) => {
          e.preventDefault();
          roll(formula);
        }}
      >
        <input
          value={formula}
          onChange={(e) => setFormula(e.target.value)}
          placeholder="e.g. 2d6+3"
          maxLength={30}
        />
        <button type="submit" className="primary">
          Roll
        </button>
      </form>
      <input
        className="dice-label-input"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Label this roll (optional), e.g. Attack"
        maxLength={40}
      />

      <h3>Log</h3>
      <ul className="dice-log">
        {room.diceLog.length === 0 && <li className="muted">No rolls yet.</li>}
        {room.diceLog.map((entry) => (
          <li key={entry.id}>
            <div className="dice-log-line">
              <strong>{entry.name}</strong> rolled {entry.label ? `"${entry.label}" ` : ""}
              <code>{entry.formula}</code>
            </div>
            <div className="dice-log-detail">
              [{entry.rolls.join(", ")}]
              {entry.modifier ? ` ${entry.modifier > 0 ? "+" : ""}${entry.modifier}` : ""} ={" "}
              <strong>{entry.total}</strong>
              <span className="muted"> · {timeAgo(entry.timestamp)}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
