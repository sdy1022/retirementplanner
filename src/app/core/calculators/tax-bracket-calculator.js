"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateTax = calculateTax;
exports.getMarginalBracket = getMarginalBracket;
exports.amountToFillBracket = amountToFillBracket;
exports.ceilingForRate = ceilingForRate;
exports.roundCurrency = roundCurrency;
var tax_tables_1 = require("./tax-tables");
function calculateTax(grossIncome, filingStatus, year) {
    var table = (0, tax_tables_1.getTaxTable)(year, filingStatus);
    var taxableIncome = Math.max(0, grossIncome - table.standardDeduction);
    return roundCurrency(table.brackets.reduce(function (tax, bracket) {
        var taxableAtBracket = Math.max(0, Math.min(taxableIncome, bracket.max) - bracket.min);
        return tax + taxableAtBracket * bracket.rate;
    }, 0));
}
function getMarginalBracket(grossIncome, filingStatus, year) {
    var _a;
    var table = (0, tax_tables_1.getTaxTable)(year, filingStatus);
    var taxableIncome = Math.max(0, grossIncome - table.standardDeduction);
    return (_a = table.brackets.find(function (bracket) { return taxableIncome >= bracket.min && taxableIncome <= bracket.max; })) !== null && _a !== void 0 ? _a : table.brackets.at(-1);
}
function amountToFillBracket(grossIncome, targetBracketCeiling, filingStatus, year) {
    var table = (0, tax_tables_1.getTaxTable)(year, filingStatus);
    var targetGross = targetBracketCeiling + table.standardDeduction;
    return Math.max(0, targetGross - grossIncome);
}
function ceilingForRate(rate, filingStatus, year) {
    var _a;
    var bracket = (0, tax_tables_1.getTaxTable)(year, filingStatus).brackets.find(function (entry) { return entry.rate === rate; });
    return (_a = bracket === null || bracket === void 0 ? void 0 : bracket.max) !== null && _a !== void 0 ? _a : 0;
}
function roundCurrency(value) {
    return Math.round(value * 100) / 100;
}
