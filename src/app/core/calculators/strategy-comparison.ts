import { Scenario } from '../models/retirement.models';

export type ComparisonConversionMode = 'current' | 'none';

export interface StrategyComparisonOption {
  name: string;
  retirementAge: number;
  stockAllocation: number;
  useGuardrail: boolean;
  conversionMode: ComparisonConversionMode;
}

/**
 * Builds one comparison scenario without mutating the saved scenario.
 * Every option is later simulated with the same seed, so market, inflation,
 * and mortality random streams remain aligned across strategies.
 */
export function buildComparisonScenario(base: Scenario, option: StrategyComparisonOption): Scenario {
  return {
    ...base,
    name: option.name,
    retirementAge: Math.max(Math.ceil(base.currentAge), Math.floor(option.retirementAge)),
    stockAllocation: clamp(option.stockAllocation, 0, 1),
    rothConversionStrategy: option.conversionMode === 'none'
      ? { mode: 'none' }
      : cloneStrategy(base.rothConversionStrategy),
  };
}

function cloneStrategy(strategy: Scenario['rothConversionStrategy']): Scenario['rothConversionStrategy'] {
  return { ...strategy } as Scenario['rothConversionStrategy'];
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}
