"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_TAX_YEAR = exports.TAX_TABLES = void 0;
exports.getTaxTable = getTaxTable;
exports.TAX_TABLES = {
    2026: {
        single: {
            standardDeduction: 15000,
            brackets: [
                { rate: 0.1, min: 0, max: 11925 },
                { rate: 0.12, min: 11925, max: 48475 },
                { rate: 0.22, min: 48475, max: 103350 },
                { rate: 0.24, min: 103350, max: 197300 },
                { rate: 0.32, min: 197300, max: 250525 },
                { rate: 0.35, min: 250525, max: 626350 },
                { rate: 0.37, min: 626350, max: Number.POSITIVE_INFINITY },
            ],
        },
        married_filing_jointly: {
            standardDeduction: 30000,
            brackets: [
                { rate: 0.1, min: 0, max: 23850 },
                { rate: 0.12, min: 23850, max: 96950 },
                { rate: 0.22, min: 96950, max: 206700 },
                { rate: 0.24, min: 206700, max: 394600 },
                { rate: 0.32, min: 394600, max: 501050 },
                { rate: 0.35, min: 501050, max: 751600 },
                { rate: 0.37, min: 751600, max: Number.POSITIVE_INFINITY },
            ],
        },
    },
};
exports.DEFAULT_TAX_YEAR = 2026;
function getTaxTable(year, filingStatus) {
    var _a, _b;
    return (_b = (_a = exports.TAX_TABLES[year]) === null || _a === void 0 ? void 0 : _a[filingStatus]) !== null && _b !== void 0 ? _b : exports.TAX_TABLES[exports.DEFAULT_TAX_YEAR][filingStatus];
}
