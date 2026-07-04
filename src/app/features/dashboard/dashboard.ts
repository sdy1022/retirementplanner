import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { NgxChartsModule } from '@swimlane/ngx-charts';
import { generateActionPlan, calculateMaxTraditionalBalanceForBracket } from '../../core/calculators/action-plan';
import { runScenario } from '../../core/calculators/scenario-engine';
import { ScenarioResult } from '../../core/models/retirement.models';
import { LocalStateService } from '../../core/services/local-state.service';
import { getRmdStartAge, UNIFORM_LIFETIME_DIVISORS } from '../../core/calculators/rmd-calculator';

@Component({
  selector: 'app-dashboard',
  imports: [CurrencyPipe, MatCardModule, NgxChartsModule],
  template: `
    <section class="summary">
      <mat-card>
        <mat-card-header><mat-card-title>{{ result().scenarioName }}</mat-card-title></mat-card-header>
        <mat-card-content>
          <div class="metric"><span>Total tax</span><strong>{{ result().totalTax | currency }}</strong></div>
          <div class="metric"><span>Ending assets</span><strong>{{ result().endingAssets | currency }}</strong></div>
        </mat-card-content>
      </mat-card>
      <mat-card>
        <mat-card-header><mat-card-title>Baseline</mat-card-title></mat-card-header>
        <mat-card-content>
          <div class="metric"><span>Total tax</span><strong>{{ baseline().totalTax | currency }}</strong></div>
          <div class="metric"><span>Ending assets</span><strong>{{ baseline().endingAssets | currency }}</strong></div>
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
    .summary { display: grid; grid-template-columns: repeat(2, minmax(240px, 1fr)); gap: 20px; margin-bottom: 20px; }
    .advice, .action-plan { margin-bottom: 20px; }
    .advice-list, .action-list { padding-left: 20px; line-height: 1.6; font-size: 1.05rem; }
    .advice-list li, .action-list li { margin-bottom: 8px; }
    .action-list li.status-warning { color: #d32f2f; }
    .action-list li.status-success { color: #2e7d32; }
    .metric { display: flex; justify-content: space-between; gap: 16px; padding: 14px 0; border-bottom: 1px solid #edf1f5; }
    .metric:last-child { border-bottom: 0; }
    .charts { display: grid; grid-template-columns: 1fr; gap: 20px; }
    mat-card-content { min-height: 280px; }
    @media (max-width: 760px) { .summary { grid-template-columns: 1fr; } }
  `,
})
export class Dashboard {
  private readonly state = inject(LocalStateService);
  readonly result = computed(() => runScenario(this.state.scenario(), this.state.accounts()));
  readonly baseline = computed(() => runScenario({ ...this.state.scenario(), name: 'No conversion', rothConversionStrategy: { mode: 'none' } }, this.state.accounts()));
  readonly rmdChart = computed(() => this.toSeries('RMD', this.result(), this.baseline(), 'rmd'));
  readonly assetChart = computed(() => this.toSeries('Assets', this.result(), this.baseline(), 'endingAssets'));
  readonly actionPlan = computed(() => generateActionPlan(this.result(), this.state.scenario().filingStatus));

  readonly optimizationAdvice = computed(() => {
    const res = this.result();
    const base = this.baseline();
    const advices = [];

    const taxDiff = base.totalTax - res.totalTax;
    const assetsDiff = res.endingAssets - base.endingAssets;

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
    const targetBracket = strategy.mode === 'fill-to-bracket'
      ? strategy.targetBracket
      : 0.24; // Default to 24% for generic advice if auto-optimizing

    const rmdStartAge = getRmdStartAge(this.state.scenario().birthYear);
    const divisor = UNIFORM_LIFETIME_DIVISORS[rmdStartAge];
    const ssIncome = this.state.scenario().ssPia * 12;
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
