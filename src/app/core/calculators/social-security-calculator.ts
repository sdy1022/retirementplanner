import { FilingStatus } from '../models/retirement.models';

// IRS provisional-income thresholds for Social Security taxability (fixed by law, not indexed)
const SS_TAX_THRESHOLDS: Record<FilingStatus, { base: number; upper: number }> = {
  single: { base: 25000, upper: 34000 },
  married_filing_jointly: { base: 32000, upper: 44000 },
};

// Taxable portion of Social Security under the IRS provisional-income formula:
// 0% below the base threshold, up to 50% between thresholds, up to 85% above.
export function taxableSocialSecurity(annualBenefit: number, otherOrdinaryIncome: number, filingStatus: FilingStatus): number {
  if (annualBenefit <= 0) return 0;
  const { base, upper } = SS_TAX_THRESHOLDS[filingStatus];
  const provisionalIncome = otherOrdinaryIncome + annualBenefit / 2;
  if (provisionalIncome <= base) return 0;
  if (provisionalIncome <= upper) {
    return Math.min(annualBenefit * 0.5, (provisionalIncome - base) * 0.5);
  }
  return Math.min(
    annualBenefit * 0.85,
    (provisionalIncome - upper) * 0.85 + Math.min(annualBenefit * 0.5, (upper - base) * 0.5),
  );
}

export interface SocialSecurityComparison {
  age: 62 | 67 | 70;
  annualBenefit: number;
  lifetimePV: number;
  breakevenAge?: number;
}

export function compareClaimingAges(pia: number, ages: Array<62 | 67 | 70> = [62, 67, 70], lifeExpectancy = 90, discountRate = 0.02): SocialSecurityComparison[] {
  const comparisons = ages.map((age) => ({
    age,
    annualBenefit: annualBenefitForClaimAge(pia, age),
    lifetimePV: presentValuePayments(annualBenefitForClaimAge(pia, age), age, lifeExpectancy, discountRate),
  }));

  return comparisons.map((comparison) => ({
    ...comparison,
    breakevenAge: breakevenAgainstEarliest(comparison, comparisons, lifeExpectancy, discountRate),
  }));
}

function annualBenefitForClaimAge(pia: number, age: 62 | 67 | 70): number {
  const multiplier = age === 62 ? 0.7 : age === 70 ? 1.24 : 1;
  return Math.round(pia * 12 * multiplier);
}

function presentValuePayments(annualBenefit: number, claimAge: number, lifeExpectancy: number, discountRate: number): number {
  let total = 0;
  for (let age = claimAge; age <= lifeExpectancy; age++) {
    total += annualBenefit / Math.pow(1 + discountRate, age - claimAge);
  }
  return Math.round(total);
}

function breakevenAgainstEarliest(target: SocialSecurityComparison, comparisons: SocialSecurityComparison[], lifeExpectancy: number, discountRate: number): number | undefined {
  const earliest = comparisons.reduce((min, current) => (current.age < min.age ? current : min));
  if (target.age === earliest.age) {
    return undefined;
  }

  let earlyTotal = 0;
  let targetTotal = 0;
  for (let age = earliest.age; age <= lifeExpectancy; age++) {
    if (age >= earliest.age) {
      earlyTotal += earliest.annualBenefit / Math.pow(1 + discountRate, age - earliest.age);
    }
    if (age >= target.age) {
      targetTotal += target.annualBenefit / Math.pow(1 + discountRate, age - earliest.age);
    }
    if (targetTotal >= earlyTotal) {
      return age;
    }
  }

  return undefined;
}
