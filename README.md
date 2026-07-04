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