# Golden Scenario Regression Suite

Run only the five golden scenarios:

```bash
npm run test:golden
```

The suite fixes seed `20260718` and protects these end-to-end calculation paths:

1. Three-year working-period accumulation and after-tax contribution constraints.
2. Aggregation of multiple accounts with the same type and brokerage cost basis.
3. Joint stock/bond historical sampling and expected 60/40 volatility reduction.
4. The six Return x Guardrail sensitivity cells using common random numbers.
5. Earliest-feasible-retirement-age search across a fixed age range and criteria.

Changes to tax rules, historical data, cash-flow ordering, guardrails, or retirement search can intentionally change these values. Review and explain any updated golden values rather than refreshing them automatically.
