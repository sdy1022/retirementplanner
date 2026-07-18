import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { LocalStateService } from '../../core/services/local-state.service';
import { AccountOwner, AccountSnapshot, AccountType } from '../../core/models/retirement.models';
import { AccountService } from '../../core/services/account.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-accounts',
  imports: [CurrencyPipe, ReactiveFormsModule, MatButtonModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule, MatTableModule],
  template: `
    <section class="summary-grid">
      <mat-card><mat-card-content><span>Traditional</span><strong>{{ totals().traditional | currency }}</strong></mat-card-content></mat-card>
      <mat-card><mat-card-content><span>Roth</span><strong>{{ totals().roth | currency }}</strong></mat-card-content></mat-card>
      <mat-card><mat-card-content><span>Brokerage</span><strong>{{ totals().brokerage | currency }}</strong></mat-card-content></mat-card>
      <mat-card><mat-card-content><span>Brokerage basis</span><strong>{{ totals().basis | currency }}</strong></mat-card-content></mat-card>
      <mat-card class="total-card"><mat-card-content><span>Total assets</span><strong>{{ totals().total | currency }}</strong></mat-card-content></mat-card>
    </section>

    <section class="page-grid">
      <mat-card>
        <mat-card-header><mat-card-title>{{ editingIndex() == null ? 'Add Account' : 'Edit Account' }}</mat-card-title></mat-card-header>
        <mat-card-content>
          <form [formGroup]="form" (ngSubmit)="saveAccount()" class="form-grid">
            <mat-form-field><mat-label>Account name</mat-label><input matInput formControlName="name" placeholder="Current employer 401(k)" /></mat-form-field>
            <mat-form-field><mat-label>Owner</mat-label><mat-select formControlName="owner">@for (owner of owners; track owner) {<mat-option [value]="owner">{{ ownerLabel(owner) }}</mat-option>}</mat-select></mat-form-field>
            <mat-form-field><mat-label>Type</mat-label><mat-select formControlName="type">@for (type of accountTypes; track type) {<mat-option [value]="type">{{ typeLabel(type) }}</mat-option>}</mat-select></mat-form-field>
            <mat-form-field><mat-label>Balance</mat-label><input matInput type="number" formControlName="balance" /></mat-form-field>
            <mat-form-field><mat-label>Cost basis</mat-label><input matInput type="number" formControlName="costBasis" /></mat-form-field>
            <mat-form-field><mat-label>Snapshot date</mat-label><input matInput type="date" formControlName="snapshotDate" /></mat-form-field>
            <div class="actions">
              <button mat-flat-button type="submit" [disabled]="form.invalid">{{ editingIndex() == null ? 'Add Account' : 'Save Changes' }}</button>
              @if (editingIndex() != null) {<button mat-stroked-button type="button" (click)="cancelEdit()">Cancel</button>}
            </div>
          </form>
        </mat-card-content>
      </mat-card>

      <mat-card>
        <mat-card-header><mat-card-title>Current Accounts</mat-card-title></mat-card-header>
        <mat-card-content class="table-wrap">
          <table mat-table [dataSource]="state.accounts()">
            <ng-container matColumnDef="name"><th mat-header-cell *matHeaderCellDef>Name</th><td mat-cell *matCellDef="let a">{{ a.name || typeLabel(a.type) }}</td></ng-container>
            <ng-container matColumnDef="owner"><th mat-header-cell *matHeaderCellDef>Owner</th><td mat-cell *matCellDef="let a">{{ ownerLabel(a.owner || 'primary') }}</td></ng-container>
            <ng-container matColumnDef="type"><th mat-header-cell *matHeaderCellDef>Type</th><td mat-cell *matCellDef="let a">{{ typeLabel(a.type) }}</td></ng-container>
            <ng-container matColumnDef="balance"><th mat-header-cell *matHeaderCellDef>Balance</th><td mat-cell *matCellDef="let a">{{ a.balance | currency }}</td></ng-container>
            <ng-container matColumnDef="costBasis"><th mat-header-cell *matHeaderCellDef>Cost basis</th><td mat-cell *matCellDef="let a">{{ a.type === 'brokerage' ? ((a.costBasis ?? a.balance) | currency) : '—' }}</td></ng-container>
            <ng-container matColumnDef="snapshotDate"><th mat-header-cell *matHeaderCellDef>Date</th><td mat-cell *matCellDef="let a">{{ a.snapshotDate }}</td></ng-container>
            <ng-container matColumnDef="actions"><th mat-header-cell *matHeaderCellDef>Actions</th><td mat-cell *matCellDef="let a; let i = index"><button mat-icon-button aria-label="Edit account" (click)="editAccount(i)"><mat-icon>edit</mat-icon></button><button mat-icon-button aria-label="Delete account" (click)="deleteAccount(i)"><mat-icon>delete</mat-icon></button></td></ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr><tr mat-row *matRowDef="let row; columns: columns"></tr>
          </table>
        </mat-card-content>
      </mat-card>

      @if (auth.currentUser()) {
        <mat-card class="cloud-card"><mat-card-header><mat-card-title>Cloud Sync</mat-card-title></mat-card-header><mat-card-content><div class="actions"><button mat-flat-button color="primary" (click)="saveToCloud()">Save to Supabase</button><button mat-stroked-button (click)="loadFromCloud()">Load from Supabase</button></div></mat-card-content></mat-card>
      }
    </section>
  `,
  styles: `
    .summary-grid { display:grid; grid-template-columns:repeat(5,minmax(140px,1fr)); gap:12px; margin-bottom:20px; }
    .summary-grid mat-card-content { display:flex; flex-direction:column; gap:6px; padding:16px; }
    .summary-grid span { color:#5c6675; font-size:13px; } .summary-grid strong { font-size:20px; }
    .total-card { background:#eaf2ff; }
    .page-grid { display:grid; grid-template-columns:minmax(300px,420px) 1fr; gap:20px; align-items:start; }
    .form-grid { display:grid; gap:14px; padding-top:16px; }
    .actions { display:flex; gap:12px; flex-wrap:wrap; }
    .table-wrap { overflow:auto; } table { width:100%; min-width:850px; }
    .cloud-card { grid-column:1/-1; }
    @media (max-width:1100px) { .summary-grid { grid-template-columns:repeat(2,1fr); } .page-grid { grid-template-columns:1fr; } }
    @media (max-width:600px) { .summary-grid { grid-template-columns:1fr; } }
  `,
})
export class Accounts {
  readonly state = inject(LocalStateService);
  readonly accountService = inject(AccountService);
  readonly auth = inject(AuthService);
  readonly editingIndex = signal<number | null>(null);
  readonly accountTypes: AccountType[] = ['traditional_401k', 'traditional_ira', 'roth_401k', 'roth_ira', 'brokerage'];
  readonly owners: AccountOwner[] = ['primary', 'spouse', 'joint'];
  readonly columns = ['name', 'owner', 'type', 'balance', 'costBasis', 'snapshotDate', 'actions'];
  readonly totals = computed(() => {
    const accounts = this.state.accounts();
    const traditional = accounts.filter(a => a.type === 'traditional_401k' || a.type === 'traditional_ira').reduce((s,a)=>s+a.balance,0);
    const roth = accounts.filter(a => a.type === 'roth_401k' || a.type === 'roth_ira').reduce((s,a)=>s+a.balance,0);
    const brokerageAccounts = accounts.filter(a => a.type === 'brokerage');
    const brokerage = brokerageAccounts.reduce((s,a)=>s+a.balance,0);
    const basis = brokerageAccounts.reduce((s,a)=>s+(a.costBasis ?? a.balance),0);
    return { traditional, roth, brokerage, basis, total: traditional + roth + brokerage };
  });
  private readonly fb = inject(FormBuilder);
  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required], owner: ['primary' as AccountOwner, Validators.required], type: ['traditional_401k' as AccountType, Validators.required],
    balance: [0, [Validators.required, Validators.min(0)]], costBasis: [0, [Validators.min(0)]], snapshotDate: [new Date().toISOString().slice(0,10), Validators.required],
  });

  typeLabel(type: AccountType): string { return ({traditional_401k:'Traditional 401(k)',traditional_ira:'Traditional IRA',roth_401k:'Roth 401(k)',roth_ira:'Roth IRA',brokerage:'Brokerage'} as Record<AccountType,string>)[type]; }
  ownerLabel(owner: AccountOwner): string { return ({primary:'Primary',spouse:'Spouse',joint:'Joint'} as Record<AccountOwner,string>)[owner]; }
  saveAccount(): void { if (this.form.invalid) return; const v=this.form.getRawValue(); const account:AccountSnapshot={...v,costBasis:v.type==='brokerage'?(v.costBasis||0):undefined}; const i=this.editingIndex(); i==null?this.state.addAccount(account):this.state.updateAccount(i,account); this.cancelEdit(); }
  editAccount(index:number):void { const a=this.state.accounts()[index]; this.editingIndex.set(index); this.form.setValue({name:a.name||this.typeLabel(a.type),owner:a.owner||'primary',type:a.type,balance:a.balance,costBasis:a.costBasis??0,snapshotDate:a.snapshotDate}); }
  deleteAccount(index:number):void { if (confirm('Delete this account?')) { this.state.deleteAccount(index); if(this.editingIndex()===index)this.cancelEdit(); } }
  cancelEdit():void { this.editingIndex.set(null); this.form.reset({name:'',owner:'primary',type:'traditional_401k',balance:0,costBasis:0,snapshotDate:new Date().toISOString().slice(0,10)}); }
  async saveToCloud():Promise<void>{const user=this.auth.currentUser();if(!user)return;try{await this.accountService.createMany(this.state.accounts(),user.id);alert('Accounts saved to cloud successfully.');}catch(e){alert('Error saving accounts: '+(e instanceof Error?e.message:String(e)));}}
  async loadFromCloud():Promise<void>{try{const list=await this.accountService.list();if(list.length){this.state.setAccounts(list);alert('Accounts loaded from cloud successfully.');}else alert('No accounts found in cloud.');}catch(e){alert('Error loading accounts: '+(e instanceof Error?e.message:String(e)));}}
}
