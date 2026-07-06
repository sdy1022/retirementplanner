import { Component, effect, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { LocalStateService } from '../../core/services/local-state.service';
import { RothConversionStrategy, Scenario } from '../../core/models/retirement.models';
import { RESIDUAL_TRADITIONAL_TAX_RATE } from '../../core/calculators/scenario-engine';

@Component({
  selector: 'app-scenario-builder',
  imports: [ReactiveFormsModule, MatButtonModule, MatCardModule, MatCheckboxModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  template: `
    <mat-card class="panel">
      <mat-card-header><mat-card-title>Scenario Builder</mat-card-title></mat-card-header>
      <mat-card-content>
        <form [formGroup]="form" (ngSubmit)="save()" class="form-grid">
          <mat-form-field><mat-label>Name</mat-label><input matInput formControlName="name" /></mat-form-field>
          <mat-form-field><mat-label>Current age</mat-label><input matInput type="number" formControlName="currentAge" /></mat-form-field>
          <mat-form-field><mat-label>Retirement age</mat-label><input matInput type="number" formControlName="retirementAge" /></mat-form-field>
          <mat-form-field><mat-label>Current wage</mat-label><input matInput type="number" formControlName="wageIncome" /></mat-form-field>
          <mat-form-field><mat-label>Annual raise ($/yr)</mat-label><input matInput type="number" formControlName="annualWageGrowth" /></mat-form-field>
          <mat-form-field><mat-label>Annual expenses</mat-label><input matInput type="number" formControlName="annualLivingExpenses" /></mat-form-field>
          <mat-form-field><mat-label>Birth year</mat-label><input matInput type="number" formControlName="birthYear" /></mat-form-field>
          <mat-form-field><mat-label>SS claim age</mat-label><input matInput type="number" formControlName="ssClaimAge" /></mat-form-field>
          <mat-form-field><mat-label>Monthly PIA</mat-label><input matInput type="number" formControlName="ssPia" /></mat-form-field>
          <mat-form-field><mat-label>Life expectancy</mat-label><input matInput type="number" formControlName="lifeExpectancy" /></mat-form-field>
          <mat-form-field><mat-label>Return rate</mat-label><input matInput type="number" step="0.01" formControlName="assumedReturnRate" /></mat-form-field>
          <mat-form-field><mat-label>State tax rate</mat-label><input matInput type="number" step="0.01" formControlName="stateTaxRate" /></mat-form-field>
          <mat-form-field><mat-label>Residual tax rate (heirs/liquidation)</mat-label><input matInput type="number" step="0.01" formControlName="residualTaxRate" /></mat-form-field>
          <mat-form-field>
            <mat-label>Filing status</mat-label>
            <mat-select formControlName="filingStatus">
              <mat-option value="single">Single</mat-option>
              <mat-option value="married_filing_jointly">Married Filing Jointly</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Conversion mode</mat-label>
            <mat-select formControlName="conversionMode">
              <mat-option value="none">None</mat-option>
              <mat-option value="fixed-amount">Fixed amount</mat-option>
              <mat-option value="fill-to-bracket">Fill to bracket (Max out each year)</mat-option>
              <mat-option value="smooth-to-bracket">Smooth to bracket (Optimal fixed amount)</mat-option>
              <mat-option value="smooth-income-target">Smooth income target (Recommended / Default)</mat-option>
              <mat-option value="auto-optimize">Auto-Optimize (Max Ending Assets)</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field><mat-label>Fixed amount</mat-label><input matInput type="number" formControlName="fixedAmount" /></mat-form-field>
          <mat-form-field><mat-label>Target bracket</mat-label><input matInput type="number" step="0.01" formControlName="targetBracket" /></mat-form-field>
          <mat-form-field><mat-label>Traditional Balance</mat-label><input matInput type="number" formControlName="traditionalBalance" /></mat-form-field>
          <mat-form-field><mat-label>Roth Balance</mat-label><input matInput type="number" formControlName="rothBalance" /></mat-form-field>
          <mat-form-field><mat-label>Brokerage Balance</mat-label><input matInput type="number" formControlName="brokerageBalance" /></mat-form-field>
          <mat-form-field><mat-label>Brokerage Cost Basis</mat-label><input matInput type="number" formControlName="brokerageCostBasis" /></mat-form-field>
          <mat-checkbox formControlName="allowPreRetirementConversions">Convert during working years (uses bracket room above wages)</mat-checkbox>
          <button mat-flat-button type="submit" [disabled]="form.invalid">Run Scenario</button>
        </form>
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .panel { max-width: 980px; }
    .form-grid { display: grid; grid-template-columns: repeat(3, minmax(180px, 1fr)); gap: 14px; padding-top: 16px; }
    button { justify-self: start; min-width: 160px; }
    @media (max-width: 780px) { .form-grid { grid-template-columns: 1fr; } }
  `,
})
export class ScenarioBuilder {
  private readonly state = inject(LocalStateService);
  private readonly fb = inject(FormBuilder);

  constructor() {
    effect(() => {
      // Re-evaluate whenever accounts signal changes
      const accounts = this.state.accounts();
      if (this.form && this.form.pristine) {
        this.form.patchValue({
          traditionalBalance: this.getBalance(['traditional_401k', 'traditional_ira']),
          rothBalance: this.getBalance(['roth_401k', 'roth_ira']),
          brokerageBalance: this.getBalance(['brokerage']),
          brokerageCostBasis: accounts.find(a => a.type === 'brokerage')?.costBasis ?? this.getBalance(['brokerage'])
        });
      }
    });
  }

  private getBalance(types: string[]): number {
    return this.state.accounts().filter(a => types.includes(a.type)).reduce((sum, a) => sum + a.balance, 0);
  }

  readonly form = this.fb.nonNullable.group({
    name: [this.state.scenario().name, Validators.required],
    currentAge: [this.state.scenario().currentAge, Validators.required],
    retirementAge: [this.state.scenario().retirementAge, Validators.required],
    birthYear: [this.state.scenario().birthYear, Validators.required],
    wageIncome: [this.state.scenario().wageIncome, Validators.required],
    annualWageGrowth: [this.state.scenario().annualWageGrowth ?? 0],
    annualLivingExpenses: [this.state.scenario().annualLivingExpenses ?? 0, Validators.required],
    ssClaimAge: [this.state.scenario().ssClaimAge, Validators.required],
    ssPia: [this.state.scenario().ssPia, Validators.required],
    lifeExpectancy: [this.state.scenario().lifeExpectancy, Validators.required],
    assumedReturnRate: [this.state.scenario().assumedReturnRate, Validators.required],
    stateTaxRate: [this.state.scenario().stateTaxRate],
    residualTaxRate: [this.state.scenario().residualTaxRate ?? RESIDUAL_TRADITIONAL_TAX_RATE],
    allowPreRetirementConversions: [this.state.scenario().allowPreRetirementConversions ?? false],
    filingStatus: [this.state.scenario().filingStatus, Validators.required],
    conversionMode: [this.state.scenario().rothConversionStrategy.mode, Validators.required],
    fixedAmount: [this.state.scenario().rothConversionStrategy.mode === 'fixed-amount' ? (this.state.scenario().rothConversionStrategy as any).amount : 25000],
    targetBracket: ['targetBracket' in this.state.scenario().rothConversionStrategy ? (this.state.scenario().rothConversionStrategy as any).targetBracket : 0.24],
    traditionalBalance: [this.getBalance(['traditional_401k', 'traditional_ira']), Validators.required],
    rothBalance: [this.getBalance(['roth_401k', 'roth_ira']), Validators.required],
    brokerageBalance: [this.getBalance(['brokerage']), Validators.required],
    brokerageCostBasis: [this.state.accounts().find(a => a.type === 'brokerage')?.costBasis ?? this.getBalance(['brokerage']), Validators.required],
  });

  save(): void {
    const value = this.form.getRawValue();
    const rothConversionStrategy: RothConversionStrategy =
      value.conversionMode === 'fixed-amount'
        ? { mode: 'fixed-amount', amount: value.fixedAmount }
        : value.conversionMode === 'fill-to-bracket'
          ? { mode: 'fill-to-bracket', targetBracket: value.targetBracket }
          : value.conversionMode === 'smooth-to-bracket'
            ? { mode: 'smooth-to-bracket', targetBracket: value.targetBracket }
            : value.conversionMode === 'smooth-income-target'
              ? { mode: 'smooth-income-target', targetBracket: value.targetBracket }
              : value.conversionMode === 'auto-optimize'
                ? { mode: 'auto-optimize' }
                : { mode: 'none' };
    const scenario: Scenario = {
      name: value.name,
      currentAge: value.currentAge,
      retirementAge: value.retirementAge,
      wageIncome: value.wageIncome,
      annualLivingExpenses: value.annualLivingExpenses,
      birthYear: value.birthYear,
      ssClaimAge: value.ssClaimAge as Scenario['ssClaimAge'],
      ssPia: value.ssPia,
      lifeExpectancy: value.lifeExpectancy,
      filingStatus: value.filingStatus as Scenario['filingStatus'],
      rothConversionStrategy,
      assumedReturnRate: value.assumedReturnRate,
      stateTaxRate: value.stateTaxRate,
      residualTaxRate: value.residualTaxRate,
      allowPreRetirementConversions: value.allowPreRetirementConversions,
      annualWageGrowth: value.annualWageGrowth,
    };

    const now = new Date().toISOString().split('T')[0];
    this.state.setAccounts([
      { type: 'traditional_ira', balance: value.traditionalBalance, snapshotDate: now },
      { type: 'roth_ira', balance: value.rothBalance, snapshotDate: now },
      { type: 'brokerage', balance: value.brokerageBalance, costBasis: value.brokerageCostBasis, snapshotDate: now },
    ]);

    this.state.updateScenario(scenario);
  }
}
