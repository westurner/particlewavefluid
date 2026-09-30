import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateThermalLoop, compareThermalFluids, THERMAL_FLUIDS } from './thermalLoopModel.js';

test('thermal-loop energy balance closes', () => {
  const model = calculateThermalLoop({ itLoadMW: 2.5, temperatureRiseC: 12 });
  assert.ok(Math.abs(model.energyResidualW) < 1e-8);
  assert.ok(model.massFlowKgS > 0);
});

test('smaller pipe diameter raises pressure drop and pump power', () => {
  const wide = calculateThermalLoop({ pipeDiameterM: 0.2 });
  const narrow = calculateThermalLoop({ pipeDiameterM: 0.1 });
  assert.ok(narrow.pressureDropPa > wide.pressureDropPa);
  assert.ok(narrow.pumpPowerW > wide.pumpPowerW);
});

test('economizer availability lowers chiller power and PUE', () => {
  const cool = calculateThermalLoop({ ambientC: 10, supplyC: 30, economizerHoursFraction: 0.7 });
  const hot = calculateThermalLoop({ ambientC: 32, supplyC: 30, economizerHoursFraction: 0.7 });
  assert.equal(cool.economizerAvailable, true);
  assert.equal(hot.economizerAvailable, false);
  assert.ok(cool.chillerPowerW < hot.chillerPowerW);
  assert.ok(cool.pue < hot.pue);
});

test('more viscous fluid incurs a pump penalty under equal thermal duty', () => {
  const comparison = compareThermalFluids({ itLoadMW: 1, temperatureRiseC: 10 }, 'water', 'glycol30');
  assert.ok(comparison.pumpPowerRatio > 1);
});

test('all fluid records carry provenance and uncertainty', () => {
  Object.values(THERMAL_FLUIDS).forEach((fluid) => {
    assert.ok(fluid.source.length > 20);
    assert.ok(fluid.uncertainty >= 0);
    assert.ok(['reference', 'user', 'hypothesis'].includes(fluid.status));
    if (fluid.status === 'reference') {
      assert.ok(fluid.citation.length > 20);
      assert.equal(fluid.temperatureRangeC.length, 2);
    }
  });
});