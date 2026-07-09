import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { NgxChartsModule } from '@swimlane/ngx-charts';
import { generateActionPlan, calculateMaxTraditionalBalanceForBracket } from '../../core/calculators/action-plan';
import { DEFAULT_MONTE_CARLO_TRIALS, MonteCarloResult, runMonteCarloSmoothIncomeTarget } from '../../core/calculators/monte-carlo';
import { LONG_TERM_CAPITAL_GAINS_RATE, sumAccounts, sumCostBasis } from '../../core/calculators/roth-conversion-calculator';
import { runScenario, RESIDUAL_TRADITIONAL_TAX_RATE } from '../../core/calculators/scenario-engine';
import { effectiveConversionRate, selectStrategy, StrategyChoice } from '../../core/calculators/strategy-selector';
import { DEFAULT_TAX_YEAR } from '../../core/calculators/tax-tables';
import { ScenarioResult, YearResult } from '../../core/models/retirement.models';
import { LocalStateService } from '../../core/services/local-state.service';
import { getRmdStartAge, UNIFORM_LIFETIME_DIVISORS } from '../../core/calculators/rmd-calculator';

@Component({
  selector: 'app-dashboard',
  imports: [CurrencyPipe, DecimalPipe, MatButtonModule, MatCardModule, MatProgressSpinnerModule, NgxChartsModule],
  template: `
    <section class="rmd-banner">
      <mat-card>
        <mat-card-content>
          <strong>RMDs start at age {{ rmdStartAge() }}</strong> — projected pre-tax (Traditional) balance at that age:
          <strong>{{ traditionalAtRmdStart() | currency }}</strong>
          <span class="divider">|</span>
          <strong>Total assets at age {{ finalAge() }}:</strong>
          <strong>{{ result().endingAssets | currency }}</strong>
          <span class="divider">|</span>
          <span class="data-year">Tax data year: {{ taxDataYear }} (IRS Rev. Proc. 2025-32; CMS 2026 IRMAA)</span>
        </mat-card-content>
      </mat-card>
    </section>

    <section class="summary">
      <mat-card>
        <mat-card-header><mat-card-title>{{ result().scenarioName }}</mat-card-title></mat-card-header>
        <mat-card-content>
          <div class="metric"><span>Total tax</span><strong>{{ result().totalTax | currency }}</strong></div>
          <div class="metric"><span>Ending assets</span><strong>{{ result().endingAssets | currency }}</strong></div>
          <div class="metric"><span>After-tax ending assets</span><strong>{{ resultAfterTax() | currency }}</strong></div>
          <div class="metric sub"><span>Pre-tax (Traditional) at {{ finalAge() }}</span><strong>{{ resultFinalYear()?.traditionalBalance | currency }}</strong></div>
          <div class="metric sub"><span>Roth at {{ finalAge() }}</span><strong>{{ resultFinalYear()?.rothBalance | currency }}</strong></div>
          <div class="metric sub"><span>Brokerage at {{ finalAge() }}</span><strong>{{ resultFinalYear()?.brokerageBalance | currency }}</strong></div>
          <div class="metric sub"><span>… of which unrealized gain</span><strong>{{ resultUnrealizedGain() | currency }}</strong></div>
          @if (result().note) {
            <p class="strategy-note">ℹ️ {{ result().note }}</p>
          }
        </mat-card-content>
      </mat-card>
      <mat-card>
        <mat-card-header><mat-card-title>Baseline</mat-card-title></mat-card-header>
        <mat-card-content>
          <div class="metric"><span>Total tax</span><strong>{{ baseline().totalTax | currency }}</strong></div>
          <div class="metric"><span>Ending assets</span><strong>{{ baseline().endingAssets | currency }}</strong></div>
          <div class="metric"><span>After-tax ending assets</span><strong>{{ baselineAfterTax() | currency }}</strong></div>
          <div class="metric sub"><span>Pre-tax (Traditional) at {{ finalAge() }}</span><strong>{{ baselineFinalYear()?.traditionalBalance | currency }}</strong></div>
          <div class="metric sub"><span>Roth at {{ finalAge() }}</span><strong>{{ baselineFinalYear()?.rothBalance | currency }}</strong></div>
          <div class="metric sub"><span>Brokerage at {{ finalAge() }}</span><strong>{{ baselineFinalYear()?.brokerageBalance | currency }}</strong></div>
        </mat-card-content>
      </mat-card>
    </section>

    <section class="strategy-selector">
      <mat-card>
        <mat-card-header><mat-card-title>Strategy Selector: Roth Conversion vs Buy-Borrow-Die</mat-card-title></mat-card-header>
        <mat-card-content>
          <p class="verdict">{{ strategyVerdict() }}</p>
          <div class="metric"><span>Roth conversion value (P × Δrate)</span><strong>{{ strategyDecision().conversionValue | currency }}</strong></div>
          <div class="metric"><span>Buy-Borrow-Die value (borrow vs sell, at death)</span><strong>{{ strategyDecision().bbdValue | currency }}</strong></div>
          <div class="metric"><span>BBD stress test (peak LTV after 40% crash, limit 50%)</span><strong>{{ strategyDecision().bbdFeasible ? 'Pass' : 'Fail' }} ({{ strategyDecision().peakStressedLtv * 100 | number: '1.0-0' }}%)</strong></div>
          <ul class="advice-list">
            @for (note of strategyDecision().notes; track note) {
              <li>{{ note }}</li>
            }
          </ul>
          <p class="strategy-note">
            Rule of thumb: convert pre-tax dollars while today's rate is below the exit rate (residual tax rate, currently
            {{ (scenario().residualTaxRate ?? residualRateDefault) * 100 | number: '1.0-0' }}%); hold brokerage for step-up only when
            avoided gains tax outruns loan interest ({{ sblocBorrowRate * 100 | number: '1.0-0' }}% assumed) for your remaining horizon.
            The two rules apply to different accounts, so "both" is a valid answer.
          </p>
        </mat-card-content>
      </mat-card>
    </section>

    @if (isSmoothIncomeTarget()) {
    <section class="monte-carlo">
      <mat-card>
        <mat-card-header><mat-card-title>Monte Carlo Verification (Smooth Income Target)</mat-card-title></mat-card-header>
        <mat-card-content>
          <p class="strategy-note">
            Replays the solved conversion plan under {{ monteCarloTrials | number }} randomized market-return sequences
            (mean-adjusted historical bootstrap, centered on your assumed {{ scenario().assumedReturnRate * 100 | number: '1.0-1' }}% return)
            instead of one flat rate — showing how the plan holds up across a realistic range of real-world outcomes.
          </p>
          <button mat-flat-button color="primary" [disabled]="monteCarloRunning()" (click)="runMonteCarlo()">
            {{ monteCarloRunning() ? 'Running…' : (monteCarloResult() ? 'Re-run Monte Carlo' : 'Run Monte Carlo (' + (monteCarloTrials | number) + ' trials)') }}
          </button>
          @if (monteCarloRunning()) {
            <div class="mc-loading"><mat-spinner diameter="24" /> <span>Simulating {{ monteCarloTrials | number }} market paths…</span></div>
          }
          @if (monteCarloError()) {
            <p class="strategy-note mc-error">⚠️ {{ monteCarloError() }}</p>
          }
          @if (monteCarloResult(); as mc) {
            <div class="metric"><span>Probability the plan never runs short through age {{ finalAge() }}</span><strong>{{ mc.successProbability * 100 | number: '1.1-1' }}%</strong></div>
            <div class="metric sub"><span>Mean after-tax ending assets</span><strong>{{ mc.meanEndingAssets | currency }}</strong></div>
            <div class="metric sub"><span>10th percentile (bad markets)</span><strong>{{ mc.endingAssetsPercentiles.p10 | currency }}</strong></div>
            <div class="metric sub"><span>25th percentile</span><strong>{{ mc.endingAssetsPercentiles.p25 | currency }}</strong></div>
            <div class="metric sub"><span>Median (50th percentile)</span><strong>{{ mc.endingAssetsPercentiles.p50 | currency }}</strong></div>
            <div class="metric sub"><span>75th percentile</span><strong>{{ mc.endingAssetsPercentiles.p75 | currency }}</strong></div>
            <div class="metric sub"><span>90th percentile (good markets)</span><strong>{{ mc.endingAssetsPercentiles.p90 | currency }}</strong></div>
          }
        </mat-card-content>
      </mat-card>
    </section>
    }

    <section class="summary">
      <mat-card>
        <mat-card-header><mat-card-title>SBLOC-Funded Conversion Taxes (BBD, ages {{ sblocStartAge }}–{{ sblocEndAge }})</mat-card-title></mat-card-header>
        <mat-card-content>
          <div class="metric"><span>After-tax estate at {{ finalAge() }} (net of loan)</span><strong>{{ sblocAfterTax() | currency }}</strong></div>
          <div class="metric"><span>SBLOC loan at death</span><strong>{{ sblocLoanAtDeath() | currency }}</strong></div>
          <div class="metric sub"><span>… conversion tax borrowed</span><strong>{{ sblocTaxBorrowed() | currency }}</strong></div>
          <div class="metric sub"><span>… interest accrued ({{ sblocBorrowRate * 100 | number: '1.0-0' }}%)</span><strong>{{ sblocInterestTotal() | currency }}</strong></div>
          <div class="metric sub"><span>… paid down from cash (margin cures)</span><strong>{{ sblocPaydownTotal() | currency }}</strong></div>
          <div class="metric"><span>Peak LTV (limit {{ sblocMaxLtv * 100 | number: '1.0-0' }}%)</span><strong>{{ sblocPeakLtv() * 100 | number: '1.0-1' }}%</strong></div>
          <div class="metric sub"><span>Brokerage at {{ finalAge() }}</span><strong>{{ sblocFinalYear()?.brokerageBalance | currency }}</strong></div>
          <div class="metric sub"><span>Roth at {{ finalAge() }}</span><strong>{{ sblocFinalYear()?.rothBalance | currency }}</strong></div>
        </mat-card-content>
      </mat-card>
      <mat-card>
        <mat-card-header><mat-card-title>Pay Conversion Taxes in Cash (current strategy)</mat-card-title></mat-card-header>
        <mat-card-content>
          <div class="metric"><span>After-tax estate at {{ finalAge() }}</span><strong>{{ resultAfterTax() | currency }}</strong></div>
          <div class="metric"><span>Loan at death</span><strong>{{ 0 | currency }}</strong></div>
          <div class="metric sub"><span>Brokerage at {{ finalAge() }}</span><strong>{{ resultFinalYear()?.brokerageBalance | currency }}</strong></div>
          <div class="metric sub"><span>Roth at {{ finalAge() }}</span><strong>{{ resultFinalYear()?.rothBalance | currency }}</strong></div>
          <p class="strategy-note">{{ sblocVerdict() }}</p>
        </mat-card-content>
      </mat-card>
    </section>

    <section class="advice">
      <mat-card>
        <mat-card-header><mat-card-title>Optimization Advice & Insights</mat-card-title></mat-card-header>
        <mat-card-content>
          <ul class="advice-list">
            @for (advice of optimizationAdvice(); track advice) {
              <li>{{ advice }}</li>
            }
          </ul>
        </mat-card-content>
      </mat-card>
    </section>

    @if (actionPlan().length > 0) {
    <section class="action-plan">
      <mat-card>
        <mat-card-header><mat-card-title>Year-by-Year Action Plan</mat-card-title></mat-card-header>
        <mat-card-content>
          <ul class="action-list">
            @for (step of actionPlan(); track step.age) {
              <li [class]="'status-' + step.status">
                <strong>Age {{ step.age }}:</strong> {{ step.message }}
              </li>
            }
          </ul>
        </mat-card-content>
      </mat-card>
    </section>
    }

    <section class="charts">
      <mat-card>
        <mat-card-header><mat-card-title>RMD Curve</mat-card-title></mat-card-header>
        <mat-card-content>
          <ngx-charts-line-chart [results]="rmdChart()" [legend]="true" [xAxis]="true" [yAxis]="true" [autoScale]="true" />
        </mat-card-content>
      </mat-card>
      <mat-card>
        <mat-card-header><mat-card-title>Asset Curve</mat-card-title></mat-card-header>
        <mat-card-content>
          <ngx-charts-line-chart [results]="assetChart()" [legend]="true" [xAxis]="true" [yAxis]="true" [autoScale]="true" />
        </mat-card-content>
      </mat-card>
    </section>
  `,
  styles: `
    .rmd-banner { margin-bottom: 20px; }
    .rmd-banner mat-card-content { min-height: unset; padding: 14px 16px; font-size: 1.05rem; }
    .rmd-banner .divider { margin: 0 10px; color: #b0bac4; }
    .rmd-banner .data-year { color: #5a6b7c; font-size: 0.9rem; }
    .summary { display: grid; grid-template-columns: repeat(2, minmax(240px, 1fr)); gap: 20px; margin-bottom: 20px; }
    .strategy-selector, .advice, .action-plan, .monte-carlo { margin-bottom: 20px; }
    .mc-loading { display: flex; align-items: center; gap: 10px; margin-top: 14px; color: #5a6b7c; font-size: 0.92rem; }
    .mc-error { background: #fdecea; color: #b71c1c; }
    .verdict { margin: 0 0 12px; font-size: 1.15rem; font-weight: 600; }
    .advice-list, .action-list { padding-left: 20px; line-height: 1.6; font-size: 1.05rem; }
    .advice-list li, .action-list li { margin-bottom: 8px; }
    .action-list li.status-warning { color: #d32f2f; }
    .action-list li.status-danger { color: #b71c1c; font-weight: 600; }
    .action-list li.status-success { color: #2e7d32; }
    .strategy-note { margin: 12px 0 0; padding: 10px 12px; background: #eef4fb; border-radius: 6px; font-size: 0.92rem; line-height: 1.5; color: #33475b; }
    .metric { display: flex; justify-content: space-between; gap: 16px; padding: 14px 0; border-bottom: 1px solid #edf1f5; }
    .metric.sub { padding: 8px 0 8px 14px; font-size: 0.92rem; color: #5a6b7c; }
    .metric:last-child { border-bottom: 0; }
    .charts { display: grid; grid-template-columns: 1fr; gap: 20px; }
    mat-card-content { min-height: 280px; }
    @media (max-width: 760px) { .summary { grid-template-columns: 1fr; } }
  `,
})
export class Dashboard {
  private readonly state = inject(LocalStateService);
  readonly taxDataYear = DEFAULT_TAX_YEAR;
  readonly scenario = this.state.scenario;
  readonly residualRateDefault = RESIDUAL_TRADITIONAL_TAX_RATE;
  // SBLOC borrow rate assumed for the Buy-Borrow-Die comparison; not a scenario input yet
  readonly sblocBorrowRate = 0.07;
  // BBD tax-funding window and loan cap: conversion taxes from 60–75 are borrowed against
  // the brokerage, and draws stop once the loan hits 40% of the collateral
  readonly sblocStartAge = 60;
  readonly sblocEndAge = 75;
  readonly sblocMaxLtv = 0.4;

