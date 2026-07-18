import { monteCarloAccounts, monteCarloScenario, GOLDEN_SEED } from '../golden-scenarios/golden-scenarios';
import { runMonteCarloStochasticLongevity } from './monte-carlo';

describe('stochastic longevity Monte Carlo', () => {
  it('is reproducible and reports a mortality distribution', () => {
    const a = runMonteCarloStochasticLongevity(monteCarloScenario, monteCarloAccounts, { primarySex: 'male', maximumAge: 110 }, 100, GOLDEN_SEED, true);
    const b = runMonteCarloStochasticLongevity(monteCarloScenario, monteCarloAccounts, { primarySex: 'male', maximumAge: 110 }, 100, GOLDEN_SEED, true);
    expect(a).toEqual(b);
    expect(a.successProbability).toBe(0.98);
    expect(a.longevityStats.medianPrimaryDeathAge).toBe(84);
    expect(a.longevityStats.p10LastSurvivorAge).toBe(71);
    expect(a.longevityStats.p90LastSurvivorAge).toBe(93);
  });
});
