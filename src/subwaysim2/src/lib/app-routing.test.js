import test from 'node:test';
import assert from 'node:assert/strict';
import { getHomeUrl, getSimulationRoute, getSimulationUrl } from './app-routing.js';

const simulationIds = ['subwaysim2', 'waveinterferencesim'];

test('simulation routes resolve direct URLs and the legacy index entry', () => {
  assert.deepEqual(getSimulationRoute('/', simulationIds), { type: 'home' });
  assert.deepEqual(getSimulationRoute('/index.html', simulationIds), { type: 'home' });
  assert.deepEqual(getSimulationRoute('/sim/subwaysim2', simulationIds), { type: 'simulation', id: 'subwaysim2' });
  assert.deepEqual(getSimulationRoute('/sim/waveinterferencesim/', simulationIds), { type: 'simulation', id: 'waveinterferencesim' });
});

test('simulation URLs respect a configured base path and reject unknown IDs', () => {
  assert.equal(getSimulationUrl('subwaysim2', '/particlewavefluid/'), '/particlewavefluid/sim/subwaysim2');
  assert.equal(getHomeUrl('/particlewavefluid/'), '/particlewavefluid/');
  assert.deepEqual(getSimulationRoute('/particlewavefluid/sim/subwaysim2', simulationIds, '/particlewavefluid/'), { type: 'simulation', id: 'subwaysim2' });
  assert.deepEqual(getSimulationRoute('/sim/unknown', simulationIds), { type: 'not-found' });
  assert.deepEqual(getSimulationRoute('/sim/%E0%A4%A', simulationIds), { type: 'not-found' });
});