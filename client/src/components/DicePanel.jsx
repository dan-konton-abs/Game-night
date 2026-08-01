import React, { useEffect, useMemo, useRef, useState } from "react";
import { socket } from "../socket.js";

const QUICK_DICE = [4, 6, 8, 10, 12, 20, 100];
const MAX_DICE = 20;
const PIP_FACES = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
const MODE_KEY = "gamenight:diceMode";

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

/** Normalizes either roll type into a flat list of { sides, value, variant }. */
function diceFromEntry(entry) {
  if (entry.mode === "alien") {
    return [
      ...entry.baseRolls.map((v) => ({ sides: 6, value: v, variant: "base" })),
      ...entry.stressRolls.map((v) => ({ sides: 6, value: v, variant: "stress" })),
    ];
  }
  const sides = sidesFromFormula(entry.formula);
  return entry.rolls.map((v) => ({ sides, value: v, variant: "normal" }));
}

function DieFace({ sides, value, variant, spinning }) {
  const pip = sides === 6 && value >= 1 && value <= 6;
  const success = !spinning && variant !== "normal" && value === 6;
  const classes = [
    "die-face",
    pip && "die-pips",
    value >= 100 && "die-face-small",
    variant === "stress" && "die-stress",
    success && "die-success",
    spinning ? "spinning" : "settled",
  ]
    .filter(Boolean)
    .join(" ");
  return <div className={classes}>{pip ? PIP_FACES[value] : value}</div>;
}

function DiceTray({ entry }) {
  const dice = useMemo(() => diceFromEntry(entry), [entry]);
  const stagger = Math.max(30, Math.min(130, 900 / Math.max(dice.length, 1)));
  const [values, setValues] = useState(dice.map((d) => 1 + Math.floor(Math.random() * d.sides)));
  const [spinning, setSpinning] = useState(true);

  useEffect(() => {
    const intervals = dice.map((d, i) =>
      setInterval(() => {
        setValues((prev) => {
          const next = [...prev];
          next[i] = 1 + Math.floor(Math.random() * d.sides);
          return next;
        });
      }, 80 + i * 4)
    );

    const settleTimers = dice.map((d, i) =>
      setTimeout(() => {
        clearInterval(intervals[i]);
        setValues((prev) => {
          const next = [...prev];
          next[i] = d.value;
          return next;
        });
      }, 550 + i * stagger)
    );

    const doneTimer = setTimeout(() => setSpinning(false), 550 + dice.length * stagger + 150);

    return () => {
      intervals.forEach(clearInterval);
      settleTimers.forEach(clearTimeout);
      clearTimeout(doneTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.id]);

  return (
    <div className="dice-tray">
      <div className="dice-tray-label">
        <strong>{entry.name}</strong> rolled {entry.label ? `"${entry.label}" ` : ""}
        {entry.mode === "alien" ? (
          <code>
            {entry.baseRolls.length}d6{entry.stressRolls.length ? ` + ${entry.stressRolls.length} stress` : ""}
          </code>
        ) : (
          <code>{entry.formula}</code>
        )}
      </div>
      <div className="dice-tray-dice">
        {dice.map((d, i) => (
          <DieFace key={i} sides={d.sides} value={values[i]} variant={d.variant} spinning={spinning} />
        ))}
      </div>
      {!spinning &&
        (entry.mode === "alien" ? (
          <div className="dice-tray-total">
            <strong>{entry.successes}</strong> success{entry.successes === 1 ? "" : "es"}
            {entry.panic && <div className="dice-panic-warning">⚠ Panic! Roll on the Panic Table.</div>}
          </div>
        ) : (
          <div className="dice-tray-total">
            [{entry.rolls.join(", ")}]
            {entry.modifier ? ` ${entry.modifier > 0 ? "+" : ""}${entry.modifier}` : ""} = <strong>{entry.total}</strong>
          </div>
        ))}
    </div>
  );
}

export default function DicePanel({ room }) {
  const [mode, setMode] = useState(() => localStorage.getItem(MODE_KEY) || "dnd");
  const [formula, setFormula] = useState("1d20");
  const [label, setLabel] = useState("");
  const [selectedSides, setSelectedSides] = useState(20);
  const [count, setCount] = useState(1);
  const [baseDice, setBaseDice] = useState(1);
  const [stressDice, setStressDice] = useState(0);
  const [activeRoll, setActiveRoll] = useState(null);
  // Captured once at mount so resuming a game doesn't replay old history as an animation.
  const lastSeenIdRef = useRef(room.diceLog[0]?.id ?? null);

  useEffect(() => {
    localStorage.setItem(MODE_KEY, mode);
  }, [mode]);

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

  function rollAlienPool() {
    socket.emit("dice:roll", { mode: "alien", baseDice, stressDice, label });
  }

  return (
    <div className="panel dice-panel">
      <h3>Roll dice</h3>
      <div className="mode-toggle dice-mode-toggle">
        <button type="button" className={mode === "dnd" ? "active" : ""} onClick={() => setMode("dnd")}>
          D&D-style
        </button>
        <button type="button" className={mode === "alien" ? "active" : ""} onClick={() => setMode("alien")}>
          Alien RPG
        </button>
      </div>

      {mode === "dnd" ? (
        <>
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
        </>
      ) : (
        <>
          <div className="alien-pool-row">
            <label>
              Base dice
              <div className="inline-row">
                <button type="button" className="small" onClick={() => setBaseDice((n) => Math.max(0, n - 1))}>
                  −
                </button>
                <span className="dice-count">{baseDice}</span>
                <button
                  type="button"
                  className="small"
                  onClick={() => setBaseDice((n) => Math.min(MAX_DICE, n + 1))}
                >
                  +
                </button>
              </div>
            </label>
            <label>
              Stress dice
              <div className="inline-row">
                <button type="button" className="small" onClick={() => setStressDice((n) => Math.max(0, n - 1))}>
                  −
                </button>
                <span className="dice-count">{stressDice}</span>
                <button
                  type="button"
                  className="small"
                  onClick={() => setStressDice((n) => Math.min(MAX_DICE, n + 1))}
                >
                  +
                </button>
              </div>
            </label>
          </div>
          <button
            type="button"
            className="primary"
            disabled={baseDice + stressDice < 1}
            onClick={rollAlienPool}
          >
            Roll {baseDice}d6{stressDice ? ` + ${stressDice} stress` : ""}
          </button>
          <p className="hint">Each 6 is a success. A 1 on any stress die risks Panic.</p>
        </>
      )}

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
              {entry.mode === "alien" ? (
                <code>
                  {entry.baseRolls.length}d6{entry.stressRolls.length ? ` + ${entry.stressRolls.length} stress` : ""}
                </code>
              ) : (
                <code>{entry.formula}</code>
              )}
            </div>
            <div className="dice-log-detail">
              {entry.mode === "alien" ? (
                <>
                  [{[...entry.baseRolls, ...entry.stressRolls].join(", ")}] = <strong>{entry.successes}</strong>{" "}
                  success{entry.successes === 1 ? "" : "es"}
                  {entry.panic ? " · ⚠ Panic!" : ""}
                </>
              ) : (
                <>
                  [{entry.rolls.join(", ")}]
                  {entry.modifier ? ` ${entry.modifier > 0 ? "+" : ""}${entry.modifier}` : ""} ={" "}
                  <strong>{entry.total}</strong>
                </>
              )}
              <span className="muted"> · {timeAgo(entry.timestamp)}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
