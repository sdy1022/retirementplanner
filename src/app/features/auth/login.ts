import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
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
        @if (auth.currentUser()) {
          <div class="signed-in-state">
            <p>You are signed in as {{ auth.currentUser()?.email }}.</p>
            <div class="actions">
              <button mat-flat-button type="button" (click)="goDashboard()">Go to Dashboard</button>
              <button mat-stroked-button type="button" (click)="signOut()">Sign Out</button>
            </div>
            @if (message()) {
              <p>{{ message() }}</p>
            }
          </div>
        } @else {
          <form [formGroup]="form" class="form-grid">
            <mat-form-field>
              <mat-label>Email</mat-label>
              <input matInput type="email" formControlName="email" #emailInput autocomplete="email" />
              @if (form.controls.email.touched && form.controls.email.invalid) {
                <mat-error>Enter a valid email address.</mat-error>
              }
            </mat-form-field>
            <mat-form-field>
              <mat-label>Password</mat-label>
              <input matInput type="password" formControlName="password" #passwordInput autocomplete="current-password" />
              @if (form.controls.password.touched && form.controls.password.invalid) {
                <mat-error>Password must be at least 6 characters.</mat-error>
              }
            </mat-form-field>
            <div class="actions">
              <button mat-flat-button type="button" (click)="signIn()">Sign In</button>
              <button mat-stroked-button type="button" (click)="signUp()">Sign Up</button>
            </div>
            @if (message()) {
              <p>{{ message() }}</p>
            }
          </form>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .login-card { max-width: 440px; }
    .form-grid, .signed-in-state { display: grid; gap: 14px; padding-top: 16px; }
    .actions { display: flex; gap: 12px; flex-wrap: wrap; }
  `,
})
export class Login {
  private readonly fb = inject(FormBuilder);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly message = signal('');
  private readonly emailInput = viewChild<ElementRef<HTMLInputElement>>('emailInput');
  private readonly passwordInput = viewChild<ElementRef<HTMLInputElement>>('passwordInput');
  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  async signIn(): Promise<void> {
    await this.submit(async (email, password) => {
      await this.auth.signIn(email, password);
      this.router.navigate(['/dashboard']);
    }, 'Signed in.');
  }

  async signUp(): Promise<void> {
    await this.submit((email, password) => this.auth.signUp(email, password), 'Signup submitted.');
  }

  async signOut(): Promise<void> {
    // Local plan data is cleared on sign-out (AuthService.applySession) — confirm first
    if (!confirm('Sign out? Plan data held only in this browser will be cleared. Anything saved to Supabase stays safe.')) return;
    try {
      await this.auth.signOut();
      this.message.set('Signed out.');
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Sign out failed.');
    }
  }

  goDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  private async submit(action: (email: string, password: string) => Promise<unknown>, success: string): Promise<void> {
    this.adoptAutofilledValues();
    if (this.form.invalid) {
      // Returning silently here meant a click did nothing at all — no message, no field
      // highlight — which is indistinguishable from a broken button.
      this.form.markAllAsTouched();
      this.message.set(this.validationMessage());
      return;
    }
    const { email, password } = this.form.getRawValue();
    try {
      await action(email, password);
      this.message.set(success);
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Authentication failed.');
    }
  }

  /**
   * Password managers and browser autofill frequently assign `input.value` directly without
   * dispatching an input event, so the FormControl stays empty while the text is plainly
   * visible on screen. The form then fails validation and the user watches a filled-in form
   * refuse to submit. Adopt whatever the DOM actually holds before validating.
   */
  private adoptAutofilledValues(): void {
    const patch: { email?: string; password?: string } = {};
    const email = this.emailInput()?.nativeElement.value ?? '';
    const password = this.passwordInput()?.nativeElement.value ?? '';
    if (email && !this.form.controls.email.value) patch.email = email;
    if (password && !this.form.controls.password.value) patch.password = password;
    if (patch.email !== undefined || patch.password !== undefined) this.form.patchValue(patch);
  }

  private validationMessage(): string {
    if (this.form.controls.email.invalid) return 'Enter a valid email address.';
    if (this.form.controls.password.hasError('required')) return 'Enter a password.';
    if (this.form.controls.password.hasError('minlength')) return 'Password must be at least 6 characters.';
    return 'Check the form and try again.';
  }
}
