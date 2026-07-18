import { AccountSnapshot, RothConversionStrategy, Scenario, ScenarioResult, SpendingOrder, YearResult } from '../models/retirement.models';
import { simulateConversionStrategy } from './roth-conversion-calculator';
import { engineInputFromScenario } from './engine-input-mapper';
import { DEFAULT_TAX_YEAR, getTaxTable, IRMAA_TIERS } from './tax-tables';
import { getRmdStartAge } from './rmd-calculator';

// Assumed tax rate on traditional dollars remaining at the end of the plan (heirs/liquidation),
// used to compare pre-tax and after-tax dollars honestly in scoring and reporting
export const RESIDUAL_TRADITIONAL_TAX_RATE = 0.24;

export function runScenario(scenario: Scenario, accounts: AccountSnapshot[]): ScenarioResult {
  const residualRate = scenario.residualTaxRate ?? RESIDUAL_TRADITIONAL_TAX_RATE;
  const gainsRate = scenario.brokerageGainsTaxRate ?? 0;
  const afterTax = (r: ScenarioResult) => {
    const last = r.years.at(-1);
    if (!last) return 0;
    return last.endingAssets - last.traditionalBalance * residualRate - Math.max(0, last.brokerageBalance - last.brokerageBasis) * gainsRate - (last.sblocLoanBalance ?? 0);
  };
  const fmt = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

  // Choices the user left open are tried both ways and settled by after-tax ending assets:
  // spending order (IRA-low-bracket-first vs brokerage-first, only relevant with expenses)
  // and working-year conversions (which pay tax sooner and can look worse pre-tax).
  const spendingOrders: SpendingOrder[] = scenario.spendingOrder
    ? [scenario.spendingOrder]
    : (scenario.annualLivingExpenses ?? 0) > 0
      ? ['traditional-first', 'brokerage-first']
      : ['traditional-first'];
  const preRetirementChoices = scenario.allowPreRetirementConversions ? [true, false] : [false];

  const runs = spendingOrders.flatMap((spendingOrder) =>
    preRetirementChoices.map((allowPreRetirementConversions) => {
      const result = runScenarioCore({ ...scenario, spendingOrder, allowPreRetirementConversions }, accounts);
      return { result, spendingOrder, allowPreRetirementConversions, value: afterTax(result) };
    }),
  );

  let best = runs[0];
  for (const run of runs) {
    if (run.value > best.value) best = run;
  }

  const notes: string[] = [];
  if (scenario.allowPreRetirementConversions) {
    const bestWith = Math.max(...runs.filter((r) => r.allowPreRetirementConversions).map((r) => r.value));
    const bestWithout = Math.max(...runs.filter((r) => !r.allowPreRetirementConversions).map((r) => r.value));
    if (bestWithout > bestWith) {
      notes.push(`Working-year conversions were skipped automatically: without them you keep ${fmt(bestWithout)} after tax vs ${fmt(bestWith)} with them.`);
    } else if (bestWith > bestWithout) {
      notes.push(`Working-year conversions pay tax sooner, so the raw ending balance can look smaller — but after future taxes on traditional dollars you keep ${fmt(bestWith)} vs ${fmt(bestWithout)} without them.`);
    }
  }
  if (spendingOrders.length > 1 && best.spendingOrder === 'brokerage-first') {
    const bestTraditionalFirst = Math.max(...runs.filter((r) => r.spendingOrder === 'traditional-first').map((r) => r.value));
    notes.push(`Living expenses are paid from brokerage first, freeing bracket room for conversions: ${fmt(best.value)} after tax vs ${fmt(bestTraditionalFirst)} with IRA-first spending.`);
  }

  return {
    ...best.result,
    ...(notes.length > 0 ? { note: notes.join(' ') } : {}),
    resolvedSpendingOrder: best.spendingOrder,
    resolvedAllowPreRetirementConversions: best.allowPreRetirementConversions,
  };
}

