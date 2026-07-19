import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatMenuModule } from '@angular/material/menu';
import { AuthService } from './core/services/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatButtonModule, MatIconModule, MatToolbarModule, MatMenuModule],
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
        <a mat-button routerLink="/tranche-planner" routerLinkActive="active-link">
          <mat-icon>event_repeat</mat-icon>
          Tranches
        </a>
        <a mat-button routerLink="/compare-strategies" routerLinkActive="active-link">
          <mat-icon>compare_arrows</mat-icon>
          Compare
        </a>
        <a mat-button routerLink="/qa/golden-scenarios" routerLinkActive="active-link">
          <mat-icon>verified</mat-icon>
          Golden QA
        </a>
        <button mat-button [matMenuTriggerFor]="helpMenu">
          <mat-icon>help</mat-icon>
          Help
          <mat-icon>arrow_drop_down</mat-icon>
        </button>
        <mat-menu #helpMenu="matMenu">
          <a mat-menu-item routerLink="/help">
            <mat-icon>help_outline</mat-icon>
            <span>Quick Help</span>
          </a>
          <a
            mat-menu-item
            href="/docs/readme-zh.html"
            target="_blank"
            rel="noopener noreferrer">
            <mat-icon>menu_book</mat-icon>
            <span>完整中文手册</span>
          </a>
        </mat-menu>
        @if (auth.currentUser()) {
          <button mat-button (click)="signOut()">
            <mat-icon>logout</mat-icon>
            Sign Out ({{ auth.currentUser()?.email }})
          </button>
        } @else {
          <a mat-button routerLink="/login" routerLinkActive="active-link">
            <mat-icon>login</mat-icon>
            Login
          </a>
        }
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
    @media print {
      .shell-toolbar {
        display: none !important;
      }
      main {
        padding: 0;
        background: white;
      }
    }
  `
})
export class App {
  readonly auth = inject(AuthService);

  async signOut() {
    try {
      await this.auth.signOut();
    } catch (err) {
      alert('Sign out failed: ' + (err instanceof Error ? err.message : String(err)));
    }
  }
}
