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
    }));
  }

  create(scenario: Scenario, userId: string) {
    return this.requireClient().from('scenarios').insert({
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
    });
  }

  private requireClient() {
    if (!this.supabase.client) throw new Error('Supabase environment values are not configured.');
    return this.supabase.client;
  }
}
