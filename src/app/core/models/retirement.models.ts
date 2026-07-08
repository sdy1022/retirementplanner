export type FilingStatus = 'single' | 'married_filing_jointly';
export type AccountType = 'traditional_401k' | 'traditional_ira' | 'roth_401k' | 'roth_ira' | 'brokerage';

export interface AccountSnapshot {
  id?: string;
  userId?: string;
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
  ssPia: number;
  lifeExpectancy: number;
  filingStatus: FilingStatus;
  rothConversionStrategy: RothConversionStrategy;
  assumedReturnRate: number;
  stateTaxRate: number;
  wageIncome: number;
  // Interest and non-qualified dividends taxed as ordinary income every year
  annualOtherIncome?: number;
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
}
