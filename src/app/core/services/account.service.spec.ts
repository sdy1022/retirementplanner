import { TestBed } from '@angular/core/testing';
import { AccountService } from './account.service';
import { SupabaseService } from './supabase.service';
import { AccountSnapshot } from '../models/retirement.models';

describe('AccountService', () => {
  let service: AccountService;
  let insertSpy: jasmine.Spy;
  let updateSpy: jasmine.Spy;
  let deleteSpy: jasmine.Spy;
  let deletedIds: string[];
  let existingIds: { id: string }[];

  const account: AccountSnapshot = { type: 'brokerage', balance: 100000, snapshotDate: '2026-07-09' };
  const row = (id: string, overrides: Record<string, unknown> = {}) => ({
    id, user_id: 'user-1', type: 'brokerage', balance: '100000', cost_basis: null, snapshot_date: '2026-07-09', name: null, owner: null, ...overrides,
  });

  beforeEach(() => {
    existingIds = [];
    deletedIds = [];
    // insert(...).select('*') resolves to the persisted rows (ids assigned by the database)
    insertSpy = jasmine.createSpy('insert').and.callFake((rows: Record<string, unknown>[]) => ({
      select: () => Promise.resolve({ data: rows.map((r, i) => row(`new-${i + 1}`, r)), error: null }),
    }));
    updateSpy = jasmine.createSpy('update').and.callFake((values: Record<string, unknown>) => ({
      eq: (_c: string, id: string) => ({ eq: () => ({ select: () => Promise.resolve({ data: [row(id, values)], error: null }) }) }),
    }));
    deleteSpy = jasmine.createSpy('delete').and.callFake(() => ({
      in: (_column: string, ids: string[]) => { deletedIds = ids; return { eq: () => Promise.resolve({ error: null }) }; },
    }));

    const mockClient = {
      from: jasmine.createSpy('from').and.returnValue({
        insert: insertSpy,
        update: updateSpy,
        delete: deleteSpy,
        select: (columns: string) =>
          columns === 'id'
            ? Promise.resolve({ data: existingIds, error: null })
            : { order: () => ({ order: () => Promise.resolve({ data: existingIds.map((r) => row(r.id)), error: null }) }) },
      }),
    };

    TestBed.configureTestingModule({
      providers: [AccountService, { provide: SupabaseService, useValue: { client: mockClient } }],
    });
    service = TestBed.inject(AccountService);
  });

  it('createMany inserts all accounts in a single call', async () => {
    await service.createMany([account, { ...account, type: 'roth_ira' }], 'user-1');
    expect(insertSpy).toHaveBeenCalledTimes(1);
    const rows = insertSpy.calls.mostRecent().args[0];
    expect(rows.length).toBe(2);
    expect(rows[0].user_id).toBe('user-1');
  });

  it('create throws when Supabase returns an error instead of resolving silently', async () => {
    const dbError = new Error('row-level security violation');
    insertSpy.and.returnValue({ select: () => Promise.resolve({ data: null, error: dbError }) });

    await expectAsync(service.create(account, 'user-1')).toBeRejectedWith(dbError);
  });

  it('syncAll returns the accounts with their row ids so the next save can update in place', async () => {
    const saved = await service.syncAll([account, { ...account, type: 'roth_ira' }], 'user-1');
    expect(saved.map((a) => a.id)).toEqual(['new-1', 'new-2']);
  });

  it('syncAll updates accounts that already have ids instead of inserting duplicates', async () => {
    // Regression test for the insert-only cloud sync: saving twice used to append a second
    // copy of every account, so "Load from Supabase" returned 2n rows for n local accounts.
    existingIds = [{ id: 'row-1' }];
    const saved = await service.syncAll([{ ...account, id: 'row-1', balance: 123456 }], 'user-1');

    expect(insertSpy).not.toHaveBeenCalled();
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy.calls.mostRecent().args[0].balance).toBe(123456);
    expect(saved.length).toBe(1);
    expect(saved[0].id).toBe('row-1');
  });

  it('syncAll prunes cloud rows the user deleted locally, and only those', async () => {
    existingIds = [{ id: 'row-1' }, { id: 'row-2' }];
    await service.syncAll([{ ...account, id: 'row-2' }], 'user-1');
    expect(deletedIds).toEqual(['row-1']);
  });

  it('syncAll deletes nothing when the local list still covers every cloud row', async () => {
    existingIds = [{ id: 'row-1' }];
    await service.syncAll([{ ...account, id: 'row-1' }], 'user-1');
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('syncAll inserts before deleting, so a failed insert cannot empty the cloud copy', async () => {
    existingIds = [{ id: 'row-1' }];
    const dbError = new Error('insert failed');
    insertSpy.and.returnValue({ select: () => Promise.resolve({ data: null, error: dbError }) });

    await expectAsync(service.syncAll([account], 'user-1')).toBeRejectedWith(dbError);
    expect(deleteSpy).not.toHaveBeenCalled();
  });
});
