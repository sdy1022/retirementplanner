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
    choice,
    notes,
  };
}

function simulateBrokeragePaths(input: StrategySelectorInput): { value: number; feasible: boolean; peakStressedLtv: number; notes: string[] } {
  const notes: string[] = [];
  const years = Math.max(0, Math.floor(input.yearsToDeath));
  if (input.brokerageBalance <= 0 || years === 0) {
    return { value: 0, feasible: false, peakStressedLtv: 0, notes: ['No brokerage balance (or no horizon) to hold for step-up — BBD not applicable.'] };
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

  // Borrow path: assets untouched, debt compounds and funds the same spending
  let bbdBalance = input.brokerageBalance;
  let debt = 0;
  let feasible = true;
  let peakStressedLtv = 0;

  for (let year = 1; year <= years; year++) {
    const gainFraction = sellBalance > 0 ? Math.max(0, sellBalance - sellBasis) / sellBalance : 0;
    const taxOnGainSlice = gainFraction * input.capitalGainsRate;
    const grossNeeded = taxOnGainSlice < 1 ? input.annualSpending / (1 - taxOnGainSlice) : sellBalance;
    const withdrawal = Math.min(sellBalance, grossNeeded);
    if (withdrawal < grossNeeded) sellPathDepleted = true;
    sellBasis = Math.max(0, sellBasis - withdrawal * (1 - gainFraction));
    sellBalance = (sellBalance - withdrawal) * (1 + input.expectedReturnRate);

    debt = debt * (1 + effectiveBorrowRate) + input.annualSpending;
    bbdBalance = bbdBalance * (1 + input.expectedReturnRate);
    const stressedLtv = debt / (bbdBalance * (1 - stressDrawdown));
    peakStressedLtv = Math.max(peakStressedLtv, stressedLtv);
    if (stressedLtv > maxLtv) feasible = false;
  }

  // Step-up at death wipes unrealized gains on both paths, so estates compare directly
  const sellEstate = sellBalance;
  const bbdEstate = bbdBalance - debt;
  const value = roundCurrency(bbdEstate - sellEstate);

  if (!feasible) {
    notes.push(`BBD infeasible: stressed LTV peaks at ${pct(peakStressedLtv)} (limit ${pct(maxLtv)} after a ${pct(stressDrawdown)} crash).`);
  } else if (value > 0) {
    notes.push(`Borrow-and-step-up leaves $${money(value)} more at death than gradual selling (peak stressed LTV ${pct(peakStressedLtv)}).`);
  } else {
    notes.push(`Gradual selling beats borrowing by $${money(-value)}: compounded interest outweighs the ${pct(input.capitalGainsRate)} gains tax avoided.`);
  }
  if (sellPathDepleted) {
    notes.push('Warning: the sell path exhausts the brokerage before death — spending exceeds what this bucket can fund either way.');
  }

  return { value, feasible, peakStressedLtv: roundCurrency(peakStressedLtv), notes };
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function money(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}
