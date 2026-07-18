import { AccountSnapshot, Scenario } from '../models/retirement.models';

export const GOLDEN_SEED = 20260718;

export const accumulationScenario: Scenario = {
  name: 'Golden 1 - accumulation',
  currentAge: 55,
  retirementAge: 58,
  birthYear: 1971,
  ssClaimAge: 67,
  ssPia: 0,
  lifeExpectancy: 57,
  filingStatus: 'single',
  rothConversionStrategy: { mode: 'none' },
  assumedReturnRate: 0,
  stateTaxRate: 0,
  wageIncome: 30000,
  annualLivingExpenses: 0,
  annualPreTaxContribution: 20000,
  employerMatch: 5000,
};

export const accumulationAccounts: AccountSnapshot[] = [
  { type: 'traditional_401k', balance: 100000, snapshotDate: '2026-01-01' },
];

export const constrainedAfterTaxContributionScenario: Scenario = {
  ...accumulationScenario,
  name: 'Golden 1b - constrained after-tax contributions',
  currentAge: 55,
  retirementAge: 56,
  lifeExpectancy: 55,
  wageIncome: 50000,
  annualLivingExpenses: 45000,
  annualPreTaxContribution: 0,
  annualRothContribution: 20000,
  employerMatch: 0,
};

export const aggregationScenario: Scenario = {
  name: 'Golden 2 - account aggregation',
  currentAge: 60,
  retirementAge: 60,
  birthYear: 1966,
  ssClaimAge: 67,
  ssPia: 0,
  lifeExpectancy: 60,
  filingStatus: 'single',
  rothConversionStrategy: { mode: 'none' },
  assumedReturnRate: 0,
  stateTaxRate: 0,
  wageIncome: 0,
  annualLivingExpenses: 0,
};

export const aggregationAccounts: AccountSnapshot[] = [
  { type: 'traditional_401k', balance: 300000, snapshotDate: '2026-01-01' },
  { type: 'traditional_401k', balance: 200000, snapshotDate: '2026-01-01' },
  { type: 'roth_ira', balance: 100000, snapshotDate: '2026-01-01' },
  { type: 'roth_ira', balance: 50000, snapshotDate: '2026-01-01' },
  { type: 'brokerage', balance: 80000, costBasis: 50000, snapshotDate: '2026-01-01' },
  { type: 'brokerage', balance: 20000, costBasis: 15000, snapshotDate: '2026-01-01' },
];

export const monteCarloScenario: Scenario = {
  name: 'Golden 3/4 - market and guardrail',
  currentAge: 60,
  retirementAge: 60,
  birthYear: 1966,
  ssClaimAge: 67,
  ssPia: 2800,
  lifeExpectancy: 90,
  filingStatus: 'single',
  rothConversionStrategy: { mode: 'smooth-income-target', targetBracket: 0.24 },
  assumedReturnRate: 0.06,
  stockAllocation: 0.6,
  stateTaxRate: 0.03,
  wageIncome: 0,
  annualLivingExpenses: 70000,
};

export const monteCarloAccounts: AccountSnapshot[] = [
  { type: 'traditional_401k', balance: 1400000, snapshotDate: '2026-01-01' },
  { type: 'brokerage', balance: 300000, costBasis: 250000, snapshotDate: '2026-01-01' },
];

export const retirementSearchScenario: Scenario = {
  name: 'Golden 5 - retirement age search',
  currentAge: 58,
  retirementAge: 58,
  birthYear: 1968,
  ssClaimAge: 67,
  ssPia: 2800,
  lifeExpectancy: 95,
  filingStatus: 'single',
  rothConversionStrategy: { mode: 'smooth-income-target', targetBracket: 0.24 },
  assumedReturnRate: 0.06,
  stockAllocation: 0.6,
  stateTaxRate: 0.03,
  wageIncome: 150000,
  annualLivingExpenses: 65000,
  annualPreTaxContribution: 24000,
  annualRothContribution: 6000,
  annualBrokerageContribution: 5000,
  employerMatch: 7500,
  annualWageGrowth: 3000,
};

export const retirementSearchAccounts: AccountSnapshot[] = [
  { type: 'traditional_401k', balance: 900000, snapshotDate: '2026-01-01' },
  { type: 'roth_ira', balance: 150000, snapshotDate: '2026-01-01' },
  { type: 'brokerage', balance: 250000, costBasis: 200000, snapshotDate: '2026-01-01' },
];
