import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { NgxChartsModule } from '@swimlane/ngx-charts';
import { afterTaxAssetsForYear, DEFAULT_MONTE_CARLO_TRIALS, MonteCarloResult, StochasticLongevityResult } from '../../core/calculators/monte-carlo';
import { RESIDUAL_TRADITIONAL_TAX_RATE, runScenario } from '../../core/calculators/scenario-engine';
import { downloadFile, escapeCsvField, exportFilename } from '../../core/services/export.service';
import { LocalStateService } from '../../core/services/local-state.service';
import { MonteCarloWorkerService } from '../../core/services/monte-carlo-worker.service';
import { RetirementAgeSearchResult } from '../../core/calculators/retirement-age-search';

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
            flat rate. Returns are drawn as a joint block bootstrap of 1928–2025 S&amp;P 500 and 10-year Treasury history (Damodaran, NYU Stern) —
            multi-year crash and boom runs (1929–32, 1973–74, 2000–02, 2008, …) replay in sequence, capturing the
            sequence-of-returns risk that iid sampling misses — with long-run compound growth matched to your assumed
            {{ scenario().assumedReturnRate * 100 | number: '1.0-1' }}% portfolio return ({{ (scenario().stockAllocation ?? 1) * 100 | number: '1.0-0' }}% stocks / {{ (1 - (scenario().stockAllocation ?? 1)) * 100 | number: '1.0-0' }}% bonds).
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
            @if (useGuardrail) {
              <div class="guardrail-example">
                <p class="strategy-note">
                  <strong>How the guardrail works — a worked example.</strong> At the start of each simulated year, the
                  assets you actually carry into the year are compared against what the deterministic plan (the dashboard's
                  flat-return projection) says you would have at the same age. Three rules follow from that ratio:
                </p>
                <div class="example-scroll">
                  <table class="example-table">
                    <thead>
                      <tr><th>Age</th><th>Plan balance</th><th>Actual balance</th><th>Actual ÷ plan</th><th>Guardrail action</th></tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>67</td><td>$2,000,000</td><td>$1,980,000</td><td>99%</td>
                        <td>On track — full spending, this year's Roth conversion proceeds as planned.</td>
                      </tr>
                      <tr class="cut">
                        <td>68</td><td>$2,050,000</td><td>$1,540,000</td><td>75%</td>
                        <td><strong>More than 20% behind (ratio below 80%) → cut mode:</strong> spend 10% less this year and
                          skip this year's Roth conversion, so no depressed assets are sold to pay conversion tax.</td>
                      </tr>
                      <tr class="cut">
                        <td>69</td><td>$2,100,000</td><td>$1,790,000</td><td>85%</td>
                        <td><strong>Still in cut mode.</strong> The ratio is back above the 80% trigger, but restoring requires
                          95% — this gap (hysteresis) stops spending from flip-flopping up and down each year while assets
                          hover near the trigger.</td>
                      </tr>
                      <tr>
                        <td>70</td><td>$2,160,000</td><td>$2,110,000</td><td>98%</td>
                        <td><strong>Recovered past 95% → cut mode ends:</strong> full spending and Roth conversions resume.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p class="strategy-note">
                  Why this helps: dollars not spent in a down year stay invested and compound through the recovery, and a
                  paused conversion defers its tax bill instead of paying it by selling depressed assets. The cut is
                  deliberately modest, so it lifts a <em>marginal</em> plan's success probability by a few points but cannot
                  rescue a structurally underfunded one — if the guardrail barely moves your number, the plan was either
                  already safe or short by far more than 10% of spending.
                </p>
              </div>
            }
            <button mat-flat-button color="primary" [disabled]="running()" (click)="run()">
              {{ running() ? 'Running…' : (result() ? 'Re-run Monte Carlo' : 'Run Monte Carlo (' + (trials | number) + ' trials)') }}
            </button>
            @if (running()) {
              <div class="mc-loading"><mat-spinner diameter="24" /> <span>Simulating market paths… {{ progress() | number }} / {{ trials | number }}</span></div>
            }
            @if (result()) {
              <span class="export-group">
                <button mat-button (click)="exportMonteCarloCsv()" id="export-mc-csv-btn" class="mc-export-btn">📥 Export CSV</button>
                <button mat-button (click)="printReport()" id="print-mc-pdf-btn" class="mc-export-btn">🖨️ Print PDF</button>
              </span>
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
            <div class="metric"><span>Model success rate through age {{ finalAge() }}</span><strong>{{ mc.successProbability * 100 | number: '1.0-0' }}%</strong></div>
            <p class="strategy-note mc-disclaimer">
              This is a model-conditional success rate, not a calibrated real-world probability. It uses the scenario-level stock/bond allocation with annual rebalancing, fixed 3% inflation, a fixed strategy that only adapts via the guardrail below
              (if enabled), and a fixed life expectancy. Depending on assumptions not yet modeled — asset allocation,
              inflation variability, longevity, long-term care — the realistic range could differ by roughly 10
              percentage points or more. Use this number to compare strategies against each other and to stress-test
              a plan, not as a literal probability of success.
            </p>
            @if (resultUsedGuardrail() && mc.guardrailStats; as gr) {
              <div class="metric sub guardrail-stat">
                <span>Guardrail triggered in this many trials</span>
                <strong>{{ gr.triggeredProbability * 100 | number: '1.0-0' }}%</strong>
              </div>
              <p class="strategy-note mc-sub-note">
                Among trials where it triggered, the plan spent a median of {{ gr.medianYearsInCutMode }} year(s) in
                cut mode (average {{ gr.meanYearsInCutMode | number: '1.0-1' }} years, longest consecutive cuts averaged {{ gr.meanConsecutiveCutYears | number: '1.0-1' }} years).
                The average consumption realization rate across all trials was {{ gr.meanConsumptionRealization * 100 | number: '1.0-1' }}%
                (10th percentile: {{ gr.p10ConsumptionRealization * 100 | number: '1.0-1' }}%).
              </p>
            }
            @if (mc.failureStats; as fs) {
              <div class="metric sub failure-stat">
                <span>Among failed trials, typical lifetime shortfall</span>
                <strong>{{ fs.medianShortfall | currency: 'USD':'symbol':'1.0-0' }}</strong>
              </div>
              <p class="strategy-note mc-sub-note">
                Worst 10% of failed trials fell short by {{ fs.p90Shortfall | currency: 'USD':'symbol':'1.0-0' }} or
                more — a failed trial isn't necessarily a near-miss.
              </p>
            }
            <div class="metric sub"><span>Mean after-tax ending assets</span><strong>{{ mc.meanEndingAssets | currency }}</strong></div>
            <div class="metric sub"><span>10th percentile (bad markets)</span><strong>{{ mc.endingAssetsPercentiles.p10 | currency }}</strong></div>
            <div class="metric sub"><span>25th percentile</span><strong>{{ mc.endingAssetsPercentiles.p25 | currency }}</strong></div>
            <div class="metric sub"><span>Median (50th percentile)</span><strong>{{ mc.endingAssetsPercentiles.p50 | currency }}</strong></div>
            <div class="metric sub"><span>75th percentile</span><strong>{{ mc.endingAssetsPercentiles.p75 | currency }}</strong></div>
            <div class="metric sub"><span>90th percentile (good markets)</span><strong>{{ mc.endingAssetsPercentiles.p90 | currency }}</strong></div>
          </mat-card-content>
        </mat-card>
      </section>

      <section class="mc-sensitivity">
        <mat-card>
          <mat-card-header><mat-card-title>Return-Rate Sensitivity</mat-card-title></mat-card-header>
          <mat-card-content>
            <p class="strategy-note">
              Re-runs the same plan at ±1 percentage point around your assumed
              {{ scenario().assumedReturnRate * 100 | number: '1.0-0' }}% return (smaller trial count, so results are
              directionally reliable but noisier than the main run above) to show how much the model success rate
              hinges on that single assumption.
            </p>
            @if (!sensitivityResult()) {
              <button mat-stroked-button [disabled]="sensitivityRunning()" (click)="runSensitivity()">
                {{ sensitivityRunning() ? 'Running…' : 'Show return-rate sensitivity' }}
              </button>
            } @else {
              <table class="sensitivity-table">
                <thead><tr><th>Assumed return</th><th>Guardrail off</th><th>Guardrail on</th></tr></thead>
                <tbody>
                  @for (row of sensitivityResult(); track row.label) {
                    <tr [class.current]="row.isBase">
                      <td>{{ row.label }}</td>
                      <td>{{ row.noGuardrail * 100 | number: '1.0-0' }}%</td><td>{{ row.guardrail * 100 | number: '1.0-0' }}%</td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          </mat-card-content>
        </mat-card>
      </section>

      <section class="mc-sensitivity">
        <mat-card>
          <mat-card-header><mat-card-title>Longevity Sensitivity</mat-card-title></mat-card-header>
          <mat-card-content>
            <p class="strategy-note">
              Re-runs the plan assuming you live to age 90, 95, or 100 to show how longevity risk impacts your model success rate.
            </p>
            @if (!longevityResult()) {
              <button mat-stroked-button [disabled]="longevityRunning()" (click)="runLongevity()">
                {{ longevityRunning() ? 'Running…' : 'Show longevity sensitivity' }}
              </button>
            } @else {
              <table class="sensitivity-table">
                <thead><tr><th>End Age</th><th>Model success rate</th></tr></thead>
                <tbody>
                  @for (row of longevityResult(); track row.age) {
                    <tr [class.current]="row.isBase">
                      <td>{{ row.age }}</td>
                      <td>{{ row.successProbability * 100 | number: '1.0-0' }}%</td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          </mat-card-content>
        </mat-card>
      </section>
      <section class="mc-sensitivity">
        <mat-card>
          <mat-card-header><mat-card-title>SSA Stochastic Longevity</mat-card-title></mat-card-header>
          <mat-card-content>
            <p class="strategy-note">
              Samples a death age independently for each trial using the SSA 2023 period life table. Market and mortality random streams are separated, so longevity sampling does not reshuffle the market path. Keep the fixed age 90/95/100 table above as the conservative stress test.
            </p>
            <div class="search-grid">
              <label>Primary sex
                <select [(ngModel)]="primarySex"><option value="male">Male</option><option value="female">Female</option></select>
              </label>
              @if (scenario().filingStatus === 'married_filing_jointly' && scenario().spouseCurrentAge != null) {
                <label>Spouse sex
                  <select [(ngModel)]="spouseSex"><option value="male">Male</option><option value="female">Female</option></select>
                </label>
              }
              <label>Maximum modeled age <input type="number" min="90" max="120" [(ngModel)]="maximumMortalityAge" /></label>
            </div>
            <button mat-stroked-button [disabled]="stochasticLongevityRunning()" (click)="runStochasticLongevity()">
              {{ stochasticLongevityRunning() ? 'Running…' : 'Run mortality-weighted analysis' }}
            </button>
            @if (stochasticLongevityResult(); as stochastic) {
              <div class="metric"><span>Mortality-weighted model success rate</span><strong>{{ stochastic.successProbability * 100 | number:'1.0-0' }}%</strong></div>
              <div class="metric sub"><span>Median primary death age</span><strong>{{ stochastic.longevityStats.medianPrimaryDeathAge }}</strong></div>
              @if (stochastic.longevityStats.medianSpouseDeathAge != null) {
                <div class="metric sub"><span>Median spouse death age</span><strong>{{ stochastic.longevityStats.medianSpouseDeathAge }}</strong></div>
                <div class="metric sub"><span>Median first death age (primary-age timeline)</span><strong>{{ stochastic.longevityStats.medianFirstDeathAge }}</strong></div>
              }
              <div class="metric sub"><span>Median last-survivor age</span><strong>{{ stochastic.longevityStats.medianLastSurvivorAge }}</strong></div>
              <div class="metric sub"><span>10th–90th percentile last-survivor age</span><strong>{{ stochastic.longevityStats.p10LastSurvivorAge }}–{{ stochastic.longevityStats.p90LastSurvivorAge }}</strong></div>
              <div class="metric sub"><span>Last survivor reaches age 95</span><strong>{{ stochastic.longevityStats.probabilityLastSurvivorTo95 * 100 | number:'1.0-0' }}%</strong></div>
              <div class="metric sub"><span>Last survivor reaches age 100</span><strong>{{ stochastic.longevityStats.probabilityLastSurvivorTo100 * 100 | number:'1.0-0' }}%</strong></div>
              <p class="strategy-note mc-disclaimer">{{ stochastic.mortalitySource }}. Population-level mortality does not reflect personal health, smoking, family history, or socioeconomic factors.</p>
            }
          </mat-card-content>
        </mat-card>
      </section>

      <section class="mc-sensitivity">
        <mat-card>
          <mat-card-header><mat-card-title>Estimated Earliest Feasible Retirement Age</mat-card-title></mat-card-header>
          <mat-card-content>
            <p class="strategy-note">Searches each candidate age with the same market paths. Qualification requires both the selected model-success rate and consumption realization through the planning age.</p>
            <div class="search-grid">
              <label>From age <input type="number" [(ngModel)]="retirementSearchMinAge" /></label>
              <label>To age <input type="number" [(ngModel)]="retirementSearchMaxAge" /></label>
              <label>Success threshold <input type="number" step="0.01" [(ngModel)]="retirementSuccessThreshold" /></label>
              <label>Consumption threshold <input type="number" step="0.01" [(ngModel)]="retirementConsumptionThreshold" /></label>
              <label>Plan through age <input type="number" [(ngModel)]="retirementPlanningAge" /></label>
            </div>
            <button mat-stroked-button [disabled]="retirementAgeRunning()" (click)="runRetirementAgeSearch()">{{ retirementAgeRunning() ? 'Searching…' : 'Find earliest feasible age' }}</button>
            @if (retirementAgeResult(); as search) {
              <h3>{{ search.earliestFeasibleAge ? 'Earliest qualifying age: ' + search.earliestFeasibleAge : 'No tested age qualified' }}</h3>
              <table class="sensitivity-table"><thead><tr><th>Age</th><th>Success</th><th>Consumption</th><th>Guardrail trigger</th><th>Qualifies</th></tr></thead><tbody>
                @for (row of search.rows; track row.retirementAge) {<tr [class.current]="row.qualifies"><td>{{ row.retirementAge }}</td><td>{{ row.successProbability * 100 | number:'1.0-0' }}%</td><td>{{ row.consumptionRealization * 100 | number:'1.0-0' }}%</td><td>{{ row.guardrailTriggerRate * 100 | number:'1.0-0' }}%</td><td>{{ row.qualifies ? 'Yes' : 'No' }}</td></tr>}
              </tbody></table>
            }
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
    .mc-intro, .mc-summary, .mc-chart, .mc-sensitivity { margin-bottom: 20px; }
    .strategy-note { margin: 0 0 14px; padding: 10px 12px; background: #eef4fb; border-radius: 6px; font-size: 0.92rem; line-height: 1.5; color: #33475b; }
    .mc-disclaimer { margin-top: 4px; }
    .mc-sub-note { font-size: 0.85rem; margin: -4px 0 12px 14px; }
    .mc-loading { display: flex; align-items: center; gap: 10px; margin-top: 14px; color: #5a6b7c; font-size: 0.92rem; }
    .mc-error { background: #fdecea; color: #b71c1c; }
    .guardrail-toggle { margin: 0 0 14px; font-size: 0.92rem; }
    .guardrail-example { margin: 0 0 14px; }
    .example-scroll { overflow-x: auto; margin: 0 0 14px; }
    .example-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; line-height: 1.45; }
    .example-table th, .example-table td { padding: 8px 12px; border: 1px solid #dde5ec; text-align: left; vertical-align: top; }
    .example-table thead th { background: #f2f6fa; white-space: nowrap; }
    .example-table td:nth-child(-n+4) { white-space: nowrap; }
    .example-table tr.cut { background: #fff7ec; }
    .metric { display: flex; justify-content: space-between; gap: 16px; padding: 14px 0; border-bottom: 1px solid #edf1f5; }
    .metric.sub { padding: 8px 0 8px 14px; font-size: 0.92rem; color: #5a6b7c; }
    .metric:last-child { border-bottom: 0; }
    .mc-chart mat-card-content { min-height: 380px; }
    .mc-export-btn { margin-left: 10px; font-size: 0.85rem; text-transform: none; }
    .export-group { display: inline-flex; }
    .sensitivity-table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
    .sensitivity-table th, .sensitivity-table td { padding: 8px 12px; border: 1px solid #dde5ec; text-align: left; }
    .sensitivity-table thead th { background: #f2f6fa; }
    .sensitivity-table tr.current { background: #eef4fb; font-weight: 600; }
    .search-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:10px; margin-bottom:12px; }
    .search-grid label { display:flex; flex-direction:column; gap:4px; font-size:.85rem; }
    .search-grid input, .search-grid select { padding:7px; }
    @media print {
      button, .guardrail-toggle, .guardrail-example, .mc-loading, .mc-error, .export-group { display: none !important; }
      mat-card { box-shadow: none !important; border: 1px solid #ddd; margin-bottom: 24px; page-break-inside: avoid; }
      .mc-intro, .mc-summary, .mc-chart, .mc-sensitivity { display: block; }
      .mc-summary { page-break-inside: avoid; }
      .mc-chart { page-break-inside: avoid; page-break-before: auto; }
      .mc-sensitivity { page-break-inside: avoid; }
    }
  `,
})
export class MonteCarlo {
  private readonly state = inject(LocalStateService);
  private readonly worker = inject(MonteCarloWorkerService);
  readonly trials = DEFAULT_MONTE_CARLO_TRIALS;
  readonly scenario = this.state.scenario;
  readonly result = signal<MonteCarloResult | null>(null);
  readonly resultUsedGuardrail = signal(false);
  // Plain property (not a signal) — bound via ngModel, read once when the run starts
  useGuardrail = false;
  readonly running = signal(false);
  readonly progress = signal(0);
  readonly error = signal<string | null>(null);
  private lastSeed = 0;
  readonly isSmoothIncomeTarget = computed(() => this.state.scenario().rothConversionStrategy.mode === 'smooth-income-target');
  readonly finalAge = computed(() => this.result()?.assetsByAge.at(-1)?.age ?? this.state.scenario().lifeExpectancy);

  // Smaller trial count than the main run — sensitivity is meant to be a quick, directional
  // check ("how much does 87% move if the return assumption is off by a point?"), not a
  // second full-precision run.
  private static readonly SENSITIVITY_TRIALS = 2000;
  readonly sensitivityRunning = signal(false);
  readonly sensitivityResult = signal<{ label: string; noGuardrail: number; guardrail: number; isBase: boolean }[] | null>(null);


  readonly retirementAgeRunning = signal(false);
  readonly retirementAgeResult = signal<RetirementAgeSearchResult | null>(null);
  retirementSearchMinAge = Math.ceil(this.state.scenario().currentAge);
  retirementSearchMaxAge = Math.max(this.retirementSearchMinAge, this.state.scenario().retirementAge + 10);
  retirementSuccessThreshold = 0.85;
  retirementConsumptionThreshold = 0.90;
  retirementPlanningAge = 95;

  readonly longevityRunning = signal(false);
  readonly longevityResult = signal<{ age: number; successProbability: number; isBase: boolean }[] | null>(null);
  readonly stochasticLongevityRunning = signal(false);
  readonly stochasticLongevityResult = signal<StochasticLongevityResult | null>(null);
  primarySex: 'male' | 'female' = 'male';
  spouseSex: 'male' | 'female' = 'female';
  maximumMortalityAge = 110;

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
    this.sensitivityResult.set(null);
    const scenario = this.state.scenario();
    const accounts = this.state.accounts();
    const useGuardrail = this.useGuardrail;
    try {
      this.lastSeed = Date.now();
      const result = await this.worker.run(
        scenario, accounts, this.trials, this.lastSeed, useGuardrail,
        (p) => this.progress.set(p.completed),
      );
      this.progress.set(this.trials);
      this.result.set(result);
      this.resultUsedGuardrail.set(useGuardrail);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Monte Carlo simulation failed.');
    } finally {
      this.running.set(false);
    }
  }

  // Re-runs the plan at ±1 percentage point around the assumed return rate, at a reduced
  // trial count, so the user can see how much the headline success rate hinges on that one
  // assumption without editing the scenario and re-running by hand. Reuses the main run's
  // result for the base case rather than recomputing it.
  async runSensitivity(): Promise<void> {
    if (!this.result()) return;
    this.sensitivityRunning.set(true);
    const scenario = this.state.scenario();
    const accounts = this.state.accounts();
    const seed = this.lastSeed || Date.now();
    try {
      const rates = [scenario.assumedReturnRate - 0.01, scenario.assumedReturnRate, scenario.assumedReturnRate + 0.01];
      const rows = [];
      for (const rate of rates) {
        const candidate = { ...scenario, assumedReturnRate: rate };
        const [noGuardrail, guardrail] = await Promise.all([
          this.worker.run(candidate, accounts, MonteCarlo.SENSITIVITY_TRIALS, seed, false),
          this.worker.run(candidate, accounts, MonteCarlo.SENSITIVITY_TRIALS, seed, true),
        ]);
        rows.push({
          label: `${Math.round(rate * 100)}% return`,
          noGuardrail: noGuardrail.successProbability,
          guardrail: guardrail.successProbability,
          isBase: Math.abs(rate - scenario.assumedReturnRate) < 1e-9,
        });
      }
      this.sensitivityResult.set(rows);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Sensitivity run failed.');
    } finally {
      this.sensitivityRunning.set(false);
    }
  }

  async runRetirementAgeSearch(): Promise<void> {
    this.retirementAgeRunning.set(true);
    this.retirementAgeResult.set(null);
    try {
      const result = await this.worker.searchRetirementAge(
        this.state.scenario(),
        this.state.accounts(),
        this.retirementSearchMinAge,
        this.retirementSearchMaxAge,
        {
          minimumSuccessRate: this.retirementSuccessThreshold,
          minimumConsumptionRealization: this.retirementConsumptionThreshold,
          planningAge: this.retirementPlanningAge,
        },
        MonteCarlo.SENSITIVITY_TRIALS,
        this.lastSeed || Date.now(),
        this.useGuardrail,
      );
      this.retirementAgeResult.set(result);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Retirement-age search failed.');
    } finally {
      this.retirementAgeRunning.set(false);
    }
  }

  async runStochasticLongevity(): Promise<void> {
    this.stochasticLongevityRunning.set(true);
    this.stochasticLongevityResult.set(null);
    try {
      const result = await this.worker.runStochasticLongevity(
        this.state.scenario(),
        this.state.accounts(),
        { primarySex: this.primarySex, spouseSex: this.spouseSex, maximumAge: this.maximumMortalityAge },
        MonteCarlo.SENSITIVITY_TRIALS,
        this.lastSeed || Date.now(),
        this.resultUsedGuardrail(),
      );
      this.stochasticLongevityResult.set(result);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Stochastic longevity run failed.');
    } finally {
      this.stochasticLongevityRunning.set(false);
    }
  }

  async runLongevity(): Promise<void> {
    const mainResult = this.result();
    if (!mainResult) return;
    this.longevityRunning.set(true);
    const scenario = this.state.scenario();
    const accounts = this.state.accounts();
    const useGuardrail = this.resultUsedGuardrail();
    const seed = this.lastSeed || Date.now();
    try {
      const targetAges = [90, 95, 100];
      const results = await Promise.all(targetAges.map(age => 
        age === scenario.lifeExpectancy 
          ? mainResult 
          : this.worker.run(
              { ...scenario, lifeExpectancy: age },
              accounts, MonteCarlo.SENSITIVITY_TRIALS, seed, useGuardrail
            )
      ));
      
      this.longevityResult.set(results.map((res, i) => ({
        age: targetAges[i],
        successProbability: res.successProbability,
        isBase: targetAges[i] === scenario.lifeExpectancy
      })));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Longevity run failed.');
    } finally {
      this.longevityRunning.set(false);
    }
  }

  // ── Export ────────────────────────────────────────────────────────────────

  /** Export Monte Carlo results as CSV: metadata header + percentile fan chart data. */
  exportMonteCarloCsv(): void {
    const mc = this.result()!;
    const scenario = this.state.scenario();

    // Metadata section — key-value pairs describing the simulation run
    const metaRows: [string, string | number][] = [
      ['trials', mc.trials],
      ['successProbability', mc.successProbability],
      ['meanEndingAssets', mc.meanEndingAssets],
      ['p10EndingAssets', mc.endingAssetsPercentiles.p10],
      ['p25EndingAssets', mc.endingAssetsPercentiles.p25],
      ['p50EndingAssets', mc.endingAssetsPercentiles.p50],
      ['p75EndingAssets', mc.endingAssetsPercentiles.p75],
      ['p90EndingAssets', mc.endingAssetsPercentiles.p90],
      ['guardrailEnabled', this.resultUsedGuardrail() ? 'true' : 'false'],
      ['assumedReturnRate', scenario.assumedReturnRate],
      ['strategyMode', scenario.rothConversionStrategy.mode],
      ['exportedAt', new Date().toISOString()],
    ];
    if (mc.guardrailStats) {
      metaRows.push(
        ['guardrailTriggeredProbability', mc.guardrailStats.triggeredProbability],
        ['guardrailMedianYearsInCutMode', mc.guardrailStats.medianYearsInCutMode],
        ['guardrailP90YearsInCutMode', mc.guardrailStats.p90YearsInCutMode],
      );
    }
    if (mc.failureStats) {
      metaRows.push(
        ['failureMedianShortfall', mc.failureStats.medianShortfall],
        ['failureP90Shortfall', mc.failureStats.p90Shortfall],
      );
    }

    // Deterministic comparison line on the same after-tax basis as the fan chart
    const residualRate = scenario.residualTaxRate ?? RESIDUAL_TRADITIONAL_TAX_RATE;
    const gainsRate = scenario.brokerageGainsTaxRate ?? 0;
    const deterministic = runScenario(scenario, this.state.accounts());
    const detByAge = new Map(
      deterministic.years.map(y => [y.age, afterTaxAssetsForYear(y, residualRate, gainsRate)])
    );

    // Fan chart data section
    const dataHeaders = ['age', 'p10', 'p25', 'p50', 'p75', 'p90', 'deterministic'];
    const dataRows = mc.assetsByAge.map(row => [
      row.age, row.p10, row.p25, row.p50, row.p75, row.p90,
      detByAge.get(row.age) ?? '',
    ]);

    // Build combined CSV: metadata header block, blank separator, percentile data
    const BOM = '\uFEFF';
    const lines = [
      'key,value',
      ...metaRows.map(([k, v]) => `${escapeCsvField(k)},${escapeCsvField(v)}`),
      '',
      dataHeaders.map(escapeCsvField).join(','),
      ...dataRows.map(row => row.map(escapeCsvField).join(',')),
    ];

    const content = BOM + lines.join('\r\n') + '\r\n';
    downloadFile(exportFilename('monte-carlo', 'csv'), content, 'text/csv;charset=utf-8');
  }

  /** Trigger browser native print to generate PDF */
  printReport(): void {
    window.print();
  }
}
