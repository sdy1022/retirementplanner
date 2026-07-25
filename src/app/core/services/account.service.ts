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
    return (data ?? []).map((row) => this.toModel(row));
  }

  /**
   * Makes the cloud copy match the local account list and returns the list with row ids
   * filled in, so the caller can store them and keep later saves idempotent.
   *
   * `createMany` alone used to be called on every "Save to Supabase" click, which appended a
   * fresh copy of every account each time — save twice with four accounts and "Load from
   * Supabase" returned eight. Ordering here is deliberately non-destructive: insert and
   * update first, delete only what the user actually removed locally, so a mid-way failure
   * can never leave the cloud copy emptier than the local one.
   */
  async syncAll(accounts: AccountSnapshot[], userId: string): Promise<AccountSnapshot[]> {
    const client = this.requireClient();

    // RLS scopes this to the signed-in user, so these are exactly the rows we may prune
    const { data: existing, error: listError } = await client.from('accounts').select('id');
    if (listError) throw listError;

    const inserted = await this.createMany(accounts.filter((account) => !account.id), userId);

    const updated: AccountSnapshot[] = [];
    for (const account of accounts.filter((a) => a.id)) {
      const { data, error } = await client
        .from('accounts')
        .update(this.toRow(account, userId))
        .eq('id', account.id!)
        .eq('user_id', userId)
        .select('*');
      if (error) throw error;
      // Row deleted elsewhere: re-insert instead of dropping the account on the floor
      updated.push(data?.length ? this.toModel(data[0]) : (await this.createMany([{ ...account, id: undefined }], userId))[0]);
    }

    const keptIds = new Set([...inserted, ...updated].map((account) => account.id));
    const removedIds = (existing ?? []).map((row) => row.id as string).filter((id) => !keptIds.has(id));
    if (removedIds.length) {
      const { error } = await client.from('accounts').delete().in('id', removedIds).eq('user_id', userId);
      if (error) throw error;
    }

    return [...inserted, ...updated];
  }

  async create(account: AccountSnapshot, userId: string): Promise<AccountSnapshot[]> {
    return this.createMany([account], userId);
  }

  async createMany(accounts: AccountSnapshot[], userId: string): Promise<AccountSnapshot[]> {
    if (!accounts.length) return [];
    const rows = accounts.map((account) => this.toRow(account, userId));
    const { data, error } = await this.requireClient().from('accounts').insert(rows).select('*');
    if (error) throw error;
    return (data ?? []).map((row) => this.toModel(row));
  }

  private toRow(account: AccountSnapshot, userId: string) {
    return {
      user_id: userId,
      name: account.name,
      owner: account.owner,
      type: account.type,
      balance: account.balance,
      cost_basis: account.costBasis,
      snapshot_date: account.snapshotDate,
    };
  }

  private toModel(row: Record<string, unknown>): AccountSnapshot {
    return {
      id: row['id'] as string,
      userId: row['user_id'] as string,
      name: (row['name'] as string) ?? undefined,
      owner: (row['owner'] as AccountSnapshot['owner']) ?? undefined,
      type: row['type'] as AccountSnapshot['type'],
      balance: Number(row['balance']),
      costBasis: row['cost_basis'] == null ? undefined : Number(row['cost_basis']),
      snapshotDate: row['snapshot_date'] as string,
    };
  }

  private requireClient() {
    if (!this.supabase.client) throw new Error('Supabase environment values are not configured.');
    return this.supabase.client;
  }
}
