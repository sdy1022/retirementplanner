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
# 退休策略计算器 (Retirement Strategy Calculator)

一个基于 Angular 和 Supabase 构建的动态个人理财工具，用于模拟人生跨度内的 Roth 转换策略以及法定最低取款额 (RMD)。

## 🎯 核心目标

该工具旨在替代零散的电子表格分析，提供一个可复用的模型，使你能够：

* 快速录入当前的退休账户快照（401k、传统 IRA、Roth IRA、免税证券账户）。
* 将“基线”情景（不进行任何操作）与特定的 Roth 转换策略（例如，每年用满特定联邦税率区间的额度）进行对比。
* 可视化你终身的税务负担、RMD 轨迹以及最终的资产总值，从而找出最具税务效益的退休资产提款策略。

## 🚀 技术栈

* **前端**: Angular 20 (独立组件 / Standalone Components)
* **UI 组件库**: Angular Material + 用于数据可视化的 ngx-charts
* **后端**: Supabase (PostgreSQL + 用户认证 Auth)
* **托管平台**: Vercel (SPA 单页应用模式)
* **核心计算**: 纯 TypeScript 函数（计算引擎无需与服务器进行网络交互）

## 🧮 计算引擎

核心逻辑位于 `src/app/core/calculators/` 目录中，并采用纯函数和不可变数据结构，以确保预测结果的确定性与可测试性：

1. **`tax-tables.ts`**: 硬编码的 2026 年美国国税局 (IRS) 税率区间和标准扣除额。
2. **`rmd-calculator.ts`**: 基于《SECURE 2.0 法案》的统一生命周期表 (Uniform Lifetime Table) 预测（根据出生年份自动处理 73 岁或 75 岁的 RMD 起始年龄）。
3. **`tax-bracket-calculator.ts`**: 计算超额累进税率逻辑以及“用满税率区间上限”的数学模型。
4. **`roth-conversion-calculator.ts`**: 模拟逐年的 Roth 转换过程及账户余额消耗。
5. **`social-security-calculator.ts`**: 模拟过程中根据开始领取年龄动态计算社会安全福利金 (Social Security benefits)。
6. **`scenario-engine.ts`**: 编排上述所有计算模块，贯穿整个预测周期（从当前年龄一直到预期寿命）。

## 🛠️ 本地开发设置

1. **安装依赖**
```bash
npm install

```


2. **配置 Supabase**
* 在 [Supabase](https://supabase.com) 中创建一个项目。
* 在 Supabase 的 SQL 编辑器中运行位于 `supabase/migrations/0001_init.sql` 的 SQL 脚本，以初始化数据库表和行级安全 (RLS) 策略。
* 在 `src/environments/environment.ts`（以及 `environment.production.ts`）中填入你的 Supabase URL 和 Anon Key（匿名密钥）。


3. **启动开发服务器**
```bash
npm start

```


打开浏览器并访问 `http://localhost:4200/`。修改任何源码文件后，应用都会自动刷新。
4. **运行单元测试**
```bash
npm test

```


*注意：测试将使用 Karma 在无头 Chrome (Headless Chrome) 实例中运行。*
5. **生产环境打包**
```bash
npm run build

```


打包后的产物将存放在 `dist/` 目录中。

## 📌 未来规划 (v2)

* IRMAA MAGI 门槛检测以及 Medicare Part B/D 额外保费模型。
* 社会安全福利金征税规则计算（最高 85% 的应税临时收入）。
* 支持夫妻联合申报 (MFJ) 模式。
* 最终账户余额的蒙特卡洛模拟 / 多情景概率分布。
* 引入数据库持久化功能，以便保存历史计算结果的快照。