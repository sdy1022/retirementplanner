export type FilingStatus = 'single' | 'married_filing_jointly';
export type AccountType = 'traditional_401k' | 'traditional_ira' | 'roth_401k' | 'roth_ira' | 'brokerage';

export type AccountOwner = 'primary' | 'spouse' | 'joint';

export interface AccountSnapshot {
  id?: string;
  userId?: string;
  name?: string;
  owner?: AccountOwner;
  type: AccountType;
  balance: number;
  costBasis?: number;
  snapshotDate: string;
}

export interface TaxBracket {
  rate: number;
  min: number;
  max: number;
}

export type RothConversionStrategy =
  | { mode: 'none' }
  | { mode: 'fixed-amount'; amount: number; stopAtRmdAge?: boolean; conversionStopAge?: number }
  | { mode: 'fill-to-bracket'; targetBracket: number }
  | { mode: 'smooth-to-bracket'; targetBracket: number }
  | { mode: 'fill-to-income'; targetIncome: number; stopAtRmdAge?: boolean; conversionStopAge?: number; preserveFloor?: number }
  | { mode: 'smooth-income-target'; targetBracket: number }
  | { mode: 'auto-optimize' };

export interface Scenario {
  id?: string;
  userId?: string;
  name: string;
  currentAge: number;
  retirementAge: number;
  birthYear: number;
  ssClaimAge: 62 | 63 | 64 | 65 | 66 | 67 | 68 | 69 | 70;
  // Monthly Social Security benefit AT THE CHOSEN CLAIM AGE, in today's dollars — the user
  // enters the already-adjusted amount (e.g. ~70% of PIA when claiming at 62, ~124% at 70).
  // The engine does not re-apply claiming-age factors; it only starts payments at ssClaimAge.
  ssPia: number;
  // Annual Social Security cost-of-living adjustment applied from the simulation's first
  // year (SSA statements quote today's dollars; benefits are COLA-indexed both before and
  // after claiming). Defaults to 2.5% — roughly the long-run average COLA.
  ssColaRate?: number;
  // MAGI from two years before the plan starts — drives IRMAA in the first two Medicare
  // years when the simulation has no history of its own (only matters when the plan
  // starts at age 63+). Unset falls back to current-year MAGI.
  preSimulationMagi?: number;
  // Optional spouse modeling (MFJ only): the year after the spouse dies, the plan files
  // single (single brackets/deductions/IRMAA, one Medicare enrollee — the "widow's tax
  // penalty") and the survivor keeps the LARGER of the two Social Security benefits.
  // All balances roll to the survivor. Leave unset to keep MFJ for the whole plan.
  spouseCurrentAge?: number;
  spouseLifeExpectancy?: number;
  // Spouse's monthly benefit at the spouse's claim age (already claiming-age-adjusted)
  spouseSsPia?: number;
  spouseSsClaimAge?: number;
  lifeExpectancy: number;
  filingStatus: FilingStatus;
  rothConversionStrategy: RothConversionStrategy;
  assumedReturnRate: number;
  // Scenario-level portfolio allocation used by Monte Carlo. All accounts share this
  // allocation in v1 and are rebalanced annually. Defaults to 100% stocks for legacy data.
  stockAllocation?: number;
  stateTaxRate: number;
  wageIncome: number;
  // Interest and non-qualified dividends taxed as ordinary income every year
  annualOtherIncome?: number;
  // Pre-retirement annual contributions
  annualPreTaxContribution?: number;
  annualRothContribution?: number;
  annualBrokerageContribution?: number;
  employerMatch?: number;
  annualLivingExpenses: number;
  // Tax rate assumed on traditional dollars left at the end of the plan (heirs/liquidation);
  // drives the after-tax score that picks between conversion strategies. Defaults to 24%.
  residualTaxRate?: number;
  // Allow conversions during working years, using whatever bracket room remains above
  // wage income. The plan is charged only the incremental tax the conversion causes.
  allowPreRetirementConversions?: boolean;
  // Flat dollar raise added to wageIncome each year until retirement (e.g. 5000 = +$5k/yr).
  annualWageGrowth?: number;
  // How living expenses are funded: 'traditional-first' harvests the low brackets from the
  // IRA before touching brokerage; 'brokerage-first' spends brokerage and leaves the bracket
  // room to conversions. Left unset, the engine tries both and keeps the after-tax winner.
  spendingOrder?: SpendingOrder;
  // Tax rate applied to unrealized brokerage gains remaining at the end of the plan.
  // 0 (default) models the step-up in basis heirs receive; ~0.15 models spending it yourself.
  brokerageGainsTaxRate?: number;
  // Portion of the brokerage return paid out as dividends each year (e.g. 0.015 = 1.5%).
  // Taxed annually at the qualified-dividend rate even when reinvested; reinvestment
  // raises cost basis. Carved out of assumedReturnRate, not added on top.
  dividendYield?: number;
  // When set, conversion taxes inside the window are borrowed via SBLOC (Buy-Borrow-Die)
  sblocTaxFunding?: SblocTaxFunding;
}

