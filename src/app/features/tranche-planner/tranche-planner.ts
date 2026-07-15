import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, computed, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { ceilingForRate } from '../../core/calculators/tax-bracket-calculator';
import { DEFAULT_TAX_YEAR } from '../../core/calculators/tax-tables';
import {
  computeTranchePlan,
  DRAWDOWN_THRESHOLD,
  T1_TARGET_SHARE,
  T2_REMAINDER_SHARE,
  T3_BUFFER,
  TrancheCheckpoint,
  TranchePlanInputs,
} from '../../core/calculators/tranche-planner-calculator';

const STORE_KEY = 'rothTranchePlanner';

const DEFAULT_INPUTS: TranchePlanInputs = {
  bracketCeiling: ceilingForRate(0.22, 'single', DEFAULT_TAX_YEAR),
  otherTaxableIncome: 85000,
  bonusEstimate: 12000,
  targetConversion: 45000,
  projectedIncome: 0,
  executedYtd: 0,
  checkpoint: 'jan',
  high52: 520,
  currentPrice: 520,
  bonusCap: 15000,
};

// The standalone roth_tranche_planner.html stored state under the same key with the
// input elements' ids as field names — map the two ids that were renamed so plans
// saved in the old tool carry over.
const LEGACY_FIELD_MAP: Record<string, keyof TranchePlanInputs> = {
  ytdOtherIncomeOct: 'projectedIncome',
  current52wHigh: 'high52',
};

function loadInputs(): TranchePlanInputs {
  try {
    const stored = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') as Record<string, unknown> | null;
    if (!stored) return DEFAULT_INPUTS;
    const inputs = { ...DEFAULT_INPUTS };
    for (const [key, raw] of Object.entries(stored)) {
      const field = LEGACY_FIELD_MAP[key] ?? (key in DEFAULT_INPUTS ? (key as keyof TranchePlanInputs) : null);
      if (!field || raw == null) continue;
      if (field === 'checkpoint') {
        if (raw === 'jan' || raw === 'oct' || raw === 'dec') inputs.checkpoint = raw;
      } else {
        const value = Number(raw);
        if (Number.isFinite(value)) inputs[field] = value;
      }
    }
    return inputs;
  } catch {
    return DEFAULT_INPUTS; // corrupt state — fall back to defaults
  }
}

interface LedgerRow {
  id: string;
  when: string;
  desc: string;
  amount: number;
  status: 'ok' | 'watch' | 'over' | 'active';
}

