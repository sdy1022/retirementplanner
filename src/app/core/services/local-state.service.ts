import { Injectable, signal } from '@angular/core';
import { AccountSnapshot, Scenario } from '../models/retirement.models';

const defaultAccounts: AccountSnapshot[] = [
  { type: 'traditional_401k', balance: 1600000, snapshotDate: '2026-07-02' },
  { type: 'roth_ira', balance: 500000, snapshotDate: '2026-07-02' },
  { type: 'traditional_ira', balance: 500000, snapshotDate: '2026-07-02' },
  { type: 'brokerage', balance: 500000, snapshotDate: '2026-07-02' },
];

const defaultScenario: Scenario = {
  name: 'Smooth to 24% bracket',
  currentAge: 52,
  retirementAge: 60,
  birthYear: 1973,
  ssClaimAge: 67,
  ssPia: 2200,
  lifeExpectancy: 90,
  filingStatus: 'married_filing_jointly',
  rothConversionStrategy: { mode: 'smooth-income-target', targetBracket: 0.24 },
  assumedReturnRate: 0.08,
  stateTaxRate: 0.0495,
  wageIncome: 180000,
};

@Injectable({ providedIn: 'root' })
export class LocalStateService {
  readonly accounts = signal<AccountSnapshot[]>(defaultAccounts);
  readonly scenario = signal<Scenario>(defaultScenario);

  addAccount(account: AccountSnapshot): void {
    this.accounts.update((accounts) => [...accounts, account]);
  }

  updateScenario(scenario: Scenario): void {
    this.scenario.set(scenario);
  }
}
