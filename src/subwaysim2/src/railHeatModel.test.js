import test from 'node:test';
import assert from 'node:assert/strict';
import { createRailHeatState, normalizedTensorGaussian, stepRailHeatComparison, stepRailHeatState, summarizeRailHeatState } from './railHeatModel.js';

test('Fourier conduction spreads a hot spot and remains finite', () => {
  const state = createRailHeatState({ nodes: 41, length: 2, ambientTemperature: 0, initialTemperature: 0 });
  state.temperatures[20] = 100;
  stepRailHeatState(state, 20, { model: 'fourier', ambientTemperature: 0, heatPower: 0, convection: 0 });
  assert.ok(state.temperatures[19] > 0);
  assert.ok(state.temperatures[21] > 0);
  assert.ok(state.temperatures.every(Number.isFinite));
  assert.ok(state.temperatures[20] < 100);
});

test('Cattaneo-Vernotte stores a finite relaxing heat flux', () => {
  const state = createRailHeatState({ nodes: 41, length: 2, ambientTemperature: 0, initialTemperature: 0 });
  state.temperatures[20] = 100;
  stepRailHeatState(state, 0.25, { model: 'cattaneo', ambientTemperature: 0, heatPower: 0, convection: 0, relaxationTime: 2 });
  assert.ok(state.heatFluxes.some((flux) => Math.abs(flux) > 0));
  assert.ok(state.heatFluxes.every(Number.isFinite));
  assert.ok(state.temperatures.every(Number.isFinite));
});

test('DDF flux is limited relative to Fourier flux at a steep gradient', () => {
  const fourier = createRailHeatState({ nodes: 21, length: 1, ambientTemperature: 0, initialTemperature: 0 });
  const ddf = createRailHeatState({ nodes: 21, length: 1, ambientTemperature: 0, initialTemperature: 0 });
  fourier.temperatures[10] = 100;
  ddf.temperatures[10] = 100;
  const options = { ambientTemperature: 0, heatPower: 0, convection: 0, ddfStrength: 0.8 };
  stepRailHeatState(fourier, 0.001, { ...options, model: 'fourier' });
  stepRailHeatState(ddf, 0.001, { ...options, model: 'ddf' });
  assert.ok(Math.abs(ddf.heatFluxes[9]) < Math.abs(fourier.heatFluxes[9]));
  assert.ok(ddf.temperatures.every(Number.isFinite));
});

test('accelerated comparison steps keep all model temperatures bounded', () => {
  const states = Object.fromEntries(['fourier', 'cattaneo', 'ddf'].map((model) => [model, createRailHeatState({ nodes: 73, length: 6, ambientTemperature: 20 })]));
  stepRailHeatComparison(states, 45, { ambientTemperature: 20, heatPower: 4200, sourceWidth: 0.16, relaxationTime: 2, ddfStrength: 0.8 });
  for (const state of Object.values(states)) {
    const maximum = summarizeRailHeatState(state).maximumTemperature;
    assert.ok(Number.isFinite(maximum));
    assert.ok(maximum < 200);
  }
});

test('short Cattaneo relaxation remains stable through an accelerated frame', () => {
  const state = createRailHeatState({ nodes: 73, length: 6, ambientTemperature: 20 });
  stepRailHeatState(state, 90, { model: 'cattaneo', ambientTemperature: 20, heatPower: 12000, sourceWidth: 0.04, relaxationTime: 0.1, diffusivityScale: 5 });
  assert.ok(state.temperatures.every(Number.isFinite));
  assert.ok(state.temperatures.every((temperature) => temperature >= 20 && temperature < 1000));
});

test('normalized tensor Gaussian peaks at one and is anisotropic', () => {
  const center = normalizedTensorGaussian({ x: 0, y: 0 });
  const alongRail = normalizedTensorGaussian({ x: 0.1, y: 0 });
  const acrossRail = normalizedTensorGaussian({ x: 0, y: 0.1 });
  assert.equal(center, 1);
  assert.ok(alongRail > acrossRail);
  assert.ok(alongRail <= 1 && acrossRail >= 0);
});