# Retirement Strategy Calculator

A dynamic personal finance tool built with Angular and Supabase to model Roth conversion strategies and Required Minimum Distributions (RMDs) over a lifetime projection.

## 🎯 Purpose

This tool replaces ad-hoc spreadsheet analysis with a repeatable model that allows you to:
- Snapshot your current retirement accounts (401k, Traditional IRA, Roth IRA, Brokerage).
- Compare "baseline" scenarios (doing nothing) against specific Roth conversion strategies (e.g., filling a specific tax bracket each year).
- Visualize your lifetime tax burden, RMD trajectory, and ending asset value to identify the most tax-efficient retirement decumulation strategy.

## 🚀 Tech Stack

- **Frontend**: Angular 20 (Standalone Components)
- **UI Library**: Angular Material + ngx-charts for data visualization
- **Backend**: Supabase (PostgreSQL + Auth)
- **Hosting Target**: Vercel (SPA mode)
- **Computation**: Pure TypeScript functions (no server round-trips for the calculation engine)

## 🧮 Calculation Engine

The core logic lives in `src/app/core/calculators/` and uses pure, immutable functions to ensure deterministic, testable projections:

1. **`tax-tables.ts`**: Hardcoded 2026 IRS tax brackets and standard deductions.
2. **`rmd-calculator.ts`**: Uniform Lifetime Table projection based on the SECURE 2.0 act (handles age 73 or 75 start dates based on birth year).
3. **`tax-bracket-calculator.ts`**: Computes progressive marginal tax logic and "fill-to-bracket-ceiling" math.
4. **`roth-conversion-calculator.ts`**: Simulates the year-by-year Roth conversions and balance depletion.
5. **`social-security-calculator.ts`**: Determines Social Security benefits dynamically during the simulation based on claim age.
6. **`scenario-engine.ts`**: Orchestrates the above across the full projection horizon (from current age up to life expectancy).

## 🛠️ Local Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Supabase**
   - Create a project in [Supabase](https://supabase.com).
   - Run the SQL script located in `supabase/migrations/0001_init.sql` in your Supabase SQL Editor to provision the tables and Row Level Security (RLS) policies.
   - Update `src/environments/environment.ts` (and `environment.production.ts`) with your Supabase URL and Anon Key.

3. **Start Development Server**
   ```bash
   npm start
   ```
   Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

4. **Run Unit Tests**
   ```bash
   npm test
   ```
   *Note: Tests run using Karma with a headless Chrome instance.*

5. **Build for Production**
   ```bash
   npm run build
   ```
   Artifacts will be stored in the `dist/` directory.

## 📌 Future Scope (v2)

- IRMAA MAGI threshold detection and Part B/D surcharge modeling.
- Social Security benefit taxability rules (up to 85% taxable provisional income).
- Married filing jointly support.
- Monte Carlo / multi-scenario probabilistic distribution of ending balances.
- Database persistence for snapshotting historical calculation results.