  // Per-bucket decision: Rule 1 compares today's conversion rate against the exit rate on
  // unconverted dollars; Rule 2 simulates borrow-vs-sell for the brokerage held to step-up.
  // Spending is funded from the brokerage only once retired, so the horizon starts then.
  readonly strategyDecision = computed(() => {
    const scenario = this.state.scenario();
    const accounts = this.state.accounts();
    const strategy = scenario.rothConversionStrategy;
    // t_now = what the plan actually pays per converted dollar (conversions fill cheap
    // brackets first, so this is usually well below the target bracket); the target
    // bracket is only the fallback when the plan converts nothing
    const conversionRate = effectiveConversionRate(this.result().years, scenario.filingStatus, scenario.stateTaxRate)
      ?? ('targetBracket' in strategy ? strategy.targetBracket : 0.24);
    return selectStrategy({
      pretaxBalance: sumAccounts(accounts, ['traditional_401k', 'traditional_ira']),
      brokerageBalance: sumAccounts(accounts, ['brokerage']),
      brokerageCostBasis: sumCostBasis(accounts, ['brokerage']),
      conversionRate,
      exitRate: scenario.residualTaxRate ?? RESIDUAL_TRADITIONAL_TAX_RATE,
      capitalGainsRate: LONG_TERM_CAPITAL_GAINS_RATE,
      borrowRate: this.sblocBorrowRate,
      expectedReturnRate: scenario.assumedReturnRate,
      yearsToDeath: Math.max(0, scenario.lifeExpectancy - Math.max(scenario.currentAge, scenario.retirementAge)),
      annualSpending: scenario.annualLivingExpenses,
      // Roth can't be pledged as SBLOC collateral, but it can cure a stressed margin call
      backstopLiquidAssets: sumAccounts(accounts, ['roth_401k', 'roth_ira']),
    });
  });

