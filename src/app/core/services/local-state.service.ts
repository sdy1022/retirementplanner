import { Injectable, signal } from '@angular/core';
import { AccountSnapshot, Scenario } from '../models/retirement.models';

const defaultAccounts: AccountSnapshot[] = [
  { type: 'traditional_401k', balance: 650000, snapshotDate: '2026-07-02' },
  { type: 'roth_ira', balance: 120000, snapshotDate: '2026-07-02' },
  { type: 'brokerage', balance: 180000, costBasis: 120000, snapshotDate: '2026-07-02' },
];

const defaultScenario: Scenario = {
  name: 'Fill 22% bracket',
  currentAge: 58,
  retirementAge: 67,
  birthYear: 1968,
  ssClaimAge: 67,
  ssPia: 2800,
  lifeExpectancy: 92,
  filingStatus: 'single',
  rothConversionStrategy: { mode: 'fill-to-bracket', targetBracket: 0.22 },
  assumedReturnRate: 0.05,
  stateTaxRate: 0,
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
