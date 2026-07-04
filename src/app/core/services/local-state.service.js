"use strict";
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalStateService = void 0;
var core_1 = require("@angular/core");
var defaultAccounts = [
    { type: 'traditional_401k', balance: 1000000, snapshotDate: '2026-07-02' },
    { type: 'roth_ira', balance: 500000, snapshotDate: '2026-07-02' },
    { type: 'traditional_ira', balance: 500000, snapshotDate: '2026-07-02' },
    { type: 'brokerage', balance: 500000, snapshotDate: '2026-07-02' },
];
var defaultScenario = {
    name: 'Smooth income target',
    currentAge: 53,
    retirementAge: 60,
    birthYear: 1973,
    ssClaimAge: 67,
    ssPia: 2200,
    lifeExpectancy: 90,
    filingStatus: 'married_filing_jointly',
    rothConversionStrategy: { mode: 'smooth-income-target', targetBracket: 0.24 },
    assumedReturnRate: 0.08,
    stateTaxRate: 0.0495,
    wageIncome: 180000,
    annualLivingExpenses: 120000,
};
var LocalStateService = function () {
    var _classDecorators = [(0, core_1.Injectable)({ providedIn: 'root' })];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var LocalStateService = _classThis = /** @class */ (function () {
        function LocalStateService_1() {
            this.accounts = (0, core_1.signal)(this.loadAccounts());
            this.scenario = (0, core_1.signal)(this.loadScenario());
        }
        LocalStateService_1.prototype.loadAccounts = function () {
            if (typeof localStorage !== 'undefined') {
                var saved = localStorage.getItem('accounts');
                if (saved)
                    return JSON.parse(saved);
            }
            return defaultAccounts;
        };
        LocalStateService_1.prototype.loadScenario = function () {
            if (typeof localStorage !== 'undefined') {
                var saved = localStorage.getItem('scenario');
                if (saved)
                    return JSON.parse(saved);
            }
            return defaultScenario;
        };
        LocalStateService_1.prototype.addAccount = function (account) {
            this.accounts.update(function (accounts) {
                var updated = __spreadArray(__spreadArray([], accounts, true), [account], false);
                if (typeof localStorage !== 'undefined')
                    localStorage.setItem('accounts', JSON.stringify(updated));
                return updated;
            });
        };
        LocalStateService_1.prototype.setAccounts = function (accounts) {
            if (typeof localStorage !== 'undefined')
                localStorage.setItem('accounts', JSON.stringify(accounts));
            this.accounts.set(accounts);
        };
        LocalStateService_1.prototype.updateScenario = function (scenario) {
            if (typeof localStorage !== 'undefined')
                localStorage.setItem('scenario', JSON.stringify(scenario));
            this.scenario.set(scenario);
        };
        return LocalStateService_1;
    }());
    __setFunctionName(_classThis, "LocalStateService");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        LocalStateService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return LocalStateService = _classThis;
}();
exports.LocalStateService = LocalStateService;