export type SpendingOrder = 'traditional-first' | 'brokerage-first';

// Buy-Borrow-Die tax funding: within the age window, the conversion's incremental tax is
// drawn on an SBLOC against the brokerage instead of selling shares. Interest compounds on
// the outstanding balance and is never repaid — the estate settles the loan at death while
// the unsold brokerage keeps its step-up in basis.
export interface SblocTaxFunding {
  startAge: number;
  endAge: number;
  borrowRate: number;
  // Draws stop once the loan reaches this fraction of the brokerage collateral;
  // the excess tax falls back to the normal cash waterfall. Default 0.4.
  maxLtv?: number;
}

export interface RmdYearEntry {
  age: number;
  divisor: number;
  beginningBalance: number;
  rmd: number;
}

export interface YearResult {
  age: number;
  traditionalBalance: number;
  rothBalance: number;
  brokerageBalance: number;
  // Remaining cost basis; brokerageBalance - brokerageBasis is the unrealized gain
  brokerageBasis: number;
  rmd: number;
  conversion: number;
  taxableIncome: number;
  federalTax: number;
  stateTax: number;
  totalTax: number;
  irmaa: number;
  shortfall: number;
  marginalRate: number;
  livingExpenses: number;
  endingAssets: number;
  // Funding sources for the year's living expenses
  expensesFromSs: number;
  expensesFromRmd: number;
  expensesFromTraditional: number;
  expensesFromBrokerage: number;
  expensesFromRoth: number;
  // Funding sources for the year's taxes and IRMAA
  taxFromBrokerage: number;
  // 10% early-distribution penalty on pre-59½ traditional withdrawals (included in federalTax)
  earlyWithdrawalPenalty?: number;
  taxWithheldFromConversion: number;
  // Grossed-up traditional withdrawal that pays taxes once brokerage and conversion
  // withholding are exhausted — drains pre-tax dollars before Roth is touched
  taxFromTraditional: number;
  taxFromRoth: number;
  // SBLOC (Buy-Borrow-Die) tax funding; absent/0 when the scenario doesn't use it.
  // endingAssets stays gross — subtract sblocLoanBalance for the net estate.
  taxFromSbloc?: number;
  sblocInterest?: number;
  sblocLoanBalance?: number;
  // Loan repaid this year (brokerage first, then Roth) because the collateral no longer
  // supported the balance at maxLtv — the margin-call cure
  sblocPaydown?: number;
}

export interface ScenarioResult {
  scenarioName: string;
  years: YearResult[];
  totalTax: number;
  endingAssets: number;
  // Plain-language explanation of automatic strategy decisions, shown on the dashboard
  note?: string;
  // The concrete strategy actually simulated to produce `years` — for search-based modes
  // (auto-optimize, smooth-to-bracket, smooth-income-target) this is the winning candidate,
  // e.g. a fixed-amount or fill-to-income strategy, not the original search directive.
  // Lets callers (e.g. Monte Carlo) replay the same strategy without repeating the search.
  resolvedStrategy?: RothConversionStrategy;
  // The spending order and pre-retirement-conversion choice that produced `years`, when the
  // scenario left them open for the engine to decide between.
  resolvedSpendingOrder?: SpendingOrder;
  resolvedAllowPreRetirementConversions?: boolean;
}
