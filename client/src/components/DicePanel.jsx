import React, { useEffect, useMemo, useRef, useState } from "react";
import { socket } from "../socket.js";
import { diceFromEntry } from "../diceShapes.js";

const QUICK_DICE = [4, 6, 8, 10, 12, 20, 100];
const MAX_DICE = 20;
const PIP_FACES = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
const MODE_KEY = "gamenight:diceMode";
const SKIN_KEY = "gamenight:diceSkin";
const DICE_SKINS = [
  { id: "pips", label: "Classic" },
  { id: "led", label: "LED Readout" },
  { id: "holo", label: "Holographic" },
  { id: "hex", label: "Hex Panel" },
];
const BR_LEVELS = ["A", "B", "C", "D"];
const BR_LEVEL_DIE = { A: 12, B: 10, C: 8, D: 6 };
const BR_ATTRIBUTES = [
  { id: "strength", label: "Strength" },
  { id: "agility", label: "Agility" },
  { id: "intelligence", label: "Intelligence" },
  { id: "empathy", label: "Empathy" },
];

function timeAgo(ts) {
  const diff = Math.max(0, Date.now() - ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

function DieFace({ sides, value, variant, spinning, skin = "pips" }) {
  // The LED skin is a digital readout, not a physical die - it always shows
  // the numeral, even for a d6 that would otherwise show pips.
  const pip = skin !== "led" && sides === 6 && value >= 1 && value <= 6;
  // Alien dice only ever succeed on an exact 6 (that's the only face a d6
  // has); Blade Runner's Base Dice can be d8/d10/d12 too, where 6+ succeeds
  // and a natural 10+ counts double - hence the >= here instead of ===.
  const success = !spinning && variant !== "normal" && value >= 6;
  const doubleSuccess = !spinning && variant === "br" && value >= 10;
  const classes = [
    "die-face",
    `die-skin-${skin}`,
    pip && "die-pips",
    value >= 100 && "die-face-small",
    variant === "stress" && "die-stress",
    success && "die-success",
    doubleSuccess && "die-double-success",
    spinning ? "spinning" : "settled",
  ]
    .filter(Boolean)
    .join(" ");
  return <div className={classes}>{pip ? PIP_FACES[value] : value}</div>;
}

function brNotation(entry) {
  return entry.rolls.map((r) => `D${r.sides}`).join(" + ");
}

function DiceTray({ entry, skin, playerId, onPush }) {
  const dice = useMemo(() => diceFromEntry(entry), [entry]);
  const stagger = Math.max(30, Math.min(130, 900 / Math.max(dice.length, 1)));
  const [values, setValues] = useState(dice.map((d) => 1 + Math.floor(Math.random() * d.sides)));
  const [spinning, setSpinning] = useState(true);
  // Tracks the pushCount we've already animated up to, so a push (which
  // mutates this same entry in place rather than creating a new one) can
  // snap straight to the new results instead of replaying the full tumble.
  const pushCountRef = useRef(entry.pushCount ?? 0);

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

  useEffect(() => {
    if ((entry.pushCount ?? 0) === pushCountRef.current) return;
    pushCountRef.current = entry.pushCount;
    setValues(dice.map((d) => d.value));
  }, [entry.pushCount, dice]);

  const pushesAllowed = entry.replicant ? 2 : 1;
  const canPush = entry.mode === "br" && entry.playerId === playerId && (entry.pushCount ?? 0) < pushesAllowed;
  const harmLabel = entry.replicant || ["intelligence", "empathy"].includes(entry.attributeType) ? "stress" : "damage";

  return (
    <div className="dice-tray">
      <div className="dice-tray-label">
        <strong>{entry.name}</strong> rolled {entry.label ? `"${entry.label}" ` : ""}
        {entry.mode === "alien" ? (
          <code>
            {entry.baseRolls.length}d6{entry.stressRolls.length ? ` + ${entry.stressRolls.length} stress` : ""}
          </code>
        ) : entry.mode === "br" ? (
          <code>{brNotation(entry)}</code>
        ) : (
          <code>{entry.formula}</code>
        )}
      </div>
      <div className="dice-tray-dice">
        {dice.map((d, i) => (
          <DieFace key={i} sides={d.sides} value={values[i]} variant={d.variant} spinning={spinning} skin={skin} />
        ))}
      </div>
      {!spinning &&
        (entry.mode === "alien" ? (
          <div className="dice-tray-total">
            <strong>{entry.successes}</strong> success{entry.successes === 1 ? "" : "es"}
            {entry.panic && <div className="dice-panic-warning">⚠ Panic! Roll on the Panic Table.</div>}
          </div>
        ) : entry.mode === "br" ? (
          <div className="dice-tray-total">
            <strong>{entry.successes}</strong> success{entry.successes === 1 ? "" : "es"}
            {entry.critical && <span className="dice-critical-badge"> · Critical!</span>}
            {entry.harm > 0 && (
              <div className="dice-panic-warning">
                ⚠ {entry.harm} point{entry.harm === 1 ? "" : "s"} of {harmLabel} from pushing
              </div>
            )}
            {canPush && (
              <button type="button" className="danger small dice-push-button" onClick={onPush}>
                Push the roll{entry.replicant ? ` (${pushesAllowed - entry.pushCount} left)` : ""}
              </button>
            )}
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

const DICE_3D_OPTIONS = [
  { id: "off", label: "Off (2D tray only)" },
  { id: "low", label: "Potato (lighter on the GPU)" },
  { id: "high", label: "High" },
];

export default function DicePanel({ room, playerId, dice3dQuality, onChangeDice3dQuality }) {
  const [mode, setMode] = useState(() => localStorage.getItem(MODE_KEY) || "dnd");
  const [skin, setSkin] = useState(() => localStorage.getItem(SKIN_KEY) || "pips");
  const [formula, setFormula] = useState("1d20");
  const [label, setLabel] = useState("");
  const [selectedSides, setSelectedSides] = useState(20);
  const [count, setCount] = useState(1);
  const [baseDice, setBaseDice] = useState(1);
  const [stressDice, setStressDice] = useState(0);
  const [attributeType, setAttributeType] = useState("strength");
  const [attributeLevel, setAttributeLevel] = useState("C");
  const [skillLevel, setSkillLevel] = useState("C");
  const [brModifier, setBrModifier] = useState("none");
  const [replicant, setReplicant] = useState(false);
  // Only tracks WHICH log entry is active - the entry itself is always looked
  // up fresh from room.diceLog, so a push (which mutates the same entry
  // rather than creating a new one) updates the tray in place instead of
  // being stuck showing a stale pre-push snapshot.
  const [activeRollId, setActiveRollId] = useState(null);
  // Captured once at mount so resuming a game doesn't replay old history as an animation.
  const lastSeenIdRef = useRef(room.diceLog[0]?.id ?? null);
  const activeRoll = activeRollId ? room.diceLog.find((e) => e.id === activeRollId) ?? null : null;

  useEffect(() => {
    localStorage.setItem(MODE_KEY, mode);
  }, [mode]);

  useEffect(() => {
    localStorage.setItem(SKIN_KEY, skin);
  }, [skin]);

  useEffect(() => {
    const newest = room.diceLog[0];
    if (newest && newest.id !== lastSeenIdRef.current) {
      lastSeenIdRef.current = newest.id;
      setActiveRollId(newest.id);
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

  function rollBladeRunner() {
    socket.emit("dice:roll", {
      mode: "br",
      attributeType,
      attributeLevel,
      skillLevel,
      modifier: brModifier === "none" ? null : brModifier,
      replicant,
      label,
    });
  }

  function pushBladeRunnerRoll() {
    if (!activeRoll) return;
    socket.emit("dice:pushBR", { entryId: activeRoll.id });
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
        <button type="button" className={mode === "br" ? "active" : ""} onClick={() => setMode("br")}>
          Blade Runner
        </button>
      </div>

      {room.theme === "scifi" && (
        <label>
          Dice skin
          <select value={skin} onChange={(e) => setSkin(e.target.value)}>
            {DICE_SKINS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <label>
        3D dice pop-up (over the map, for everyone)
        <select value={dice3dQuality} onChange={(e) => onChangeDice3dQuality(e.target.value)}>
          {DICE_3D_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

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
      ) : mode === "alien" ? (
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
      ) : (
        <>
          <div className="br-roll-row">
            <label>
              Attribute
              <select value={attributeType} onChange={(e) => setAttributeType(e.target.value)}>
                {BR_ATTRIBUTES.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Attribute level
              <select value={attributeLevel} onChange={(e) => setAttributeLevel(e.target.value)}>
                {BR_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l} (D{BR_LEVEL_DIE[l]})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Skill level
              <select value={skillLevel} onChange={(e) => setSkillLevel(e.target.value)}>
                {BR_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l} (D{BR_LEVEL_DIE[l]})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mode-toggle br-modifier-toggle">
            <button type="button" className={brModifier === "none" ? "active" : ""} onClick={() => setBrModifier("none")}>
              None
            </button>
            <button
              type="button"
              className={brModifier === "advantage" ? "active" : ""}
              onClick={() => setBrModifier("advantage")}
            >
              Advantage
            </button>
            <button
              type="button"
              className={brModifier === "disadvantage" ? "active" : ""}
              onClick={() => setBrModifier("disadvantage")}
            >
              Disadvantage
            </button>
          </div>

          <label className="inline-row">
            <input type="checkbox" checked={replicant} onChange={(e) => setReplicant(e.target.checked)} />
            Replicant (can push twice; pushing always costs stress)
          </label>

          <button type="button" className="primary" onClick={rollBladeRunner}>
            Roll D{BR_LEVEL_DIE[attributeLevel]} + D{BR_LEVEL_DIE[skillLevel]}
            {brModifier === "advantage" ? ` + D${Math.min(BR_LEVEL_DIE[attributeLevel], BR_LEVEL_DIE[skillLevel])}` : ""}
          </button>
          <p className="hint">6+ on a die is a success (10+ counts as two). Pushing re-rolls anything that isn't already a 1.</p>
        </>
      )}

      <input
        className="dice-label-input"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Label this roll (optional), e.g. Attack"
        maxLength={40}
      />

      {activeRoll && (
        <DiceTray
          key={activeRoll.id}
          entry={activeRoll}
          skin={room.theme === "scifi" ? skin : "pips"}
          playerId={playerId}
          onPush={pushBladeRunnerRoll}
        />
      )}

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
              ) : entry.mode === "br" ? (
                <code>{brNotation(entry)}</code>
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
              ) : entry.mode === "br" ? (
                <>
                  [{entry.rolls.map((r) => r.value).join(", ")}] = <strong>{entry.successes}</strong> success
                  {entry.successes === 1 ? "" : "es"}
                  {entry.critical ? " · Critical!" : ""}
                  {entry.pushCount > 0 ? ` · pushed ${entry.pushCount}x` : ""}
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
