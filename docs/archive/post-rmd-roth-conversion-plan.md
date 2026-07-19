# Implementation Plan: Post-RMD Roth Conversions

## Objective
Enable the retirement strategy engine to optimally continue Roth conversions even after Required Minimum Distributions (RMDs) have started (typically at age 75).

## Rationale
Currently, the automated optimization strategies (`smooth-income-target` and `smooth-to-bracket`) are strictly hard-coded to stop all Roth conversions when RMDs begin. However, if an RMD does not completely fill the user's targeted tax bracket (e.g., the 24% bracket), there is remaining "cheap" tax space. Topping off this bracket with Roth conversions alongside the RMD can:
1. Further shrink the Traditional balance, reducing future RMDs.
2. Shift more growth into tax-free Roth accounts.
3. Lower the final residual tax burden on the estate.

## Changes Implemented

### 1. `scenario-engine.ts`
- **Current Behavior**: The `smooth-income-target` loop passes `stopAtRmdAge: true` to `runWithStrategy`, preventing any conversions at age 75 or later.
- **New Behavior**: We modified the optimization loop to evaluate two parallel branches for every floor/ceiling combination:
  1. `stopAtRmdAge: true` (Stop at RMD age)
  2. `stopAtRmdAge: false` (Continue converting after RMD age)
- **Selection**: The engine compares the `score` (after-tax ending assets) of both branches and automatically selects whichever path yields the highest lifetime score.

### 2. `roth-conversion-calculator.ts`
- **Validation**: When `stopAtRmdAge: false` is used, the `fill-to-income` conversion formula is:
  `Math.max(0, strategy.targetIncome - taxableIncome)`
- Since `taxableIncome` (Gross Income) already includes the forced RMD amount, this formula safely calculates exactly how much room is left in the target bracket. It will not push the user into the next tax bracket.

### 3. `action-plan.ts` (Action Plan UI)
- **Validation**: The action plan UI is already equipped to handle years with both conversions and RMDs.
  - It will log a `Convert $X to Roth` message.
  - It will log an `RMD of $Y stays within the Z% band` message for the same year.

## Status
- Core logic update in `scenario-engine.ts` has been completed.
- Angular compilation succeeds without errors.
- The change is seamless and requires no new UI toggles; the engine simply became smarter.
