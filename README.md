# Retirement Strategy Calculator

A client-side personal finance tool built with Angular and Supabase that models retirement drawdown strategies — Roth conversions, Required Minimum Distributions (RMDs), Social Security timing, and Buy-Borrow-Die — over a full lifetime projection, then stress-tests the winning plan with Monte Carlo simulation.

## 🎯 What It Does

This tool replaces ad-hoc spreadsheet analysis with a repeatable, testable model that lets you:

- **Snapshot your accounts** — 401(k), Traditional IRA, Roth IRA, and taxable brokerage.
- **Compare strategies side by side** — a "do nothing" baseline vs. Roth conversion strategies (fixed amount, fill-to-bracket, auto-optimize, smooth income target).
- **Pick the right lever per bucket** — the strategy selector decides whether Roth conversion (pre-tax dollars) and/or Buy-Borrow-Die (brokerage dollars) add value, since the two act on disjoint money.
- **Get a concrete action plan** — the dashboard translates the winning tax-funding strategy into year-by-year steps.
- **Quantify the risk** — a Monte Carlo page runs the chosen plan through thousands of randomized market-return sequences (historical block bootstrap) and reports the probability the plan never runs short, plus a percentile fan chart of assets by age.

## 📱 Pages

| Route | Purpose |
|---|---|
| `/dashboard` | Strategy comparison, winning-strategy charts, and the year-by-year action plan |
| `/accounts` | Enter and manage retirement account snapshots |
| `/scenarios` | Build scenarios: ages, spending, return assumptions, conversion strategy |
| `/monte-carlo` | Success probability, ending-asset percentiles, and the fan chart |
| `/login` | Supabase-backed sign in (optional — the app works without it) |

## 🚀 Tech Stack

- **Frontend**: Angular 20 (standalone components, signals, no NgModules)
- **UI**: Angular Material + ngx-charts for visualization
- **Persistence (optional)**: Supabase (PostgreSQL + Auth) for saving scenarios and accounts
- **Hosting target**: Vercel (SPA mode)
- **Computation**: pure, framework-free TypeScript — the entire engine runs in the browser with no server round-trips

## 🧮 Calculation Engine

The core logic lives in `src/app/core/calculators/` as pure, immutable, unit-tested functions:

| Module | Responsibility |
|---|---|
| `tax-tables.ts` | Federal tax brackets and standard deductions (2026, single), with bracket-inflation handling |
| `tax-bracket-calculator.ts` | Progressive tax math: marginal rates, bracket-fill headroom, rate ceilings |
| `rmd-calculator.ts` | IRS Uniform Lifetime Table divisors; SECURE 2.0 start age (73 or 75 by birth year) |
| `roth-conversion-calculator.ts` | Year-by-year simulation loop: RMDs, Social Security, conversions, taxes, growth |
| `scenario-engine.ts` | Entry point that runs a scenario; for `auto-optimize` it searches across bracket ceilings |
| `strategy-selector.ts` | Decides Roth conversion vs. Buy-Borrow-Die per asset bucket by simulating both funding paths |
| `action-plan.ts` | Turns the winning strategy into concrete yearly actions for the dashboard |
| `social-security-calculator.ts` | Claiming-age comparison (62/67/70) with lifetime present value and breakeven age |
| `monte-carlo.ts` / `monte-carlo-returns.ts` | 5,000-trial simulation using a geometric-mean-anchored stationary block bootstrap of historical returns; chunked so the UI never freezes |

## 🛠️ Local Setup

1. **Install dependencies**
   ```bash
   cd retirement-planner
   npm install
   ```

2. **Start the dev server**
   ```bash
   npm start
   ```
   Open `http://localhost:4200/`. **Supabase is optional** — without credentials the app runs entirely on in-memory state (`local-state.service.ts`) with seeded defaults; only saving/loading scenarios and login are disabled.

