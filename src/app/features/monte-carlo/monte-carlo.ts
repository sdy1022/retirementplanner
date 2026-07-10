import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { NgxChartsModule } from '@swimlane/ngx-charts';
import { afterTaxAssetsForYear, DEFAULT_MONTE_CARLO_TRIALS, MonteCarloResult, runMonteCarloSmoothIncomeTargetAsync } from '../../core/calculators/monte-carlo';
import { RESIDUAL_TRADITIONAL_TAX_RATE, runScenario } from '../../core/calculators/scenario-engine';
import { LocalStateService } from '../../core/services/local-state.service';

@Component({
  selector: 'app-monte-carlo',
  imports: [CurrencyPipe, DecimalPipe, FormsModule, MatButtonModule, MatCardModule, MatCheckboxModule, MatProgressSpinnerModule, NgxChartsModule],
  template: `
    <section class="mc-intro">
      <mat-card>
        <mat-card-header><mat-card-title>Monte Carlo Simulation (Smooth Income Target)</mat-card-title></mat-card-header>
        <mat-card-content>
          <p class="strategy-note">
            Replays the solved conversion plan under {{ trials | number }} randomized market-return sequences instead of one
            flat rate. Returns are drawn as a block bootstrap of 1928–2025 S&amp;P 500 history (Damodaran, NYU Stern) —
            multi-year crash and boom runs (1929–32, 1973–74, 2000–02, 2008, …) replay in sequence, capturing the
            sequence-of-returns risk that iid sampling misses — with long-run compound growth matched to your assumed
            {{ scenario().assumedReturnRate * 100 | number: '1.0-1' }}% return.
          </p>
          @if (!isSmoothIncomeTarget()) {
            <p class="strategy-note mc-error">
              The current scenario uses the "{{ scenario().rothConversionStrategy.mode }}" strategy. Monte Carlo verification
              currently supports smooth-income-target only — switch the strategy on the Scenario page to run it.
            </p>
          } @else {
            <p class="guardrail-toggle">
              <mat-checkbox [(ngModel)]="useGuardrail" [disabled]="running()">
                Model adaptive spending: cut living expenses 10% and pause conversions when running &gt;20% behind
                the deterministic plan, restore once back within 5%
              </mat-checkbox>
            </p>
            <button mat-flat-button color="primary" [disabled]="running()" (click)="run()">
              {{ running() ? 'Running…' : (result() ? 'Re-run Monte Carlo' : 'Run Monte Carlo (' + (trials | number) + ' trials)') }}
            </button>
            @if (running()) {
              <div class="mc-loading"><mat-spinner diameter="24" /> <span>Simulating market paths… {{ progress() | number }} / {{ trials | number }}</span></div>
            }
            @if (error()) {
              <p class="strategy-note mc-error">⚠️ {{ error() }}</p>
            }
          }
        </mat-card-content>
      </mat-card>
    </section>

    @if (result(); as mc) {
      <section class="mc-summary">
        <mat-card>
          <mat-card-header><mat-card-title>Outcome Distribution {{ resultUsedGuardrail() ? '(adaptive spending on)' : '(fixed plan, no adaptation)' }}</mat-card-title></mat-card-header>
          <mat-card-content>
            <div class="metric"><span>Probability the plan never runs short through age {{ finalAge() }}</span><strong>{{ mc.successProbability * 100 | number: '1.1-1' }}%</strong></div>
            <div class="metric sub"><span>Mean after-tax ending assets</span><strong>{{ mc.meanEndingAssets | currency }}</strong></div>
            <div class="metric sub"><span>10th percentile (bad markets)</span><strong>{{ mc.endingAssetsPercentiles.p10 | currency }}</strong></div>
            <div class="metric sub"><span>25th percentile</span><strong>{{ mc.endingAssetsPercentiles.p25 | currency }}</strong></div>
            <div class="metric sub"><span>Median (50th percentile)</span><strong>{{ mc.endingAssetsPercentiles.p50 | currency }}</strong></div>
            <div class="metric sub"><span>75th percentile</span><strong>{{ mc.endingAssetsPercentiles.p75 | currency }}</strong></div>
            <div class="metric sub"><span>90th percentile (good markets)</span><strong>{{ mc.endingAssetsPercentiles.p90 | currency }}</strong></div>
          </mat-card-content>
        </mat-card>
      </section>
      <section class="mc-chart">
        <mat-card>
          <mat-card-header><mat-card-title>After-Tax Assets by Age — Percentile Fan</mat-card-title></mat-card-header>
          <mat-card-content>
            <p class="strategy-note">
              Each line is a percentile of after-tax assets (same liquidation-value basis as the percentiles above:
              pre-tax traditional dollars and unrealized brokerage gains discounted for the tax due if liquidated)
              across all {{ mc.trials | number }} trials at that age; the "Deterministic plan" line is the flat-
              {{ scenario().assumedReturnRate * 100 | number: '1.0-1' }}%-return projection shown on the dashboard, on
              the same after-tax basis. Where the 10th-percentile line dives toward zero is when bad market sequences
              start to break the plan.
            </p>
            <ngx-charts-line-chart [results]="fanChart()" [legend]="true" [xAxis]="true" [yAxis]="true" [autoScale]="true" />
          </mat-card-content>
        </mat-card>
      </section>
    }
  `,
  styles: `
    .mc-intro, .mc-summary, .mc-chart { margin-bottom: 20px; }
    .strategy-note { margin: 0 0 14px; padding: 10px 12px; background: #eef4fb; border-radius: 6px; font-size: 0.92rem; line-height: 1.5; color: #33475b; }
    .mc-loading { display: flex; align-items: center; gap: 10px; margin-top: 14px; color: #5a6b7c; font-size: 0.92rem; }
    .mc-error { background: #fdecea; color: #b71c1c; }
    .guardrail-toggle { margin: 0 0 14px; font-size: 0.92rem; }
    .metric { display: flex; justify-content: space-between; gap: 16px; padding: 14px 0; border-bottom: 1px solid #edf1f5; }
    .metric.sub { padding: 8px 0 8px 14px; font-size: 0.92rem; color: #5a6b7c; }
    .metric:last-child { border-bottom: 0; }
    .mc-chart mat-card-content { min-height: 380px; }
  `,
})
export class MonteCarlo {
  private readonly state = inject(LocalStateService);
  readonly trials = DEFAULT_MONTE_CARLO_TRIALS;
  readonly scenario = this.state.scenario;
  readonly result = signal<MonteCarloResult | null>(null);
  readonly resultUsedGuardrail = signal(false);
  // Plain property (not a signal) — bound via ngModel, read once when the run starts
  useGuardrail = false;
  readonly running = signal(false);
  readonly progress = signal(0);
  readonly error = signal<string | null>(null);
  readonly isSmoothIncomeTarget = computed(() => this.state.scenario().rothConversionStrategy.mode === 'smooth-income-target');
  readonly finalAge = computed(() => this.result()?.assetsByAge.at(-1)?.age ?? this.state.scenario().lifeExpectancy);

