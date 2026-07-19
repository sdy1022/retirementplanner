"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var scenario_engine_1 = require("./src/app/core/calculators/scenario-engine");
var local_state_service_1 = require("./src/app/core/services/local-state.service");
var state = new local_state_service_1.LocalStateService();
var result = (0, scenario_engine_1.runScenario)(state.scenario(), state.accounts());
var year60 = result.years.find(function (y) { return y.age === 60; });
console.log(JSON.stringify(year60, null, 2));
