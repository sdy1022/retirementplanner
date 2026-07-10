import { Component, OnInit, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AccountService } from './core/services/account.service';
import { LocalStateService } from './core/services/local-state.service';
import { AccountSnapshot } from './core/models/retirement.models';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatButtonModule, MatIconModule, MatToolbarModule],
  template: `
    <mat-toolbar class="shell-toolbar">
      <span class="brand">Retirement Strategy</span>
      <nav>
        <a mat-button routerLink="/dashboard" routerLinkActive="active-link">
          <mat-icon>monitoring</mat-icon>
          Dashboard
        </a>
        <a mat-button routerLink="/accounts" routerLinkActive="active-link">
          <mat-icon>account_balance</mat-icon>
          Accounts
        </a>
        <a mat-button routerLink="/scenarios" routerLinkActive="active-link">
          <mat-icon>tune</mat-icon>
          Scenario
        </a>
        <a mat-button routerLink="/monte-carlo" routerLinkActive="active-link">
          <mat-icon>query_stats</mat-icon>
          Monte Carlo
        </a>
        <a mat-button href="/runningsteps_eng.html" target="_blank">
          <mat-icon>help</mat-icon>
          Help
        </a>
        <a mat-button routerLink="/login" routerLinkActive="active-link">
          <mat-icon>login</mat-icon>
          Login
        </a>
      </nav>
    </mat-toolbar>
    <main>
      <router-outlet />
    </main>
  `,
  styles: `
    .shell-toolbar {
      gap: 24px;
      border-bottom: 1px solid #d7dde5;
      background: #fff;
      color: #18212f;
    }
    .brand {
      font-weight: 700;
      white-space: nowrap;
    }
    nav {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }
    a {
      color: #263241;
    }
    .active-link {
      background: #e8eef6;
    }
    main {
      min-height: calc(100vh - 64px);
      background: #f6f8fb;
      padding: 24px;
    }
    @media (max-width: 720px) {
      .shell-toolbar {
        height: auto;
        align-items: flex-start;
        padding: 12px;
        flex-direction: column;
      }
      main {
        padding: 16px;
      }
    }
  `
})
export class App implements OnInit {
  private readonly accountService = inject(AccountService);
  private readonly state = inject(LocalStateService);

  async ngOnInit() {
    try {
      const allAccounts = await this.accountService.list();
      if (allAccounts.length > 0) {
        // Only keep the most recent snapshot for each account type
        const latestMap = new Map<string, AccountSnapshot>();
        for (const acc of allAccounts) {
          if (!latestMap.has(acc.type)) {
            latestMap.set(acc.type, acc);
          }
        }
        
        // Completely replace local accounts with the live Supabase data.
        // We do not merge with localStorage here because we don't want to accidentally 
        // sum old dummy accounts (like traditional_401k) with the new traditional_ira total!
        this.state.setAccounts(Array.from(latestMap.values()));
      }
    } catch (err) {
      console.warn('Could not pull latest Supabase accounts on load:', err);
    }
  }
}
