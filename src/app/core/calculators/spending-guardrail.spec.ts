import { createGuardrail } from './spending-guardrail';

describe('spending-guardrail', () => {
  const baseline = new Map<number, number>([
    [60, 1000000],
    [61, 1000000],
    [62, 1000000],
    [63, 1000000],
  ]);

  it('does not cut when on or above the baseline', () => {
    const guardrail = createGuardrail(baseline);
    expect(guardrail({ age: 60, beginningAssets: 1000000 })).toEqual({ livingExpenseMultiplier: 1, pauseConversion: false });
    expect(guardrail({ age: 61, beginningAssets: 1200000 })).toEqual({ livingExpenseMultiplier: 1, pauseConversion: false });
  });

  it('cuts spending and pauses conversion once behind the cut trigger', () => {
    const guardrail = createGuardrail(baseline);
    // 700k / 1,000,000 = 0.70, below the default 0.80 trigger
    const decision = guardrail({ age: 60, beginningAssets: 700000 });
    expect(decision.livingExpenseMultiplier).toBe(0.9);
    expect(decision.pauseConversion).toBe(true);
  });

  it('does not cut for a mild shortfall between the cut and restore triggers', () => {
    const guardrail = createGuardrail(baseline);
    // 850k / 1,000,000 = 0.85 — above the 0.80 cut trigger, so cut mode never engages
    const decision = guardrail({ age: 60, beginningAssets: 850000 });
    expect(decision.livingExpenseMultiplier).toBe(1);
    expect(decision.pauseConversion).toBe(false);
  });

  it('has hysteresis: stays in cut mode until assets recover past the restore trigger, not just the cut trigger', () => {
    const guardrail = createGuardrail(baseline);
    guardrail({ age: 60, beginningAssets: 700000 }); // 0.70 -> enters cut mode
    // 850k / 1,000,000 = 0.85 — above the 0.80 cut trigger but below the 0.95 restore trigger,
    // so a plan that ticked back up just past the cut line should still be trimming spending
    const decision = guardrail({ age: 61, beginningAssets: 850000 });
    expect(decision.livingExpenseMultiplier).toBe(0.9);
    expect(decision.pauseConversion).toBe(true);
  });

  it('exits cut mode once assets recover past the restore trigger', () => {
    const guardrail = createGuardrail(baseline);
    guardrail({ age: 60, beginningAssets: 700000 }); // enters cut mode
    const decision = guardrail({ age: 61, beginningAssets: 960000 }); // 0.96 >= 0.95 restore trigger
    expect(decision.livingExpenseMultiplier).toBe(1);
    expect(decision.pauseConversion).toBe(false);
  });

  it('is a no-op for an age with no baseline entry', () => {
    const guardrail = createGuardrail(baseline);
    const decision = guardrail({ age: 99, beginningAssets: 1 });
    expect(decision).toEqual({ livingExpenseMultiplier: 1, pauseConversion: false });
  });

  it('respects custom thresholds', () => {
    const guardrail = createGuardrail(baseline, { cutTrigger: 0.5, restoreTrigger: 0.6, cutFraction: 0.25 });
    // 600k / 1,000,000 = 0.60 — above the custom 0.5 cut trigger, so no cut
    expect(guardrail({ age: 60, beginningAssets: 600000 }).livingExpenseMultiplier).toBe(1);
    // 400k / 1,000,000 = 0.40 — below the custom 0.5 cut trigger
    expect(guardrail({ age: 61, beginningAssets: 400000 }).livingExpenseMultiplier).toBe(0.75);
  });

  it('two independent instances do not share cut-mode state', () => {
    const a = createGuardrail(baseline);
    const b = createGuardrail(baseline);
    a({ age: 60, beginningAssets: 700000 }); // a enters cut mode
    const decisionB = b({ age: 61, beginningAssets: 850000 }); // b never dipped below trigger
    expect(decisionB.livingExpenseMultiplier).toBe(1);
    expect(decisionB.pauseConversion).toBe(false);
  });
});
