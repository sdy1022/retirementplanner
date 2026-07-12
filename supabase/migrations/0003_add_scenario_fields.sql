alter table scenarios add column if not exists annual_other_income numeric default 0;
alter table scenarios add column if not exists annual_wage_growth numeric default 0;
alter table scenarios add column if not exists residual_tax_rate numeric;
alter table scenarios add column if not exists allow_pre_retirement_conversions boolean default false;
alter table scenarios add column if not exists brokerage_gains_tax_rate numeric default 0;
alter table scenarios add column if not exists dividend_yield numeric;

alter table scenarios drop constraint if exists scenarios_filing_status_check;
alter table scenarios add constraint scenarios_filing_status_check
  check (filing_status in ('single', 'married_filing_jointly'));
