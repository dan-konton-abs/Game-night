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

module.exports = { rollFormula };
