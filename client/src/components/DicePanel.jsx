import React, { useEffect, useRef, useState } from "react";
import { socket } from "../socket.js";

const QUICK_DICE = [4, 6, 8, 10, 12, 20, 100];
const MAX_DICE = 20;
const PIP_FACES = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

function timeAgo(ts) {
  const diff = Math.max(0, Date.now() - ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

function sidesFromFormula(formula) {
  const match = /d(\d+)/i.exec(formula);
  return match ? Number(match[1]) : 20;
}

function DieFace({ sides, value, spinning }) {
  const pip = sides === 6 && value >= 1 && value <= 6;
  const classes = ["die-face", pip && "die-pips", value >= 100 && "die-face-small", spinning ? "spinning" : "settled"]
    .filter(Boolean)
    .join(" ");
  return <div className={classes}>{pip ? PIP_FACES[value] : value}</div>;
}

function DiceTray({ entry }) {
  const sides = sidesFromFormula(entry.formula);
  const [values, setValues] = useState(entry.rolls.map(() => 1 + Math.floor(Math.random() * sides)));
  const [spinning, setSpinning] = useState(true);

  useEffect(() => {
    const intervals = entry.rolls.map((_, i) =>
      setInterval(() => {
        setValues((prev) => {
          const next = [...prev];
          next[i] = 1 + Math.floor(Math.random() * sides);
          return next;
        });
      }, 80 + i * 6)
    );

    const settleTimers = entry.rolls.map((finalValue, i) =>
      setTimeout(() => {
        clearInterval(intervals[i]);
        setValues((prev) => {
          const next = [...prev];
          next[i] = finalValue;
          return next;
        });
      }, 550 + i * 130)
    );

    const doneTimer = setTimeout(() => setSpinning(false), 550 + entry.rolls.length * 130 + 150);

    return () => {
      intervals.forEach(clearInterval);
      settleTimers.forEach(clearTimeout);
      clearTimeout(doneTimer);
    };
  }, [entry.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="dice-tray">
      <div className="dice-tray-label">
        <strong>{entry.name}</strong> rolled {entry.label ? `"${entry.label}" ` : ""}
        <code>{entry.formula}</code>
      </div>
      <div className="dice-tray-dice">
        {values.map((v, i) => (
          <DieFace key={i} sides={sides} value={v} spinning={spinning} />
        ))}
      </div>
      {!spinning && (
        <div className="dice-tray-total">
          [{entry.rolls.join(", ")}]
          {entry.modifier ? ` ${entry.modifier > 0 ? "+" : ""}${entry.modifier}` : ""} = <strong>{entry.total}</strong>
        </div>
      )}
    </div>
  );
}

export default function DicePanel({ room }) {
  const [formula, setFormula] = useState("1d20");
  const [label, setLabel] = useState("");
  const [selectedSides, setSelectedSides] = useState(20);
  const [count, setCount] = useState(1);
  const [activeRoll, setActiveRoll] = useState(null);
  // Captured once at mount so resuming a game doesn't replay old history as an animation.
  const lastSeenIdRef = useRef(room.diceLog[0]?.id ?? null);

  useEffect(() => {
    const newest = room.diceLog[0];
    if (newest && newest.id !== lastSeenIdRef.current) {
      lastSeenIdRef.current = newest.id;
      setActiveRoll(newest);
    }
  }, [room.diceLog]);

  function roll(f) {
    socket.emit("dice:roll", { formula: f, label });
  }

  function quickRoll(sides) {
    setSelectedSides(sides);
    roll(`1d${sides}`);
  }

  function adjustCount(delta) {
    setCount((c) => Math.min(MAX_DICE, Math.max(1, c + delta)));
  }

  return (
    <div className="panel dice-panel">
      <h3>Roll dice</h3>
      <div className="quick-dice">
        {QUICK_DICE.map((sides) => (
          <button
            key={sides}
            type="button"
            className={selectedSides === sides ? "active" : ""}
            onClick={() => quickRoll(sides)}
          >
            d{sides}
          </button>
        ))}
      </div>

      <div className="dice-count-row">
        <span className="muted small">Roll multiple:</span>
        <button type="button" className="small" onClick={() => adjustCount(-1)} disabled={count <= 1}>
          −
        </button>
        <span className="dice-count">{count}</span>
        <button type="button" className="small" onClick={() => adjustCount(1)} disabled={count >= MAX_DICE}>
          +
        </button>
        <button type="button" className="primary small" onClick={() => roll(`${count}d${selectedSides}`)}>
          Roll {count}d{selectedSides}
        </button>
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

      {activeRoll && <DiceTray key={activeRoll.id} entry={activeRoll} />}

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
