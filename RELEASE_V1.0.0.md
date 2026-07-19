# Retirement Strategy Planner v1.0.0 发布清单

## v1.0 功能范围

- 账户与成本基础管理
- 退休现金流与税务引擎
- Roth Conversion 多策略
- RMD、IRMAA 与遗属阶段
- 股票/债券/CPI 联合历史抽样
- Fixed / Historical inflation
- SSA stochastic longevity
- Adaptive spending guardrail
- Web Worker 与进度回传
- Same-seed strategy comparison
- Production Golden QA 与 CI 防回归
- 中文完整手册与 Help 页面

## 发布前验收

- [ ] `npm ci`
- [ ] `npm run check:conflicts`
- [ ] `npx tsc -p tsconfig.app.json --noEmit`
- [ ] `npm run test:ci`
- [ ] `npm run test:golden`
- [ ] `npm run build`
- [ ] 专项 same-seed path verification 通过
- [ ] Supabase migrations 已应用
- [ ] Production Golden QA 全部 PASS
- [ ] `/help` 与 `/docs/readme-zh.html` 可访问
- [ ] `/compare-strategies` 可运行
- [ ] `DATA_REFRESH.md` 与 `MODEL_ASSUMPTIONS_AND_LIMITATIONS.md` 已审阅

## 创建 Tag

本补丁本身不包含 `.git` 元数据，也不能替用户向 GitHub 推送 tag。代码合并、CI 与生产 QA 通过后执行：

```bash
git checkout main
git pull origin main
git status
git tag -a v1.0.0 -m "Retirement Strategy Planner v1.0.0"
git push origin v1.0.0
```

验证：

```bash
git show v1.0.0 --no-patch
git ls-remote --tags origin v1.0.0
```
