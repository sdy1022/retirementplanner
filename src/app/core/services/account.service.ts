import { Injectable, inject } from '@angular/core';
import { AccountSnapshot } from '../models/retirement.models';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class AccountService {
  private readonly supabase = inject(SupabaseService);

  async list(): Promise<AccountSnapshot[]> {
    const { data, error } = await this.requireClient()
      .from('accounts')
      .select('*')
      .order('snapshot_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      type: row.type,
      balance: Number(row.balance),
      costBasis: row.cost_basis == null ? undefined : Number(row.cost_basis),
      snapshotDate: row.snapshot_date,
    }));
  }

  async create(account: AccountSnapshot, userId: string): Promise<void> {
    await this.createMany([account], userId);
  }

  async createMany(accounts: AccountSnapshot[], userId: string): Promise<void> {
    const rows = accounts.map((account) => ({
      user_id: userId,
      type: account.type,
      balance: account.balance,
      cost_basis: account.costBasis,
      snapshot_date: account.snapshotDate,
    }));
    const { error } = await this.requireClient().from('accounts').insert(rows);
    if (error) throw error;
  }

  private requireClient() {
    if (!this.supabase.client) throw new Error('Supabase environment values are not configured.');
    return this.supabase.client;
  }
}