3. **(Optional) Configure Supabase persistence**
   - Create a project at [Supabase](https://supabase.com).
   - Run `supabase/migrations/0001_init.sql` in the Supabase SQL Editor to provision tables and Row Level Security policies.
   - For local dev, fill `supabaseUrl` / `supabaseAnonKey` in `src/environments/environment.ts`.
   - For production, set the `SUPABASE_URL` / `SUPABASE_ANON_KEY` environment variables (e.g. in Vercel) — the build runs `set-env.js`, which generates `environment.production.ts` automatically. **Never hand-edit `environment.production.ts`**; it is overwritten on every build.

4. **Run unit tests**
   ```bash
   npm test                 # watch mode
   ng test --watch=false    # single run (CI-style)
   ```

5. **Build for production**
   ```bash
   npm run build
   ```
   Artifacts are written to `dist/`.

## 📌 Future Scope

- IRMAA MAGI threshold detection and Medicare Part B/D surcharge modeling.
- Social Security benefit taxability rules (up to 85% taxable via provisional income).
- Married-filing-jointly support (tax tables currently cover single filers, 2026).
- Persisting Monte Carlo results and historical calculation snapshots.

## ⚠️ Disclaimer

This is a modeling tool, not financial or tax advice. Tax tables cover a single filing status and year, and projections depend entirely on the assumptions you enter. Consult a qualified professional before acting on any strategy.

---

# 退休策略计算器 (Retirement Strategy Calculator)

一个基于 Angular 和 Supabase 构建的纯客户端个人理财工具，用于在整个人生跨度内模拟退休提款策略 —— Roth 转换、法定最低取款额 (RMD)、社会安全金领取时机、以及 Buy-Borrow-Die 策略，并通过蒙特卡洛模拟对最优方案进行压力测试。

## 🎯 功能概述

该工具旨在替代零散的电子表格分析，提供一个可复用、可测试的模型，使你能够：

- **录入账户快照** —— 401(k)、传统 IRA、Roth IRA 以及应税证券账户。
- **多策略对比** —— 将"不做任何操作"的基线情景与各类 Roth 转换策略（固定金额、填满税率区间、自动优化、平滑收入目标）并排比较。
- **按资产类别选择策略** —— 策略选择器分别判断 Roth 转换（针对税前资金）和 Buy-Borrow-Die（针对证券账户资金）是否各自创造价值，因为两者作用于互不重叠的资金。
- **生成具体行动计划** —— 仪表盘将胜出的税务筹资策略转化为逐年执行步骤。
- **量化风险** —— 蒙特卡洛页面将选定方案放入数千条随机市场收益序列（历史区块自助抽样）中运行，报告"资金终身不枯竭"的成功概率，并绘制按年龄分布的资产百分位扇形图。

## 📱 页面导航

| 路由 | 用途 |
|---|---|
| `/dashboard` | 策略对比、胜出策略图表、逐年行动计划 |
| `/accounts` | 录入和管理退休账户快照 |
| `/scenarios` | 构建情景：年龄、支出、收益率假设、转换策略 |
| `/monte-carlo` | 成功概率、期末资产百分位、扇形图 |
| `/login` | 基于 Supabase 的登录（可选 —— 不登录也可完整使用） |

## 🚀 技术栈

- **前端**: Angular 20（独立组件 + Signals，无 NgModules）
- **UI**: Angular Material + ngx-charts 数据可视化
- **持久化（可选）**: Supabase (PostgreSQL + Auth)，用于保存情景和账户
- **托管平台**: Vercel（SPA 单页应用模式）
- **核心计算**: 纯 TypeScript 函数，与框架无关 —— 整个计算引擎在浏览器中运行，无需服务器交互

## 🧮 计算引擎

核心逻辑位于 `src/app/core/calculators/`，全部为纯函数、不可变数据、带单元测试：

| 模块 | 职责 |
|---|---|
| `tax-tables.ts` | 联邦税率区间和标准扣除额（2026 年，单身申报），含税级通胀调整 |
| `tax-bracket-calculator.ts` | 超额累进税率计算：边际税率、区间剩余额度、税率上限 |
| `rmd-calculator.ts` | IRS 统一生命周期表除数；SECURE 2.0 起始年龄（按出生年份为 73 或 75 岁） |
| `roth-conversion-calculator.ts` | 逐年模拟主循环：RMD、社会安全金、转换、税负、资产增长 |
| `scenario-engine.ts` | 情景运行入口；`auto-optimize` 模式下遍历各税率区间上限寻优 |
| `strategy-selector.ts` | 通过逐年模拟两条筹资路径，按资产类别判定 Roth 转换 vs. Buy-Borrow-Die |
| `action-plan.ts` | 将胜出策略转化为仪表盘上的逐年具体行动 |
| `social-security-calculator.ts` | 领取年龄对比（62/67/70），含终身现值与盈亏平衡年龄 |
| `monte-carlo.ts` / `monte-carlo-returns.ts` | 5,000 次模拟，采用几何均值锚定的平稳区块自助抽样重放历史收益序列；分块执行以保证 UI 不卡顿 |

## 🛠️ 本地开发设置

1. **安装依赖**
   ```bash
   cd retirement-planner
   npm install
   ```

2. **启动开发服务器**
   ```bash
   npm start
   ```
   访问 `http://localhost:4200/`。**Supabase 是可选的** —— 未配置凭据时，应用完全基于内存状态运行（`local-state.service.ts`，含预设默认数据），仅保存/加载情景和登录功能不可用。

3. **（可选）配置 Supabase 持久化**
   - 在 [Supabase](https://supabase.com) 中创建项目。
   - 在 Supabase SQL 编辑器中运行 `supabase/migrations/0001_init.sql`，初始化数据库表和行级安全 (RLS) 策略。
   - 本地开发：在 `src/environments/environment.ts` 中填入 `supabaseUrl` / `supabaseAnonKey`。
   - 生产环境：设置 `SUPABASE_URL` / `SUPABASE_ANON_KEY` 环境变量（如在 Vercel 中）—— 构建时 `set-env.js` 会自动生成 `environment.production.ts`。**切勿手动编辑 `environment.production.ts`**，每次构建都会将其覆盖。

4. **运行单元测试**
   ```bash
   npm test                 # 监听模式
   ng test --watch=false    # 单次运行（CI 模式）
   ```

5. **生产环境打包**
   ```bash
   npm run build
   ```
   产物输出到 `dist/` 目录。

## 📌 未来规划

- IRMAA MAGI 门槛检测及 Medicare Part B/D 附加保费建模。
- 社会安全金征税规则（基于临时收入，最高 85% 应税）。
- 支持夫妻联合申报 (MFJ)（当前税表仅覆盖 2026 年单身申报）。
- 蒙特卡洛结果及历史计算快照的持久化保存。

## ⚠️ 免责声明

本工具仅用于建模分析，不构成财务或税务建议。税表仅覆盖单一申报身份和年度，预测结果完全取决于你输入的假设。在执行任何策略前，请咨询合格的专业人士。
