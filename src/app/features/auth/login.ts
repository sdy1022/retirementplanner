import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, MatButtonModule, MatCardModule, MatFormFieldModule, MatInputModule],
  template: `
    <mat-card class="login-card">
      <mat-card-header><mat-card-title>Supabase Login</mat-card-title></mat-card-header>
      <mat-card-content>
        <form [formGroup]="form" class="form-grid">
          <mat-form-field><mat-label>Email</mat-label><input matInput type="email" formControlName="email" /></mat-form-field>
          <mat-form-field><mat-label>Password</mat-label><input matInput type="password" formControlName="password" /></mat-form-field>
          <div class="actions">
            <button mat-flat-button type="button" (click)="signIn()">Sign In</button>
            <button mat-stroked-button type="button" (click)="signUp()">Sign Up</button>
          </div>
          @if (message()) {
            <p>{{ message() }}</p>
          }
        </form>
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .login-card { max-width: 440px; }
    .form-grid { display: grid; gap: 14px; padding-top: 16px; }
    .actions { display: flex; gap: 12px; flex-wrap: wrap; }
  `,
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  readonly message = signal('');
  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  async signIn(): Promise<void> {
    await this.submit((email, password) => this.auth.signIn(email, password), 'Signed in.');
  }

  async signUp(): Promise<void> {
    await this.submit((email, password) => this.auth.signUp(email, password), 'Signup submitted.');
  }

  private async submit(action: (email: string, password: string) => Promise<unknown>, success: string): Promise<void> {
    if (this.form.invalid) return;
    const { email, password } = this.form.getRawValue();
    try {
      await action(email, password);
      this.message.set(success);
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Authentication failed.');
    }
  }
}
