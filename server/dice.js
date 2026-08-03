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

const LEVEL_DIE_SIZES = { A: 12, B: 10, C: 8, D: 6 };

function levelToSides(level) {
  return LEVEL_DIE_SIZES[level] || 6;
}

function rollDie(sides) {
  return 1 + Math.floor(Math.random() * sides);
}

function scoreBladeRunnerDice(rolls) {
  const successes = rolls.reduce((sum, r) => sum + (r.value >= 10 ? 2 : r.value >= 6 ? 1 : 0), 0);
  return { successes, critical: successes >= 2 };
}

/**
 * Rolls a Blade Runner RPG Base Dice check: an attribute die plus a skill
 * die, each sized by level A-D -> D12/D10/D8/D6. An advantage adds a third
 * die matching the lower of the two (count all); a disadvantage drops the
 * lower die (roll only the higher one). 6+ on a die is a success; a natural
 * 10+ (only possible on a D10/D12) counts as two.
 */
function rollBladeRunner({ attributeLevel, skillLevel, modifier }) {
  const aSides = levelToSides(attributeLevel);
  const sSides = levelToSides(skillLevel);

  let sides = [aSides, sSides];
  if (modifier === "disadvantage") sides = [Math.max(aSides, sSides)];
  else if (modifier === "advantage") sides = [aSides, sSides, Math.min(aSides, sSides)];

  const rolls = sides.map((s) => ({ sides: s, value: rollDie(s) }));
  const { successes, critical } = scoreBladeRunnerDice(rolls);

  return { ok: true, rolls, successes, critical };
}

/**
 * Pushes an existing Blade Runner roll: every die not already showing a 1
 * gets re-rolled (a 1 can never be re-rolled away, per the rules). Harm is
 * the number of dice showing 1 after this push - inflicted as damage or
 * stress, depending on which attribute the roll used.
 */
function pushBladeRunner(rolls) {
  const pushed = rolls.map(({ sides, value }) => (value === 1 ? { sides, value } : { sides, value: rollDie(sides) }));
  const { successes, critical } = scoreBladeRunnerDice(pushed);
  const harm = pushed.filter((r) => r.value === 1).length;

  return { ok: true, rolls: pushed, successes, critical, harm };
}

module.exports = { rollFormula, rollAlienPool, rollBladeRunner, pushBladeRunner };
