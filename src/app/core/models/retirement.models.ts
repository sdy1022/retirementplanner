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
  annualLivingExpenses: number;
  // Tax rate assumed on traditional dollars left at the end of the plan (heirs/liquidation);
  // drives the after-tax score that picks between conversion strategies. Defaults to 24%.
  residualTaxRate?: number;
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
}

export interface ScenarioResult {
  scenarioName: string;
  years: YearResult[];
  totalTax: number;
  endingAssets: number;
}
