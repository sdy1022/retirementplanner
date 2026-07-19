import { DecimalPipe, PercentPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MonteCarloResult } from '../../core/calculators/monte-carlo';
import { buildComparisonScenario, StrategyComparisonOption } from '../../core/calculators/strategy-comparison';
import { LocalStateService } from '../../core/services/local-state.service';
import { MonteCarloWorkerService } from '../../core/services/monte-carlo-worker.service';

interface ComparisonRow {
  option: StrategyComparisonOption;
  result: MonteCarloResult;
  successDelta: number;
  medianDelta: number;
}

@Component({
  selector: 'app-strategy-comparison',
  imports: [FormsModule, MatButtonModule, MatCardModule, MatIconModule, DecimalPipe, PercentPipe],
  template: `
    <section class="page-header">
      <div>
        <h1>Same-Seed Strategy Comparison</h1>
        <p>Compare up to three strategies against exactly the same simulated market and inflation paths.</p>
      </div>
      <a mat-stroked-button href="/qa/golden-scenarios" target="_blank" rel="noopener">
        <mat-icon>verified</mat-icon>
        Golden Scenarios
      </a>
    </section>

    <mat-card class="explanation">
      <mat-card-content>
        <strong>Why the same seed?</strong>
        Each strategy receives the same random seed, trial count, accounts, historical return blocks, and CPI draws.
        The differences below therefore reflect strategy choices more than random luck. The saved scenario is never changed.
      </mat-card-content>
    </mat-card>

    <section class="run-settings">
      <label>Seed <input type="number" [(ngModel)]="seed" /></label>
      <label>Trials <input type="number" min="100" max="20000" step="100" [(ngModel)]="trials" /></label>
      <button mat-flat-button [disabled]="running()" (click)="runComparison()">
        <mat-icon>compare_arrows</mat-icon>
        {{ running() ? 'Comparing…' : 'Run same-seed comparison' }}
      </button>
    </section>

    <section class="strategy-grid">
      @for (option of options; track $index; let i = $index) {
        <mat-card>
          <mat-card-header>
            <mat-card-title>{{ i === 0 ? 'Baseline' : 'Option ' + (i + 1) }}</mat-card-title>
          </mat-card-header>
          <mat-card-content class="strategy-form">
            <label>Name <input [(ngModel)]="option.name" /></label>
            <label>Retirement age <input type="number" [min]="scenario().currentAge" max="80" [(ngModel)]="option.retirementAge" /></label>
            <label>Stock allocation % <input type="number" min="0" max="100" step="5" [ngModel]="option.stockAllocation * 100" (ngModelChange)="setAllocation(option, $event)" /></label>
            <label>Roth conversion
              <select [(ngModel)]="option.conversionMode">
                <option value="current">Use saved strategy</option>
                <option value="none">No conversions</option>
              </select>
            </label>
            <label class="checkbox"><input type="checkbox" [(ngModel)]="option.useGuardrail" /> Adaptive spending guardrail</label>
          </mat-card-content>
        </mat-card>
      }
    </section>

    @if (running()) {
      <mat-card class="progress-card"><mat-card-content>
        Running strategy {{ currentStrategy() }} of {{ options.length }} — {{ progress() }}%
        <div class="progress-track"><div class="progress-fill" [style.width.%]="progress()"></div></div>
      </mat-card-content></mat-card>
    }

    @if (error()) {
      <mat-card class="error"><mat-card-content>{{ error() }}</mat-card-content></mat-card>
    }

    @if (rows(); as comparisonRows) {
      <mat-card class="results">
        <mat-card-header><mat-card-title>Comparison Results</mat-card-title></mat-card-header>
        <mat-card-content>
          <p class="note">Deltas are relative to the baseline. Positive success-rate and ending-asset deltas are better.</p>
          <div class="table-scroll">
            <table>
              <thead><tr>
                <th>Strategy</th><th>Retire</th><th>Stocks</th><th>Guardrail</th><th>Success</th><th>Δ Success</th><th>Median ending assets</th><th>Δ Median</th><th>10th percentile</th><th>Consumption</th>
              </tr></thead>
              <tbody>
                @for (row of comparisonRows; track row.option.name; let i = $index) {
                  <tr [class.baseline]="i === 0" [class.best]="isBest(row)">
                    <td><strong>{{ row.option.name }}</strong></td>
                    <td>{{ row.option.retirementAge }}</td>
                    <td>{{ row.option.stockAllocation | percent:'1.0-0' }}</td>
                    <td>{{ row.option.useGuardrail ? 'On' : 'Off' }}</td>
                    <td>{{ row.result.successProbability | percent:'1.1-1' }}</td>
                    <td>{{ signedPercent(row.successDelta) }}</td>
                    <td>{{ row.result.endingAssetsPercentiles.p50 | number:'1.0-0' }}</td>
                    <td>{{ signedCurrency(row.medianDelta) }}</td>
                    <td>{{ row.result.endingAssetsPercentiles.p10 | number:'1.0-0' }}</td>
                    <td>{{ consumption(row.result) | percent:'1.1-1' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <p class="note">A higher success rate can come with lower consumption when the guardrail is enabled. Review both columns rather than choosing on success rate alone.</p>
        </mat-card-content>
      </mat-card>
    }
  `,
  styles: `
    :host { display:block; max-width:1500px; margin:0 auto; }
    .page-header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:16px; }
    h1 { margin:0 0 6px; } .page-header p { margin:0; color:#59697a; }
    .explanation, .progress-card, .results, .error { margin-bottom:18px; }
    .run-settings { display:flex; flex-wrap:wrap; align-items:end; gap:14px; margin:18px 0; }
    label { display:flex; flex-direction:column; gap:5px; font-size:.88rem; color:#405064; }
    input, select { box-sizing:border-box; width:100%; padding:9px 10px; border:1px solid #cbd5df; border-radius:5px; background:white; }
    .run-settings input { width:150px; }
    .strategy-grid { display:grid; grid-template-columns:repeat(3,minmax(240px,1fr)); gap:16px; margin-bottom:18px; }
    .strategy-form { display:grid; gap:12px; padding-top:10px; }
    .checkbox { flex-direction:row; align-items:center; } .checkbox input { width:auto; }
    .progress-track { height:8px; background:#e4eaf0; border-radius:5px; margin-top:10px; overflow:hidden; }
    .progress-fill { height:100%; background:#486f9f; transition:width .15s ease; }
    .error { color:#a51d1d; background:#fff1f1; }
    .table-scroll { overflow-x:auto; }
    table { width:100%; border-collapse:collapse; white-space:nowrap; }
    th, td { padding:10px 12px; border:1px solid #dce3ea; text-align:right; }
    th:first-child, td:first-child { text-align:left; }
    thead th { background:#f1f5f9; }
    tr.baseline { background:#f8fafc; }
    tr.best { outline:2px solid #87a8cc; outline-offset:-2px; }
    .note { color:#58697a; font-size:.9rem; line-height:1.45; }
    @media (max-width:900px) { .strategy-grid { grid-template-columns:1fr; } .page-header { flex-direction:column; } }
  `,
})
export class StrategyComparison {
  private readonly state = inject(LocalStateService);
  private readonly worker = inject(MonteCarloWorkerService);
  readonly scenario = this.state.scenario;
  seed = 20260718;
  trials = 1000;
  readonly running = signal(false);
  readonly progress = signal(0);
  readonly currentStrategy = signal(0);
  readonly error = signal<string | null>(null);
  readonly rows = signal<ComparisonRow[] | null>(null);

