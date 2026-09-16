import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateElectromagneticField, calculateOcclusionTransmission, calculateWaveDerivative, calculateWaveDisplacement, calculateWaveEnvelope, calculateWaveFrame, calculateWaveSample, calculateWaveTensorGaussian, cloneWaveState, combineWaves, DEFAULT_SIGNAL_DIRECTION, DEFAULT_SIGNAL_ORIGIN, DEFAULT_SIGNAL_ROTATION, DEFAULT_WAVE_COUNT, DEFAULT_WAVE_STATES, DEFAULT_WAVES, HELICAL_TOPOLOGICAL_CHARGE, INTERFERENCE_MODES, MAX_WAVES, OCCLUSION_PRESETS, PHASE_MODES, POLARIZATION_MODES, SIGNAL_SOURCE_PRESETS } from './waveModel.js';

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

test('wave states normalize origin and direction defaults', () => {
  const state = cloneWaveState({ name: 'legacy', waveCount: 1, waves: [{}] });
  assert.deepEqual(state.waves[0].origin, DEFAULT_SIGNAL_ORIGIN);
  assert.deepEqual(state.waves[0].direction, DEFAULT_SIGNAL_DIRECTION);
  assert.deepEqual(state.waves[0].rotation, DEFAULT_SIGNAL_ROTATION);
  assert.equal(state.waves[0].decayRate, 0);
  assert.equal(state.waves[0].polarization, 'Scalar');
});

test('wave phase follows the configured origin and direction', () => {
  const wave = { wavelength: 4, phaseMode: 'Standard', phaseOffset: 0, phaseRate: 0, origin: { x: 2, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } };
  assert.equal(calculateWaveSample(wave, 3, 0, 0), calculateWaveSample({ ...wave, origin: { x: 0, y: 0, z: 0 } }, 1, 0, 0));

  const zDirected = { ...wave, origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 1 } };
  assert.equal(calculateWaveSample(zDirected, 0, 1, 0), 1);
  assert.equal(calculateWaveSample(zDirected, 1, 0, 0), 0);
});

test('signal source frame exposes propagation direction for source vectors', () => {
  const frame = calculateWaveFrame({
    origin: { x: -8, y: 1, z: 2 },
    direction: { x: 0, y: 1, z: 1 },
    rotation: { x: 0, y: 0, z: 0 }
  });
  const length = Math.hypot(frame.direction.x, frame.direction.y, frame.direction.z);
  assert.deepEqual(frame.origin, { x: -8, y: 1, z: 2 });
  assert.ok(Math.abs(length - 1) < 1e-12);
  assert.ok(Math.abs(frame.direction.x) < 1e-12);
  assert.ok(Math.abs(frame.direction.y - Math.SQRT1_2) < 1e-12);
  assert.ok(Math.abs(frame.direction.z - Math.SQRT1_2) < 1e-12);
});

test('helical phase winds once around its directed propagation axis', () => {
  const wave = { wavelength: 8, phaseMode: 'Helical-Left', phaseOffset: 0, phaseRate: 0, origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } };
  assert.equal(HELICAL_TOPOLOGICAL_CHARGE, 1);
  assert.ok(Math.abs(calculateWaveSample(wave, 0, 0, 0, 1)) < 1e-12);
  assert.ok(Math.abs(calculateWaveSample(wave, 0, 1, 0, 0) - 1) < 1e-12);
  assert.ok(Math.abs(calculateWaveSample(wave, 0, 0, 0, -1)) < 1e-12);
  assert.ok(Math.abs(calculateWaveSample(wave, 0, -1, 0, 0) + 1) < 1e-12);
});

test('signal rotation rotates the complete directed frame', () => {
  const wave = { wavelength: 4, phaseMode: 'Standard', phaseOffset: 0, phaseRate: 0, rotation: { x: 0, y: 0, z: Math.PI / 2 } };
  assert.ok(Math.abs(calculateWaveSample(wave, 1, 0, 0)) < 1e-12);
  assert.ok(Math.abs(calculateWaveSample(wave, 0, 0, 0, 1) - 1) < 1e-12);
});

test('decay attenuates a wave only downstream of its origin', () => {
  const wave = { wavelength: 4, phaseMode: 'Standard', phaseOffset: 0, phaseRate: 0, decayRate: Math.log(2) };
  assert.ok(Math.abs(calculateWaveSample(wave, 1, 0, 0) - 0.5) < 1e-12);
  assert.ok(Math.abs(calculateWaveSample(wave, -1, 0, 0) + 1) < 1e-12);
  assert.equal(calculateWaveEnvelope({ decayRate: -1 }, 4), 1);
});

