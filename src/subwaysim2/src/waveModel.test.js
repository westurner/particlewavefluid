import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateWaveDerivative, calculateWaveSample, cloneWaveState, combineWaves, DEFAULT_WAVE_COUNT, DEFAULT_WAVE_STATES, DEFAULT_WAVES, INTERFERENCE_MODES, MAX_WAVES, PHASE_MODES } from './waveModel.js';

test('wave configuration exposes eight phase modes and eight defaults', () => {
  assert.equal(MAX_WAVES, 8);
  assert.equal(DEFAULT_WAVES.length, MAX_WAVES);
  assert.equal(DEFAULT_WAVE_COUNT, 6);
  assert.equal(DEFAULT_WAVES.find((wave) => wave.phaseMode === 'Circular-Left').enabled, false);
  assert.equal(DEFAULT_WAVES.find((wave) => wave.phaseMode === 'Helical-Right').enabled, false);
  assert.deepEqual(PHASE_MODES.slice(-4), ['Circular-Left', 'Circular-Right', 'Helical-Left', 'Helical-Right']);
  assert.deepEqual(Object.keys(INTERFERENCE_MODES), ['constructive', 'superposition']);
});

test('named wave states teach the modeled phase concepts and retain all slots', () => {
  assert.ok(DEFAULT_WAVE_STATES.length >= 8);
  assert.deepEqual(DEFAULT_WAVE_STATES.map((state) => state.name), [
    'Single traveling wave', 'Cancellation pair', 'Constructive pair', 'Standing wave',
    'Quadrature pair', 'Circular wave', 'Counter-rotating rings', 'Helical pair', 'Mixed phase field'
  ]);
  for (const state of DEFAULT_WAVE_STATES) {
    assert.equal(state.waves.length, MAX_WAVES);
    assert.ok(state.waveCount >= 1 && state.waveCount <= MAX_WAVES);
    assert.deepEqual(Object.keys(state.interferenceModes), ['constructive', 'superposition']);
  }
  const clone = cloneWaveState(DEFAULT_WAVE_STATES[1]);
  clone.waves[0].amplitude = 0;
  assert.notEqual(clone.waves[0].amplitude, DEFAULT_WAVE_STATES[1].waves[0].amplitude);
  assert.deepEqual(cloneWaveState({ name: 'legacy', waveCount: 1, interferenceMode: 'constructive', waves: [] }).interferenceModes, { constructive: true, superposition: false });
});

test('all phase modes produce finite samples', () => {
  for (const phaseMode of PHASE_MODES) {
    const sample = calculateWaveSample({ wavelength: 4, phaseMode, phaseOffset: 0.7, phaseRate: 1.2 }, 2, -1, 0.5);
    assert.ok(Number.isFinite(sample), `${phaseMode} should produce a finite sample`);
  }
});

test('constructive mode removes cancellation while superposition preserves it', () => {
  const waves = [
    { wavelength: 4, amplitude: 1, phaseMode: 'Standard', phaseOffset: 0, phaseRate: 0 },
    { wavelength: 4, amplitude: 1, phaseMode: 'Inverted', phaseOffset: 0, phaseRate: 0 }
  ];
  assert.equal(combineWaves(waves, 1, 0, 0, 'superposition'), 0);
  assert.ok(combineWaves(waves, 1, 0, 0, 'constructive') > 0);
});

test('interference layers can be enabled independently or together', () => {
  const waves = [
    { wavelength: 4, amplitude: 1, phaseMode: 'Standard', phaseOffset: 0, phaseRate: 0 },
    { wavelength: 4, amplitude: 1, phaseMode: 'Inverted', phaseOffset: 0, phaseRate: 0 }
  ];
  const constructive = combineWaves(waves, 1, 0, 0, { constructive: true, superposition: false });
  const superposition = combineWaves(waves, 1, 0, 0, { constructive: false, superposition: true });
  assert.ok(constructive > 0);
  assert.equal(superposition, 0);
  assert.equal(combineWaves(waves, 1, 0, 0, { constructive: false, superposition: false }), 0);
  assert.equal(combineWaves(waves, 1, 0, 0, { constructive: true, superposition: true }), constructive + superposition);
});

test('disabled waves do not contribute to the field', () => {
  const wave = { wavelength: 4, amplitude: 1, phaseMode: 'Standard', phaseOffset: 0, phaseRate: 0 };
  assert.equal(combineWaves([{ ...wave, enabled: false }], 1, 0, 0), 0);
  assert.notEqual(combineWaves([{ ...wave, enabled: true }], 1, 0, 0), 0);
});

test('wave motion derivative follows the selected order', () => {
  const wave = { wavelength: 4, amplitude: 1, phaseMode: 'Standard', phaseOffset: 0.2, phaseRate: 0 };
  assert.equal(calculateWaveDerivative([wave], 1, 0, 0, 0), combineWaves([wave], 1, 0, 0));
  assert.ok(Number.isFinite(calculateWaveDerivative([wave], 1, 0, 0, 1)));
  assert.ok(Number.isFinite(calculateWaveDerivative([wave], 1, 0, 0, 4)));
});
