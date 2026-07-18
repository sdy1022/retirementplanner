import { CurrencyPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { LocalStateService } from '../../core/services/local-state.service';
import { AccountSnapshot, AccountType } from '../../core/models/retirement.models';
import { AccountService } from '../../core/services/account.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-accounts',
  imports: [CurrencyPipe, ReactiveFormsModule, MatButtonModule, MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatTableModule],
  template: `
    <section class="page-grid">
      <mat-card>
        <mat-card-header><mat-card-title>Account Snapshot</mat-card-title></mat-card-header>
        <mat-card-content>
          <form [formGroup]="form" (ngSubmit)="addAccount()" class="form-grid">
            <mat-form-field>
              <mat-label>Type</mat-label>
              <mat-select formControlName="type">
                @for (type of accountTypes; track type) {
                  <mat-option [value]="type">{{ type }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field>
              <mat-label>Balance</mat-label>
              <input matInput type="number" formControlName="balance" />
            </mat-form-field>
            <mat-form-field>
              <mat-label>Cost basis</mat-label>
              <input matInput type="number" formControlName="costBasis" />
            </mat-form-field>
            <mat-form-field>
              <mat-label>Snapshot date</mat-label>
              <input matInput type="date" formControlName="snapshotDate" />
            </mat-form-field>
            <button mat-flat-button type="submit" [disabled]="form.invalid">Add Snapshot</button>
          </form>
        </mat-card-content>
      </mat-card>

      <mat-card>
        <mat-card-header><mat-card-title>Current Inputs</mat-card-title></mat-card-header>
        <mat-card-content>
          <table mat-table [dataSource]="state.accounts()">
            <ng-container matColumnDef="type">
              <th mat-header-cell *matHeaderCellDef>Type</th>
              <td mat-cell *matCellDef="let account">{{ account.type }}</td>
            </ng-container>
            <ng-container matColumnDef="balance">
              <th mat-header-cell *matHeaderCellDef>Balance</th>
              <td mat-cell *matCellDef="let account">{{ account.balance | currency }}</td>
            </ng-container>
            <ng-container matColumnDef="snapshotDate">
              <th mat-header-cell *matHeaderCellDef>Date</th>
              <td mat-cell *matCellDef="let account">{{ account.snapshotDate }}</td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
          </table>
        </mat-card-content>
      </mat-card>

      @if (auth.currentUser()) {
        <mat-card>
          <mat-card-header><mat-card-title>Cloud Sync</mat-card-title></mat-card-header>
          <mat-card-content>
            <div class="actions">
              <button mat-flat-button color="primary" (click)="saveToCloud()">Save to Supabase</button>
              <button mat-stroked-button (click)="loadFromCloud()">Load from Supabase</button>
            </div>
          </mat-card-content>
        </mat-card>
      }
    </section>
  `,
  styles: `
    .page-grid { display: grid; grid-template-columns: minmax(280px, 420px) 1fr; gap: 20px; align-items: start; }
    .form-grid { display: grid; gap: 14px; padding-top: 16px; }
    .actions { display: flex; gap: 12px; padding-top: 16px; flex-wrap: wrap; }
    table { width: 100%; }
    @media (max-width: 900px) { .page-grid { grid-template-columns: 1fr; } }
  `,
})
export class Accounts {
  readonly state = inject(LocalStateService);
  readonly accountService = inject(AccountService);
  readonly auth = inject(AuthService);
  readonly accountTypes: AccountType[] = ['traditional_401k', 'traditional_ira', 'roth_401k', 'roth_ira', 'brokerage'];
  readonly columns = ['type', 'balance', 'snapshotDate'];
  private readonly fb = inject(FormBuilder);
  readonly form = this.fb.nonNullable.group({
    type: ['traditional_401k' as AccountType, Validators.required],
    balance: [0, [Validators.required, Validators.min(0)]],
    costBasis: [0],
    snapshotDate: [new Date().toISOString().slice(0, 10), Validators.required],
  });

  addAccount(): void {
    if (this.form.invalid) return;
    const value = this.form.getRawValue();
    const account: AccountSnapshot = { ...value, costBasis: value.costBasis || undefined };
    this.state.addAccount(account);
    this.form.patchValue({ balance: 0, costBasis: 0 });
  }

  async saveToCloud(): Promise<void> {
    const user = this.auth.currentUser();
    if (!user) return;
    try {
      await this.accountService.createMany(this.state.accounts(), user.id);
      alert('Accounts saved to cloud successfully.');
    } catch (e) {
      alert('Error saving accounts: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async loadFromCloud(): Promise<void> {
    try {
      const list = await this.accountService.list();
      if (list.length > 0) {
        // Preserve every account row, including multiple accounts of the same tax type.
        this.state.setAccounts(list);
        alert('Accounts loaded from cloud successfully.');
      } else {
        alert('No accounts found in cloud.');
      }
    } catch (e) {
      alert('Error loading accounts: ' + (e instanceof Error ? e.message : String(e)));
    }
  }
}
