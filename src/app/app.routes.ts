import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard) },
  { path: 'accounts', loadComponent: () => import('./features/accounts/accounts').then((m) => m.Accounts) },
  { path: 'scenarios', loadComponent: () => import('./features/scenario-builder/scenario-builder').then((m) => m.ScenarioBuilder) },
  { path: 'monte-carlo', loadComponent: () => import('./features/monte-carlo/monte-carlo').then((m) => m.MonteCarlo) },
  { path: 'tranche-planner', loadComponent: () => import('./features/tranche-planner/tranche-planner').then((m) => m.TranchePlanner) },
  { path: 'compare-strategies', loadComponent: () => import('./features/strategy-comparison/strategy-comparison').then((m) => m.StrategyComparison) },
  { path: 'qa/golden-scenarios', loadComponent: () => import('./features/qa-golden-scenarios/qa-golden-scenarios').then((m) => m.QaGoldenScenarios) },
  { path: 'login', loadComponent: () => import('./features/auth/login').then((m) => m.Login) },
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: '**', redirectTo: 'dashboard' },
];
