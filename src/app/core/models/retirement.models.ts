export type FilingStatus = 'single';
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
  | { mode: 'fixed-amount'; amount: number }
  | { mode: 'fill-to-bracket'; targetBracket: number };

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
  endingAssets: number;
}

export interface ScenarioResult {
  scenarioName: string;
  years: YearResult[];
  totalTax: number;
  endingAssets: number;
}
