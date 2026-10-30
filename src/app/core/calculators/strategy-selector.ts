import { FilingStatus, YearResult } from '../models/retirement.models';
import { calculateTax, roundCurrency } from './tax-bracket-calculator';
import { BRACKET_INFLATION_RATE, DEFAULT_TAX_YEAR } from './tax-tables';

// Decides, per bucket, whether Roth conversion (pre-tax bucket) and/or Buy-Borrow-Die
// (brokerage bucket) add value. The two strategies act on disjoint dollars — IRAs get no
// step-up at death (IRD) and brokerage can't be converted — so the answer can be 'both'.
//
// Rule 1 (pre-tax): convert while t_now < t_exit. Household value ≈ P × (t_exit − t_now).
// Rule 2 (brokerage): hold-to-step-up beats gradual selling iff c·g > (r − m)·T plus a
// risk premium, subject to a stressed LTV feasibility constraint. Rather than trust the
// closed form, both funding paths are simulated year by year and compared at death.

export interface StrategySelectorInput {
  pretaxBalance: number;
  brokerageBalance: number;
  brokerageCostBasis: number;
  /** Marginal rate paid converting this year (t_now) */
  conversionRate: number;
  /** Rate unconverted dollars face at exit: max of RMD-era, survivor-single, heir 10-year-window rate (t_exit) */
  exitRate: number;
  /** LTCG rate actually achievable selling gradually (0–0.238), not the panic-liquidation rate */
  capitalGainsRate: number;
  /** SBLOC borrow rate (r) */
  borrowRate: number;
  /** Expected market return (m) */
  expectedReturnRate: number;
  /** Years until death, when step-up applies (T) */
  yearsToDeath: number;
  /** Annual spending that must come from the brokerage bucket (sold or borrowed) */
  annualSpending: number;
  /**
   * Roth/cash reachable to pay down the loan if a stressed margin call hits. Retirement
   * accounts can't be pledged as collateral (IRC §408(e) treats a pledged IRA as a
   * distribution), so this never raises the LTV denominator — it only converts a stress
   * breach from ruin (forced liquidation) into a curable, expensive event.
   */
  backstopLiquidAssets?: number;
  /** Charged on top of the borrow rate so r < m alone can't win on unpriced leverage; default 0.01 */
  riskPremium?: number;
  /** Max loan-to-value the lender allows; default 0.5 */
  maxLtv?: number;
  /** Market crash assumed when stress-testing LTV; default 0.4 */
  stressDrawdown?: number;
}

export type StrategyChoice = 'roth-conversion' | 'buy-borrow-die' | 'both' | 'neither';

export interface StrategySelectorResult {
  /** ≈ P × (t_exit − t_now): lifetime tax saved by converting the pre-tax bucket */
  conversionValue: number;
  /** Estate value at death under borrow-and-step-up minus under gradual selling */
  bbdValue: number;
  /** False if the loan breaches stressed LTV in any year (BBD ruled out regardless of value) */
  bbdFeasible: boolean;
  /** Worst stressed loan-to-value reached over the horizon */
  peakStressedLtv: number;
  /**
   * True when forced sales consumed the whole brokerage while the loan was still
   * outstanding. peakStressedLtv is then a ratio against a vanishing denominator — it
   * climbs because the collateral is being sold off, not because anything was lent past
   * the cap — so callers should report the exhaustion rather than print the number.
   */
  bbdCollateralExhausted: boolean;
  choice: StrategyChoice;
  notes: string[];
}

// Dollar-weighted effective rate (fed + flat state) actually paid on a simulated plan's
// conversions. A strategy's target bracket overstates t_now — conversions fill the cheap
// brackets first — so the selector should judge Rule 1 by what the plan really pays.
// Returns null when the plan converts nothing (caller falls back to the target bracket).
export function effectiveConversionRate(years: YearResult[], filingStatus: FilingStatus, stateTaxRate: number, taxYear: number = DEFAULT_TAX_YEAR): number | null {
  const startAge = years[0]?.age ?? 0;
  let totalConversion = 0;
  let totalConversionTax = 0;
  for (const year of years) {
    if (year.conversion <= 0) continue;
    // Same per-year bracket indexing as the engine and action plan
    const inflationFactor = Math.pow(1 + BRACKET_INFLATION_RATE, year.age - startAge);
    const taxWith = calculateTax(year.taxableIncome, filingStatus, taxYear, inflationFactor);
    const taxWithout = calculateTax(year.taxableIncome - year.conversion, filingStatus, taxYear, inflationFactor);
    totalConversion += year.conversion;
    totalConversionTax += taxWith - taxWithout + year.conversion * stateTaxRate;
  }
  return totalConversion > 0 ? totalConversionTax / totalConversion : null;
}