test('polarization maps scalar, transverse, and longitudinal displacement vectors', () => {
  assert.deepEqual(POLARIZATION_MODES, ['Scalar', 'Transverse', 'Longitudinal', 'Electromagnetic', 'EM-Tensor-Gaussian']);
  const baseWave = { wavelength: 4, amplitude: 1, phaseMode: 'Standard', phaseOffset: 0, phaseRate: 0, direction: { x: 0, y: 0, z: 1 } };
  assert.deepEqual(calculateWaveDisplacement([{ ...baseWave, polarization: 'Scalar' }], 0, 1, 0), { x: 0, y: 1, z: 0 });
  assert.deepEqual(calculateWaveDisplacement([{ ...baseWave, polarization: 'Longitudinal' }], 0, 1, 0), { x: 0, y: 0, z: 1 });
  assert.deepEqual(calculateWaveDisplacement([{ ...baseWave, polarization: 'Transverse' }], 0, 1, 0), { x: 0, y: 1, z: 0 });
  const circular = { ...baseWave, phaseMode: 'Circular-Left', polarization: 'Electromagnetic' };
  const electromagnetic = calculateWaveDisplacement([circular], 0, 0, 0);
  assert.ok(Math.hypot(electromagnetic.x, electromagnetic.y, electromagnetic.z) > 0);
});

test('electromagnetic polarization is transverse and derives B from k cross E', () => {
  const wave = { wavelength: 4, amplitude: 1, phaseMode: 'Circular-Left', phaseOffset: 0, phaseRate: 0, direction: { x: 0, y: 0, z: 1 } };
  const field = calculateElectromagneticField(wave, 0, 0, 0);
  const dotWithDirection = field.electric.z;
  const magneticMagnitude = Math.hypot(field.magnetic.x, field.magnetic.y, field.magnetic.z);
  const electricMagnitude = Math.hypot(field.electric.x, field.electric.y, field.electric.z);
  assert.ok(Math.abs(dotWithDirection) < 1e-12);
  assert.ok(Math.abs(magneticMagnitude - electricMagnitude) < 1e-12);
  assert.ok(Math.abs(field.tensor.reduce((sum, value) => sum + value * value, 0) - 1) < 1e-12);
});

test('tensor Gaussian splatters are strongest on-axis and vanish toward the beam edge', () => {
  const wave = { wavelength: 4, amplitude: 1, phaseMode: 'Standard', phaseOffset: Math.PI / 2, phaseRate: 0, beamWaist: 2, polarization: 'EM-Tensor-Gaussian' };
  const center = calculateWaveTensorGaussian([wave], 0, 0, 0);
  const edge = calculateWaveTensorGaussian([wave], 0, 6, 0);
  assert.ok(center > edge);
  assert.ok(center > 0);
  assert.ok(edge < 0.02);
});

test('signal source presets provide coherent laser configurations', () => {
  assert.deepEqual(SIGNAL_SOURCE_PRESETS.map((preset) => preset.name), [
    'Continuous-wave laser',
    'Continuous-wave laser w/ Helical-L and Helical-R'
  ]);
  const [laser, helicalLaser] = SIGNAL_SOURCE_PRESETS;
  assert.equal(laser.waveCount, 1);
  assert.equal(helicalLaser.waveCount, 3);
  assert.deepEqual(helicalLaser.waves.slice(0, 3).map((wave) => wave.phaseMode), ['Standard', 'Helical-Left', 'Helical-Right']);
  for (const preset of SIGNAL_SOURCE_PRESETS) {
    assert.equal(preset.waves.length, MAX_WAVES);
    assert.ok(preset.waves.every((wave) => wave.origin && wave.direction));
  }
});

test('occlusion presets expose aperture, fractal, room, and obstacle masks', () => {
  assert.deepEqual(OCCLUSION_PRESETS.map((preset) => preset.id), [
    'none', 'pinhole', 'single-slit', 'double-slit', 'sierpinski-carpet', 'unilluminable-room', 'boulder'
  ]);
  assert.equal(calculateOcclusionTransmission('none', 4, 8), 1);
  assert.equal(calculateOcclusionTransmission('pinhole', 2, 0), 1);
  assert.equal(calculateOcclusionTransmission('pinhole', 2, 2), 0);
  assert.equal(calculateOcclusionTransmission('single-slit', 2, 1), 1);
  assert.equal(calculateOcclusionTransmission('double-slit', 2, 2.1), 1);
  assert.equal(calculateOcclusionTransmission('double-slit', 2, 0), 0);
  assert.equal(calculateOcclusionTransmission('sierpinski-carpet', 1, -8), 1);
  assert.equal(calculateOcclusionTransmission('sierpinski-carpet', 1.5, 0), 0);
  assert.equal(calculateOcclusionTransmission('unilluminable-room', 4, 0), 0);
  assert.equal(calculateOcclusionTransmission('unilluminable-room', 4, 6), 1);
  assert.equal(calculateOcclusionTransmission('boulder', 2.8, 0), 0);
  assert.equal(calculateOcclusionTransmission('boulder', 6, 3), 1);
});