@Component({
  selector: 'app-tranche-planner',
  imports: [CurrencyPipe, DecimalPipe, FormsModule, MatCardModule],
  template: `
    <section class="tp-section">
      <mat-card>
        <mat-card-header><mat-card-title>Roth Conversion Tranche Planner</mat-card-title></mat-card-header>
        <mat-card-content>
          <p class="strategy-note">
            Within-year execution plan for the annual conversion target: a conservative January tranche sized off salary
            only, an October true-up once the bonus is visible, and a December precision top-off — plus a market-drawdown
            bonus tranche. Complements the multi-year strategy on the Scenario page. Federal bracket only; state flat tax
            applies on top and is not modeled here.
          </p>
        </mat-card-content>
      </mat-card>
    </section>

    <section class="tp-section">
      <mat-card>
        <mat-card-header><mat-card-title>01 · Annual Setup (fill in January)</mat-card-title></mat-card-header>
        <mat-card-content class="field-grid">
          <div class="field">
            <label for="bracketCeiling">Bracket Ceiling — Taxable Income ($)</label>
            <input type="number" id="bracketCeiling" step="100"
                   [ngModel]="inputs().bracketCeiling" (ngModelChange)="setNumber('bracketCeiling', $event)">
            <div class="hint">Top of the target bracket. Defaults to the 22% single ceiling from the {{ taxYear }} tax table.</div>
          </div>
          <div class="field">
            <label for="otherTaxableIncome">Salary / Other Taxable Income ($)</label>
            <input type="number" id="otherTaxableIncome" step="1000"
                   [ngModel]="inputs().otherTaxableIncome" (ngModelChange)="setNumber('otherTaxableIncome', $event)">
            <div class="hint">Known income excluding bonus and conversions.</div>
          </div>
          <div class="field">
            <label for="bonusEstimate">Bonus / Variable Comp Estimate ($)</label>
            <input type="number" id="bonusEstimate" step="500"
                   [ngModel]="inputs().bonusEstimate" (ngModelChange)="setNumber('bonusEstimate', $event)">
            <div class="hint">Best guess as of January. Refined in Tranche 2/3.</div>
          </div>
          <div class="field">
            <label for="targetConversion">Target Annual Conversion ($)</label>
            <input type="number" id="targetConversion" step="1000"
                   [ngModel]="inputs().targetConversion" (ngModelChange)="setNumber('targetConversion', $event)">
          </div>
        </mat-card-content>
      </mat-card>
    </section>

    <section class="tp-section">
      <mat-card>
        <mat-card-header><mat-card-title>02 · Fall True-Up (fill in Oct / Dec)</mat-card-title></mat-card-header>
        <mat-card-content class="field-grid">
          <div class="field">
            <label for="projectedIncome">Projected Full-Year Taxable Income ($)</label>
            <input type="number" id="projectedIncome" step="1000"
                   [ngModel]="inputs().projectedIncome" (ngModelChange)="setNumber('projectedIncome', $event)">
            <div class="hint">
              Updated full-year estimate at the check-in: salary + confirmed bonus, <b>excluding</b> Roth conversions.
              Not literal YTD — project through Dec 31. Leave at 0 in January.
            </div>
          </div>
          <div class="field">
            <label for="executedYtd">Conversions Executed YTD ($)</label>
            <input type="number" id="executedYtd" step="1000"
                   [ngModel]="inputs().executedYtd" (ngModelChange)="setNumber('executedYtd', $event)">
            <div class="hint">
              Total actually converted so far this year (T1 by October; T1+T2 by December).
              Leave at 0 to assume prior tranches executed as planned.
            </div>
          </div>
          <div class="field">
            <label for="checkpoint">Which checkpoint is this?</label>
            <select id="checkpoint" [ngModel]="inputs().checkpoint" (ngModelChange)="setCheckpoint($event)">
              <option value="jan">January — Tranche 1 only</option>
              <option value="oct">October — Tranche 2 true-up</option>
              <option value="dec">December — Tranche 3 final</option>
            </select>
          </div>
        </mat-card-content>
      </mat-card>
    </section>

    <section class="tp-section">
      <mat-card>
        <mat-card-header><mat-card-title>03 · Drawdown Check</mat-card-title></mat-card-header>
        <mat-card-content class="field-grid">
          <div class="field">
            <label for="high52">52-Week High (QQQ or VOO, $/share)</label>
            <input type="number" id="high52" step="1"
                   [ngModel]="inputs().high52" (ngModelChange)="setNumber('high52', $event)">
          </div>
          <div class="field">
            <label for="currentPrice">Current Price ($/share)</label>
            <input type="number" id="currentPrice" step="1"
                   [ngModel]="inputs().currentPrice" (ngModelChange)="setNumber('currentPrice', $event)">
          </div>
          <div class="field">
            <label for="bonusCap">Max Bonus Conversion ($)</label>
            <input type="number" id="bonusCap" step="1000"
                   [ngModel]="inputs().bonusCap" (ngModelChange)="setNumber('bonusCap', $event)">
            <div class="hint">
              Largest extra conversion you'd do on a drawdown. Keep it small enough that your taxable
              tax-source pool covers the tax (~25% of this amount in cash).
            </div>
          </div>
        </mat-card-content>
      </mat-card>
    </section>

    @if (plan(); as r) {
      <section class="tp-section">
        @if (r.overCeiling) {
          <div class="callout alert-c">
            <b>⚠ Over ceiling.</b> Planned tranches{{ r.drawdownActive ? ' (incl. bonus tranche)' : '' }} plus projected
            income exceed the bracket top by {{ r.overAmt | currency: 'USD':'symbol':'1.0-0' }}. Trim
            {{ r.drawdownActive ? 'the bonus tranche or ' : '' }}Tranche 3 before executing.
          </div>
        }
        @if (r.drawdownActive) {
          <div class="callout">
            <b>Drawdown trigger active</b> — price is {{ r.drawdownPct * 100 | number: '1.1-1' }}% below the 52-week high
            (≥{{ drawdownThresholdPct }}% threshold). Bonus tranche of {{ r.bonusAmt | currency: 'USD':'symbol':'1.0-0' }}
            available; make sure the tax-source pool covers its tax.
          </div>
        } @else {
          <div class="callout">
            <b>No drawdown trigger.</b> Price is {{ r.drawdownPct * 100 | number: '1.1-1' }}% off the 52-week high —
            below the {{ drawdownThresholdPct }}% threshold. Proceed with the base schedule only.
          </div>
        }
      </section>

      <section class="tp-section">
        <mat-card>
          <mat-card-header><mat-card-title>Bracket Gauge</mat-card-title></mat-card-header>
          <mat-card-content>
            <div class="gauge-labels">
              <span>$0</span>
              <span>{{ inputs().bracketCeiling | currency: 'USD':'symbol':'1.0-0' }} ceiling</span>
            </div>
            <div class="gauge">
              @for (seg of gauge().segments; track seg.label) {
                <div class="seg" [class]="'seg ' + seg.cls" [style.width.%]="seg.width">
                  {{ seg.width > 6 ? seg.label : '' }}
                </div>
              }
              <div class="ceiling-line" [style.left.%]="gauge().ceilingLeft">
                <div class="ceiling-tag">ceiling</div>
              </div>
            </div>
          </mat-card-content>
        </mat-card>
      </section>

      <section class="tp-section">
        <mat-card>
          <mat-card-header>
            <mat-card-title>Tranche Schedule</mat-card-title>
            <span class="total-planned">{{ r.totalPlanned + (r.drawdownActive ? r.bonusAmt : 0) | currency: 'USD':'symbol':'1.0-0' }} planned</span>
          </mat-card-header>
          <mat-card-content>
            @for (row of ledger(); track row.id) {
              <div class="ledger-row">
                <div class="tranche-id">{{ row.id === 'Bonus' ? 'Bonus' : 'Tranche ' + row.id }}</div>
                <div class="desc"><span class="when">{{ row.when }}</span>{{ row.desc }}</div>
                <div class="amt">{{ row.amount | currency: 'USD':'symbol':'1.0-0' }}</div>
                <div class="status" [class]="'status ' + row.status">{{ row.status.toUpperCase() }}</div>
              </div>
            }
            <p class="footline">
              <b>Remaining bracket room right now:</b> {{ r.finalRoom | currency: 'USD':'symbol':'1.0-0' }} ·
              <b>Rule:</b> all tranches in-kind, zero withholding, tax paid from taxable brokerage tax-source pool with
              specific lot ID.<br>
              <b>Sizing:</b> T1 = min({{ t1SharePct }}% of target, 90% of salary-only room) · T2 preview =
              {{ t2SharePct }}% of remainder · room math keeps a 10% margin; December T3 keeps a
              {{ t3Buffer | currency: 'USD':'symbol':'1.0-0' }} buffer.
            </p>
          </mat-card-content>
        </mat-card>
      </section>
    }
  `,
  styles: `
    .tp-section { margin-bottom: 20px; max-width: 980px; }
    .strategy-note { margin: 0; padding: 10px 12px; background: #eef4fb; border-radius: 6px; font-size: 0.92rem; line-height: 1.5; color: #33475b; }
    .field-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 18px; }
    .field label { display: block; font-size: 0.82rem; font-weight: 500; color: #5a6b7c; margin-bottom: 6px; }
    .field input, .field select { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid #d7dde5; border-radius: 4px; font-size: 0.95rem; background: #fff; }
    .field .hint { font-size: 0.75rem; color: #7a8794; margin-top: 4px; line-height: 1.4; }
    .callout { padding: 12px 14px; border-radius: 6px; background: #eef4fb; color: #33475b; font-size: 0.92rem; line-height: 1.5; margin-bottom: 10px; }
    .callout.alert-c { background: #fdecea; color: #b71c1c; }
    .gauge-labels { display: flex; justify-content: space-between; font-size: 0.78rem; color: #5a6b7c; margin-bottom: 6px; }
    .gauge { position: relative; display: flex; height: 34px; background: #f2f6fa; border: 1px solid #d7dde5; border-radius: 4px; overflow: visible; }
    .seg { display: flex; align-items: center; justify-content: center; font-size: 0.72rem; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; }
    .seg.income { background: #cfd8e0; color: #5a6b7c; }
    .seg.t1 { background: #4a7ab5; }
    .seg.t2 { background: #6b98c9; }
    .seg.t3 { background: #93b6d9; color: #33475b; }
    .seg.bonus { background: #b58a3c; }
    .ceiling-line { position: absolute; top: -4px; bottom: -4px; width: 2px; background: #b71c1c; }
    .ceiling-tag { position: absolute; top: -18px; left: -24px; font-size: 0.68rem; color: #b71c1c; white-space: nowrap; }
    mat-card-header { align-items: baseline; justify-content: space-between; }
    .total-planned { margin-left: auto; font-size: 0.88rem; font-weight: 600; color: #33475b; }
    .ledger-row { display: grid; grid-template-columns: 110px 1fr 110px 80px; gap: 14px; align-items: baseline; padding: 12px 0; border-bottom: 1px solid #edf1f5; font-size: 0.92rem; }
    .ledger-row:last-of-type { border-bottom: 0; }
    .tranche-id { font-weight: 600; color: #263241; }
    .desc { color: #5a6b7c; line-height: 1.45; }
    .desc .when { display: block; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: #7a8794; }
    .amt { text-align: right; font-weight: 600; }
    .status { text-align: right; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.05em; }
    .status.ok, .status.active { color: #2e7d32; }
    .status.watch { color: #a3762c; }
    .status.over { color: #b71c1c; }
    .footline { margin: 14px 0 0; font-size: 0.82rem; color: #5a6b7c; line-height: 1.6; }
    @media (max-width: 640px) {
      .ledger-row { grid-template-columns: 1fr 90px; }
      .tranche-id, .status { display: none; }
    }
  `,
})
export class TranchePlanner {
  readonly taxYear = DEFAULT_TAX_YEAR;
  readonly drawdownThresholdPct = DRAWDOWN_THRESHOLD * 100;
  readonly t1SharePct = T1_TARGET_SHARE * 100;
  readonly t2SharePct = T2_REMAINDER_SHARE * 100;
  readonly t3Buffer = T3_BUFFER;

