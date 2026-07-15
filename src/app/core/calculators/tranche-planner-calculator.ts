// Within-year Roth conversion execution planner. The scenario engine answers WHICH
// multi-year strategy to run; this answers HOW to execute one calendar year of it:
// split the annual conversion target into three tranches (January salary-floor,
// October true-up, mid-December top-off) plus an optional market-drawdown bonus
// tranche, keeping projected income under the target bracket ceiling throughout.

export type TrancheCheckpoint = 'jan' | 'oct' | 'dec';

export interface TranchePlanInputs {
  /** Taxable-income top of the target bracket (e.g. 22% bracket max). */
  bracketCeiling: number;
  /** Salary and other known taxable income — excludes bonus and conversions. */
  otherTaxableIncome: number;
  /** Best guess of bonus / variable comp as of January. */
  bonusEstimate: number;
  /** Desired total conversion for the year. */
  targetConversion: number;
  /** Fall true-up: projected full-year taxable income excl. conversions (0 = not yet known). */
  projectedIncome: number;
  /** Conversions actually executed so far this year (0 = assume prior tranches ran as planned). */
  executedYtd: number;
  checkpoint: TrancheCheckpoint;
  /** 52-week high of the reference index fund ($/share). */
  high52: number;
  /** Current price of the reference index fund ($/share). */
  currentPrice: number;
  /** Largest extra conversion to execute on a drawdown trigger. */
  bonusCap: number;
}

export interface TranchePlanResult {
  tranche1: number;
  tranche2: number;
  tranche3: number;
  totalPlanned: number;
  /** Income + planned tranches (+ active bonus tranche) exceed the bracket ceiling. */
  overCeiling: boolean;
  overAmt: number;
  /** Bracket room remaining before any planned tranches, at the current income estimate. */
  finalRoom: number;
  /** Income estimate used for room math at this checkpoint. */
  usedIncome: number;
  drawdownPct: number;
  drawdownActive: boolean;
  bonusAmt: number;
}

// Sizing factors: T1 = min(60% of target, 90% of salary-only room) — conservative floor that
// holds even in a zero-bonus year. T2 (Jan preview) = 65% of the remainder. All room math keeps
// a 10% safety margin (×0.9); T3 in December keeps a flat $200 buffer instead.
export const T1_TARGET_SHARE = 0.6;
export const T2_REMAINDER_SHARE = 0.65;
export const ROOM_SAFETY = 0.9;
export const T3_BUFFER = 200;
export const DRAWDOWN_THRESHOLD = 0.1;

export function computeTranchePlan(inputs: TranchePlanInputs): TranchePlanResult {
  const { bracketCeiling, otherTaxableIncome, bonusEstimate, targetConversion, projectedIncome, executedYtd, checkpoint } = inputs;

  // Available room at salary floor (Tranche 1 basis) — conservative, ignores bonus entirely
  const roomSalaryOnly = Math.max(0, bracketCeiling - otherTaxableIncome);
  const plannedT1 = Math.min(targetConversion * T1_TARGET_SHARE, roomSalaryOnly * ROOM_SAFETY);

  // Total room including bonus estimate
  const roomWithBonus = Math.max(0, bracketCeiling - otherTaxableIncome - bonusEstimate);
  const remainingAfterT1 = Math.max(0, targetConversion - plannedT1);
  // Jan-preview T2 — also the Dec fallback so both checkpoints assume the same executed amount
  const plannedT2 = Math.min(remainingAfterT1 * T2_REMAINDER_SHARE, Math.max(0, roomWithBonus - plannedT1) * ROOM_SAFETY);

  let tranche1 = plannedT1;
  let tranche2 = 0;
  let tranche3 = 0;
  let usedIncome = otherTaxableIncome + bonusEstimate;

  if (checkpoint === 'jan') {
    tranche2 = plannedT2;
    tranche3 = Math.max(0, targetConversion - tranche1 - tranche2);
  } else if (checkpoint === 'oct') {
    usedIncome = projectedIncome > 0 ? projectedIncome : otherTaxableIncome + bonusEstimate;
    const roomNow = Math.max(0, bracketCeiling - usedIncome);
    const converted = executedYtd > 0 ? executedYtd : plannedT1;
    tranche1 = converted;
    tranche2 = Math.min(Math.max(0, targetConversion - converted), Math.max(0, roomNow - converted) * ROOM_SAFETY);
    tranche3 = Math.max(0, targetConversion - converted - tranche2);
  } else {
    usedIncome = projectedIncome > 0 ? projectedIncome : otherTaxableIncome + bonusEstimate;
    const roomNow = Math.max(0, bracketCeiling - usedIncome);
    const converted = executedYtd > 0 ? executedYtd : plannedT1 + plannedT2;
    // T1/T2 rows show what was actually executed; T3 closes the remaining gap with a buffer
    tranche1 = Math.min(converted, plannedT1);
    tranche2 = Math.max(0, converted - tranche1);
    tranche3 = Math.max(0, Math.min(targetConversion - converted, roomNow - converted - T3_BUFFER));
  }

  // Drawdown bonus tranche (clamped so a price above the high reads as 0% off)
  const drawdownPct = inputs.high52 > 0 ? Math.max(0, 1 - inputs.currentPrice / inputs.high52) : 0;
  const drawdownActive = drawdownPct >= DRAWDOWN_THRESHOLD;
  const bonusAmt = drawdownActive ? inputs.bonusCap : 0;

  const totalPlanned = tranche1 + tranche2 + tranche3;
  const finalRoom = Math.max(0, bracketCeiling - usedIncome);
  // Bonus tranche is ordinary taxable income too — include it in the ceiling check
  const overAmt = usedIncome + totalPlanned + bonusAmt - bracketCeiling;

  return {
    tranche1,
    tranche2,
    tranche3,
    totalPlanned,
    overCeiling: overAmt > 0,
    overAmt,
    finalRoom,
    usedIncome,
    drawdownPct,
    drawdownActive,
    bonusAmt,
  };
}
