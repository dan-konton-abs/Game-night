import React, { useEffect, useState } from "react";
import { socket } from "../socket.js";

function emptyDraft() {
  return {
    id: null,
    name: "",
    className: "",
    level: 1,
    hp: 0,
    maxHp: 0,
    defense: 0,
    attributes: [],
    notes: "",
    inventory: "",
  };
}

export default function CharacterSheet({ room, playerId, isGM, viewCharacterId, onChangeViewCharacter }) {
  const targetId = isGM ? viewCharacterId : playerId;
  const character = room.characters[targetId];
  const [draft, setDraft] = useState(character || emptyDraft());
  const [saved, setSaved] = useState(true);
  const [adjustAmount, setAdjustAmount] = useState(1);

  useEffect(() => {
    setDraft(room.characters[targetId] || emptyDraft());
    setSaved(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId]);

  const canEdit = isGM || targetId === playerId;

  function update(patch) {
    setDraft((d) => ({ ...d, ...patch }));
    setSaved(false);
  }

  function save(nextDraft = draft) {
    socket.emit("character:upsert", { character: { ...nextDraft, id: targetId } });
    setSaved(true);
  }

  function updateAttribute(id, patch) {
    update({ attributes: draft.attributes.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
  }

  function addAttribute() {
    const next = { ...draft, attributes: [...draft.attributes, { id: `tmp-${Date.now()}`, label: "New Stat", value: "0" }] };
    setDraft(next);
    save(next);
  }

  function removeAttribute(id) {
    const next = { ...draft, attributes: draft.attributes.filter((a) => a.id !== id) };
    setDraft(next);
    save(next);
  }

  function adjustHp(delta) {
    const maxHp = Number(draft.maxHp) || 0;
    const current = Number(draft.hp) || 0;
    const nextHp = Math.min(Math.max(current + delta, 0), maxHp);
    const next = { ...draft, hp: nextHp };
    setDraft(next);
    save(next);
  }

  if (!character && !isGM) {
    return <div className="panel">Loading your character…</div>;
  }

  return (
    <div className="panel character-sheet">
      {isGM && (
        <label>
          Viewing character
          <select value={targetId} onChange={(e) => onChangeViewCharacter(e.target.value)}>
            {Object.values(room.players).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.id === room.gmPlayerId ? "(GM)" : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      <fieldset disabled={!canEdit}>
        <div className="row two-col">
          <label>
            Name
            <input value={draft.name} onChange={(e) => update({ name: e.target.value })} onBlur={() => save()} maxLength={40} />
          </label>
          <label>
            Class / Role
            <input
              value={draft.className}
              onChange={(e) => update({ className: e.target.value })}
              onBlur={() => save()}
              maxLength={40}
            />
          </label>
        </div>

        <div className="row three-col">
          <label>
            Level
            <input type="number" value={draft.level} onChange={(e) => update({ level: e.target.value })} onBlur={() => save()} />
          </label>
          <label>
            HP
            <input type="number" value={draft.hp} onChange={(e) => update({ hp: e.target.value })} onBlur={() => save()} />
          </label>
          <label>
            Max HP
            <input type="number" value={draft.maxHp} onChange={(e) => update({ maxHp: e.target.value })} onBlur={() => save()} />
          </label>
        </div>

        {canEdit && (
          <div className="hp-adjust-row">
            <input
              type="number"
              className="hp-adjust-amount"
              value={adjustAmount}
              onChange={(e) => setAdjustAmount(Math.max(1, Number(e.target.value) || 1))}
              min={1}
            />
            <button type="button" className="danger" onClick={() => adjustHp(-adjustAmount)}>
              Damage
            </button>
            <button type="button" className="primary" onClick={() => adjustHp(adjustAmount)}>
              Heal
            </button>
          </div>
        )}

        <label>
          Defense / Armor
          <input type="number" value={draft.defense} onChange={(e) => update({ defense: e.target.value })} onBlur={() => save()} />
        </label>

        <h3>
          Attributes{" "}
          {canEdit && (
            <button type="button" className="link-button" onClick={addAttribute}>
              + Add
            </button>
          )}
        </h3>
        <div className="attributes-grid">
          {draft.attributes.map((attr) => (
            <div key={attr.id} className="attribute-row">
              <input
                value={attr.label}
                onChange={(e) => updateAttribute(attr.id, { label: e.target.value })}
                onBlur={() => save()}
                maxLength={24}
              />
              <input
                value={attr.value}
                onChange={(e) => updateAttribute(attr.id, { value: e.target.value })}
                onBlur={() => save()}
                maxLength={10}
              />
              {canEdit && (
                <button type="button" className="link-button" onClick={() => removeAttribute(attr.id)}>
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        <label>
          Inventory
          <textarea value={draft.inventory} onChange={(e) => update({ inventory: e.target.value })} onBlur={() => save()} rows={3} />
        </label>

        <label>
          Notes
          <textarea value={draft.notes} onChange={(e) => update({ notes: e.target.value })} onBlur={() => save()} rows={4} />
        </label>
      </fieldset>

      {canEdit && <div className="save-indicator muted">{saved ? "Saved" : "Saving…"}</div>}
    </div>
  );
}