  readonly options: StrategyComparisonOption[] = this.defaultOptions();

  async runComparison(): Promise<void> {
    this.running.set(true);
    this.error.set(null);
    this.rows.set(null);
    this.progress.set(0);
    const safeTrials = Math.max(100, Math.min(20000, Math.floor(this.trials || 1000)));
    const safeSeed = Math.floor(this.seed || 20260718);
    const completed: { option: StrategyComparisonOption; result: MonteCarloResult }[] = [];

    try {
      for (let index = 0; index < this.options.length; index++) {
        this.currentStrategy.set(index + 1);
        const option = { ...this.options[index] };
        const comparedScenario = buildComparisonScenario(this.scenario(), option);
        const result = await this.worker.run(
          comparedScenario,
          this.state.accounts(),
          safeTrials,
          safeSeed,
          option.useGuardrail,
          ({ completed: done, total }) => this.progress.set(Math.round(((index + done / total) / this.options.length) * 100)),
        );
        completed.push({ option, result });
      }
      const baseline = completed[0].result;
      this.rows.set(completed.map(({ option, result }) => ({
        option,
        result,
        successDelta: result.successProbability - baseline.successProbability,
        medianDelta: result.endingAssetsPercentiles.p50 - baseline.endingAssetsPercentiles.p50,
      })));
      this.progress.set(100);
    } catch (cause) {
      this.error.set(cause instanceof Error ? cause.message : String(cause));
    } finally {
      this.running.set(false);
    }
  }

  setAllocation(option: StrategyComparisonOption, percent: number): void {
    option.stockAllocation = Math.max(0, Math.min(1, Number(percent) / 100));
  }

  consumption(result: MonteCarloResult): number {
    return result.guardrailStats?.meanConsumptionRealization ?? 1;
  }

  signedPercent(value: number): string {
    const percentage = value * 100;
    return `${percentage >= 0 ? '+' : ''}${percentage.toFixed(1)} pts`;
  }

  signedCurrency(value: number): string {
    const rounded = Math.round(value);
    return `${rounded >= 0 ? '+' : '-'}$${Math.abs(rounded).toLocaleString()}`;
  }

  isBest(row: ComparisonRow): boolean {
    const all = this.rows();
    if (!all?.length) return false;
    return row.result.successProbability === Math.max(...all.map((item) => item.result.successProbability));
  }

  private defaultOptions(): StrategyComparisonOption[] {
    const scenario = this.state.scenario();
    const stockAllocation = scenario.stockAllocation ?? 1;
    return [
      { name: 'Current plan', retirementAge: scenario.retirementAge, stockAllocation, useGuardrail: false, conversionMode: 'current' },
      { name: 'Retire 2 years later', retirementAge: scenario.retirementAge + 2, stockAllocation, useGuardrail: false, conversionMode: 'current' },
      { name: 'Current plan + guardrail', retirementAge: scenario.retirementAge, stockAllocation, useGuardrail: true, conversionMode: 'current' },
    ];
  }
}
