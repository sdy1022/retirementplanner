import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Login } from './login';
import { AuthService } from '../../core/services/auth.service';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

describe('Login Component', () => {
  let component: Login;
  let fixture: ComponentFixture<Login>;
  let mockAuthService: any;
  let mockRouter: any;

  beforeEach(async () => {
    mockAuthService = {
      currentUser: signal(null),
      signIn: jasmine.createSpy('signIn'),
      signUp: jasmine.createSpy('signUp'),
      signOut: jasmine.createSpy('signOut')
    };

    mockRouter = {
      navigate: jasmine.createSpy('navigate')
    };

    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: Router, useValue: mockRouter },
        provideAnimationsAsync()
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(Login);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should display error message when signIn throws (wrong credentials)', async () => {
    const errorMsg = 'Wrong password.';
    mockAuthService.signIn.and.rejectWith(new Error(errorMsg));

    component.form.patchValue({ email: 'test@example.com', password: 'password123' });
    
    await component.signIn();
    
    expect(component.message()).toBe(errorMsg);
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it('explains why an invalid form was not submitted instead of silently doing nothing', async () => {
    // The form used to `return` on invalid input with no message and no field highlight, so a
    // click on Sign Up was indistinguishable from a dead button.
    component.form.patchValue({ email: 'not-an-email', password: 'password123' });

    await component.signUp();

    expect(mockAuthService.signUp).not.toHaveBeenCalled();
    expect(component.message()).toBe('Enter a valid email address.');
    expect(component.form.controls.email.touched).toBeTrue();
  });

  it('reports a too-short password rather than failing quietly', async () => {
    component.form.patchValue({ email: 'test@example.com', password: 'abc' });

    await component.signIn();

    expect(mockAuthService.signIn).not.toHaveBeenCalled();
    expect(component.message()).toBe('Password must be at least 6 characters.');
  });

  it('adopts values a password manager wrote straight into the DOM', async () => {
    // Password managers and browser autofill often set input.value without dispatching an
    // input event, leaving the FormControl empty while the user sees a filled-in form. The
    // submit path must read the DOM before deciding the form is invalid.
    mockAuthService.signIn.and.resolveTo();
    const inputs: HTMLInputElement[] = fixture.nativeElement.querySelectorAll('input');
    inputs[0].value = 'autofilled@example.com';
    inputs[1].value = 'autofilled-secret';
    expect(component.form.controls.email.value).toBe('');

    await component.signIn();

    expect(mockAuthService.signIn).toHaveBeenCalledWith('autofilled@example.com', 'autofilled-secret');
    expect(component.message()).toBe('Signed in.');
  });

  it('does not let a stale DOM value override what the user typed', async () => {
    mockAuthService.signIn.and.resolveTo();
    const inputs: HTMLInputElement[] = fixture.nativeElement.querySelectorAll('input');
    component.form.patchValue({ email: 'typed@example.com', password: 'typed-secret' });
    fixture.detectChanges();
    inputs[0].value = 'stale@example.com';

    await component.signIn();

    expect(mockAuthService.signIn).toHaveBeenCalledWith('typed@example.com', 'typed-secret');
  });

  it('should navigate to dashboard on successful signIn', async () => {
    mockAuthService.signIn.and.resolveTo();

    component.form.patchValue({ email: 'test@example.com', password: 'password123' });
    
    await component.signIn();
    
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard']);
    expect(component.message()).toBe('Signed in.');
  });
});
