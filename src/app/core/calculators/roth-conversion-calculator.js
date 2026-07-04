"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.simulateConversionStrategy = simulateConversionStrategy;
var rmd_calculator_1 = require("./rmd-calculator");
var tax_bracket_calculator_1 = require("./tax-bracket-calculator");
var tax_tables_1 = require("./tax-tables");
// Brokerage withdrawals are treated as fully realized long-term capital gains
var LONG_TERM_CAPITAL_GAINS_RATE = 0.15;
function simulateConversionStrategy(input) {
    var _a, _b, _c, _d, _e, _f;
    var traditionalBalance = sumAccounts(input.accounts, ['traditional_401k', 'traditional_ira']);
    var rothBalance = sumAccounts(input.accounts, ['roth_401k', 'roth_ira']);
    var brokerageBalance = sumAccounts(input.accounts, ['brokerage']);
    var results = [];
    var rmdStartAge = (0, rmd_calculator_1.getRmdStartAge)(input.birthYear);
    for (var age = input.currentAge; age <= input.endAge; age++) {
        var isRetired = input.retirementAge ? age >= input.retirementAge : true;
        var currentWage = isRetired ? 0 : ((_a = input.wageIncome) !== null && _a !== void 0 ? _a : 0);
        var divisor = (_b = rmd_calculator_1.UNIFORM_LIFETIME_DIVISORS[age]) !== null && _b !== void 0 ? _b : rmd_calculator_1.UNIFORM_LIFETIME_DIVISORS[120];
        var rmd = age >= rmdStartAge ? Math.min(traditionalBalance, (0, tax_bracket_calculator_1.roundCurrency)(traditionalBalance / divisor)) : 0;
        var ssIncome = (input.ssPia && input.ssClaimAge && age >= input.ssClaimAge) ? input.ssPia * 12 : 0;
        var taxableSsIncome = (0, tax_bracket_calculator_1.roundCurrency)(ssIncome * 0.85);
        // Living expenses are covered by SS and RMD cash first, then brokerage, then traditional, then Roth.
        // The traditional slice is ordinary income, so it joins the tax base before the conversion decision
        // and consumes bracket room that would otherwise go to conversions.
        var livingExpenses = isRetired ? ((_c = input.annualLivingExpenses) !== null && _c !== void 0 ? _c : 0) : 0;
        var spendingNeed = Math.max(0, livingExpenses - ssIncome - rmd);
        var fromBrokerage = Math.min(brokerageBalance, spendingNeed);
        var fromTraditional = Math.min(Math.max(0, traditionalBalance - rmd), spendingNeed - fromBrokerage);
        var baseTaxableIncome = currentWage + ((_d = input.annualOtherIncome) !== null && _d !== void 0 ? _d : 0) + taxableSsIncome + rmd + fromTraditional;
        // Only convert if retired (since in working years wages likely fill low brackets)
        var conversion = isRetired ? Math.min(traditionalBalance - rmd - fromTraditional, conversionAmount(input.strategy, baseTaxableIncome, input.filingStatus, (_e = input.taxYear) !== null && _e !== void 0 ? _e : 2026, age, rmdStartAge)) : 0;
        var taxableIncome = baseTaxableIncome + conversion;
        var taxYear = (_f = input.taxYear) !== null && _f !== void 0 ? _f : 2026;
        var table = (0, tax_tables_1.getTaxTable)(taxYear, input.filingStatus);
        var stateTaxableIncome = Math.max(0, taxableIncome - table.standardDeduction);
        var capitalGainsFederalTax = (0, tax_bracket_calculator_1.roundCurrency)(fromBrokerage * LONG_TERM_CAPITAL_GAINS_RATE);
        var capitalGainsStateTax = (0, tax_bracket_calculator_1.roundCurrency)(fromBrokerage * input.stateTaxRate);
        var federalTax = isRetired ? (0, tax_bracket_calculator_1.roundCurrency)((0, tax_bracket_calculator_1.calculateTax)(taxableIncome, input.filingStatus, taxYear) + capitalGainsFederalTax) : 0;
        var stateTax = isRetired ? (0, tax_bracket_calculator_1.roundCurrency)(stateTaxableIncome * input.stateTaxRate + capitalGainsStateTax) : 0;
        var totalTax = (0, tax_bracket_calculator_1.roundCurrency)(federalTax + stateTax);
        var marginalRate = (0, tax_bracket_calculator_1.getMarginalBracket)(taxableIncome, input.filingStatus, taxYear).rate;
        traditionalBalance = Math.max(0, traditionalBalance - rmd - fromTraditional - conversion);
        brokerageBalance = (0, tax_bracket_calculator_1.roundCurrency)(brokerageBalance + rmd - fromBrokerage);
        var actualRothDeposit = conversion;
        if (brokerageBalance >= totalTax) {
            brokerageBalance = (0, tax_bracket_calculator_1.roundCurrency)(brokerageBalance - totalTax);
        }
        else {
            var unpaidTax = (0, tax_bracket_calculator_1.roundCurrency)(totalTax - brokerageBalance);
            brokerageBalance = 0;
            actualRothDeposit = Math.max(0, conversion - unpaidTax);
        }
        rothBalance += actualRothDeposit;
        // Last-resort Roth withdrawal if brokerage and traditional couldn't cover the spending need
        var fromRoth = Math.min(rothBalance, spendingNeed - fromBrokerage - fromTraditional);
        rothBalance = Math.max(0, rothBalance - fromRoth);
        traditionalBalance = (0, tax_bracket_calculator_1.roundCurrency)(traditionalBalance * (1 + input.assumedReturnRate));
        rothBalance = (0, tax_bracket_calculator_1.roundCurrency)(rothBalance * (1 + input.assumedReturnRate));
        brokerageBalance = (0, tax_bracket_calculator_1.roundCurrency)(brokerageBalance * (1 + input.assumedReturnRate));
        results.push({
            age: age,
            traditionalBalance: traditionalBalance,
            rothBalance: rothBalance,
            brokerageBalance: brokerageBalance,
            rmd: rmd,
            conversion: (0, tax_bracket_calculator_1.roundCurrency)(conversion),
            taxableIncome: (0, tax_bracket_calculator_1.roundCurrency)(taxableIncome),
            federalTax: federalTax,
            stateTax: stateTax,
            totalTax: totalTax,
            marginalRate: marginalRate,
            endingAssets: (0, tax_bracket_calculator_1.roundCurrency)(traditionalBalance + rothBalance + brokerageBalance),
        });
    }
    return results;
}
function conversionAmount(strategy, taxableIncome, filingStatus, taxYear, age, rmdStartAge) {
    if (strategy.mode === 'none') {
        return 0;
    }
    if (strategy.mode === 'fixed-amount') {
        if (strategy.stopAtRmdAge && age >= rmdStartAge)
            return 0;
        return Math.max(0, strategy.amount);
    }
    if (strategy.mode === 'fill-to-income') {
        if (strategy.stopAtRmdAge && age >= rmdStartAge)
            return 0;
        return Math.max(0, strategy.targetIncome - taxableIncome);
    }
    if (strategy.mode === 'auto-optimize' || strategy.mode === 'smooth-income-target') {
        return 0; // handled by scenario engine
    }
    return (0, tax_bracket_calculator_1.amountToFillBracket)(taxableIncome, (0, tax_bracket_calculator_1.ceilingForRate)(strategy.targetBracket, filingStatus, taxYear), filingStatus, taxYear);
}
function sumAccounts(accounts, types) {
    var latestByType = new Map();
    for (var _i = 0, accounts_1 = accounts; _i < accounts_1.length; _i++) {
        var account = accounts_1[_i];
        if (!types.includes(account.type))
            continue;
        var existing = latestByType.get(account.type);
        if (!existing || new Date(account.snapshotDate) > new Date(existing.snapshotDate)) {
            latestByType.set(account.type, account);
        }
    }
    return Array.from(latestByType.values()).reduce(function (total, account) { return total + account.balance; }, 0);
}
