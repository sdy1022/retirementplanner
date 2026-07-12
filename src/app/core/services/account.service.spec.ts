import { TestBed } from '@angular/core/testing';
import { AccountService } from './account.service';
import { SupabaseService } from './supabase.service';
import { AccountSnapshot } from '../models/retirement.models';

describe('AccountService', () => {
  let service: AccountService;
  let insertSpy: jasmine.Spy;

  const account: AccountSnapshot = { type: 'brokerage', balance: 100000, snapshotDate: '2026-07-09' };

  beforeEach(() => {
    insertSpy = jasmine.createSpy('insert').and.returnValue(Promise.resolve({ error: null }));
    const mockClient = {
      from: jasmine.createSpy('from').and.returnValue({ insert: insertSpy }),
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
    insertSpy.and.returnValue(Promise.resolve({ error: dbError }));

    await expectAsync(service.create(account, 'user-1')).toBeRejectedWith(dbError);
  });
});
