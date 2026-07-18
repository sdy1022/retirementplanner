import { CurrencyPipe, DecimalPipe, PercentPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { runScenario } from '../../core/calculators/scenario-engine';
import { runMonteCarloSmoothIncomeTarget, runMonteCarloStochasticLongevity } from '../../core/calculators/monte-carlo';
import { createPortfolioReturnSampler, createSeededRng } from '../../core/calculators/monte-carlo-returns';
import { findEarliestFeasibleRetirementAge } from '../../core/calculators/retirement-age-search';
import { MonteCarloWorkerService } from '../../core/services/monte-carlo-worker.service';
import {
  GOLDEN_SEED, accumulationAccounts, accumulationScenario, aggregationAccounts, aggregationScenario,
  constrainedAfterTaxContributionScenario, monteCarloAccounts, monteCarloScenario,
  retirementSearchAccounts, retirementSearchScenario,
} from '../../core/golden-scenarios/golden-scenarios';

interface QaCheck { label: string; expected: string; actual: string; pass: boolean; }
interface QaScenarioResult { name: string; durationMs: number; pass: boolean; checks: QaCheck[]; error?: string; }

@Component({
  selector: 'app-qa-golden-scenarios',
  imports: [CurrencyPipe, DecimalPipe, PercentPipe, MatButtonModule, MatCardModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <section class="header">
      <div><h1>Production Golden Scenarios</h1><p>Runs fixed, deterministic QA fixtures against the production calculation bundle. This route does not alter saved accounts or scenarios.</p></div>
      <button mat-flat-button (click)="runAll()" [disabled]="running()"><mat-icon>science</mat-icon>{{ running() ? 'Running…' : 'Run all checks' }}</button>
    </section>
    <mat-card class="environment"><mat-card-content>
      <span><strong>Seed:</strong> {{ seed }}</span><span><strong>Worker API:</strong> {{ workerAvailable ? 'available' : 'unavailable' }}</span><span><strong>Location:</strong> {{ location }}</span>
    </mat-card-content></mat-card>
    @if (running()) { <div class="running"><mat-spinner diameter="36"></mat-spinner><span>Running golden scenarios. Monte Carlo checks can take several seconds.</span></div> }
    <section class="result-grid">
      @for (result of results(); track result.name) {
        <mat-card [class.pass]="result.pass" [class.fail]="!result.pass">
          <mat-card-header><mat-icon>{{ result.pass ? 'check_circle' : 'error' }}</mat-icon><mat-card-title>{{ result.name }}</mat-card-title><mat-card-subtitle>{{ result.durationMs | number:'1.0-0' }} ms</mat-card-subtitle></mat-card-header>
          <mat-card-content>
            @if (result.error) { <p class="error-text">{{ result.error }}</p> }
            <table><thead><tr><th>Check</th><th>Expected</th><th>Actual</th><th>Status</th></tr></thead><tbody>
              @for (check of result.checks; track check.label) {<tr><td>{{ check.label }}</td><td>{{ check.expected }}</td><td>{{ check.actual }}</td><td><mat-icon [class.ok]="check.pass" [class.bad]="!check.pass">{{ check.pass ? 'check' : 'close' }}</mat-icon></td></tr>}
            </tbody></table>
          </mat-card-content>
        </mat-card>
      }
    </section>
  `,
  styles: `
    .header { display:flex; justify-content:space-between; gap:24px; align-items:center; margin-bottom:16px; }
    h1 { margin:0 0 6px; } p { margin:0; color:#5c6675; }
    .environment mat-card-content { display:flex; gap:24px; flex-wrap:wrap; }
    .running { display:flex; gap:14px; align-items:center; margin:20px 0; }
    .result-grid { display:grid; gap:16px; margin-top:16px; }
    mat-card.pass { border-left:5px solid #2e7d32; } mat-card.fail { border-left:5px solid #c62828; }
    mat-card-header mat-icon { margin-right:10px; } .pass mat-card-header mat-icon,.ok { color:#2e7d32; } .fail mat-card-header mat-icon,.bad,.error-text { color:#c62828; }
    table { width:100%; border-collapse:collapse; margin-top:12px; } th,td { text-align:left; padding:9px; border-bottom:1px solid #e1e5eb; } th { color:#4d5968; }
    @media(max-width:720px){.header{align-items:flex-start;flex-direction:column}.result-grid{overflow:auto}table{min-width:680px}}
  `,
})
export class QaGoldenScenarios {
  private readonly worker = inject(MonteCarloWorkerService);
  readonly seed = GOLDEN_SEED;
  readonly workerAvailable = typeof Worker !== 'undefined';
  readonly location = typeof window === 'undefined' ? 'server' : window.location.href;
  readonly running = signal(false);
  readonly results = signal<QaScenarioResult[]>([]);

  async runAll(): Promise<void> {
    this.running.set(true); this.results.set([]);
    const runners: Array<() => Promise<QaScenarioResult> | QaScenarioResult> = [
      () => this.runAccumulation(), () => this.runAggregation(), () => this.runPortfolio(),
      () => this.runSensitivity(), () => this.runRetirementSearch(), () => this.runWorkerParity(), () => this.runStochasticLongevity(),
    ];
    for (const runner of runners) {
      try { const result = await runner(); this.results.update((r: QaScenarioResult[]) => [...r, result]); }
      catch (error) { this.results.update((r: QaScenarioResult[]) => [...r, { name:'Unexpected QA failure', durationMs:0, pass:false, checks:[], error:error instanceof Error?error.message:String(error) }]); }
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    this.running.set(false);
  }

  private result(name:string,start:number,checks:QaCheck[]):QaScenarioResult{return{name,durationMs:performance.now()-start,checks,pass:checks.every(c=>c.pass)}}
  private check(label:string,expected:string,actual:string,pass:boolean):QaCheck{return{label,expected,actual,pass}}
  private runAccumulation():QaScenarioResult { const start=performance.now(); const a=runScenario(accumulationScenario,accumulationAccounts); const c=runScenario(constrainedAfterTaxContributionScenario,[]); const last=a.years.at(-1)!; const cy=c.years[0]; return this.result('1. Accumulation and after-tax cash constraint',start,[this.check('Traditional ending balance','$175,000',String(last.traditionalBalance),last.traditionalBalance===175000),this.check('Total ending assets','$205,000',String(a.endingAssets),a.endingAssets===205000),this.check('Constrained Roth contribution','$1,180',String(cy.rothBalance),cy.rothBalance===1180),this.check('Shortfall','$0',String(cy.shortfall),cy.shortfall===0)]); }
  private runAggregation():QaScenarioResult { const start=performance.now(); const y=runScenario(aggregationScenario,aggregationAccounts).years[0]; return this.result('2. Multiple same-type account aggregation',start,[this.check('Traditional','$500,000',String(y.traditionalBalance),y.traditionalBalance===500000),this.check('Roth','$150,000',String(y.rothBalance),y.rothBalance===150000),this.check('Brokerage','$100,000',String(y.brokerageBalance),y.brokerageBalance===100000),this.check('Brokerage basis','$65,000',String(y.brokerageBasis),y.brokerageBasis===65000),this.check('Total','$750,000',String(y.endingAssets),y.endingAssets===750000)]); }
  private stats(stockAllocation:number,count=20000){const sampler=createPortfolioReturnSampler(createSeededRng(GOLDEN_SEED),0.06,stockAllocation);const v=Array.from({length:count},()=>sampler());const mean=v.reduce((s,x)=>s+x,0)/v.length;const sd=Math.sqrt(v.reduce((s,x)=>s+(x-mean)**2,0)/v.length);return{mean,sd}}
  private runPortfolio():QaScenarioResult { const start=performance.now(); const stock=this.stats(1),balanced=this.stats(.6); return this.result('3. Paired stock/bond historical simulation',start,[this.check('All-stock volatility','19.4564%',(stock.sd*100).toFixed(4)+'%',Math.abs(stock.sd-0.1945641084)<1e-8),this.check('60/40 volatility','12.1420%',(balanced.sd*100).toFixed(4)+'%',Math.abs(balanced.sd-0.1214204489)<1e-8),this.check('60/40 materially lower','< 80% of all-stock',((balanced.sd/stock.sd)*100).toFixed(1)+'%',balanced.sd<stock.sd*.8)]); }
  private runSensitivity():QaScenarioResult { const start=performance.now(); const expectedOff=[224/300,268/300,284/300],expectedOn=[264/300,285/300,295/300];const rates=[.05,.06,.07];const checks:QaCheck[]=[];rates.forEach((rate,i)=>{const scenario={...monteCarloScenario,assumedReturnRate:rate};const off=runMonteCarloSmoothIncomeTarget(scenario,monteCarloAccounts,300,GOLDEN_SEED,false);const on=runMonteCarloSmoothIncomeTarget(scenario,monteCarloAccounts,300,GOLDEN_SEED,true);checks.push(this.check(`${rate*100}% / guardrail off`,(expectedOff[i]*100).toFixed(2)+'%',(off.successProbability*100).toFixed(2)+'%',off.successProbability===expectedOff[i]));checks.push(this.check(`${rate*100}% / guardrail on`,(expectedOn[i]*100).toFixed(2)+'%',(on.successProbability*100).toFixed(2)+'%',on.successProbability===expectedOn[i]));});return this.result('4. Return × Guardrail six-cell sensitivity',start,checks); }
  private runRetirementSearch():QaScenarioResult { const start=performance.now(); const result=findEarliestFeasibleRetirementAge(retirementSearchScenario,retirementSearchAccounts,58,62,{minimumSuccessRate:.75,minimumConsumptionRealization:.9,maximumGuardrailTriggerRate:.9,planningAge:95},250,GOLDEN_SEED,true);return this.result('5. Earliest feasible retirement age',start,[this.check('Age rows','58, 59, 60, 61, 62',result.rows.map(r=>r.retirementAge).join(', '),result.rows.map(r=>r.retirementAge).join(',')==='58,59,60,61,62'),this.check('Earliest qualifying age','59',String(result.earliestFeasibleAge),result.earliestFeasibleAge===59),this.check('Success-rate vector','71.6%, 80.0%, 87.2%, 92.0%, 96.0%',result.rows.map(r=>(r.successProbability*100).toFixed(1)+'%').join(', '),JSON.stringify(result.rows.map(r=>r.successProbability))===JSON.stringify([.716,.8,.872,.92,.96]))]); }

  private async runStochasticLongevity():Promise<QaScenarioResult> {
    const start=performance.now();
    const direct=runMonteCarloStochasticLongevity(monteCarloScenario,monteCarloAccounts,{primarySex:'male',maximumAge:110},100,GOLDEN_SEED,true);
    const viaWorker=await this.worker.runStochasticLongevity(monteCarloScenario,monteCarloAccounts,{primarySex:'male',maximumAge:110},100,GOLDEN_SEED,true);
    return this.result('7. SSA stochastic longevity',start,[
      this.check('Success rate','98.00%',(direct.successProbability*100).toFixed(2)+'%',direct.successProbability===.98),
      this.check('Median death age','84',String(direct.longevityStats.medianPrimaryDeathAge),direct.longevityStats.medianPrimaryDeathAge===84),
      this.check('10th–90th percentile death age','71–93',`${direct.longevityStats.p10LastSurvivorAge}–${direct.longevityStats.p90LastSurvivorAge}`,direct.longevityStats.p10LastSurvivorAge===71&&direct.longevityStats.p90LastSurvivorAge===93),
      this.check('Worker parity',direct.meanEndingAssets.toFixed(2),viaWorker.meanEndingAssets.toFixed(2),direct.meanEndingAssets===viaWorker.meanEndingAssets),
    ]);
  }

  private async runWorkerParity():Promise<QaScenarioResult> { const start=performance.now(); const direct=runMonteCarloSmoothIncomeTarget(monteCarloScenario,monteCarloAccounts,100,GOLDEN_SEED,true); const viaWorker=await this.worker.run(monteCarloScenario,monteCarloAccounts,100,GOLDEN_SEED,true); return this.result('6. Web Worker serialization parity',start,[this.check('Success rate',String(direct.successProbability),String(viaWorker.successProbability),direct.successProbability===viaWorker.successProbability),this.check('Mean ending assets',direct.meanEndingAssets.toFixed(2),viaWorker.meanEndingAssets.toFixed(2),direct.meanEndingAssets===viaWorker.meanEndingAssets),this.check('Trial count','100',String(viaWorker.trials),viaWorker.trials===100)]); }
}
