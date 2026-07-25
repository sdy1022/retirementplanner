import { TestBed } from '@angular/core/testing';
import { ScenarioService } from './scenario.service';
import { SupabaseService } from './supabase.service';
import { Scenario } from '../models/retirement.models';

describe('ScenarioService', () => {
  let service: ScenarioService;
  let insertSpy: jasmine.Spy;
  let selectResult: { data: unknown[] | null; error: Error | null };

  const scenario: Scenario = {
    name: 'Test',
    currentAge: 53,
    retirementAge: 60,
    birthYear: 1973,
    ssClaimAge: 67,
    ssPia: 2200,
    lifeExpectancy: 90,
    filingStatus: 'married_filing_jointly',
    rothConversionStrategy: { mode: 'smooth-income-target', targetBracket: 0.24 },
    assumedReturnRate: 0.08,
    stockAllocation: 0.6,
    stateTaxRate: 0.0495,
    wageIncome: 180000,
    annualOtherIncome: 20000,
    annualLivingExpenses: 120000,
    dividendYield: 0.015,
  };

  let updateSpy: jasmine.Spy;
  let updateResult: { data: unknown[] | null; error: Error | null };

  beforeEach(() => {
    insertSpy = jasmine.createSpy('insert').and.returnValue({
      select: () => ({ single: () => Promise.resolve({ data: { id: 'new-row' }, error: null }) }),
    });
    updateResult = { data: [{ id: 'row-1' }], error: null };
    updateSpy = jasmine.createSpy('update').and.callFake(() => ({
      eq: () => ({ eq: () => ({ select: () => Promise.resolve(updateResult) }) }),
    }));
    selectResult = { data: [], error: null };
    const mockClient = {
      from: jasmine.createSpy('from').and.returnValue({
        insert: insertSpy,
        update: updateSpy,
        select: () => ({ order: () => Promise.resolve(selectResult) }),
      }),
    };

    TestBed.configureTestingModule({
      providers: [ScenarioService, { provide: SupabaseService, useValue: { client: mockClient } }],
    });
    service = TestBed.inject(ScenarioService);
  });

  it('create persists the newer scenario fields', async () => {
    await service.create(scenario, 'user-1');
    const row = insertSpy.calls.mostRecent().args[0];
    expect(row.annual_other_income).toBe(20000);
    expect(row.dividend_yield).toBe(0.015);
    expect(row.filing_status).toBe('married_filing_jointly');
    expect(row.stock_allocation).toBe(0.6);
  });

  it('create throws when Supabase returns an error instead of resolving silently', async () => {
    const dbError = new Error('violates check constraint');
    insertSpy.and.returnValue({ select: () => ({ single: () => Promise.resolve({ data: null, error: dbError }) }) });

    await expectAsync(service.create(scenario, 'user-1')).toBeRejectedWith(dbError);
  });

  it('create writes every column the accumulation and IRMAA inputs need', async () => {
    // Regression test for the PGRST204 failure: these four columns were written by the client
    // but never created by a migration, so any cloud save after a Scenario Builder submit
    // (which defaults them to 0 rather than leaving them undefined) failed outright.
    await service.create(
      { ...scenario, annualPreTaxContribution: 23500, annualRothContribution: 7000, annualBrokerageContribution: 12000, employerMatch: 5000, ssColaRate: 0.025, preSimulationMagi: 210000, spendingOrder: 'brokerage-first' },
      'user-1',
    );
    const row = insertSpy.calls.mostRecent().args[0];
    expect(row.annual_pre_tax_contribution).toBe(23500);
    expect(row.annual_roth_contribution).toBe(7000);
    expect(row.annual_brokerage_contribution).toBe(12000);
    expect(row.employer_match).toBe(5000);
    expect(row.ss_cola_rate).toBe(0.025);
    expect(row.pre_simulation_magi).toBe(210000);
    expect(row.spending_order).toBe('brokerage-first');
  });

  it('save updates the existing row when the scenario came from the cloud', async () => {
    // Insert-only saving used to append a row per click, growing the table without bound
    const id = await service.save({ ...scenario, id: 'row-1' }, 'user-1');
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(insertSpy).not.toHaveBeenCalled();
    expect(id).toBe('row-1');
  });

  it('save inserts and returns a new id for a scenario that has never been saved', async () => {
    const id = await service.save(scenario, 'user-1');
    expect(updateSpy).not.toHaveBeenCalled();
    expect(id).toBe('new-row');
  });

  it('save falls back to inserting when the row it targets no longer exists', async () => {
    updateResult = { data: [], error: null };
    const id = await service.save({ ...scenario, id: 'deleted-row' }, 'user-1');
    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(id).toBe('new-row');
  });

  it('list maps the newer scenario columns back to the model', async () => {
    selectResult.data = [
      {
        id: 'row-1',
        user_id: 'user-1',
        name: 'Test',
        current_age: 60,
        retirement_age: 60,
        birth_year: 1966,
        ss_claim_age: 67,
        ss_pia: '3300',
        life_expectancy: 90,
        filing_status: 'married_filing_jointly',
        roth_conversion_strategy: { mode: 'smooth-income-target', targetBracket: 0.24 },
        assumed_return_rate: '0.08',
        stock_allocation: '0.6',
        state_tax_rate: '0.0495',
        wage_income: '100000',
        annual_living_expenses: '150000',
        annual_other_income: '20000',
        annual_wage_growth: '0.02',
        residual_tax_rate: null,
        allow_pre_retirement_conversions: true,
        brokerage_gains_tax_rate: '0.15',
        dividend_yield: '0.015',
        ss_cola_rate: '0.02',
        pre_simulation_magi: '210000',
        spending_order: 'traditional-first',
        sbloc_tax_funding: { startAge: 65, endAge: 75, borrowRate: 0.06 },
      },
    ];

    const [loaded] = await service.list();
    expect(loaded.ssColaRate).toBe(0.02);
    expect(loaded.preSimulationMagi).toBe(210000);
    expect(loaded.spendingOrder).toBe('traditional-first');
    expect(loaded.sblocTaxFunding).toEqual({ startAge: 65, endAge: 75, borrowRate: 0.06 });
    expect(loaded.annualOtherIncome).toBe(20000);
    expect(loaded.annualWageGrowth).toBe(0.02);
    expect(loaded.residualTaxRate).toBeUndefined();
    expect(loaded.allowPreRetirementConversions).toBeTrue();
    expect(loaded.brokerageGainsTaxRate).toBe(0.15);
    expect(loaded.dividendYield).toBe(0.015);
    expect(loaded.stockAllocation).toBe(0.6);
  });
});
