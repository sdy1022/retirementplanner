"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UNIFORM_LIFETIME_DIVISORS = void 0;
exports.getRmdStartAge = getRmdStartAge;
exports.calculateRmdSchedule = calculateRmdSchedule;
var tax_bracket_calculator_1 = require("./tax-bracket-calculator");
// will need to get this value from resources/assets/uniform-lifetime-divisors.json
// Pub. 590-B, Accounts Subject to Required Minimum Distributions
// https://www.irs.gov/pub/irs-pdf/p590b.pdf
// Page 38 has the table
exports.UNIFORM_LIFETIME_DIVISORS = {
    73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1, 80: 20.2,
    81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2, 87: 14.4, 88: 13.7,
    89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1, 94: 9.5, 95: 8.9, 96: 8.4,
    97: 7.8, 98: 7.3, 99: 6.8, 100: 6.4, 101: 6.0, 102: 5.6, 103: 5.2, 104: 4.9,
    105: 4.6, 106: 4.3, 107: 4.1, 108: 3.9, 109: 3.7, 110: 3.5, 111: 3.4, 112: 3.3,
    113: 3.1, 114: 3.0, 115: 2.9, 116: 2.8, 117: 2.7, 118: 2.5, 119: 2.3, 120: 2.0,
};
function getRmdStartAge(birthYear) {
    return birthYear >= 1960 ? 75 : 73;
}
function calculateRmdSchedule(accountBalance, currentAge, endAge, startAge, returnRate) {
    var _a;
    if (endAge === void 0) { endAge = 95; }
    if (startAge === void 0) { startAge = 73; }
    if (returnRate === void 0) { returnRate = 0; }
    var balance = accountBalance;
    var entries = [];
    for (var age = currentAge; age <= endAge; age++) {
        if (age >= startAge) {
            var divisor = (_a = exports.UNIFORM_LIFETIME_DIVISORS[age]) !== null && _a !== void 0 ? _a : exports.UNIFORM_LIFETIME_DIVISORS[120];
            var rmd = (0, tax_bracket_calculator_1.roundCurrency)(balance / divisor);
            entries.push({ age: age, divisor: divisor, beginningBalance: (0, tax_bracket_calculator_1.roundCurrency)(balance), rmd: rmd });
            balance = Math.max(0, balance - rmd);
        }
        balance = (0, tax_bracket_calculator_1.roundCurrency)(balance * (1 + returnRate));
    }
    return entries;
}
