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

  it('should navigate to dashboard on successful signIn', async () => {
    mockAuthService.signIn.and.resolveTo();

    component.form.patchValue({ email: 'test@example.com', password: 'password123' });
    
    await component.signIn();
    
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard']);
    expect(component.message()).toBe('Signed in.');
  });
});
