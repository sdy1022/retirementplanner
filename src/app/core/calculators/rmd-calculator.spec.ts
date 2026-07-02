import { calculateRmdSchedule, getRmdStartAge } from './rmd-calculator';

describe('rmd-calculator', () => {
  it('uses SECURE 2.0 start ages by birth year', () => {
    expect(getRmdStartAge(1959)).toBe(73);
    expect(getRmdStartAge(1960)).toBe(75);
  });

  it('calculates the first RMD from the uniform lifetime divisor', () => {
    const schedule = calculateRmdSchedule(530000, 72, 73, 73, 0);
    expect(schedule[0]).toEqual({ age: 73, divisor: 26.5, beginningBalance: 530000, rmd: 20000 });
  });
});