function runScenarioCore(scenario: Scenario, accounts: AccountSnapshot[]): ScenarioResult {
  const residualRate = scenario.residualTaxRate ?? RESIDUAL_TRADITIONAL_TAX_RATE;
  const gainsRate = scenario.brokerageGainsTaxRate ?? 0;
  // After-tax score: leftover traditional is discounted by the residual liquidation rate,
  // and unrealized brokerage gains by the gains rate (0 = heirs' step-up in basis), so
  // pre-tax dollars don't count as full value when comparing candidate strategies
  const afterTaxScore = (years: YearResult[]) => {
    const last = years.at(-1)!;
    return last.endingAssets - last.traditionalBalance * residualRate - Math.max(0, last.brokerageBalance - last.brokerageBasis) * gainsRate - (last.sblocLoanBalance ?? 0);
  };
  const runWithStrategy = (strategy: RothConversionStrategy) => {
    return simulateConversionStrategy({
      ...engineInputFromScenario(scenario, accounts),
      strategy,
<<<<<<< HEAD
=======
      currentAge: scenario.currentAge,
      endAge: scenario.lifeExpectancy,
      birthYear: scenario.birthYear,
      filingStatus: scenario.filingStatus,
      assumedReturnRate: scenario.assumedReturnRate,
      stateTaxRate: scenario.stateTaxRate,
      wageIncome: scenario.wageIncome,
      annualOtherIncome: scenario.annualOtherIncome,
      annualLivingExpenses: scenario.annualLivingExpenses,
      annualPreTaxContribution: scenario.annualPreTaxContribution,
      annualRothContribution: scenario.annualRothContribution,
      annualBrokerageContribution: scenario.annualBrokerageContribution,
      employerMatch: scenario.employerMatch,
      retirementAge: scenario.retirementAge,
      ssPia: scenario.ssPia,
      ssClaimAge: scenario.ssClaimAge,
      ssColaRate: scenario.ssColaRate,
      preSimulationMagi: scenario.preSimulationMagi,
      spouseCurrentAge: scenario.spouseCurrentAge,
      spouseLifeExpectancy: scenario.spouseLifeExpectancy,
      spouseSsPia: scenario.spouseSsPia,
      spouseSsClaimAge: scenario.spouseSsClaimAge,
      allowPreRetirementConversions: scenario.allowPreRetirementConversions,
      annualWageGrowth: scenario.annualWageGrowth,
      spendingOrder: scenario.spendingOrder,
      dividendYield: scenario.dividendYield,
      sblocTaxFunding: scenario.sblocTaxFunding,
>>>>>>> 4f9ba46450b10872fcbb0b59240a54580a41cb8b
    });
  };

  if (scenario.rothConversionStrategy.mode === 'auto-optimize') {
    const table = getTaxTable(DEFAULT_TAX_YEAR, scenario.filingStatus);
    let bestResult: ReturnType<typeof runWithStrategy> | null = null;
    let bestStrategy: RothConversionStrategy | null = null;
    // Candidates are compared by after-tax ending assets (same yardstick as the smooth
    // modes) so leftover traditional dollars don't count at face value
    let bestScore = -Infinity;

    for (const bracket of table.brackets) {
      const candidate: RothConversionStrategy = { mode: 'fill-to-bracket', targetBracket: bracket.rate };
      const result = runWithStrategy(candidate);
      const score = afterTaxScore(result);
      if (score > bestScore) {
        bestScore = score;
        bestResult = result;
        bestStrategy = candidate;
      }
    }

    // Also scan fixed flat amounts from $50k to $500k in $10k increments to see if a smooth strategy beats filling a bracket
    for (let amt = 50000; amt <= 500000; amt += 10000) {
      const candidate: RothConversionStrategy = { mode: 'fixed-amount', amount: amt };
      const result = runWithStrategy(candidate);
      const score = afterTaxScore(result);
      if (score > bestScore) {
        bestScore = score;
        bestResult = result;
        bestStrategy = candidate;
      }
    }

    const years = bestResult!;
    return {
      scenarioName: scenario.name,
      years,
      totalTax: years.reduce((total, year) => total + year.totalTax, 0),
      endingAssets: years.at(-1)?.endingAssets ?? 0,
      resolvedStrategy: bestStrategy!,
    };
  }

  if (scenario.rothConversionStrategy.mode === 'smooth-to-bracket') {
    const targetBracket = scenario.rothConversionStrategy.targetBracket;
    const rmdStartAge = getRmdStartAge(scenario.birthYear);

    let bestAmount = 600000; // default to max if we can't solve it
    let bestYears: YearResult[] | null = null;

    // We want the lowest possible flat amount that successfully keeps all RMD years <= targetBracket
    for (let amt = 600000; amt >= 10000; amt -= 2000) {
      const years = runWithStrategy({ mode: 'fixed-amount', amount: amt, stopAtRmdAge: true });

      // Check if any RMD year exceeds the target bracket
      const rmdYears = years.filter(y => y.age >= rmdStartAge);
      const maxRate = rmdYears.reduce((max, y) => Math.max(max, y.marginalRate), 0);

      if (maxRate <= targetBracket) {
        // This amount successfully keeps us in the bracket!
        bestAmount = amt;
        bestYears = years;
      } else {
        // As we decrease the amount, the traditional balance gets larger.
        // If this amount fails, lower amounts will also fail (because traditional balance will be even higher).
        // So the last successful amount was the optimal (lowest) one!
        break;
      }
    }

    let finalStrategy: RothConversionStrategy = { mode: 'fixed-amount', amount: bestAmount, stopAtRmdAge: true };
    let finalYears = bestYears || runWithStrategy(finalStrategy);

    // The solved flat amount stops at RMD age; also score continuing it into the RMD years
    // (all of them, or just the first 5/10) and keep whichever after-tax result is best
    // while still respecting the target bracket in every RMD year.
    let bestScore = afterTaxScore(finalYears);
    for (const conversionStopAge of [rmdStartAge + 5, rmdStartAge + 10, undefined]) {
      const candidate: RothConversionStrategy = { mode: 'fixed-amount', amount: bestAmount, stopAtRmdAge: false, conversionStopAge };
      const years = runWithStrategy(candidate);
      const rmdYears = years.filter(y => y.age >= rmdStartAge);
      if (rmdYears.some(y => y.marginalRate > targetBracket)) continue;
      const score = afterTaxScore(years);
      if (score > bestScore) {
        bestScore = score;
        finalYears = years;
        finalStrategy = candidate;
      }
    }

    return {
      scenarioName: scenario.name,
      years: finalYears,
      totalTax: finalYears.reduce((total, year) => total + year.totalTax, 0),
      endingAssets: finalYears.at(-1)?.endingAssets ?? 0,
      resolvedStrategy: finalStrategy,
    };
  }

  if (scenario.rothConversionStrategy.mode === 'smooth-income-target') {
    const targetBracket = scenario.rothConversionStrategy.targetBracket;
    const rmdStartAge = getRmdStartAge(scenario.birthYear);
    const table = getTaxTable(DEFAULT_TAX_YEAR, scenario.filingStatus);

    // Convert as much as possible before RMD age: fill the target bracket to its top every year
    // (a flat gross-income ceiling, so conversions shrink automatically when SS starts).
    // If RMD years would still spill past that bracket, escalate to the next bracket and retry.
    // Within each bracket, search for the best "preserve floor" — traditional balance left
    // unconverted so later years drain it through the low brackets instead of paying
    // conversion-rate tax up front. Scored by after-tax ending assets: leftover traditional
    // is discounted by an assumed liquidation rate so pre-tax dollars don't count as full value.
    const candidateBrackets = table.brackets.filter(b => b.rate >= targetBracket && Number.isFinite(b.max));
    let bestYears: YearResult[] | null = null;
    let bestStrategy: RothConversionStrategy | null = null;

    const irmaaThresholds = IRMAA_TIERS[scenario.filingStatus].map(t => t.magiThreshold);

    // Once RMDs start, either stop conversions entirely, keep topping off the bracket
    // alongside the RMD for the rest of the plan, or top off only the first 5/10 RMD years —
    // late-life conversions rarely live long enough to pay back their upfront tax.
    const rmdBehaviors: { stopAtRmdAge: boolean; conversionStopAge?: number }[] = [
      { stopAtRmdAge: true },
      { stopAtRmdAge: false },
      { stopAtRmdAge: false, conversionStopAge: rmdStartAge + 5 },
      { stopAtRmdAge: false, conversionStopAge: rmdStartAge + 10 },
    ];

    for (const bracket of candidateBrackets) {
      const bracketCeiling = bracket.max + table.standardDeduction;
      // Besides the bracket top, also try stopping just under each Medicare IRMAA cliff inside
      // this bracket — the score decides whether dodging the surcharge beats converting more.
      const ceilings = [
        bracketCeiling,
        ...irmaaThresholds.filter(t => t < bracketCeiling && t - table.standardDeduction > bracket.min),
      ];
      let bestScore = -Infinity;
      let bracketBest: YearResult[] | null = null;
      let bracketBestStrategy: RothConversionStrategy | null = null;

      for (const targetIncome of ceilings) {
        for (let floor = 0; floor <= 2500000; floor += 50000) {
          for (const behavior of rmdBehaviors) {
            const candidate: RothConversionStrategy = { mode: 'fill-to-income', targetIncome, preserveFloor: floor, ...behavior };
            const years = runWithStrategy(candidate);

            const rmdYears = years.filter(y => y.age >= rmdStartAge);
            const maxRate = rmdYears.reduce((max, y) => Math.max(max, y.marginalRate), 0);
            if (maxRate > bracket.rate) continue;

            const score = afterTaxScore(years);
            if (score > bestScore) {
              bestScore = score;
              bracketBest = years;
              bracketBestStrategy = candidate;
            }
          }
        }
      }

      if (bracketBest) {
        bestYears = bracketBest;
        bestStrategy = bracketBestStrategy;
        break;
      }
      // No ceiling/floor keeps RMD years within this bracket; remember the floor-0 run and escalate
      const fallback: RothConversionStrategy = { mode: 'fill-to-income', targetIncome: bracketCeiling, stopAtRmdAge: true };
      bestYears = runWithStrategy(fallback);
      bestStrategy = fallback;
    }

    const finalYears = bestYears!;
    return {
      scenarioName: scenario.name,
      years: finalYears,
      totalTax: finalYears.reduce((total, year) => total + year.totalTax, 0),
      endingAssets: finalYears.at(-1)?.endingAssets ?? 0,
      resolvedStrategy: bestStrategy!,
    };
  }

  const years = runWithStrategy(scenario.rothConversionStrategy);

  return {
    scenarioName: scenario.name,
    years,
    totalTax: years.reduce((total, year) => total + year.totalTax, 0),
    endingAssets: years.at(-1)?.endingAssets ?? 0,
    resolvedStrategy: scenario.rothConversionStrategy,
  };
}
