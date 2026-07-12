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
import { downloadFile, escapeCsvField, exportFilename } from '../../core/services/export.service';
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
              <button mat-button (click)="exportMonteCarloCsv()" id="export-mc-csv-btn" class="mc-export-btn">📥 Export Monte Carlo CSV</button>
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
}
