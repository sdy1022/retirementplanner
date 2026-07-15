import { computeTranchePlan, TranchePlanInputs } from './tranche-planner-calculator';

// Defaults mirror the tool's initial state: 22% single ceiling, $85k salary,
// $12k bonus estimate, $45k annual conversion target, no drawdown.
const baseInputs: TranchePlanInputs = {
  bracketCeiling: 105700,
  otherTaxableIncome: 85000,
  bonusEstimate: 12000,
  targetConversion: 45000,
  projectedIncome: 0,
  executedYtd: 0,
  checkpoint: 'jan',
  high52: 520,
  currentPrice: 520,
  bonusCap: 15000,
};

describe('tranche-planner-calculator', () => {
  it('sizes the January schedule from salary-only room with safety margins', () => {
    const plan = computeTranchePlan(baseInputs);

    // T1 = min(60% of 45k, 90% of (105.7k - 85k)) = min(27k, 18.63k) = 18.63k
    expect(plan.tranche1).toBeCloseTo(18630, 0);
    // T2 = min(65% of remainder 26.37k, 90% of (8.7k bonus-inclusive room - 18.63k)) -> room exhausted
    expect(plan.tranche2).toBe(0);
    // T3 previews the rest of the target; the ceiling check flags it as over
    expect(plan.tranche3).toBeCloseTo(26370, 0);
    expect(plan.overCeiling).toBeTrue();
    expect(plan.overAmt).toBeCloseTo(85000 + 12000 + 45000 - 105700, 0);
  });

  it('fits the full target within room when the ceiling allows it', () => {
    const plan = computeTranchePlan({ ...baseInputs, otherTaxableIncome: 40000, bonusEstimate: 5000 });

    // T1 = min(27k, 90% of 65.7k) = 27k; T2 = min(65% of 18k, 90% of (60.7k - 27k)) = 11.7k
    expect(plan.tranche1).toBe(27000);
    expect(plan.tranche2).toBeCloseTo(11700, 0);
    expect(plan.tranche1 + plan.tranche2 + plan.tranche3).toBe(45000);
    expect(plan.overCeiling).toBeFalse();
  });

  it('trues up the October tranche against projected full-year income and executed YTD', () => {
    const plan = computeTranchePlan({
      ...baseInputs,
      otherTaxableIncome: 40000,
      bonusEstimate: 5000,
      checkpoint: 'oct',
      projectedIncome: 50000,
      executedYtd: 20000,
    });

    // Room now = 105.7k - 50k = 55.7k; T2 = min(45k - 20k, 90% of (55.7k - 20k)) = 25k
    expect(plan.tranche1).toBe(20000);
    expect(plan.tranche2).toBe(25000);
    expect(plan.tranche3).toBe(0);
    expect(plan.usedIncome).toBe(50000);
  });

  it('falls back to the planned tranches in October when no true-up values are entered', () => {
    const jan = computeTranchePlan({ ...baseInputs, otherTaxableIncome: 40000, bonusEstimate: 5000 });
    const oct = computeTranchePlan({ ...baseInputs, otherTaxableIncome: 40000, bonusEstimate: 5000, checkpoint: 'oct' });

    expect(oct.tranche1).toBe(jan.tranche1);
    expect(oct.usedIncome).toBe(45000);
  });

  it('closes the December gap with a $200 buffer against remaining room', () => {
    const plan = computeTranchePlan({
      ...baseInputs,
      otherTaxableIncome: 40000,
      bonusEstimate: 5000,
      checkpoint: 'dec',
      projectedIncome: 48000,
      executedYtd: 38000,
    });

    // Room now = 57.7k; T3 = min(45k - 38k, 57.7k - 38k - 200) = 7k
    expect(plan.tranche1).toBe(27000);
    expect(plan.tranche2).toBe(11000);
    expect(plan.tranche3).toBe(7000);
    expect(plan.overCeiling).toBeFalse();
  });

  it('never plans a negative December tranche when executed YTD already exceeds room', () => {
    const plan = computeTranchePlan({
      ...baseInputs,
      checkpoint: 'dec',
      projectedIncome: 100000,
      executedYtd: 10000,
    });

    expect(plan.tranche3).toBe(0);
  });

  it('activates the bonus tranche at a 10% drawdown and includes it in the ceiling check', () => {
    const below = computeTranchePlan({ ...baseInputs, otherTaxableIncome: 40000, bonusEstimate: 5000, currentPrice: 470 });
    const at = computeTranchePlan({ ...baseInputs, otherTaxableIncome: 40000, bonusEstimate: 5000, currentPrice: 466 });

    // 470/520 is a 9.6% drawdown — below the 10% threshold
    expect(below.drawdownActive).toBeFalse();
    expect(below.bonusAmt).toBe(0);
    // 466/520 is a 10.4% drawdown — past the threshold
    expect(at.drawdownActive).toBeTrue();
    expect(at.bonusAmt).toBe(15000);
    // 45k income + 45k tranches + 15k bonus = 105k, still under the 105.7k ceiling
    expect(at.overCeiling).toBeFalse();
  });

  it('reads a price above the 52-week high as a 0% drawdown', () => {
    const plan = computeTranchePlan({ ...baseInputs, currentPrice: 560 });

    expect(plan.drawdownPct).toBe(0);
    expect(plan.drawdownActive).toBeFalse();
  });
});
