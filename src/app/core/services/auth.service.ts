import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { LocalStateService } from './local-state.service';
import { User } from '@supabase/supabase-js';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService);
  private readonly localState = inject(LocalStateService);

  readonly currentUser = signal<User | null>(null);

  /**
   * Who this browser tab last saw signed in. Tracked in memory rather than localStorage on
   * purpose: a stale persisted id would wipe plan data on an ordinary page load, and work
   * entered anonymously must survive until the user actually signs out.
   */
  private lastKnownUserId: string | null = null;

  constructor() {
    this.initAuth();
  }

  private async initAuth() {
    if (!this.supabase.client) return;

    // Subscribe before the initial fetch so no auth event can slip between the two
    this.supabase.client.auth.onAuthStateChange((_event, session) => {
      this.applySession(session?.user ?? null);
    });

    const { data: { session } } = await this.supabase.client.auth.getSession();
    this.applySession(session?.user ?? null);
  }

  private applySession(user: User | null): void {
    const previousUserId = this.lastKnownUserId;
    this.lastKnownUserId = user?.id ?? null;
    this.currentUser.set(user);

    // Balances and scenarios live in localStorage, which is shared by everyone using this
    // browser profile. Once a session ends — sign-out, or a different account signing in —
    // the previous user's plan must not stay on screen or, worse, get written into the next
    // user's cloud rows by a "Save to Supabase" click. Signing in from an anonymous session
    // (previousUserId === null) deliberately keeps the local plan so unsaved work survives.
    if (previousUserId && previousUserId !== this.lastKnownUserId) {
      this.localState.clearAllData();
    }
  }

  async signIn(email: string, password: string) {
    const { data, error } = await this.requireClient().auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async signUp(email: string, password: string) {
    const { data, error } = await this.requireClient().auth.signUp({ email, password });
    if (error) throw error;
    return data;
  }

  async signOut() {
    const { error } = await this.requireClient().auth.signOut();
    if (error) throw error;
  }

  private requireClient() {
    if (!this.supabase.client) {
      throw new Error('Supabase environment values are not configured.');
    }
    return this.supabase.client;
  }
}
