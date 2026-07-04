import { runScenario } from './src/app/core/calculators/scenario-engine';
import { LocalStateService } from './src/app/core/services/local-state.service';

const state = new LocalStateService();
const result = runScenario(state.scenario(), state.accounts());
const year60 = result.years.find((y: any) => y.age === 60);
console.log(JSON.stringify(year60, null, 2));
