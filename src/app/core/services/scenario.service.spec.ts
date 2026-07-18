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

  beforeEach(() => {
    insertSpy = jasmine.createSpy('insert').and.returnValue(Promise.resolve({ error: null }));
    selectResult = { data: [], error: null };
    const mockClient = {
      from: jasmine.createSpy('from').and.returnValue({
        insert: insertSpy,
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
    insertSpy.and.returnValue(Promise.resolve({ error: dbError }));

    await expectAsync(service.create(scenario, 'user-1')).toBeRejectedWith(dbError);
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
      },
    ];

    const [loaded] = await service.list();
    expect(loaded.annualOtherIncome).toBe(20000);
    expect(loaded.annualWageGrowth).toBe(0.02);
    expect(loaded.residualTaxRate).toBeUndefined();
    expect(loaded.allowPreRetirementConversions).toBeTrue();
    expect(loaded.brokerageGainsTaxRate).toBe(0.15);
    expect(loaded.dividendYield).toBe(0.015);
    expect(loaded.stockAllocation).toBe(0.6);
  });
});
