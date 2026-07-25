import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { LocalStateService } from './local-state.service';

describe('AuthService', () => {
  let service: AuthService;
  let mockSupabaseClient: any;
  let localState: jasmine.SpyObj<LocalStateService>;
  let initialSession: { user: { id: string } } | null;
  /** Pushes an auth event the way supabase-js would, after the service subscribed */
  let emitAuthChange: (session: { user: { id: string } } | null) => void;

  const configure = () => {
    initialSession = initialSession ?? null;
    mockSupabaseClient = {
      auth: {
        getSession: jasmine.createSpy('getSession').and.callFake(() => Promise.resolve({ data: { session: initialSession }, error: null })),
        onAuthStateChange: jasmine.createSpy('onAuthStateChange').and.callFake((handler: (event: string, session: unknown) => void) => {
          emitAuthChange = (session) => handler(session ? 'SIGNED_IN' : 'SIGNED_OUT', session);
          return { data: { subscription: { unsubscribe: () => {} } } };
        }),
        signInWithPassword: jasmine.createSpy('signInWithPassword'),
        signUp: jasmine.createSpy('signUp'),
        signOut: jasmine.createSpy('signOut').and.returnValue(Promise.resolve({ error: null })),
      },
    };
    localState = jasmine.createSpyObj<LocalStateService>('LocalStateService', ['clearAllData']);

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: SupabaseService, useValue: { client: mockSupabaseClient } },
        { provide: LocalStateService, useValue: localState },
      ],
    });
    service = TestBed.inject(AuthService);
  };

  beforeEach(() => {
    initialSession = null;
    configure();
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

  it('should throw error when signOut fails', async () => {
    const mockError = new Error('network down');
    mockSupabaseClient.auth.signOut.and.returnValue(Promise.resolve({ error: mockError }));

    await expectAsync(service.signOut()).toBeRejectedWith(mockError);
  });

  describe('local plan data lifecycle', () => {
    it('clears the browser-local plan when the user signs out', async () => {
      // Balances live in localStorage, which the next person at this browser profile can see
      emitAuthChange({ user: { id: 'user-1' } });
      expect(localState.clearAllData).not.toHaveBeenCalled();

      emitAuthChange(null);
      expect(localState.clearAllData).toHaveBeenCalledTimes(1);
      expect(service.currentUser()).toBeNull();
    });

    it('clears the local plan when a different account signs in', async () => {
      // Otherwise user A's balances stay loaded and a "Save to Supabase" click by user B
      // would write A's numbers into B's rows.
      emitAuthChange({ user: { id: 'user-1' } });
      emitAuthChange({ user: { id: 'user-2' } });
      expect(localState.clearAllData).toHaveBeenCalledTimes(1);
    });

    it('keeps work entered anonymously when that visitor signs in', async () => {
      // The whole point of signing in is usually to save what you just typed
      emitAuthChange({ user: { id: 'user-1' } });
      expect(localState.clearAllData).not.toHaveBeenCalled();
    });

    it('keeps the local plan across token refreshes for the same user', async () => {
      emitAuthChange({ user: { id: 'user-1' } });
      emitAuthChange({ user: { id: 'user-1' } });
      emitAuthChange({ user: { id: 'user-1' } });
      expect(localState.clearAllData).not.toHaveBeenCalled();
    });

    it('keeps the local plan when a page load restores an existing session', async () => {
      // Guards against wiping data on every refresh: restoring a session is not a user change
      initialSession = { user: { id: 'user-1' } };
      TestBed.resetTestingModule();
      configure();
      await Promise.resolve();

      emitAuthChange({ user: { id: 'user-1' } });
      expect(localState.clearAllData).not.toHaveBeenCalled();
      expect(service.currentUser()?.id).toBe('user-1');
    });
  });
});
