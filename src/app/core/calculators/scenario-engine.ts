import { AccountSnapshot, RothConversionStrategy, Scenario, ScenarioResult, YearResult } from '../models/retirement.models';
import { simulateConversionStrategy } from './roth-conversion-calculator';
import { getTaxTable, IRMAA_TIERS } from './tax-tables';
import { getRmdStartAge } from './rmd-calculator';

export function runScenario(scenario: Scenario, accounts: AccountSnapshot[]): ScenarioResult {
  const runWithStrategy = (strategy: RothConversionStrategy) => {
    return simulateConversionStrategy({
      accounts,
      strategy,
      currentAge: scenario.currentAge,
      endAge: scenario.lifeExpectancy,
      birthYear: scenario.birthYear,
      filingStatus: scenario.filingStatus,
      assumedReturnRate: scenario.assumedReturnRate,
      stateTaxRate: scenario.stateTaxRate,
      wageIncome: scenario.wageIncome,
      annualLivingExpenses: scenario.annualLivingExpenses,
      retirementAge: scenario.retirementAge,
      ssPia: scenario.ssPia,
      ssClaimAge: scenario.ssClaimAge,
    });
  };

  if (scenario.rothConversionStrategy.mode === 'auto-optimize') {
    const table = getTaxTable(2026, scenario.filingStatus);
    let bestResult: ReturnType<typeof runWithStrategy> | null = null;
    let maxEndingAssets = -Infinity;

    for (const bracket of table.brackets) {
      const result = runWithStrategy({ mode: 'fill-to-bracket', targetBracket: bracket.rate });
      const endingAssets = result.at(-1)?.endingAssets ?? 0;
      if (endingAssets > maxEndingAssets) {
        maxEndingAssets = endingAssets;
        bestResult = result;
      }
    }

    // Also scan fixed flat amounts from $50k to $500k in $10k increments to see if a smooth strategy beats filling a bracket
    for (let amt = 50000; amt <= 500000; amt += 10000) {
      const result = runWithStrategy({ mode: 'fixed-amount', amount: amt });
      const endingAssets = result.at(-1)?.endingAssets ?? 0;
      if (endingAssets > maxEndingAssets) {
        maxEndingAssets = endingAssets;
        bestResult = result;
      }
    }

    const years = bestResult!;
    return {
      scenarioName: scenario.name,
      years,
      totalTax: years.reduce((total, year) => total + year.totalTax, 0),
      endingAssets: years.at(-1)?.endingAssets ?? 0,
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
    
    const finalYears = bestYears || runWithStrategy({ mode: 'fixed-amount', amount: bestAmount, stopAtRmdAge: true });
    return {
      scenarioName: scenario.name,
      years: finalYears,
      totalTax: finalYears.reduce((total, year) => total + year.totalTax, 0),
      endingAssets: finalYears.at(-1)?.endingAssets ?? 0,
    };
  }

  if (scenario.rothConversionStrategy.mode === 'smooth-income-target') {
    const targetBracket = scenario.rothConversionStrategy.targetBracket;
    const rmdStartAge = getRmdStartAge(scenario.birthYear);
    const table = getTaxTable(2026, scenario.filingStatus);

    // Convert as much as possible before RMD age: fill the target bracket to its top every year
    // (a flat gross-income ceiling, so conversions shrink automatically when SS starts).
    // If RMD years would still spill past that bracket, escalate to the next bracket and retry.
    // Within each bracket, search for the best "preserve floor" — traditional balance left
    // unconverted so later years drain it through the low brackets instead of paying
    // conversion-rate tax up front. Scored by after-tax ending assets: leftover traditional
    // is discounted by an assumed liquidation rate so pre-tax dollars don't count as full value.
    const RESIDUAL_TRADITIONAL_TAX_RATE = 0.24;
    const candidateBrackets = table.brackets.filter(b => b.rate >= targetBracket && Number.isFinite(b.max));
    let bestYears: YearResult[] | null = null;

    const irmaaThresholds = IRMAA_TIERS[scenario.filingStatus].map(t => t.magiThreshold);

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

      for (const targetIncome of ceilings) {
        for (let floor = 0; floor <= 2500000; floor += 50000) {
          const years = runWithStrategy({ mode: 'fill-to-income', targetIncome, stopAtRmdAge: true, preserveFloor: floor });

          const rmdYears = years.filter(y => y.age >= rmdStartAge);
          const maxRate = rmdYears.reduce((max, y) => Math.max(max, y.marginalRate), 0);
          if (maxRate > bracket.rate) continue;

          const last = years.at(-1)!;
          const score = last.endingAssets - last.traditionalBalance * RESIDUAL_TRADITIONAL_TAX_RATE;
          if (score > bestScore) {
            bestScore = score;
            bracketBest = years;
          }
        }
      }

      if (bracketBest) {
        bestYears = bracketBest;
        break;
      }
      // No ceiling/floor keeps RMD years within this bracket; remember the floor-0 run and escalate
      bestYears = runWithStrategy({ mode: 'fill-to-income', targetIncome: bracketCeiling, stopAtRmdAge: true });
    }

    const finalYears = bestYears!;
    return {
      scenarioName: scenario.name,
      years: finalYears,
      totalTax: finalYears.reduce((total, year) => total + year.totalTax, 0),
      endingAssets: finalYears.at(-1)?.endingAssets ?? 0,
    };
  }

  const years = runWithStrategy(scenario.rothConversionStrategy);

  return {
    scenarioName: scenario.name,
    years,
    totalTax: years.reduce((total, year) => total + year.totalTax, 0),
    endingAssets: years.at(-1)?.endingAssets ?? 0,
  };
}
