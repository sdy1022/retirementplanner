import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { NgxChartsModule } from '@swimlane/ngx-charts';
import { generateActionPlan, calculateMaxTraditionalBalanceForBracket } from '../../core/calculators/action-plan';
import { LONG_TERM_CAPITAL_GAINS_RATE, sumAccounts, sumCostBasis } from '../../core/calculators/roth-conversion-calculator';
import { runScenario, RESIDUAL_TRADITIONAL_TAX_RATE } from '../../core/calculators/scenario-engine';
import { effectiveConversionRate, selectStrategy, StrategyChoice } from '../../core/calculators/strategy-selector';
import { BRACKET_INFLATION_RATE, DEFAULT_TAX_YEAR } from '../../core/calculators/tax-tables';
import { ScenarioResult, YearResult } from '../../core/models/retirement.models';
import { toCsv, downloadFile, exportFilename } from '../../core/services/export.service';
import { LocalStateService } from '../../core/services/local-state.service';
import { getRmdStartAge, UNIFORM_LIFETIME_DIVISORS } from '../../core/calculators/rmd-calculator';

@Component({
  selector: 'app-dashboard',
  imports: [CurrencyPipe, DecimalPipe, MatButtonModule, MatCardModule, MatIconModule, NgxChartsModule],
  template: `
    @if (!hasAccounts()) {
      <div class="onboarding-container" id="dashboard-onboarding">
        <mat-card class="onboarding-card">
          <div class="onboarding-header">
            <div class="logo-icon-wrap">
              <mat-icon class="logo-icon">account_balance_wallet</mat-icon>
            </div>
            <h1>Retirement Strategy Planner</h1>
            <p class="subtitle">Analyze your drawdown strategy, Roth conversions, RMDs, and stress-test your plan with Monte Carlo simulations.</p>
          </div>
          
          <div class="onboarding-choices">
            <div class="choice-card demo-choice">
              <div class="choice-icon-wrap">
                <mat-icon>rocket_launch</mat-icon>
              </div>
              <h3>Explore with Demo Data</h3>
              <p>Instantly pre-populate the calculator with a sample $2.5M multi-account portfolio to see all charts, the year-by-year action plan, and Monte Carlo models in action.</p>
              <button mat-flat-button color="primary" class="cta-btn" (click)="loadDemoData()">
                <mat-icon>science</mat-icon> Load Demo Data
              </button>
            </div>

            <div class="choice-card custom-choice">
              <div class="choice-icon-wrap">
                <mat-icon>tune</mat-icon>
              </div>
              <h3>Start from Scratch</h3>
              <p>Input your own retirement accounts, wage income, living expenses, filing status, and tax strategy parameters to generate a custom projection.</p>
              <div class="scratch-actions">
                <button mat-stroked-button class="cta-btn" (click)="goToAccounts()">
                  <mat-icon>account_balance</mat-icon> Add Accounts
                </button>
                <button mat-stroked-button class="cta-btn" (click)="goToScenario()">
                  <mat-icon>settings</mat-icon> Build Scenario
                </button>
              </div>
            </div>
          </div>
        </mat-card>
      </div>
    } @else {
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
          <span class="divider">|</span>
          <span class="export-group">
            <button mat-button (click)="exportYearByYearCsv()" id="export-csv-btn">📥 Year-by-Year CSV</button>
            <button mat-button (click)="exportScenarioJson()" id="export-json-btn">📥 Scenario JSON</button>
            <button mat-button (click)="printReport()" id="print-report-btn">🖨️ Print PDF</button>
            <button mat-button class="reset-btn" (click)="resetData()" id="reset-data-btn">
              <mat-icon>restart_alt</mat-icon> Reset Data
            </button>
          </span>
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
        <mat-card-header>
          <mat-card-title>Year-by-Year Action Plan</mat-card-title>
          <mat-card-subtitle>
            Based on the winning strategy: {{ sblocWins() ? 'SBLOC-funded conversion taxes (Buy-Borrow-Die)' : 'conversion taxes paid in cash' }}
          </mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <div class="table-responsive">
            <table class="action-table">
              <thead>
                <tr>
                  <th>Age</th>
                  <th>Action</th>
                  <th>Living Expenses</th>
                  <th>Marginal Bracket</th>
                  <th>Total Tax</th>
                  <th>Medicare (Base + IRMAA)</th>
                  <th>Funding Source</th>
                </tr>
              </thead>
              <tbody>
                @for (step of actionPlan(); track step.age) {
                  <tr [class]="'status-' + step.status">
                    <td><strong>{{ step.age }}</strong></td>
                    <td>{{ step.action }}</td>
                    <td>{{ step.livingExpenses }}</td>
                    <td>{{ step.marginalBracket }}</td>
                    <td>{{ step.totalTax }}</td>
                    <td>{{ step.irmaa }}</td>
                    <td>{{ step.fundingSource }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
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
    }
  `,
  styles: `
    .onboarding-container {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: calc(100vh - 160px);
      padding: 20px;
      box-sizing: border-box;
    }
    .onboarding-card {
      max-width: 900px;
      width: 100%;
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.85);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(226, 232, 240, 0.8);
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
      padding: 40px 30px;
      text-align: center;
    }
    .onboarding-header {
      margin-bottom: 40px;
    }
    .logo-icon-wrap {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 64px;
      height: 64px;
      border-radius: 50px;
      background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%);
      color: #ffffff;
      margin-bottom: 20px;
      box-shadow: 0 4px 14px rgba(30, 64, 175, 0.4);
    }
    .logo-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
    }
    .onboarding-header h1 {
      font-size: 2.2rem;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 10px;
      letter-spacing: -0.025em;
    }
    .onboarding-header .subtitle {
      font-size: 1.1rem;
      color: #64748b;
      max-width: 600px;
      margin: 0 auto;
      line-height: 1.6;
    }
    .onboarding-choices {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 24px;
    }
    .choice-card {
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 30px 24px;
      background: #ffffff;
      display: flex;
      flex-direction: column;
      align-items: center;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .choice-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 12px 20px -8px rgba(0, 0, 0, 0.1);
    }
    .choice-icon-wrap {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      border-radius: 10px;
      margin-bottom: 16px;
    }
    .demo-choice .choice-icon-wrap {
      background: #eff6ff;
      color: #2563eb;
    }
    .custom-choice .choice-icon-wrap {
      background: #f8fafc;
      color: #475569;
    }
    .choice-card h3 {
      font-size: 1.25rem;
      font-weight: 700;
      color: #1e293b;
      margin: 0 0 12px;
    }
    .choice-card p {
      font-size: 0.95rem;
      color: #64748b;
      line-height: 1.5;
      margin: 0 0 24px;
      flex-grow: 1;
      text-align: center;
    }
    .choice-card .cta-btn {
      width: 100%;
      height: 44px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-size: 0.95rem;
    }
    .choice-card .cta-btn mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
      margin-right: 0;
    }
    .scratch-actions {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      width: 100%;
    }
    .demo-choice {
      border-top: 4px solid #3b82f6;
    }
    @media (max-width: 768px) {
      .onboarding-choices {
        grid-template-columns: 1fr;
      }
      .onboarding-card {
        padding: 30px 20px;
      }
      .onboarding-header h1 {
        font-size: 1.8rem;
      }
    }

    .rmd-banner { margin-bottom: 20px; }
    .rmd-banner mat-card-content { min-height: unset; padding: 14px 16px; font-size: 1.05rem; }
    .rmd-banner .divider { margin: 0 10px; color: #b0bac4; }
    .rmd-banner .data-year { color: #5a6b7c; font-size: 0.9rem; }
    .summary { display: grid; grid-template-columns: repeat(2, minmax(240px, 1fr)); gap: 20px; margin-bottom: 20px; }
    .strategy-selector, .advice, .action-plan { margin-bottom: 20px; }
    .verdict { margin: 0 0 12px; font-size: 1.15rem; font-weight: 600; }
    .advice-list { padding-left: 20px; line-height: 1.6; font-size: 1.05rem; }
    .advice-list li { margin-bottom: 8px; }
    
    .table-responsive { overflow-x: auto; margin-top: 10px; }
    .action-table { width: 100%; border-collapse: collapse; font-size: 1rem; text-align: left; }
    .action-table th, .action-table td { padding: 12px 14px; border-bottom: 1px solid #edf1f5; vertical-align: top; }
    .action-table th { background: #f8fafc; font-weight: 600; color: #5a6b7c; white-space: nowrap; border-bottom: 2px solid #d7dde5; }
    .action-table tr.status-warning { background-color: #fff5f5; color: #d32f2f; }
    .action-table tr.status-danger { background-color: #ffebee; color: #b71c1c; font-weight: 600; }
    .action-table tr.status-success { background-color: #edf7ed; color: #2e7d32; }

    .strategy-note { margin: 12px 0 0; padding: 10px 12px; background: #eef4fb; border-radius: 6px; font-size: 0.92rem; line-height: 1.5; color: #33475b; }
    .metric { display: flex; justify-content: space-between; gap: 16px; padding: 14px 0; border-bottom: 1px solid #edf1f5; }
    .metric.sub { padding: 8px 0 8px 14px; font-size: 0.92rem; color: #5a6b7c; }
    .metric:last-child { border-bottom: 0; }
    .charts { display: grid; grid-template-columns: 1fr; gap: 20px; }
    .export-group { display: inline-flex; gap: 6px; align-items: center; }
    .export-group button { font-size: 0.85rem; text-transform: none; }
    .reset-btn { color: #b91c1c; border: 1px solid transparent; border-radius: 6px; transition: background 0.2s, border-color 0.2s; }
    .reset-btn:hover { background: #fef2f2; border-color: #fca5a5; }
    .reset-btn mat-icon { font-size: 16px; width: 16px; height: 16px; vertical-align: middle; margin-right: 4px; }
    mat-card-content { min-height: 280px; }
    @media (max-width: 760px) { .summary { grid-template-columns: 1fr; } }
    @media print {
      .export-group { display: none !important; }
      .reset-btn { display: none !important; }
      mat-card { box-shadow: none !important; border: 1px solid #ddd; margin-bottom: 24px; page-break-inside: avoid; }
      .summary, .strategy-selector, .advice, .action-plan, .charts { display: block; }
      
      .action-plan { page-break-before: always; }
      .action-table { page-break-inside: auto; }
      .action-table tr { page-break-inside: avoid; page-break-after: auto; }
      .action-table th { background: #f8fafc !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .action-table tr.status-warning td { background-color: #fff5f5 !important; }
      .action-table tr.status-danger td { background-color: #ffebee !important; }
      .action-table tr.status-success td { background-color: #edf7ed !important; }
      
      .charts { page-break-before: always; }
    }
  `,
})
export class Dashboard {
  private readonly state = inject(LocalStateService);
  private readonly router = inject(Router);
  readonly taxDataYear = DEFAULT_TAX_YEAR;
  readonly scenario = this.state.scenario;
  readonly residualRateDefault = RESIDUAL_TRADITIONAL_TAX_RATE;
  readonly sblocBorrowRate = 0.07;
  readonly sblocStartAge = 60;
  readonly sblocEndAge = 75;
  readonly sblocMaxLtv = 0.4;

