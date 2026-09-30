import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareQuantumHydrodynamicDensity,
  createEulerKortewegState,
  createQuantumState,
  quantumDiagnostics,
  quantumObservables,
  stepEulerKorteweg,
  stepGrossPitaevskii
} from './quantumFluidModel.js';

test('plane wave preserves norm and energy under split-step evolution', () => {
  const state = createQuantumState({ size: 16, preset: 'plane-wave', interaction: 0.4 });
  const initial = quantumDiagnostics(state);
  for (let step = 0; step < 40; step += 1) stepGrossPitaevskii(state, 0.01);
  const final = quantumDiagnostics(state, initial);
  assert.ok(Math.abs(final.normDrift) < 1e-11);
  assert.ok(Math.abs(final.energyDrift) < 1e-9);
});

test('stationary vortex carries nonzero integer phase winding', () => {
  const state = createQuantumState({ size: 32, preset: 'vortex' });
  const diagnostics = quantumDiagnostics(state);
  assert.ok(diagnostics.vortices.some(({ charge }) => Math.abs(charge) === 1));
});

test('free packet disperses while preserving norm', () => {
  const state = createQuantumState({ size: 32, preset: 'packet', interaction: 0 });
  const initial = quantumDiagnostics(state);
  const initialPeak = Math.max(...initial.observables.density);
  for (let step = 0; step < 80; step += 1) stepGrossPitaevskii(state, 0.01);
  const final = quantumDiagnostics(state, initial);
  assert.ok(Math.max(...final.observables.density) < initialPeak);
  assert.ok(Math.abs(final.normDrift) < 1e-10);
});

test('Madelung observables remain finite at vacuum nodes', () => {
  const state = createQuantumState({ size: 16, preset: 'packet' });
  state.real[0] = 0;
  state.imaginary[0] = 0;
  const observables = quantumObservables(state);
  for (const field of [observables.currentX, observables.currentY, observables.quantumPressure]) {
    field.forEach((value) => assert.ok(Number.isFinite(value)));
  }
});

test('Euler-Korteweg reference advances independently from the same initial state', () => {
  const quantum = createQuantumState({ size: 16, preset: 'packet', interaction: 0.3 });
  const hydrodynamic = createEulerKortewegState(quantum);
  stepGrossPitaevskii(quantum, 0.002);
  stepEulerKorteweg(hydrodynamic, 0.002);
  const comparison = compareQuantumHydrodynamicDensity(quantum, hydrodynamic);
  assert.ok(Number.isFinite(comparison.rmsDifference));
  assert.ok(comparison.maximumDifference >= 0);
});

test('Euler-Korteweg reference remains finite around a vortex vacuum core', () => {
  const quantum = createQuantumState({ size: 32, preset: 'vortex', interaction: 0.8 });
  const hydrodynamic = createEulerKortewegState(quantum);
  for (let step = 0; step < 400; step += 1) stepEulerKorteweg(hydrodynamic, 0.002);
  for (const field of [hydrodynamic.density, hydrodynamic.velocityX, hydrodynamic.velocityY]) {
    field.forEach((value) => assert.ok(Number.isFinite(value)));
  }
});