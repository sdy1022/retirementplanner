import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

describe('AuthService', () => {
  let service: AuthService;
  let mockSupabaseClient: any;

  beforeEach(() => {
    mockSupabaseClient = {
      auth: {
        getSession: jasmine.createSpy('getSession').and.returnValue(Promise.resolve({ data: { session: null }, error: null })),
        onAuthStateChange: jasmine.createSpy('onAuthStateChange'),
        signInWithPassword: jasmine.createSpy('signInWithPassword'),
        signUp: jasmine.createSpy('signUp'),
        signOut: jasmine.createSpy('signOut')
      }
    };

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        {
          provide: SupabaseService,
          useValue: { client: mockSupabaseClient }
        }
      ]
    });
    service = TestBed.inject(AuthService);
  });

  it('should initialize session signal on creation', async () => {
    expect(mockSupabaseClient.auth.getSession).toHaveBeenCalled();
    expect(service.currentUser()).toBeNull();
  });

  it('should throw error when signIn fails', async () => {
    const mockError = new Error('Invalid credentials');
    mockSupabaseClient.auth.signInWithPassword.and.returnValue(Promise.resolve({ data: null, error: mockError }));
    
    try {
      await service.signIn('test@test.com', 'wrongpassword');
      fail('Should have thrown an error');
    } catch (e) {
      expect(e).toBe(mockError);
    }
  });

  it('should return data when signIn succeeds', async () => {
    mockSupabaseClient.auth.signInWithPassword.and.returnValue(Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }));
    const result = await service.signIn('test@test.com', 'password');
    expect(result).toEqual(jasmine.objectContaining({ user: jasmine.objectContaining({ id: 'user-1' }) }));
  });

  it('should throw error when signUp fails', async () => {
    const mockError = new Error('Email already taken');
    mockSupabaseClient.auth.signUp.and.returnValue(Promise.resolve({ data: null, error: mockError }));
    
    try {
      await service.signUp('test@test.com', 'password');
      fail('Should have thrown an error');
    } catch (e) {
      expect(e).toBe(mockError);
    }
  });
});
