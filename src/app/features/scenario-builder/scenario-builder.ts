import { Component, computed, inject } from '@angular/core';
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
import { ScenarioService } from '../../core/services/scenario.service';
import { AuthService } from '../../core/services/auth.service';
import { DEFAULT_SS_COLA_RATE } from '../../core/calculators/roth-conversion-calculator';

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
          <mat-form-field><mat-label>Employee Pre-Tax 401(k)/IRA</mat-label><input matInput type="number" formControlName="annualPreTaxContribution" /></mat-form-field>
          <mat-form-field><mat-label>Employer Match (Pre-Tax)</mat-label><input matInput type="number" formControlName="employerMatch" /></mat-form-field>
          <mat-form-field><mat-label>Employee Roth Contribution</mat-label><input matInput type="number" formControlName="annualRothContribution" /></mat-form-field>
          <mat-form-field><mat-label>Annual Brokerage Savings</mat-label><input matInput type="number" formControlName="annualBrokerageContribution" /></mat-form-field>
          <mat-form-field><mat-label>Other income (interest/non-qual div)</mat-label><input matInput type="number" formControlName="annualOtherIncome" /></mat-form-field>
          <mat-form-field><mat-label>Annual expenses (working & retirement)</mat-label><input matInput type="number" formControlName="annualLivingExpenses" /></mat-form-field>
          <mat-form-field><mat-label>Birth year</mat-label><input matInput type="number" formControlName="birthYear" /></mat-form-field>
          <mat-form-field><mat-label>SS claim age</mat-label><input matInput type="number" formControlName="ssClaimAge" /></mat-form-field>
          <mat-form-field><mat-label>Monthly SS benefit at claim age</mat-label><input matInput type="number" formControlName="ssPia" /></mat-form-field>
          <mat-form-field><mat-label>SS COLA rate</mat-label><input matInput type="number" step="0.005" formControlName="ssColaRate" /></mat-form-field>
          <mat-form-field><mat-label>MAGI 2 years ago (IRMAA, 0 = skip)</mat-label><input matInput type="number" formControlName="preSimulationMagi" /></mat-form-field>
          <mat-form-field><mat-label>Spouse current age (0 = no spouse model)</mat-label><input matInput type="number" formControlName="spouseCurrentAge" /></mat-form-field>
          <mat-form-field><mat-label>Spouse birth year</mat-label><input matInput type="number" formControlName="spouseBirthYear" /><mat-hint>Used for survivor RMD start age</mat-hint></mat-form-field>
          <mat-form-field><mat-label>Spouse life expectancy</mat-label><input matInput type="number" formControlName="spouseLifeExpectancy" /></mat-form-field>
          <mat-form-field><mat-label>Spouse monthly SS at claim age</mat-label><input matInput type="number" formControlName="spouseSsPia" /></mat-form-field>
          <mat-form-field><mat-label>Spouse SS claim age</mat-label><input matInput type="number" formControlName="spouseSsClaimAge" /></mat-form-field>
          <mat-form-field><mat-label>Life expectancy</mat-label><input matInput type="number" formControlName="lifeExpectancy" /></mat-form-field>
          <mat-form-field><mat-label>Return rate</mat-label><input matInput type="number" step="0.01" formControlName="assumedReturnRate" /></mat-form-field>
          <mat-form-field><mat-label>Stock allocation</mat-label><input matInput type="number" min="0" max="1" step="0.05" formControlName="stockAllocation" /><mat-hint>Bond allocation = 1 − stock allocation</mat-hint></mat-form-field>
          <mat-form-field>
            <mat-label>Inflation mode</mat-label>
            <mat-select formControlName="inflationMode">
              <mat-option value="fixed">Fixed assumption</mat-option>
              <mat-option value="historical">Historical CPI with market path</mat-option>
            </mat-select>
            <mat-hint>Historical mode ignores SS COLA rate and uses prior-year sampled CPI.</mat-hint>
          </mat-form-field>
          <mat-form-field><mat-label>State tax rate</mat-label><input matInput type="number" step="0.01" formControlName="stateTaxRate" /></mat-form-field>
          <mat-form-field><mat-label>Residual tax rate (heirs/liquidation)</mat-label><input matInput type="number" step="0.01" formControlName="residualTaxRate" /></mat-form-field>
          <mat-form-field><mat-label>Brokerage gains tax (0 = heir step-up)</mat-label><input matInput type="number" step="0.01" formControlName="brokerageGainsTaxRate" /></mat-form-field>
          <mat-form-field><mat-label>Dividend yield (part of return)</mat-label><input matInput type="number" step="0.001" formControlName="dividendYield" /></mat-form-field>
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
          <mat-form-field><mat-label>Traditional Balance (Read-only)</mat-label><input matInput type="number" [value]="summaryTraditional()" readonly /></mat-form-field>
          <mat-form-field><mat-label>Roth Balance (Read-only)</mat-label><input matInput type="number" [value]="summaryRoth()" readonly /></mat-form-field>
          <mat-form-field><mat-label>Brokerage Balance (Read-only)</mat-label><input matInput type="number" [value]="summaryBrokerage()" readonly /></mat-form-field>
          <mat-form-field><mat-label>Brokerage Cost Basis (Read-only)</mat-label><input matInput type="number" [value]="summaryBrokerageBasis()" readonly /></mat-form-field>
          <mat-checkbox formControlName="allowPreRetirementConversions">Convert during working years (uses bracket room above wages)</mat-checkbox>
          <button mat-flat-button type="submit" [disabled]="form.invalid">Run Scenario</button>
        </form>
      </mat-card-content>
    </mat-card>

    @if (auth.currentUser()) {
      <mat-card class="panel">
        <mat-card-header><mat-card-title>Cloud Sync</mat-card-title></mat-card-header>
        <mat-card-content>
          <div class="actions">
            <button mat-flat-button color="primary" (click)="saveToCloud()">Save to Supabase</button>
            <button mat-stroked-button (click)="loadFromCloud()">Load from Supabase</button>
          </div>
        </mat-card-content>
      </mat-card>
    }
  `,
  styles: `
    .panel { max-width: 980px; margin-bottom: 20px; }
    .form-grid { display: grid; grid-template-columns: repeat(3, minmax(180px, 1fr)); gap: 14px; padding-top: 16px; }
    .actions { display: flex; gap: 12px; padding-top: 16px; flex-wrap: wrap; }
    button { justify-self: start; min-width: 160px; }
    @media (max-width: 780px) { .form-grid { grid-template-columns: 1fr; } }
    @media print {
      :host { display: none !important; }
    }
  `,
})
export class ScenarioBuilder {
  private readonly state = inject(LocalStateService);
  private readonly fb = inject(FormBuilder);
  readonly scenarioService = inject(ScenarioService);
  readonly auth = inject(AuthService);

  readonly summaryTraditional = computed(() => this.getBalance(['traditional_401k', 'traditional_ira']));
  readonly summaryRoth = computed(() => this.getBalance(['roth_401k', 'roth_ira']));
  readonly summaryBrokerage = computed(() => this.getBalance(['brokerage']));
  readonly summaryBrokerageBasis = computed(() => this.state.accounts()
    .filter((account) => account.type === 'brokerage')
    .reduce((sum, account) => sum + (account.costBasis ?? account.balance), 0));

  constructor() {}

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
    annualPreTaxContribution: [this.state.scenario().annualPreTaxContribution ?? 0],
    annualRothContribution: [this.state.scenario().annualRothContribution ?? 0],
    annualBrokerageContribution: [this.state.scenario().annualBrokerageContribution ?? 0],
    employerMatch: [this.state.scenario().employerMatch ?? 0],
    annualOtherIncome: [this.state.scenario().annualOtherIncome ?? 0],
    annualLivingExpenses: [this.state.scenario().annualLivingExpenses ?? 0, Validators.required],
    ssClaimAge: [this.state.scenario().ssClaimAge, Validators.required],
    ssPia: [this.state.scenario().ssPia, Validators.required],
    ssColaRate: [this.state.scenario().ssColaRate ?? DEFAULT_SS_COLA_RATE],
    preSimulationMagi: [this.state.scenario().preSimulationMagi ?? 0],
    spouseCurrentAge: [this.state.scenario().spouseCurrentAge ?? 0],
    spouseBirthYear: [this.state.scenario().spouseBirthYear ?? 0],
    spouseLifeExpectancy: [this.state.scenario().spouseLifeExpectancy ?? 0],
    spouseSsPia: [this.state.scenario().spouseSsPia ?? 0],
    spouseSsClaimAge: [this.state.scenario().spouseSsClaimAge ?? 0],
    lifeExpectancy: [this.state.scenario().lifeExpectancy, Validators.required],
    assumedReturnRate: [this.state.scenario().assumedReturnRate, Validators.required],
    stockAllocation: [this.state.scenario().stockAllocation ?? 1, [Validators.required, Validators.min(0), Validators.max(1)]],
    inflationMode: [this.state.scenario().inflationMode ?? 'fixed', Validators.required],
    stateTaxRate: [this.state.scenario().stateTaxRate],
    residualTaxRate: [this.state.scenario().residualTaxRate ?? RESIDUAL_TRADITIONAL_TAX_RATE],
    allowPreRetirementConversions: [this.state.scenario().allowPreRetirementConversions ?? false],
    brokerageGainsTaxRate: [this.state.scenario().brokerageGainsTaxRate ?? 0],
    dividendYield: [this.state.scenario().dividendYield ?? 0.015],
    filingStatus: [this.state.scenario().filingStatus, Validators.required],
    conversionMode: [this.state.scenario().rothConversionStrategy.mode, Validators.required],
    fixedAmount: [this.state.scenario().rothConversionStrategy.mode === 'fixed-amount' ? (this.state.scenario().rothConversionStrategy as any).amount : 25000],
    targetBracket: ['targetBracket' in this.state.scenario().rothConversionStrategy ? (this.state.scenario().rothConversionStrategy as any).targetBracket : 0.24],
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
      annualPreTaxContribution: value.annualPreTaxContribution,
      annualRothContribution: value.annualRothContribution,
      annualBrokerageContribution: value.annualBrokerageContribution,
      employerMatch: value.employerMatch,
      annualOtherIncome: value.annualOtherIncome,
      annualLivingExpenses: value.annualLivingExpenses,
      birthYear: value.birthYear,
      ssClaimAge: value.ssClaimAge as Scenario['ssClaimAge'],
      ssPia: value.ssPia,
      ssColaRate: value.ssColaRate,
      // 0 in the form means "not used" for these optional inputs
      preSimulationMagi: value.preSimulationMagi > 0 ? value.preSimulationMagi : undefined,
      spouseCurrentAge: value.spouseCurrentAge > 0 ? value.spouseCurrentAge : undefined,
      spouseBirthYear: value.spouseBirthYear > 0 ? value.spouseBirthYear : undefined,
      spouseLifeExpectancy: value.spouseLifeExpectancy > 0 ? value.spouseLifeExpectancy : undefined,
      spouseSsPia: value.spouseSsPia > 0 ? value.spouseSsPia : undefined,
      spouseSsClaimAge: value.spouseSsClaimAge > 0 ? value.spouseSsClaimAge : undefined,
      lifeExpectancy: value.lifeExpectancy,
      filingStatus: value.filingStatus as Scenario['filingStatus'],
      rothConversionStrategy,
      assumedReturnRate: value.assumedReturnRate,
      stockAllocation: value.stockAllocation,
      inflationMode: value.inflationMode as Scenario['inflationMode'],
      stateTaxRate: value.stateTaxRate,
      residualTaxRate: value.residualTaxRate,
      allowPreRetirementConversions: value.allowPreRetirementConversions,
      annualWageGrowth: value.annualWageGrowth,
      brokerageGainsTaxRate: value.brokerageGainsTaxRate,
      dividendYield: value.dividendYield,
    };

    this.state.updateScenario(scenario);
  }

  async saveToCloud(): Promise<void> {
    const user = this.auth.currentUser();
    if (!user) return;
    try {
      await this.scenarioService.create(this.state.scenario(), user.id);
      alert('Scenario saved to cloud successfully.');
    } catch (e) {
      alert('Error saving scenario: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async loadFromCloud(): Promise<void> {
    try {
      const list = await this.scenarioService.list();
      if (list.length > 0) {
        const scenario = list[0]; // Load the most recent scenario
        this.state.updateScenario(scenario);
        
        // Also update form with new state values
        this.form.patchValue({
          name: scenario.name,
          currentAge: scenario.currentAge,
          retirementAge: scenario.retirementAge,
          birthYear: scenario.birthYear,
          wageIncome: scenario.wageIncome,
          annualWageGrowth: scenario.annualWageGrowth ?? 0,
          annualPreTaxContribution: scenario.annualPreTaxContribution ?? 0,
          annualRothContribution: scenario.annualRothContribution ?? 0,
          annualBrokerageContribution: scenario.annualBrokerageContribution ?? 0,
          employerMatch: scenario.employerMatch ?? 0,
          annualOtherIncome: scenario.annualOtherIncome ?? 0,
          annualLivingExpenses: scenario.annualLivingExpenses ?? 0,
          ssClaimAge: scenario.ssClaimAge,
          ssPia: scenario.ssPia,
          spouseBirthYear: scenario.spouseBirthYear ?? 0,
          lifeExpectancy: scenario.lifeExpectancy,
          assumedReturnRate: scenario.assumedReturnRate,
          stockAllocation: scenario.stockAllocation ?? 1,
          inflationMode: scenario.inflationMode ?? 'fixed',
          stateTaxRate: scenario.stateTaxRate,
          residualTaxRate: scenario.residualTaxRate ?? RESIDUAL_TRADITIONAL_TAX_RATE,
          allowPreRetirementConversions: scenario.allowPreRetirementConversions ?? false,
          brokerageGainsTaxRate: scenario.brokerageGainsTaxRate ?? 0,
          dividendYield: scenario.dividendYield ?? 0.015,
          filingStatus: scenario.filingStatus,
          conversionMode: scenario.rothConversionStrategy.mode,
          fixedAmount: scenario.rothConversionStrategy.mode === 'fixed-amount' ? (scenario.rothConversionStrategy as any).amount : 25000,
          targetBracket: 'targetBracket' in scenario.rothConversionStrategy ? (scenario.rothConversionStrategy as any).targetBracket : 0.24,
        });

        alert('Scenario loaded from cloud successfully.');
      } else {
        alert('No scenarios found in cloud.');
      }
    } catch (e) {
      alert('Error loading scenario: ' + (e instanceof Error ? e.message : String(e)));
    }
  }
}
