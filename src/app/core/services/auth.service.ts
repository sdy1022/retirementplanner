import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService);

  signIn(email: string, password: string) {
    return this.requireClient().auth.signInWithPassword({ email, password });
  }

  signUp(email: string, password: string) {
    return this.requireClient().auth.signUp({ email, password });
  }

  signOut() {
    return this.requireClient().auth.signOut();
  }

  private requireClient() {
    if (!this.supabase.client) {
      throw new Error('Supabase environment values are not configured.');
    }
    return this.supabase.client;
  }
}