  readonly hasAccounts = computed(() => this.state.accounts().length > 0);

  loadDemoData(): void {
    this.state.loadSampleData();
  }

  goToAccounts(): void {
    this.router.navigate(['/accounts']);
  }

  goToScenario(): void {
    this.router.navigate(['/scenarios']);
  }

  resetData(): void {
    const confirmed = window.confirm(
      'This will clear all your accounts and scenario settings, returning to the welcome screen.\n\nAre you sure you want to reset?'
    );
    if (confirmed) {
      this.state.clearAllData();
    }
  }

  readonly strategyDecision = computed(() => {
    const scenario = this.state.scenario();
    const accounts = this.state.accounts();
    const strategy = scenario.rothConversionStrategy;
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
  readonly baseline = computed(() => runScenario({ ...this.state.scenario(), name: 'No conversion', rothConversionStrategy: { mode: 'none' } }, this.state.accounts()));
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
  readonly rmdChart = computed(() => this.toSeries('RMD', this.planResult(), this.baseline(), 'rmd'));
  readonly assetChart = computed(() => {
    const res = this.planResult();
    const perAccount = (label: string, key: keyof YearResult) => ({
      name: label,
      series: res.years.map((year) => ({ name: String(year.age), value: year[key] as number })),
    });
    const series = [
      perAccount(`${res.scenarioName} total`, 'endingAssets'),
      perAccount('Pre-tax (Traditional)', 'traditionalBalance'),
      perAccount('Roth', 'rothBalance'),
      perAccount('Brokerage', 'brokerageBalance'),
      { name: 'Baseline total', series: this.baseline().years.map((year) => ({ name: String(year.age), value: year.endingAssets })) },
    ];
    if (res.years.some((year) => (year.sblocLoanBalance ?? 0) > 0)) {
      series.push({ name: 'SBLOC loan (owed)', series: res.years.map((year) => ({ name: String(year.age), value: year.sblocLoanBalance ?? 0 })) });
    }
    return series;
  });
  readonly sblocWins = computed(() => this.sblocPeakLtv() <= this.sblocMaxLtv && this.sblocEdge() > 0);
  readonly planResult = computed(() => this.sblocWins() ? this.sblocResult() : this.result());
  readonly actionPlan = computed(() => generateActionPlan(this.planResult(), this.state.scenario().filingStatus));
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

  private afterTaxEndingAssets(result: ScenarioResult): number {
    const last = result.years.at(-1);
    const residualRate = this.state.scenario().residualTaxRate ?? RESIDUAL_TRADITIONAL_TAX_RATE;
    const gainsRate = this.state.scenario().brokerageGainsTaxRate ?? 0;
    const unrealizedGain = Math.max(0, (last?.brokerageBalance ?? 0) - (last?.brokerageBasis ?? 0));
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

    const strategy = this.state.scenario().rothConversionStrategy;
    const targetBracket = 'targetBracket' in strategy
      ? strategy.targetBracket
      : 0.24; 

    const rmdStartAge = getRmdStartAge(this.state.scenario().birthYear);
    const divisor = UNIFORM_LIFETIME_DIVISORS[rmdStartAge];
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
      { name: `Baseline ${label}`, series: baseline.years.map((year) => ({ name: String(year.age), value: baseline.years.length > 0 ? (baseline.years[baseline.years.indexOf(year)] as any)[key] : 0 })) },
    ];
  }

  exportYearByYearCsv(): void {
    const scenario = this.state.scenario();
    const res = this.result();
    const base = this.baseline();

    const yearFields: (keyof YearResult)[] = [
      'traditionalBalance', 'rothBalance', 'brokerageBalance', 'brokerageBasis',
      'rmd', 'conversion',
      'taxableIncome', 'federalTax', 'stateTax', 'totalTax', 'irmaa', 'marginalRate',
      'livingExpenses',
      'expensesFromSs', 'expensesFromRmd', 'expensesFromTraditional',
      'expensesFromBrokerage', 'expensesFromRoth',
      'taxFromBrokerage', 'taxWithheldFromConversion', 'taxFromTraditional', 'taxFromRoth',
      'endingAssets', 'shortfall',
    ];

    const headers = [
      'age',
      ...yearFields.map(f => `strategy_${f}`),
      ...yearFields.map(f => `baseline_${f}`),
    ];

    const rows = res.years.map((yr, i) => {
      const byr = base.years[i];
      return [
        yr.age,
        ...yearFields.map(f => yr[f] as number),
        ...yearFields.map(f => (byr?.[f] as number) ?? ''),
      ] as (string | number)[];
    });

    const csv = toCsv(headers, rows);
    downloadFile(exportFilename(scenario.name, 'csv'), csv, 'text/csv;charset=utf-8');
  }

  exportScenarioJson(): void {
    const scenario = this.state.scenario();
    const accounts = this.state.accounts();
    const res = this.result();
    const base = this.baseline();

    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      assumptions: {
        taxDataYear: this.taxDataYear,
        residualTaxRate: scenario.residualTaxRate ?? RESIDUAL_TRADITIONAL_TAX_RATE,
        brokerageGainsTaxRate: scenario.brokerageGainsTaxRate ?? 0,
        bracketInflationRate: BRACKET_INFLATION_RATE,
      },
      scenario,
      accounts,
      result: {
        scenarioName: res.scenarioName,
        totalTax: res.totalTax,
        endingAssets: res.endingAssets,
        resolvedStrategy: res.resolvedStrategy,
        resolvedSpendingOrder: res.resolvedSpendingOrder,
        note: res.note,
        years: res.years,
      },
      baseline: {
        scenarioName: base.scenarioName,
        totalTax: base.totalTax,
        endingAssets: base.endingAssets,
        years: base.years,
      },
    };

    const json = JSON.stringify(payload, null, 2);
    downloadFile(exportFilename(scenario.name, 'json'), json, 'application/json');
  }

  printReport(): void {
    window.print();
  }
}
