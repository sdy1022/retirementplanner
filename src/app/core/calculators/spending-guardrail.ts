// Simple capital-preservation guardrail, in the spirit of the Guyton-Klinger decision
// rules used in retirement-planning literature: compare what the plan actually has at the
// start of each year against a reference ("baseline") plan at the same age, and trim
// discretionary spending — plus pause discretionary Roth conversions, which compete with
// living expenses for the same brokerage cash — while running meaningfully behind that
// baseline. This models a retiree who reacts to a bad market instead of blindly executing
// a fixed plan through every regime, which a pure Monte Carlo replay of a static plan does
// not capture.
export interface GuardrailOptions {
  // Ratio of actual-to-baseline assets that triggers a spending cut. Default 0.80 (20% behind).
  cutTrigger?: number;
  // Ratio required to exit cut mode. Kept above cutTrigger (hysteresis) so a plan hovering
  // near the trigger doesn't flip spending up and down year to year. Default 0.95.
  restoreTrigger?: number;
  // Fraction to cut discretionary living expenses by while in cut mode. Default 0.10.
  cutFraction?: number;
}

const DEFAULT_CUT_TRIGGER = 0.8;
const DEFAULT_RESTORE_TRIGGER = 0.95;
const DEFAULT_CUT_FRACTION = 0.1;

export interface GuardrailDecision {
  livingExpenseMultiplier: number;
  pauseConversion: boolean;
}

// Builds one guardrail instance with its own cut/restore state — callers must create a
// fresh instance per independent simulation run (e.g. per Monte Carlo trial). Reusing one
// instance across trials would leak "currently in cut mode" state across trial boundaries,
// the same class of bug fixed in the block-bootstrap return sampler (see
// monte-carlo-returns.ts's createReturnSampler / monte-carlo.ts's createTrialRunner).
export function createGuardrail(
  baselineAssetsByAge: ReadonlyMap<number, number>,
  options: GuardrailOptions = {},
): (params: { age: number; beginningAssets: number }) => GuardrailDecision {
  const cutTrigger = options.cutTrigger ?? DEFAULT_CUT_TRIGGER;
  const restoreTrigger = options.restoreTrigger ?? DEFAULT_RESTORE_TRIGGER;
  const cutFraction = options.cutFraction ?? DEFAULT_CUT_FRACTION;
  let inCutMode = false;

  return ({ age, beginningAssets }) => {
    const baseline = baselineAssetsByAge.get(age);
    if (baseline !== undefined && baseline > 0) {
      const ratio = beginningAssets / baseline;
      if (inCutMode) {
        if (ratio >= restoreTrigger) inCutMode = false;
      } else if (ratio < cutTrigger) {
        inCutMode = true;
      }
    }
    return { livingExpenseMultiplier: inCutMode ? 1 - cutFraction : 1, pauseConversion: inCutMode };
  };
}
