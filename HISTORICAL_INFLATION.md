# Historical Inflation Mode

`Scenario.inflationMode` supports:

- `fixed` (default): preserves the prior deterministic behavior. Living expenses use the engine's fixed 3% assumption and Social Security uses `ssColaRate`.
- `historical`: stock returns, 10-year Treasury returns, and CPI are sampled from the same historical year and stationary-bootstrap block. Living expenses use sampled CPI; Social Security uses the prior year's sampled CPI. `ssColaRate` is ignored in this mode.

Tax-bracket and IRMAA indexing remain separate policy assumptions and are not tied directly to sampled CPI. Strategy search remains deterministic; sampled inflation is applied only when replaying Monte Carlo trials. The spending guardrail continues to compare each trial with the fixed-inflation deterministic baseline, so high-inflation paths can legitimately trigger it more often.