  // Percentile fan across trials, plus the deterministic flat-rate projection for reference.
  // The deterministic run reuses the same engine and the same after-tax basis as the trial
  // percentiles, so the two are directly comparable.
  readonly fanChart = computed(() => {
    const mc = this.result();
    if (!mc) return [];
    const band = (label: string, key: 'p10' | 'p25' | 'p50' | 'p75' | 'p90') => ({
      name: label,
      series: mc.assetsByAge.map((row) => ({ name: String(row.age), value: row[key] })),
    });
    const scenario = this.state.scenario();
    const residualRate = scenario.residualTaxRate ?? RESIDUAL_TRADITIONAL_TAX_RATE;
    const gainsRate = scenario.brokerageGainsTaxRate ?? 0;
    const deterministic = runScenario(scenario, this.state.accounts());
    return [
      band('90th percentile (good markets)', 'p90'),
      band('75th percentile', 'p75'),
      band('Median', 'p50'),
      band('25th percentile', 'p25'),
      band('10th percentile (bad markets)', 'p10'),
      {
        name: 'Deterministic plan',
        series: deterministic.years.map((year) => ({ name: String(year.age), value: afterTaxAssetsForYear(year, residualRate, gainsRate) })),
      },
    ];
  });

  // Runs on click via the chunked async runner, which yields the main thread between
  // chunks so the spinner and progress keep painting during the multi-second run.
  async run(): Promise<void> {
    this.running.set(true);
    this.progress.set(0);
    this.error.set(null);
    const scenario = this.state.scenario();
    const accounts = this.state.accounts();
    const useGuardrail = this.useGuardrail;
    try {
      const result = await runMonteCarloSmoothIncomeTargetAsync(
        scenario, accounts, this.trials, Date.now(), useGuardrail,
        (done) => this.progress.set(done),
      );
      this.result.set(result);
      this.resultUsedGuardrail.set(useGuardrail);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Monte Carlo simulation failed.');
    } finally {
      this.running.set(false);
    }
  }
}