  readonly inputs = signal<TranchePlanInputs>(loadInputs());
  readonly plan = computed(() => computeTranchePlan(this.inputs()));

  readonly gauge = computed(() => {
    const r = this.plan();
    const ceiling = this.inputs().bracketCeiling;
    const total = r.usedIncome + r.totalPlanned + (r.drawdownActive ? r.bonusAmt : 0);
    const scale = Math.max(total, ceiling) * 1.05 || 1;
    const segments = [
      { label: 'income', cls: 'income', value: r.usedIncome },
      { label: 'T1', cls: 't1', value: r.tranche1 },
      { label: 'T2', cls: 't2', value: r.tranche2 },
      { label: 'T3', cls: 't3', value: r.tranche3 },
      { label: 'Bonus', cls: 'bonus', value: r.drawdownActive ? r.bonusAmt : 0 },
    ]
      .filter((seg) => seg.value > 0)
      .map((seg) => ({ ...seg, width: (seg.value / scale) * 100 }));
    return { segments, ceilingLeft: (ceiling / scale) * 100 };
  });

  readonly ledger = computed<LedgerRow[]>(() => {
    const r = this.plan();
    const checkpoint = this.inputs().checkpoint;
    const rows: LedgerRow[] = [
      {
        id: 'I',
        when: 'January',
        desc: 'Salary-floor tranche. Sized off known salary only, ignoring bonus, so it holds even in a low-bonus year.',
        amount: r.tranche1,
        status: r.tranche1 > 0 ? 'ok' : 'watch',
      },
      {
        id: 'II',
        when: 'October',
        desc: 'True-up tranche once bonus is mostly visible.',
        amount: r.tranche2,
        status: r.tranche2 > 0 ? (checkpoint === 'oct' ? 'ok' : 'watch') : 'watch',
      },
      {
        id: 'III',
        when: 'Mid-December',
        desc: 'Final precision top-off. Closes remaining bracket space with a small buffer.',
        amount: r.tranche3,
        status: r.overCeiling ? 'over' : checkpoint === 'dec' ? 'ok' : 'watch',
      },
    ];
    if (r.drawdownActive) {
      rows.push({
        id: 'Bonus',
        when: 'Any time — market-triggered',
        desc: 'Drawdown ≥10% from 52-week high. Convert extra shares at a discount, funded from tax-source pool.',
        amount: r.bonusAmt,
        status: 'active',
      });
    }
    return rows;
  });

  constructor() {
    effect(() => {
      const inputs = this.inputs();
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(inputs));
      } catch {
        // private mode etc. — plan still works, just not persisted
      }
    });
  }

  setNumber(field: Exclude<keyof TranchePlanInputs, 'checkpoint'>, value: number | null): void {
    this.inputs.update((current) => ({ ...current, [field]: Number.isFinite(value as number) ? (value as number) : 0 }));
  }

  setCheckpoint(value: TrancheCheckpoint): void {
    this.inputs.update((current) => ({ ...current, checkpoint: value }));
  }
}