  readonly strategyVerdict = computed(() => {
    const labels: Record<StrategyChoice, string> = {
      'roth-conversion': '✅ Roth Conversion — convert the pre-tax bucket; borrowing against the brokerage adds risk without enough tax savings.',
      'buy-borrow-die': '✅ Buy, Borrow, Die — hold the low-basis brokerage for step-up; the pre-tax bucket has no rate spread worth converting.',
      'both': '✅ Both — convert the pre-tax bucket AND hold the brokerage for step-up; the two strategies act on different accounts.',
      'neither': 'ℹ️ Neither — no conversion rate spread and no step-up edge; spend and sell directly.',
    };
    return labels[this.strategyDecision().choice];
  });
  readonly result = computed(() => runScenario(this.state.scenario(), this.state.accounts()));
  readonly monteCarloTrials = DEFAULT_MONTE_CARLO_TRIALS;
  readonly monteCarloResult = signal<MonteCarloResult | null>(null);
  readonly monteCarloRunning = signal(false);
  readonly monteCarloError = signal<string | null>(null);
  readonly isSmoothIncomeTarget = computed(() => this.state.scenario().rothConversionStrategy.mode === 'smooth-income-target');

  // 20k trials of the full year-by-year simulation take a couple of seconds, so this runs on
  // click (not as a computed signal recomputing on every scenario edit) and defers the heavy
  // loop a tick so the "Running…" state paints before the main thread blocks.
  runMonteCarlo(): void {
    this.monteCarloRunning.set(true);
    this.monteCarloError.set(null);
    const scenario = this.state.scenario();
    const accounts = this.state.accounts();
    setTimeout(() => {
      try {
        const result = runMonteCarloSmoothIncomeTarget(scenario, accounts, this.monteCarloTrials);
        this.monteCarloResult.set(result);
      } catch (err) {
        this.monteCarloError.set(err instanceof Error ? err.message : 'Monte Carlo simulation failed.');
      } finally {
        this.monteCarloRunning.set(false);
      }
    }, 0);
  }
  readonly baseline = computed(() => runScenario({ ...this.state.scenario(), name: 'No conversion', rothConversionStrategy: { mode: 'none' } }, this.state.accounts()));
  // Same scenario, but conversion taxes in the window are borrowed via SBLOC instead of
  // selling brokerage (Buy-Borrow-Die applied to the tax bill)
  readonly sblocResult = computed(() => runScenario({
    ...this.state.scenario(),
    name: 'SBLOC-funded conversion taxes',
    sblocTaxFunding: { startAge: this.sblocStartAge, endAge: this.sblocEndAge, borrowRate: this.sblocBorrowRate, maxLtv: this.sblocMaxLtv },
  }, this.state.accounts()));
  readonly sblocFinalYear = computed(() => this.sblocResult().years.at(-1));
  readonly sblocAfterTax = computed(() => this.afterTaxEndingAssets(this.sblocResult()));
  readonly sblocLoanAtDeath = computed(() => this.sblocFinalYear()?.sblocLoanBalance ?? 0);
  readonly sblocInterestTotal = computed(() => this.sblocResult().years.reduce((sum, y) => sum + (y.sblocInterest ?? 0), 0));
  readonly sblocTaxBorrowed = computed(() => this.sblocResult().years.reduce((sum, y) => sum + (y.taxFromSbloc ?? 0), 0));
  readonly sblocPaydownTotal = computed(() => this.sblocResult().years.reduce((sum, y) => sum + (y.sblocPaydown ?? 0), 0));
  readonly sblocPeakLtv = computed(() => this.sblocResult().years.reduce(
    (peak, y) => Math.max(peak, y.brokerageBalance > 0 ? (y.sblocLoanBalance ?? 0) / y.brokerageBalance : 0), 0));
  readonly sblocEdge = computed(() => this.sblocAfterTax() - this.resultAfterTax());
  readonly sblocVerdict = computed(() => {
    const edge = this.sblocEdge();
    const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    // Margin calls are cured in-engine (loan paid down from brokerage, then Roth), so the
    // LTV cap only stays breached when even the Roth backstop couldn't cover the cure
    if (this.sblocPeakLtv() > this.sblocMaxLtv) {
      return `⚠️ Not feasible: even after forced paydowns the loan exceeds ${Math.round(this.sblocMaxLtv * 100)}% of the collateral (peak ${Math.round(this.sblocPeakLtv() * 100)}%). A lender would liquidate before age ${this.finalAge()}, so the ${fmt.format(Math.abs(edge))} difference shown is not achievable.`;
    }
    const cureNote = this.sblocPaydownTotal() > 0
      ? ` Note: staying under the ${Math.round(this.sblocMaxLtv * 100)}% LTV cap forced ${fmt.format(this.sblocPaydownTotal())} of loan paydowns from cash along the way.`
      : '';
    return (edge > 0
      ? `✅ Borrowing the conversion tax wins: the untouched brokerage outgrows the ${Math.round(this.sblocBorrowRate * 100)}% loan, leaving ${fmt.format(edge)} more after tax at ${this.finalAge()}.`
      : `❌ Paying the tax in cash wins: ${Math.round(this.sblocBorrowRate * 100)}% compounding loan interest costs ${fmt.format(-edge)} more than the gains tax and growth it avoids.`) + cureNote;
  });
  readonly rmdChart = computed(() => this.toSeries('RMD', this.result(), this.baseline(), 'rmd'));
  readonly assetChart = computed(() => {
    const res = this.result();
    const perAccount = (label: string, key: keyof YearResult) => ({
      name: label,
      series: res.years.map((year) => ({ name: String(year.age), value: year[key] as number })),
    });
    return [
      perAccount(`${res.scenarioName} total`, 'endingAssets'),
      perAccount('Pre-tax (Traditional)', 'traditionalBalance'),
      perAccount('Roth', 'rothBalance'),
      perAccount('Brokerage', 'brokerageBalance'),
      { name: 'Baseline total', series: this.baseline().years.map((year) => ({ name: String(year.age), value: year.endingAssets })) },
    ];
  });
  readonly actionPlan = computed(() => generateActionPlan(this.result(), this.state.scenario().filingStatus));
  readonly rmdStartAge = computed(() => getRmdStartAge(this.state.scenario().birthYear));
  readonly finalAge = computed(() => this.result().years.at(-1)?.age ?? this.state.scenario().lifeExpectancy);
  readonly resultAfterTax = computed(() => this.afterTaxEndingAssets(this.result()));
  readonly baselineAfterTax = computed(() => this.afterTaxEndingAssets(this.baseline()));
  readonly resultFinalYear = computed(() => this.result().years.at(-1));
  readonly baselineFinalYear = computed(() => this.baseline().years.at(-1));
  readonly resultUnrealizedGain = computed(() => {
    const last = this.resultFinalYear();
    return Math.max(0, (last?.brokerageBalance ?? 0) - (last?.brokerageBasis ?? 0));
  });

