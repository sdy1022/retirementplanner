# Auto-Optimize Roth Conversion Feature

This document captures the code changes made to introduce the "Auto-Optimize (Max Ending Assets)" strategy to the Retirement Strategy Calculator. This feature addresses the issue of high RMD tax burdens by dynamically simulating Roth conversions across all available tax brackets and automatically selecting the optimal bracket that maximizes ending assets.

## 1. `src/app/core/models/retirement.models.ts`
Added the `auto-optimize` mode to the `RothConversionStrategy` type.

```typescript
export type RothConversionStrategy =
  | { mode: 'none' }
  | { mode: 'fixed-amount'; amount: number }
  | { mode: 'fill-to-bracket'; targetBracket: number }
  | { mode: 'auto-optimize' };
```

## 2. `src/app/core/calculators/scenario-engine.ts`
Updated the `runScenario` function. When the `auto-optimize` mode is selected, the engine iteratively runs the simulation across all tax brackets using the `fill-to-bracket` strategy, then returns the result that yields the highest `endingAssets`.

```typescript
import { AccountSnapshot, RothConversionStrategy, Scenario, ScenarioResult } from '../models/retirement.models';
import { simulateConversionStrategy } from './roth-conversion-calculator';
import { getTaxTable } from './tax-tables';

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

    const years = bestResult!;
    return {
      scenarioName: scenario.name,
      years,
      totalTax: years.reduce((total, year) => total + year.totalTax, 0),
      endingAssets: years.at(-1)?.endingAssets ?? 0,
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
```

## 3. `src/app/core/calculators/roth-conversion-calculator.ts`
Added a bypass in `conversionAmount` for the `auto-optimize` mode. This satisfies the TypeScript compiler, even though the mode is fundamentally replaced by the `scenario-engine.ts` iteratively calling this function with `fill-to-bracket`.

```typescript
function conversionAmount(strategy: RothConversionStrategy, taxableIncome: number, filingStatus: FilingStatus, taxYear: number): number {
  if (strategy.mode === 'none') {
    return 0;
  }
  if (strategy.mode === 'fixed-amount') {
    return Math.max(0, strategy.amount);
  }
  if (strategy.mode === 'auto-optimize') {
    return 0; // handled by scenario engine
  }
  return amountToFillBracket(taxableIncome, ceilingForRate(strategy.targetBracket, filingStatus, taxYear), filingStatus, taxYear);
}
```

## 4. `src/app/features/scenario-builder/scenario-builder.ts`
Added the "Auto-Optimize (Max Ending Assets)" option to the scenario builder UI dropdown and mapped it correctly in the form submission handler.

**Template Update:**
```html
          <mat-form-field>
            <mat-label>Conversion mode</mat-label>
            <mat-select formControlName="conversionMode">
              <mat-option value="none">None</mat-option>
              <mat-option value="fixed-amount">Fixed amount</mat-option>
              <mat-option value="fill-to-bracket">Fill to bracket</mat-option>
              <mat-option value="auto-optimize">Auto-Optimize (Max Ending Assets)</mat-option>
            </mat-select>
          </mat-form-field>
```

**Save Method Update:**
```typescript
  save(): void {
    const value = this.form.getRawValue();
    const rothConversionStrategy: RothConversionStrategy =
      value.conversionMode === 'fixed-amount'
        ? { mode: 'fixed-amount', amount: value.fixedAmount }
        : value.conversionMode === 'fill-to-bracket'
          ? { mode: 'fill-to-bracket', targetBracket: value.targetBracket }
          : value.conversionMode === 'auto-optimize'
            ? { mode: 'auto-optimize' }
            : { mode: 'none' };
    
    // ...
```
