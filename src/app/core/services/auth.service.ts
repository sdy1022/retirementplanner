import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { User } from '@supabase/supabase-js';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService);

  readonly currentUser = signal<User | null>(null);

  constructor() {
    this.initAuth();
  }

  private async initAuth() {
    if (!this.supabase.client) return;

    // Subscribe before the initial fetch so no auth event can slip between the two
    this.supabase.client.auth.onAuthStateChange((_event, session) => {
      this.currentUser.set(session?.user ?? null);
    });

    const { data: { session } } = await this.supabase.client.auth.getSession();
    this.currentUser.set(session?.user ?? null);
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
