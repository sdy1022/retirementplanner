import { AccountSnapshot, RothConversionStrategy, Scenario, ScenarioResult, YearResult } from '../models/retirement.models';
import { simulateConversionStrategy } from './roth-conversion-calculator';
import { getTaxTable } from './tax-tables';
import { calculateRequiredFlatConversion, calculateMaxTraditionalBalanceForBracket } from './action-plan';
import { getRmdStartAge, UNIFORM_LIFETIME_DIVISORS } from './rmd-calculator';

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

    const maxIncome = 1000000;
    let bestYears: YearResult[] | null = null;

    // We want the lowest possible income ceiling that keeps all RMD years <= targetBracket.
    // Each year converts just enough to lift total income to the ceiling, so the conversion
    // shrinks automatically when Social Security starts and total income stays flat.
    for (let income = maxIncome; income >= 20000; income -= 2000) {
      const years = runWithStrategy({ mode: 'fill-to-income', targetIncome: income, stopAtRmdAge: true });

      const rmdYears = years.filter(y => y.age >= rmdStartAge);
      const maxRate = rmdYears.reduce((max, y) => Math.max(max, y.marginalRate), 0);

      if (maxRate <= targetBracket) {
        bestYears = years;
      } else {
        // Lower ceilings convert less, leaving an even larger traditional balance at RMD age,
        // so the last successful ceiling was the optimal (lowest) one.
        break;
      }
    }

    const finalYears = bestYears ?? runWithStrategy({ mode: 'fill-to-income', targetIncome: maxIncome, stopAtRmdAge: true });
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