const DEFAULT_RISK_PREMIUM = 0.01;
const DEFAULT_MAX_LTV = 0.5;
const DEFAULT_STRESS_DRAWDOWN = 0.4;

export function selectStrategy(input: StrategySelectorInput): StrategySelectorResult {
  const notes: string[] = [];

  // Rule 1 — pre-tax bucket
  const rateSpread = input.exitRate - input.conversionRate;
  const conversionValue = roundCurrency(Math.max(0, input.pretaxBalance) * rateSpread);
  if (conversionValue > 0) {
    notes.push(`Converting saves ~${pct(rateSpread)} on $${money(input.pretaxBalance)} of pre-tax dollars (exit rate ${pct(input.exitRate)} vs conversion rate ${pct(input.conversionRate)}).`);
  } else if (input.pretaxBalance > 0) {
    notes.push(`No conversion edge: exit rate ${pct(input.exitRate)} does not exceed conversion rate ${pct(input.conversionRate)}.`);
  }

  // Rule 2 — brokerage bucket, simulated sell-path vs borrow-path
  const bbd = simulateBrokeragePaths(input);
  notes.push(...bbd.notes);

  const bbdWins = bbd.value > 0 && bbd.feasible;
  const choice: StrategyChoice =
    conversionValue > 0 && bbdWins ? 'both'
    : conversionValue > 0 ? 'roth-conversion'
    : bbdWins ? 'buy-borrow-die'
    : 'neither';

  return {
    conversionValue,
    bbdValue: bbd.value,
    bbdFeasible: bbd.feasible,
    peakStressedLtv: bbd.peakStressedLtv,
    bbdCollateralExhausted: bbd.depleted,
    choice,
    notes,
  };
}

