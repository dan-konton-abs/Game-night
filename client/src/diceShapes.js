function sidesFromFormula(formula) {
  const match = /d(\d+)/i.exec(formula);
  return match ? Number(match[1]) : 20;
}

/** Normalizes any roll-log entry into a flat list of { sides, value, variant }. */
export function diceFromEntry(entry) {
  if (entry.mode === "alien") {
    return [
      ...entry.baseRolls.map((v) => ({ sides: 6, value: v, variant: "base" })),
      ...entry.stressRolls.map((v) => ({ sides: 6, value: v, variant: "stress" })),
    ];
  }
  if (entry.mode === "br") {
    return entry.rolls.map((r) => ({ sides: r.sides, value: r.value, variant: "br" }));
  }
  const sides = sidesFromFormula(entry.formula);
  return entry.rolls.map((v) => ({ sides, value: v, variant: "normal" }));
}
