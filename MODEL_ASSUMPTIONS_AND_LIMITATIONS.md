# 模型假设与局限

本文件说明退休策略规划工具“计算了什么、没有计算什么，以及结果应该如何解读”。它是产品说明的一部分，不构成财务、投资、税务、法律、保险或医疗建议。

## 1. 结果的正确含义

### 确定性结果

确定性 Dashboard 在用户给定的收益率、通胀、寿命、收入和法规假设下逐年计算现金流。它回答的是：**如果这些假设成立，这个计划如何运行？** 它不是对未来金额的承诺。

### Monte Carlo 成功率

“成功”通常表示每个模拟年度的生活支出和税款都得到资金支持，未出现超过容差的短缺。成功率是**模型条件下的样本比例**，不是现实世界中精确可校准的个人破产概率。

不要把 91% 与 92% 当成有意义的精确差异。更适合关注：

- 差异是否达到数个百分点或更多；
- 在不同收益、支出、寿命假设下方向是否稳定；
- P10、消费实现率和失败短缺是否可接受；
- 提高成功率是否只是依赖大幅削减消费。

## 2. 同 Seed 策略比较

Compare 页面让多个策略使用相同 seed、trial 数和随机流命名空间。对于同一 trial：

- 历史股票、债券与 CPI 使用同一组选中年份；
- stochastic longevity 使用相同的 primary/spouse mortality streams；
- 策略参数不会参与随机 seed 的生成。

因此差值更接近策略本身的影响，而不是随机抽样运气。不过，不同资产配置在同一年会产生不同组合收益，这是策略差异而不是路径不一致。

## 3. 历史市场与通胀

- 股票、10 年期美国国债和 CPI 以同一历史年份联合抽样，保留滞胀、复苏和连续熊市等历史关联。
- block bootstrap 保留部分多年度顺序风险，但未来不必重复历史。
- 组合收益经过常数平移，使长期几何均值贴近 Scenario 的 assumed return；CPI 不做平移。
- Historical inflation 主要用于模拟通胀**波动与路径风险**，不是预测未来平均通胀水平。
- Fixed mode 保留用户设置的固定假设并用于兼容既有 Golden。

## 4. Social Security 与通胀

- `ssPia` 的具体语义应与界面提示保持一致；输入前应确认它代表的月度 benefit 基准。
- Fixed inflation 模式使用 `ssColaRate`。
- Historical inflation 模式中，下一年度 Social Security benefit 使用上一年度 sampled CPI，`ssColaRate` 不再叠加。
- 实际 SSA 规则、claiming credits、WEP/GPO 或未来法律变化可能与模型简化不同。

## 5. 税务与 Medicare

模型包含联邦 ordinary income、长期资本利得 stacking、RMD、部分 Social Security taxation 和 IRMAA 逻辑，但仍是规划近似：

- 税表、标准扣除、LTCG 和 IRMAA 使用特定年度数据，会过期；参见 `DATA_REFRESH.md`。
- 州税通常以平坦税率近似。
- 不一定涵盖所有 deduction、credit、NIIT、AMT、地方税、非合格股息、净资本损失结转或特殊收入。
- IRMAA 真实执行涉及两年回溯、申诉和 life-changing event，模型不能替代 Medicare/税务专业判断。
- 税法 sunset 和未来立法不能被可靠预测。

## 6. Roth Conversion

- Conversion 策略用于长期比较，不是报税指令。
- Smooth/auto 策略在确定性基准计划上求解一次，Monte Carlo trial 不利用未来路径重新优化，避免“事后知道市场”的不现实优势。
- 模型可能未完整实现 Roth 五年规则、59½ 规则、每一 conversion tranche 的独立五年时钟、QCD、继承 IRA 或所有 pro-rata 细节。
- 执行大额 conversion 前应根据真实税表、withholding、estimated tax、现金来源和 Medicare 影响重新核算。

## 7. RMD 与遗属

- RMD 起始年龄根据显式出生年处理；primary 去世当年沿用逝者时点约定，次年切换幸存配偶时间表。
- 模型采用规划层面的 spousal rollover 近似。
- 继承 IRA、非配偶受益人十年规则、分账户所有权和复杂 beneficiary designation 可能未建模。

## 8. 寿命模型

- SSA stochastic longevity 使用人口级 period life table，不是 cohort table，也不是个体医疗预测。
- 它不考虑吸烟、健康状态、家庭史、收入、职业、婚姻相关性或医学进展。
- 配偶死亡时间目前独立抽样；现实中夫妻风险可能相关。
- 最大年龄是模型截断，不代表任何人的实际寿命上限。

## 9. Guardrail

- Guardrail 在资产落后确定性基线时削减支出/调整行为，从而可能提高成功率。
- 成功率提高不等于生活质量更高；必须同时查看 consumption realization、削减年数和连续削减时长。
- Historical inflation trial 仍相对固定假设的确定性基线判断是否落后，这是有意设计并应在比较中保持一致。

## 10. 账户、现金流与供款

- 输入余额、账户类型、owner 和 brokerage cost basis 的准确性直接决定结果质量。
- 开支字段可能覆盖工作期与退休期，除非具体界面另有说明。
- 工资、供款、employer match、税后现金约束和账户顺序均依赖 Scenario 输入。
- 真实雇主计划限制、年度供款上限、catch-up、HCE 测试和计划内规则可能未自动验证。

## 11. SBLOC / Buy-Borrow-Die

- 借款利率、抵押率、margin call、券商处置规则和可借资产范围会变化。
- 模型中的 SBLOC 只适合作为压力测试，不代表贷款机构承诺。
- 在熊市和高利率同时发生时，真实风险可能比简化模型更高。

## 12. 未建模或刻意推迟的项目

以下项目可能有价值，但 v1.0 为控制复杂度并未完整实现：

- LTC 随机费用冲击；
- SSA cohort mortality；
- 个体健康风险；
- 全面的 Roth 五年 tranche 执法规则；
- QCD 与慈善策略；
- 复杂 inherited IRA；
- 所有税法 sunset/未来改革；
- 非合格股息与完整投资税 lot；
- 全面的供款上限和雇主计划合规检查；
- 房地产、年金、养老金 COLA 和复杂保险合同。

## 13. 推荐使用方式

1. 先确认账户和 Scenario 输入。
2. 用确定性 Dashboard 检查逐年逻辑。
3. 用 Fixed mode 保留基准，再用 Historical inflation 和 stochastic longevity 压力测试。
4. 使用同 seed Compare 比较策略，不只看单个成功率。
5. 对差异很小的方案保持谨慎。
6. 每年刷新余额、法规和历史数据。
7. 在执行退休、conversion、借款、claiming 或大额投资决策前，请合格专业人士复核。
