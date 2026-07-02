import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard) },
  { path: 'accounts', loadComponent: () => import('./features/accounts/accounts').then((m) => m.Accounts) },
  { path: 'scenarios', loadComponent: () => import('./features/scenario-builder/scenario-builder').then((m) => m.ScenarioBuilder) },
  { path: 'login', loadComponent: () => import('./features/auth/login').then((m) => m.Login) },
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: '**', redirectTo: 'dashboard' },
];
