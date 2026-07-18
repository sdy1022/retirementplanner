import { createSeededRng } from '../calculators/monte-carlo-returns';
import { deriveSeed, sampleDeathAge } from './mortality-sampler';

const always = (value: number) => () => value;

describe('mortality sampler', () => {
  it('is reproducible for a fixed seed', () => {
    const a = sampleDeathAge({ currentAge: 60, sex: 'male', maximumAge: 110 }, createSeededRng(1234));
    const b = sampleDeathAge({ currentAge: 60, sex: 'male', maximumAge: 110 }, createSeededRng(1234));
    expect(a).toBe(b);
  });

  it('dies immediately when qx is one', () => {
    expect(sampleDeathAge({ currentAge: 65, sex: 'female' }, always(0.5), () => 1)).toBe(65);
  });

  it('survives to the cap when qx is zero', () => {
    expect(sampleDeathAge({ currentAge: 65, sex: 'female', maximumAge: 105 }, always(0.5), () => 0)).toBe(105);
  });

  it('derives stable independent namespaces', () => {
    expect(deriveSeed(42, 'market')).toBe(deriveSeed(42, 'market'));
    expect(deriveSeed(42, 'market')).not.toBe(deriveSeed(42, 'mortality'));
  });
});
