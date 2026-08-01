// Parses and rolls simple dice formulas like "2d6+3", "d20", "4d6-1", "d100".
const FORMULA_RE = /^\s*(\d*)d(\d+)\s*([+-]\s*\d+)?\s*$/i;

function rollFormula(formula) {
  const match = FORMULA_RE.exec(formula);
  if (!match) {
    return { ok: false, error: `Unrecognised formula "${formula}". Try something like 2d6+3.` };
  }

  const count = Math.min(parseInt(match[1] || "1", 10), 100);
  const sides = Math.min(Math.max(parseInt(match[2], 10), 2), 1000);
  const modifier = match[3] ? parseInt(match[3].replace(/\s+/g, ""), 10) : 0;

  const rolls = [];
  for (let i = 0; i < count; i++) {
    rolls.push(1 + Math.floor(Math.random() * sides));
  }
  const total = rolls.reduce((sum, r) => sum + r, 0) + modifier;

  return {
    ok: true,
    formula: `${count}d${sides}${modifier ? (modifier > 0 ? `+${modifier}` : modifier) : ""}`,
    rolls,
    modifier,
    total,
  };
}

const MAX_POOL_DICE = 20;

/**
 * Rolls an Alien RPG-style d6 dice pool: base dice plus stress dice (visually
 * distinct but mechanically identical d6s). Each 6 rolled is one success;
 * a 1 on any stress die triggers a Panic Roll.
 */
function rollAlienPool(baseCount, stressCount) {
  const base = Math.min(Math.max(parseInt(baseCount, 10) || 0, 0), MAX_POOL_DICE);
  const stress = Math.min(Math.max(parseInt(stressCount, 10) || 0, 0), MAX_POOL_DICE);
  if (base + stress < 1) {
    return { ok: false, error: "Roll at least one die." };
  }

  const roll6 = () => 1 + Math.floor(Math.random() * 6);
  const baseRolls = Array.from({ length: base }, roll6);
  const stressRolls = Array.from({ length: stress }, roll6);
  const successes = [...baseRolls, ...stressRolls].filter((v) => v === 6).length;
  const panic = stressRolls.some((v) => v === 1);

  return { ok: true, baseRolls, stressRolls, successes, panic };
}

module.exports = { rollFormula, rollAlienPool };
