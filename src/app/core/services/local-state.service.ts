import { Injectable, signal } from '@angular/core';
import { AccountSnapshot, Scenario } from '../models/retirement.models';

const defaultAccounts: AccountSnapshot[] = [
  { type: 'traditional_401k', balance: 1000000, snapshotDate: '2026-07-02' },
  { type: 'roth_ira', balance: 500000, snapshotDate: '2026-07-02' },
  { type: 'traditional_ira', balance: 500000, snapshotDate: '2026-07-02' },
  { type: 'brokerage', balance: 500000, snapshotDate: '2026-07-02' },
];

const defaultScenario: Scenario = {
  name: 'Smooth income target',
  currentAge: 60,
  retirementAge: 60,
  birthYear: 1966,
  ssClaimAge: 67,
  ssPia: 3300,
  lifeExpectancy: 90,
  filingStatus: 'married_filing_jointly',
  rothConversionStrategy: { mode: 'smooth-income-target', targetBracket: 0.24 },
  assumedReturnRate: 0.08,
  stateTaxRate: 0.0495,
  wageIncome: 100000,
  annualOtherIncome: 0,
  annualLivingExpenses: 150000,
};

@Injectable({ providedIn: 'root' })
export class LocalStateService {
  readonly accounts = signal<AccountSnapshot[]>(this.loadAccounts());
  readonly scenario = signal<Scenario>(this.loadScenario());

  private loadAccounts(): AccountSnapshot[] {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('accounts');
      if (saved) return JSON.parse(saved);
    }
    return defaultAccounts;
  }

  private loadScenario(): Scenario {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('scenario');
      if (saved) return JSON.parse(saved);
    }
    return defaultScenario;
  }

  addAccount(account: AccountSnapshot): void {
    this.accounts.update((accounts) => {
      const updated = [...accounts, account];
      if (typeof localStorage !== 'undefined') localStorage.setItem('accounts', JSON.stringify(updated));
      return updated;
    });
  }

  setAccounts(accounts: AccountSnapshot[]): void {
    if (typeof localStorage !== 'undefined') localStorage.setItem('accounts', JSON.stringify(accounts));
    this.accounts.set(accounts);
  }

  updateScenario(scenario: Scenario): void {
    if (typeof localStorage !== 'undefined') localStorage.setItem('scenario', JSON.stringify(scenario));
    this.scenario.set(scenario);
  }
}
