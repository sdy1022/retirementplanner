"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runScenario = runScenario;
var roth_conversion_calculator_1 = require("./roth-conversion-calculator");
var tax_tables_1 = require("./tax-tables");
var rmd_calculator_1 = require("./rmd-calculator");
function runScenario(scenario, accounts) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    var runWithStrategy = function (strategy) {
        return (0, roth_conversion_calculator_1.simulateConversionStrategy)({
            accounts: accounts,
            strategy: strategy,
            currentAge: scenario.currentAge,
            endAge: scenario.lifeExpectancy,
            birthYear: scenario.birthYear,
            filingStatus: scenario.filingStatus,
            assumedReturnRate: scenario.assumedReturnRate,
            stateTaxRate: scenario.stateTaxRate,
            wageIncome: scenario.wageIncome,
            annualLivingExpenses: scenario.annualLivingExpenses,
            retirementAge: scenario.retirementAge,
            ssPia: scenario.ssPia,
            ssClaimAge: scenario.ssClaimAge,
        });
    };
    if (scenario.rothConversionStrategy.mode === 'auto-optimize') {
        var table = (0, tax_tables_1.getTaxTable)(2026, scenario.filingStatus);
        var bestResult = null;
        var maxEndingAssets = -Infinity;
        for (var _i = 0, _o = table.brackets; _i < _o.length; _i++) {
            var bracket = _o[_i];
            var result = runWithStrategy({ mode: 'fill-to-bracket', targetBracket: bracket.rate });
            var endingAssets = (_b = (_a = result.at(-1)) === null || _a === void 0 ? void 0 : _a.endingAssets) !== null && _b !== void 0 ? _b : 0;
            if (endingAssets > maxEndingAssets) {
                maxEndingAssets = endingAssets;
                bestResult = result;
            }
        }
        // Also scan fixed flat amounts from $50k to $500k in $10k increments to see if a smooth strategy beats filling a bracket
        for (var amt = 50000; amt <= 500000; amt += 10000) {
            var result = runWithStrategy({ mode: 'fixed-amount', amount: amt });
            var endingAssets = (_d = (_c = result.at(-1)) === null || _c === void 0 ? void 0 : _c.endingAssets) !== null && _d !== void 0 ? _d : 0;
            if (endingAssets > maxEndingAssets) {
                maxEndingAssets = endingAssets;
                bestResult = result;
            }
        }
        var years_1 = bestResult;
        return {
            scenarioName: scenario.name,
            years: years_1,
            totalTax: years_1.reduce(function (total, year) { return total + year.totalTax; }, 0),
            endingAssets: (_f = (_e = years_1.at(-1)) === null || _e === void 0 ? void 0 : _e.endingAssets) !== null && _f !== void 0 ? _f : 0,
        };
    }
    if (scenario.rothConversionStrategy.mode === 'smooth-to-bracket') {
        var targetBracket = scenario.rothConversionStrategy.targetBracket;
        var rmdStartAge_1 = (0, rmd_calculator_1.getRmdStartAge)(scenario.birthYear);
        var bestAmount = 600000; // default to max if we can't solve it
        var bestYears = null;
        // We want the lowest possible flat amount that successfully keeps all RMD years <= targetBracket
        for (var amt = 600000; amt >= 10000; amt -= 2000) {
            var years_2 = runWithStrategy({ mode: 'fixed-amount', amount: amt, stopAtRmdAge: true });
            // Check if any RMD year exceeds the target bracket
            var rmdYears = years_2.filter(function (y) { return y.age >= rmdStartAge_1; });
            var maxRate = rmdYears.reduce(function (max, y) { return Math.max(max, y.marginalRate); }, 0);
            if (maxRate <= targetBracket) {
                // This amount successfully keeps us in the bracket!
                bestAmount = amt;
                bestYears = years_2;
            }
            else {
                // As we decrease the amount, the traditional balance gets larger. 
                // If this amount fails, lower amounts will also fail (because traditional balance will be even higher).
                // So the last successful amount was the optimal (lowest) one!
                break;
            }
        }
        var finalYears = bestYears || runWithStrategy({ mode: 'fixed-amount', amount: bestAmount, stopAtRmdAge: true });
        return {
            scenarioName: scenario.name,
            years: finalYears,
            totalTax: finalYears.reduce(function (total, year) { return total + year.totalTax; }, 0),
            endingAssets: (_h = (_g = finalYears.at(-1)) === null || _g === void 0 ? void 0 : _g.endingAssets) !== null && _h !== void 0 ? _h : 0,
        };
    }
    if (scenario.rothConversionStrategy.mode === 'smooth-income-target') {
        var targetBracket = scenario.rothConversionStrategy.targetBracket;
        var rmdStartAge_2 = (0, rmd_calculator_1.getRmdStartAge)(scenario.birthYear);
        var maxIncome = 1000000;
        var bestYears = null;
        // We want the lowest possible income ceiling that keeps all RMD years <= targetBracket.
        // Each year converts just enough to lift total income to the ceiling, so the conversion
        // shrinks automatically when Social Security starts and total income stays flat.
        for (var income = maxIncome; income >= 20000; income -= 2000) {
            var years_3 = runWithStrategy({ mode: 'fill-to-income', targetIncome: income, stopAtRmdAge: true });
            var rmdYears = years_3.filter(function (y) { return y.age >= rmdStartAge_2; });
            var maxRate = rmdYears.reduce(function (max, y) { return Math.max(max, y.marginalRate); }, 0);
            if (maxRate <= targetBracket) {
                bestYears = years_3;
            }
            else {
                // Lower ceilings convert less, leaving an even larger traditional balance at RMD age,
                // so the last successful ceiling was the optimal (lowest) one.
                break;
            }
        }
        var finalYears = bestYears !== null && bestYears !== void 0 ? bestYears : runWithStrategy({ mode: 'fill-to-income', targetIncome: maxIncome, stopAtRmdAge: true });
        return {
            scenarioName: scenario.name,
            years: finalYears,
            totalTax: finalYears.reduce(function (total, year) { return total + year.totalTax; }, 0),
            endingAssets: (_k = (_j = finalYears.at(-1)) === null || _j === void 0 ? void 0 : _j.endingAssets) !== null && _k !== void 0 ? _k : 0,
        };
    }
    var years = runWithStrategy(scenario.rothConversionStrategy);
    return {
        scenarioName: scenario.name,
        years: years,
        totalTax: years.reduce(function (total, year) { return total + year.totalTax; }, 0),
        endingAssets: (_m = (_l = years.at(-1)) === null || _l === void 0 ? void 0 : _l.endingAssets) !== null && _m !== void 0 ? _m : 0,
    };
}
