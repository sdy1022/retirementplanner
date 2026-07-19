import { Scenario } from '../models/retirement.models';
import { buildComparisonScenario } from './strategy-comparison';

describe('strategy comparison', () => {
  const base: Scenario = {
    name: 'Base', currentAge: 60, retirementAge: 62, birthYear: 1966,
    ssClaimAge: 67, ssPia: 3000, lifeExpectancy: 90,
    filingStatus: 'single', rothConversionStrategy: { mode: 'fixed-amount', amount: 25000 },
    assumedReturnRate: 0.06, stockAllocation: 0.6, stateTaxRate: 0,
    wageIncome: 100000, annualLivingExpenses: 70000,
  };

  it('creates an isolated scenario override without mutating the saved scenario', () => {
    const compared = buildComparisonScenario(base, {
      name: 'Later retirement', retirementAge: 65, stockAllocation: 0.7,
      useGuardrail: true, conversionMode: 'none',
    });

    expect(compared.name).toBe('Later retirement');
    expect(compared.retirementAge).toBe(65);
    expect(compared.stockAllocation).toBe(0.7);
    expect(compared.rothConversionStrategy.mode).toBe('none');
    expect(base.retirementAge).toBe(62);
    expect(base.stockAllocation).toBe(0.6);
    expect(base.rothConversionStrategy.mode).toBe('fixed-amount');
  });

  it('clamps invalid ages and allocations to safe bounds', () => {
    const compared = buildComparisonScenario(base, {
      name: 'Invalid', retirementAge: 55, stockAllocation: 1.5,
      useGuardrail: false, conversionMode: 'current',
    });

    expect(compared.retirementAge).toBe(60);
    expect(compared.stockAllocation).toBe(1);
  });
});
