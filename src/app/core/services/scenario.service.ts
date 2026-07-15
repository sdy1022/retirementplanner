import { Injectable, inject } from '@angular/core';
import { Scenario } from '../models/retirement.models';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class ScenarioService {
  private readonly supabase = inject(SupabaseService);

  async list(): Promise<Scenario[]> {
    const { data, error } = await this.requireClient().from('scenarios').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      currentAge: row.current_age,
      retirementAge: row.retirement_age,
      birthYear: row.birth_year,
      ssClaimAge: row.ss_claim_age,
      ssPia: Number(row.ss_pia),
      lifeExpectancy: row.life_expectancy,
      filingStatus: row.filing_status,
      rothConversionStrategy: row.roth_conversion_strategy,
      assumedReturnRate: Number(row.assumed_return_rate),
      stateTaxRate: Number(row.state_tax_rate ?? 0),
      wageIncome: Number(row.wage_income ?? 0),
      annualLivingExpenses: Number(row.annual_living_expenses ?? 0),
      annualOtherIncome: Number(row.annual_other_income ?? 0),
      annualPreTaxContribution: Number(row.annual_pre_tax_contribution ?? 0),
      annualRothContribution: Number(row.annual_roth_contribution ?? 0),
      annualBrokerageContribution: Number(row.annual_brokerage_contribution ?? 0),
      employerMatch: Number(row.employer_match ?? 0),
      annualWageGrowth: Number(row.annual_wage_growth ?? 0),
      residualTaxRate: row.residual_tax_rate == null ? undefined : Number(row.residual_tax_rate),
      allowPreRetirementConversions: row.allow_pre_retirement_conversions ?? false,
      brokerageGainsTaxRate: Number(row.brokerage_gains_tax_rate ?? 0),
      dividendYield: row.dividend_yield == null ? undefined : Number(row.dividend_yield),
    }));
  }

  async create(scenario: Scenario, userId: string): Promise<void> {
    const { error } = await this.requireClient().from('scenarios').insert({
      user_id: userId,
      name: scenario.name,
      current_age: scenario.currentAge,
      retirement_age: scenario.retirementAge,
      birth_year: scenario.birthYear,
      ss_claim_age: scenario.ssClaimAge,
      ss_pia: scenario.ssPia,
      life_expectancy: scenario.lifeExpectancy,
      filing_status: scenario.filingStatus,
      roth_conversion_strategy: scenario.rothConversionStrategy,
      assumed_return_rate: scenario.assumedReturnRate,
      state_tax_rate: scenario.stateTaxRate,
      wage_income: scenario.wageIncome,
      annual_living_expenses: scenario.annualLivingExpenses,
      annual_other_income: scenario.annualOtherIncome,
      annual_pre_tax_contribution: scenario.annualPreTaxContribution,
      annual_roth_contribution: scenario.annualRothContribution,
      annual_brokerage_contribution: scenario.annualBrokerageContribution,
      employer_match: scenario.employerMatch,
      annual_wage_growth: scenario.annualWageGrowth,
      residual_tax_rate: scenario.residualTaxRate,
      allow_pre_retirement_conversions: scenario.allowPreRetirementConversions,
      brokerage_gains_tax_rate: scenario.brokerageGainsTaxRate,
      dividend_yield: scenario.dividendYield,
    });
    if (error) throw error;
  }

  private requireClient() {
    if (!this.supabase.client) throw new Error('Supabase environment values are not configured.');
    return this.supabase.client;
  }
}
