# 年度数据刷新清单（DATA REFRESH）

本项目包含会随法规或年份变化的内嵌数据。建议每年 **10–11 月先检查 IRS/CMS 新年度公告**，在新年度正式使用前完成更新、测试与发布。任何数据更新都必须保留来源、发布日期、适用年度和变更原因。

## 1. 维护原则

1. 只使用官方来源或项目已明确记录的原始数据源。
2. 数据更新与计算逻辑修改分开提交，便于审查差异。
3. 固定旧年度的回归测试不得静默重写；若法规导致预期值改变，提交说明必须解释原因。
4. 更新后依次运行 `check:conflicts`、严格 TypeScript 编译、全量测试、Golden、production build 和生产 QA。
5. 保留上一年度常量，避免历史 Scenario 被新年度数据错误重算；需要时按 `taxYear` 选择数据表。

## 2. 年度刷新矩阵

| 数据项目 | 当前基准 | 建议检查时间 | 官方/原始来源 | 主要代码位置 | 必做验证 |
|---|---:|---|---|---|---|
| 联邦普通所得税档 | 2026 | 每年 10–11 月 | IRS inflation adjustments / Revenue Procedure | `src/app/core/calculators/tax-calculator.ts` 及税务常量 | 各 filing status 边界、标准扣除、边界 ±$1 测试 |
| 标准扣除与额外老年扣除 | 2026 | 每年 10–11 月及法律变化时 | IRS | 税务常量/计算器 | 65 岁前后、单身/夫妻、sunset 年份 |
| 长期资本利得 0%/15%/20% 断点 | 2026 | 每年 10–11 月 | IRS | 税务计算器 | ordinary income 与 LTCG stacking |
| Medicare IRMAA 档位与保费 | 2026 | 每年 9–11 月 | CMS Medicare Part B/D announcements | IRMAA 计算模块 | MAGI 边界 ±$1、两年回溯语义 |
| RMD 起始年龄规则 | SECURE 2.0 | 法律变化时 | IRS Publication 590-B / statute | `rmd` 与 conversion calculator | 出生年 1950、1951–1959、1960+ 边界 |
| Uniform Lifetime Table divisor | 当前 IRS 表 | 法规变化时 | IRS Publication 590-B | RMD divisor 常量 | 关键年龄锚点与最后年龄 |
| Social Security 规则/参数 | 当前模型假设 | 每年及法规变化时 | SSA | SS 与税务模块 | claim age、COLA、survivor 逻辑 |
| SSA period mortality table | 2023 | SSA 发布新版时 | SSA Actuarial Life Table | `src/app/core/mortality/ssa-period-life-table.ts` | 年龄/性别锚点、总长度、seeded golden |
| 股票/债券/CPI 年度序列 | 1928–2025 | 每年数据完整后（通常次年初） | 项目文档所列历史数据源 | `monte-carlo-returns.ts` | 三数组同长度、同年份、最新年份锚点 |
| 供款上限/追赶供款 | 当前输入模型 | 每年 10–11 月 | IRS retirement plan limits | Scenario 校验/帮助文档 | 年龄 50+、SECURE 2.0 特殊追赶规则（若实现） |

## 3. 更新步骤

### A. 建立维护分支

```bash
git checkout main
git pull origin main
git checkout -b maintenance/data-refresh-YYYY
```

### B. 更新数据与元数据

- 修改常量时同时修改旁边的 `source`, `effectiveYear`, `lastReviewed` 注释。
- 历史市场数据必须按同一日历年追加股票、债券、CPI 三个值。
- 不得只追加某一数组；长度不一致必须立即抛错。
- SSA 表更新需保留表的版本年份和 period/cohort 类型。

### C. 更新测试

至少包括：

- 官方公告中的几个锚点值；
- 每个阈值的 `threshold - 1`、`threshold`、`threshold + 1`；
- 固定 seed 的 Monte Carlo 回归；
- 新增历史年份在联合 sampler 中的 year/stock/bond/CPI 对齐；
- Production Golden 页面仍全部 PASS，或有审查过的、说明充分的预期变化。

### D. 发布前命令

```bash
npm ci
npm run check:conflicts
npx tsc -p tsconfig.app.json --noEmit
npm run test:ci
npm run test:golden
npm run build
```

### E. 发布记录

在 Changelog/Release 中记录：

- 数据适用年度；
- 官方来源；
- 变更前后关键值；
- 哪些 Golden 值发生变化及原因；
- 是否需要 Supabase migration；
- 生产 QA 链接和结果。

## 4. 过期提醒策略

建议 UI 显示非阻断提醒，而不是让元旦后的 build 直接失败：

- 当前系统年份大于最新税务数据年度 + 1：显示“税务数据可能需要刷新”；
- 历史序列最后年份落后当前年份超过 1 年：显示“市场/CPI 数据尚未追加”；
- SSA 发布新表但项目仍使用旧表：在维护 issue 中跟踪，不自动改变既有模拟结果。

## 5. 数据刷新负责人检查框

- [ ] IRS 普通所得税档与标准扣除
- [ ] LTCG 断点
- [ ] CMS IRMAA 档位和保费
- [ ] RMD 法规与 divisor 表
- [ ] SSA mortality table
- [ ] 股票、债券、CPI 最新完整年度
- [ ] 帮助页和中文手册年份
- [ ] 全套 CI 与 Production Golden QA
- [ ] GitHub Release 数据版本说明