  // Pre-tax traditional dollars are discounted by the residual liquidation rate, and
  // unrealized brokerage gains by the gains rate (0 = heirs' step-up in basis), so
  // strategy and baseline are compared in equivalent after-tax terms
  private afterTaxEndingAssets(result: ScenarioResult): number {
    const last = result.years.at(-1);
    const residualRate = this.state.scenario().residualTaxRate ?? RESIDUAL_TRADITIONAL_TAX_RATE;
    const gainsRate = this.state.scenario().brokerageGainsTaxRate ?? 0;
    const unrealizedGain = Math.max(0, (last?.brokerageBalance ?? 0) - (last?.brokerageBasis ?? 0));
    // Any outstanding SBLOC loan is settled by the estate before anything passes to heirs
    return (last?.endingAssets ?? 0) - (last?.traditionalBalance ?? 0) * residualRate - unrealizedGain * gainsRate - (last?.sblocLoanBalance ?? 0);
  }
  readonly traditionalAtRmdStart = computed(() => {
    const startYear = this.result().years.find(y => y.age === this.rmdStartAge());
    return startYear?.traditionalBalance ?? 0;
  });

  readonly optimizationAdvice = computed(() => {
    const res = this.result();
    const base = this.baseline();
    const advices = [];

    const taxDiff = base.totalTax - res.totalTax;
    // Compare in after-tax terms so leftover pre-tax traditional doesn't inflate the baseline
    const assetsDiff = this.afterTaxEndingAssets(res) - this.afterTaxEndingAssets(base);

    const baseRmdTotal = base.years.reduce((sum, yr) => sum + yr.rmd, 0);
    const resRmdTotal = res.years.reduce((sum, yr) => sum + yr.rmd, 0);
    const rmdReduction = baseRmdTotal - resRmdTotal;

    const basePeakRmd = Math.max(...base.years.map(yr => yr.rmd));
    const resPeakRmd = Math.max(...res.years.map(yr => yr.rmd));

    const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

    if (taxDiff > 0) {
      advices.push(`👍 This strategy saves you ${formatCurrency(taxDiff)} in lifetime taxes compared to the baseline.`);
    } else if (taxDiff < 0) {
      advices.push(`⚠️ This strategy increases your lifetime tax burden by ${formatCurrency(-taxDiff)}.`);
    } else {
      advices.push(`ℹ️ This strategy has no impact on lifetime taxes.`);
    }

    if (rmdReduction > 0) {
      advices.push(`📉 RMD Insight: By converting to Roth, you reduced your lifetime Required Minimum Distributions by ${formatCurrency(rmdReduction)}. Your peak RMD dropped from ${formatCurrency(basePeakRmd)} down to ${formatCurrency(resPeakRmd)}, shielding you from being forced into higher tax brackets later in life.`);

      if (resPeakRmd > 0 && taxDiff > 0) {
        advices.push(`💡 Strategy Tip: You still have a peak RMD of ${formatCurrency(resPeakRmd)}. To further avoid large RMD tax spikes, consider bumping your conversion target bracket (e.g., from 22% to 24% or 32%) in the Scenario Builder. Pay a bit more tax today to dramatically shrink the RMDs tomorrow!`);
      }
    } else if (rmdReduction <= 0 && baseRmdTotal > 0) {
      advices.push(`⚠️ RMD Insight: Your strategy did not reduce your RMDs significantly. Consider setting a higher target conversion bracket to drain your traditional accounts before RMD age.`);
    }

    // Drain-down solver
    const strategy = this.state.scenario().rothConversionStrategy;
    const targetBracket = 'targetBracket' in strategy
      ? strategy.targetBracket
      : 0.24; // Default to 24% for generic advice if auto-optimizing

    const rmdStartAge = getRmdStartAge(this.state.scenario().birthYear);
    const divisor = UNIFORM_LIFETIME_DIVISORS[rmdStartAge];
    // Only 85% of Social Security is taxable, matching the simulation engine
    const ssIncome = this.state.scenario().ssPia * 12 * 0.85;
    const maxBalance = calculateMaxTraditionalBalanceForBracket(targetBracket, ssIncome, divisor, this.state.scenario().filingStatus, 2026);

    if (maxBalance > 0) {
      const actualRmdStartYear = res.years.find(y => y.age === rmdStartAge);
      const actualBalance = actualRmdStartYear ? actualRmdStartYear.traditionalBalance : 0;

      let adviceMsg = `🎯 Target Drain-Down: To stay within the ${Math.round(targetBracket * 100)}% bracket when RMDs begin at age ${rmdStartAge}, your Traditional balance must be drawn down to exactly ${formatCurrency(maxBalance)} by that age.`;

      if (actualBalance > maxBalance) {
        adviceMsg += ` Your projected balance at age ${rmdStartAge} is ${formatCurrency(actualBalance)}, which exceeds this safe limit by ${formatCurrency(actualBalance - maxBalance)}. You need to convert more aggressively between now and age ${rmdStartAge}. Consider raising your target bracket (e.g., to 24% or 32%) in the Scenario Builder.`;
      } else {
        adviceMsg += ` Your projected balance at age ${rmdStartAge} is ${formatCurrency(actualBalance)}, so you are safely under the limit!`;
      }
      advices.push(adviceMsg);
    }

    if (assetsDiff > 0) {
      advices.push(`👍 This strategy leaves you with ${formatCurrency(assetsDiff)} more in ending assets.`);
    } else if (assetsDiff < 0) {
      advices.push(`⚠️ This strategy results in ${formatCurrency(-assetsDiff)} less in ending assets.`);
    } else {
      advices.push(`ℹ️ This strategy has no impact on your ending asset total.`);
    }

    if (taxDiff > 0 && assetsDiff > 0) {
      advices.push(`✅ Recommendation: Proceed! This is a highly optimized strategy because it both reduces your lifetime taxes and increases your overall ending assets.`);
    } else if (taxDiff > 0 || assetsDiff > 0) {
      advices.push(`⚖️ Recommendation: Consider the trade-offs. This strategy improves one metric but slightly worsens the other. Decide if the tax savings or ending balance is more important to you.`);
    } else if (taxDiff < 0 && assetsDiff < 0) {
      advices.push(`❌ Recommendation: This strategy is suboptimal under the current assumptions. Consider reducing your target conversion bracket or delaying Social Security.`);
    }

    return advices;
  });

  private toSeries(label: string, result: ScenarioResult, baseline: ScenarioResult, key: 'rmd' | 'endingAssets') {
    return [
      { name: result.scenarioName, series: result.years.map((year) => ({ name: String(year.age), value: year[key] })) },
      { name: `Baseline ${label}`, series: baseline.years.map((year) => ({ name: String(year.age), value: year[key] })) },
    ];
  }
}