function simulateBrokeragePaths(input: StrategySelectorInput): { value: number; feasible: boolean; peakStressedLtv: number; depleted: boolean; notes: string[] } {
  const notes: string[] = [];
  const years = Math.max(0, Math.floor(input.yearsToDeath));
  if (input.brokerageBalance <= 0 || years === 0) {
    return { value: 0, feasible: false, peakStressedLtv: 0, depleted: false, notes: ['No brokerage balance (or no horizon) to hold for step-up — BBD not applicable.'] };
  }

  const riskPremium = input.riskPremium ?? DEFAULT_RISK_PREMIUM;
  const maxLtv = input.maxLtv ?? DEFAULT_MAX_LTV;
  const stressDrawdown = input.stressDrawdown ?? DEFAULT_STRESS_DRAWDOWN;
  const effectiveBorrowRate = input.borrowRate + riskPremium;

  // Sell path: withdraw enough gross each year that spending survives the capital gains
  // tax on the gain slice; basis is consumed pro rata (same treatment as the main engine)
  let sellBalance = input.brokerageBalance;
  let sellBasis = Math.min(input.brokerageCostBasis, input.brokerageBalance);
  let sellPathDepleted = false;

  // Borrow path: hold the shares, draw on the SBLOC for spending, and sell only what the
  // credit line cannot cover. Basis is tracked here too, because once the line is capped
  // this path starts realizing gains exactly like the sell path.
  let bbdBalance = input.brokerageBalance;
  let bbdBasis = Math.min(input.brokerageCostBasis, input.brokerageBalance);
  let debt = 0;
  let peakStressedLtv = 0;
  // Largest paydown needed to get back under the LTV cap in the stressed scenario
  let maxCureNeeded = 0;
  // Spending the credit line could not fund, so it had to be sold after all
  let forcedSales = 0;
  // Set when forced sales consume the whole account while the loan is still outstanding
  let bbdDepleted = false;

  for (let year = 1; year <= years; year++) {
    const gainFraction = sellBalance > 0 ? Math.max(0, sellBalance - sellBasis) / sellBalance : 0;
    const taxOnGainSlice = gainFraction * input.capitalGainsRate;
    const grossNeeded = taxOnGainSlice < 1 ? input.annualSpending / (1 - taxOnGainSlice) : sellBalance;
    const withdrawal = Math.min(sellBalance, grossNeeded);
    if (withdrawal < grossNeeded) sellPathDepleted = true;
    sellBasis = Math.max(0, sellBasis - withdrawal * (1 - gainFraction));
    sellBalance = (sellBalance - withdrawal) * (1 + input.expectedReturnRate);

    // Interest accrues on the existing balance before this year's draw
    debt = debt * (1 + effectiveBorrowRate);
    // A real lender stops advancing at the LTV cap. Without this brake the loan compounds
    // past any collateral it could possibly be secured by — on a $500k account funding
    // $150k/yr for 30 years it reached ~$15M, a 563% LTV no broker would ever extend —
    // which made the headline "BBD value" a number with no counterpart in reality.
    const borrowCapacity = Math.max(0, maxLtv * bbdBalance - debt);
    const borrowed = Math.min(input.annualSpending, borrowCapacity);
    debt += borrowed;

    const shortfall = input.annualSpending - borrowed;
    if (shortfall > 0 && bbdBalance > 0) {
      const bbdGainFraction = Math.max(0, bbdBalance - bbdBasis) / bbdBalance;
      const bbdTaxOnGain = bbdGainFraction * input.capitalGainsRate;
      const bbdGross = bbdTaxOnGain < 1 ? shortfall / (1 - bbdTaxOnGain) : bbdBalance;
      const sold = Math.min(bbdBalance, bbdGross);
      bbdBasis = Math.max(0, bbdBasis - sold * (1 - bbdGainFraction));
      bbdBalance -= sold;
      forcedSales += sold;
    }

    bbdBalance = bbdBalance * (1 + input.expectedReturnRate);
    const stressedCollateral = bbdBalance * (1 - stressDrawdown);
    if (stressedCollateral > 0) {
      peakStressedLtv = Math.max(peakStressedLtv, debt / stressedCollateral);
      maxCureNeeded = Math.max(maxCureNeeded, debt - maxLtv * stressedCollateral);
    } else if (debt > 0) {
      // Collateral fully consumed while the loan is still outstanding. A loan-to-value
      // ratio against nothing is not a number worth printing — record the fact instead.
      bbdDepleted = true;
      maxCureNeeded = Math.max(maxCureNeeded, debt);
    }
  }
  const backstop = Math.max(0, input.backstopLiquidAssets ?? 0);
  const curedByBackstop = maxCureNeeded > 0 && maxCureNeeded <= backstop;
  const feasible = !bbdDepleted && (maxCureNeeded <= 0 || curedByBackstop);

  // Step-up at death wipes unrealized gains on both paths, so estates compare directly
  const sellEstate = sellBalance;
  const bbdEstate = bbdBalance - debt;
  const value = roundCurrency(bbdEstate - sellEstate);

  if (!feasible) {
    if (bbdDepleted) {
      notes.push(`BBD not available: this spending exhausts the brokerage before death even with the credit line, leaving $${money(maxCureNeeded)} of debt against no collateral. The bucket is too small to fund this plan by borrowing or selling.`);
    } else {
      notes.push(`BBD infeasible: stressed LTV peaks at ${pct(peakStressedLtv)} (limit ${pct(maxLtv)} after a ${pct(stressDrawdown)} crash), and curing the margin call would take $${money(maxCureNeeded)} — more than the $${money(backstop)} backstop available.`);
    }
  } else {
    if (curedByBackstop) {
      notes.push(`Caution: stressed LTV peaks at ${pct(peakStressedLtv)} (over the ${pct(maxLtv)} limit). BBD stays feasible only because up to $${money(maxCureNeeded)} of Roth/cash backstop could cure the margin call — a cure spends tax-free dollars to prop up leverage.`);
    }
    if (value > 0) {
      notes.push(`Borrow-and-step-up leaves $${money(value)} more at death than gradual selling (peak stressed LTV ${pct(peakStressedLtv)}).`);
    } else {
      notes.push(`Gradual selling beats borrowing by $${money(-value)}: compounded interest outweighs the ${pct(input.capitalGainsRate)} gains tax avoided.`);
    }
  }
  if (sellPathDepleted) {
    notes.push('Warning: the sell path exhausts the brokerage before death — spending exceeds what this bucket can fund either way.');
  }
  if (forcedSales > 0) {
    notes.push(`Note: the credit line hit its ${pct(maxLtv)} limit, so $${money(forcedSales)} of spending had to be funded by selling anyway — this is not a pure buy-borrow-die path.`);
  }

  return { value, feasible, peakStressedLtv: roundCurrency(peakStressedLtv), depleted: bbdDepleted, notes };
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function money(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}
