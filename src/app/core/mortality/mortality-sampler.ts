import { MortalitySex, SSA_MORTALITY_MAX_AGE, ssaDeathProbability } from './ssa-period-life-table';

export interface MortalityProfile {
  currentAge: number;
  sex: MortalitySex;
  maximumAge?: number;
}

export type DeathProbabilityProvider = (age: number, sex: MortalitySex) => number;

export function deriveSeed(seed: number, namespace: string): number {
  let hash = seed >>> 0;
  for (let i = 0; i < namespace.length; i++) {
    hash ^= namespace.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function sampleDeathAge(
  profile: MortalityProfile,
  random: () => number,
  probabilityProvider: DeathProbabilityProvider = ssaDeathProbability,
): number {
  const startAge = Math.max(0, Math.floor(profile.currentAge));
  const maximumAge = Math.max(startAge, Math.min(120, Math.floor(profile.maximumAge ?? SSA_MORTALITY_MAX_AGE)));
  for (let age = startAge; age < maximumAge; age++) {
    const qx = Math.min(1, Math.max(0, probabilityProvider(age, profile.sex)));
    if (random() < qx) return age;
  }
  return maximumAge;
}
