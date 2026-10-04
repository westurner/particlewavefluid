import test from 'node:test';
import assert from 'node:assert/strict';
import { Euler, Vector3 } from 'three';
import { advanceDetectorResponse, calculateDoubleSlitField, calculateElectromagneticField, calculateOcclusionTransmission, calculatePinholeField, calculateWaveDerivative, calculateWaveDisplacement, calculateWaveDisplacementAndTensorGaussian, calculateWaveEnvelope, calculateWaveFrame, calculateWaveOrbitalPhase, calculateWaveSample, calculateWaveTensorGaussian, cloneWaveState, combineWaves, createApertureSamplePoints, DEFAULT_APERTURE_SETTINGS, DEFAULT_SIGNAL_DIRECTION, DEFAULT_SIGNAL_ORIGIN, DEFAULT_SIGNAL_ROTATION, DEFAULT_WAVE_COUNT, DEFAULT_WAVE_STATES, DEFAULT_WAVES, DOUBLE_SLIT_CENTERS, DOUBLE_SLIT_DETECTOR_X, detectorDistanceForSlitScreenPosition, GRATING_SLIT_CENTERS, GRATING_SLIT_SPACING, getSlitGeometry, HELICAL_TOPOLOGICAL_CHARGE, INTERFERENCE_MODES, MAX_WAVES, normalizeApertureSettings, OCCLUSION_PRESETS, PHASE_MODES, PINHOLE_RADIUS, POLARIZATION_MODES, prepareApertureField, SIGNAL_SOURCE_PRESETS, slitScreenLocalToWorld, slitScreenWorldToLocal } from './waveModel.js';

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
    'Quadrature pair', 'Circular wave', 'Counter-rotating rings', 'Helical pair', 'Double-slit experiment', 'Single-slit experiment', 'Pinhole experiment', 'Diffraction grating', 'Two coherent sources', 'Mixed phase field'
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

test('helical orbital angular momentum controls signed phase winding', () => {
  const wave = { wavelength: 8, phaseMode: 'Helical-Left', phaseOffset: 0, phaseRate: 0, origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 }, orbitalAngularMomentum: 2 };
  const theta = Math.PI / 4;
  assert.ok(Math.abs(calculateWaveSample(wave, 0, Math.sin(theta), 0, Math.cos(theta)) - 1) < 1e-12);
  assert.ok(Math.abs(calculateWaveSample({ ...wave, orbitalAngularMomentum: -2 }, 0, Math.sin(theta), 0, Math.cos(theta) ) + 1) < 1e-12);

  const normalized = cloneWaveState({ name: 'OAM defaults', waveCount: 2, waves: [
    { phaseMode: 'Helical-Right' },
    { phaseMode: 'Helical-Left', orbitalAngularMomentum: 9 }
  ] });
  assert.equal(normalized.waves[0].orbitalAngularMomentum, -1);
  assert.equal(normalized.waves[1].orbitalAngularMomentum, 3);
});

test('tensor-Gaussian orbital phase samples the configured OAM winding', () => {
  const wave = { wavelength: 8, amplitude: 1, phaseMode: 'Helical-Left', phaseOffset: 0, phaseRate: 0, polarization: 'EM-Tensor-Gaussian', orbitalAngularMomentum: 2 };
  const theta = Math.PI / 4;
  const phase = calculateWaveOrbitalPhase([wave], 0, Math.sin(theta), 0, Math.cos(theta));
  assert.ok(Math.abs(phase - Math.PI / 2) < 1e-12);
  assert.ok(Math.abs(calculateWaveOrbitalPhase([{ ...wave, orbitalAngularMomentum: -2 }], 0, Math.sin(theta), 0, Math.cos(theta)) + Math.PI / 2) < 1e-12);
  assert.equal(calculateWaveOrbitalPhase([{ ...wave, polarization: 'Electromagnetic' }], 0, 1, 0), null);
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

test('electromagnetic plane wave is transverse, null, and derives B from k cross E', () => {
  const wave = { wavelength: 4, amplitude: 1, phaseMode: 'Circular-Left', phaseOffset: 0, phaseRate: 0, direction: { x: 0, y: 0, z: 1 } };
  const field = calculateElectromagneticField(wave, 0, 0, 0);
  const dotWithDirection = field.electric.z;
  const electricMagneticDot = field.electric.x * field.magnetic.x + field.electric.y * field.magnetic.y + field.electric.z * field.magnetic.z;
  const nullFieldInvariant = 2 * (field.magnetic.x ** 2 + field.magnetic.y ** 2 + field.magnetic.z ** 2 - field.electric.x ** 2 - field.electric.y ** 2 - field.electric.z ** 2);
  const magneticMagnitude = Math.hypot(field.magnetic.x, field.magnetic.y, field.magnetic.z);
  const electricMagnitude = Math.hypot(field.electric.x, field.electric.y, field.electric.z);
  assert.ok(Math.abs(dotWithDirection) < 1e-12);
  assert.ok(Math.abs(electricMagneticDot) < 1e-12, 'E dot B is a vanishing electromagnetic invariant for this plane wave');
  assert.ok(Math.abs(nullFieldInvariant) < 1e-12, 'B squared minus E squared vanishes in the model c=1 units');
  assert.ok(Math.abs(magneticMagnitude - electricMagnitude) < 1e-12);
  assert.ok(Math.abs(field.tensor.reduce((sum, value) => sum + value * value, 0) - 1) < 1e-12);
});

test('double-slit field coherently produces a bright center and a dark first fringe', () => {
  const wave = {
    wavelength: 1.5,
    amplitude: 1,
    phaseMode: 'Standard',
    phaseOffset: 0,
    phaseRate: 1,
    origin: { x: -8, y: 0, z: 0 },
    direction: { x: 1, y: 0, z: 0 },
    polarization: 'Electromagnetic',
    enabled: true
  };
  const period = Math.PI * 2;
  const averageIntensity = (z, field = 'intensity') => Array.from({ length: 120 }, (_, index) => {
    const time = period * index / 120;
    return calculateDoubleSlitField([wave], DOUBLE_SLIT_DETECTOR_X, z, time)[field];
  }).reduce((total, intensity) => total + intensity, 0) / 120;
  const center = averageIntensity(0);
  const firstMinimum = averageIntensity(1.4);
  const constructiveMinimum = averageIntensity(1.4, 'constructiveIntensity');
  assert.ok(center > firstMinimum * 8, `central intensity ${center} should dominate first minimum ${firstMinimum}`);
  assert.ok(constructiveMinimum > firstMinimum * 20, 'constructive mode should remove the first dark fringe from the field view');
  assert.ok(Number.isFinite(calculateDoubleSlitField([wave], DOUBLE_SLIT_DETECTOR_X, 0, 0).electric.y));
});

test('pinhole propagation samples a circular aperture and a two-dimensional detector', () => {
  const aperturePoints = createApertureSamplePoints('pinhole');
  assert.equal(aperturePoints.length, 96);
  assert.ok(aperturePoints.some((point) => Math.abs(point.y) > 0.5));
  assert.ok(aperturePoints.some((point) => Math.abs(point.z) > 0.5));
  assert.ok(aperturePoints.every((point) => point.y ** 2 + point.z ** 2 <= PINHOLE_RADIUS ** 2));

  const wave = { wavelength: 0.95, amplitude: 1, phaseMode: 'Standard', phaseOffset: 0, phaseRate: 1, origin: { x: -8, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 }, enabled: true };
  const averageIntensity = (y, z) => Array.from({ length: 60 }, (_, index) => {
    const time = Math.PI * 2 * index / 60;
    return calculatePinholeField([wave], DOUBLE_SLIT_DETECTOR_X, y, z, time).intensity;
  }).reduce((total, intensity) => total + intensity, 0) / 60;
  const center = averageIntensity(0, 0);
  const vertical = averageIntensity(2, 0);
  const horizontal = averageIntensity(0, 2);
  const firstDarkRing = averageIntensity(4.9, 0);
  assert.ok(center > vertical && center > horizontal, 'the on-axis detector pixel should be brightest');
  assert.ok(Math.abs(vertical - horizontal) < center * 0.08, 'a circular aperture should be nearly radially symmetric near its center');
  assert.ok(center > firstDarkRing * 4, 'the circular aperture should produce a dark first Airy ring');
});

test('grating and two-source experiments prepare their distinct coherent emitters', () => {
  const gratingPoints = createApertureSamplePoints('grating');
  assert.equal(GRATING_SLIT_CENTERS.length, 5);
  assert.equal(gratingPoints.length, 5 * 5 * 7);
  assert.ok(Math.abs(gratingPoints.reduce((total, point) => total + point.weight, 0) - 5.5) < 1e-12);
  const sourcePoints = createApertureSamplePoints('two-source');
  assert.deepEqual(sourcePoints.map(({ y, z }) => [y, z]), [[0, -2.1], [0, 2.1]]);
});

test('slit widths and shared position stay synchronized between mask and field sampling', () => {
  const settings = { slitPosition: 1, slitWidthA: 0.4, slitWidthB: 1.4, slitWidthsLinked: false };
  const samples = createApertureSamplePoints('double-slit', settings);
  const leftSlit = samples.slice(0, 35);
  const rightSlit = samples.slice(35);
  const mean = (points) => points.reduce((total, point) => total + point.z, 0) / points.length;
  assert.ok(Math.abs(mean(leftSlit) - -1.1) < 1e-12);
  assert.ok(Math.abs(mean(rightSlit) - 3.1) < 1e-12);
  assert.ok(Math.abs(leftSlit.at(-1).z - leftSlit[0].z) < 0.4);
  assert.ok(Math.abs(rightSlit.at(-1).z - rightSlit[0].z) < 1.4);
  assert.equal(calculateOcclusionTransmission('double-slit', 0, -1.1, 0, settings), 1);
  assert.equal(calculateOcclusionTransmission('double-slit', 0, -1.5, 0, settings), 0);
  assert.equal(calculateOcclusionTransmission('double-slit', 0, 3.7, 0, settings), 1);
  assert.equal(calculateOcclusionTransmission('double-slit', 0, 3.9, 0, settings), 0);
});

test('slit count, spacing, wall margins, and opacity share screen and field geometry', () => {
  const defaultDouble = getSlitGeometry('double-slit');
  const defaultGrating = getSlitGeometry('grating');
  assert.deepEqual(defaultDouble.centers, DOUBLE_SLIT_CENTERS);
  assert.equal(defaultDouble.spacing, 4.2);
  assert.equal(defaultGrating.centers.length, GRATING_SLIT_CENTERS.length);
  assert.equal(defaultGrating.spacing, GRATING_SLIT_SPACING);
  assert.equal(defaultDouble.opacity, 0.2);

  const settings = normalizeApertureSettings({
    slitPosition: 1,
    slitCount: 4,
    slitSpacing: 2.5,
    slitWidthA: 0.4,
    slitWallMargin: 0.5,
    slitOpacity: 0.65
  });
  const geometry = getSlitGeometry('double-slit', settings);
  assert.deepEqual(geometry.centers, [-2.75, -0.25, 2.25, 4.75]);
  assert.deepEqual(geometry.widths, [0.4, 0.4, 0.4, 0.4]);
  assert.equal(geometry.openingHeight, 2.2);
  assert.equal(geometry.opacity, 0.65);

  const samples = createApertureSamplePoints('double-slit', settings);
  assert.equal(samples.length, 4 * 5 * 7);
  assert.ok(samples.every((sample) => Math.abs(sample.y) < geometry.openingHeight / 2));
  assert.equal(calculateOcclusionTransmission('double-slit', 0, geometry.centers[0], 1, settings), 1);
  assert.equal(calculateOcclusionTransmission('double-slit', 0, geometry.centers[0], 1.2, settings), 0);
});

test('slit screen XYZ pose is invertible and drives the rotated occlusion aperture', () => {
  assert.equal(DEFAULT_APERTURE_SETTINGS.detectorDistance, DOUBLE_SLIT_DETECTOR_X);
  assert.equal(detectorDistanceForSlitScreenPosition({ x: 1, y: 2, z: 2 }), Math.hypot(DOUBLE_SLIT_DETECTOR_X - 1, 2, 2));
  assert.equal(normalizeApertureSettings({ slitScreenPositionX: 1 }).detectorDistance, DOUBLE_SLIT_DETECTOR_X - 1);
  const settings = normalizeApertureSettings({
    slitCount: 3,
    slitSpacing: 2,
    slitWallMargin: 0.4,
    slitScreenPositionX: 1.25,
    slitScreenPositionY: -0.75,
    slitScreenPositionZ: 2.5,
    slitScreenRotationX: 0.35,
    slitScreenRotationY: -0.6,
    slitScreenRotationZ: 0.2
  });
  const geometry = getSlitGeometry('double-slit', settings);
  assert.deepEqual(geometry.screenPosition, { x: 1.25, y: -0.75, z: 2.5 });
  assert.deepEqual(geometry.screenRotation, { x: 0.35, y: -0.6, z: 0.2 });
  const localOpening = { x: 0, y: 0.8, z: 0 };
  const worldOpening = slitScreenLocalToWorld(localOpening, settings);
  const roundTrip = slitScreenWorldToLocal(worldOpening, settings);
  const threeWorldOpening = new Vector3(localOpening.x, localOpening.y, localOpening.z)
    .applyEuler(new Euler(settings.slitScreenRotationX, settings.slitScreenRotationY, settings.slitScreenRotationZ, 'ZYX'))
    .add(new Vector3(settings.slitScreenPositionX, settings.slitScreenPositionY, settings.slitScreenPositionZ));
  assert.ok(Math.abs(roundTrip.x - localOpening.x) < 1e-12);
  assert.ok(Math.abs(roundTrip.y - localOpening.y) < 1e-12);
  assert.ok(Math.abs(roundTrip.z - localOpening.z) < 1e-12);
  assert.ok(Math.hypot(worldOpening.x - threeWorldOpening.x, worldOpening.y - threeWorldOpening.y, worldOpening.z - threeWorldOpening.z) < 1e-12);
  assert.equal(calculateOcclusionTransmission('double-slit', worldOpening.x, worldOpening.z, worldOpening.y, settings), 1);

  const localWall = { x: 0, y: 1.5, z: 0 };
  const worldWall = slitScreenLocalToWorld(localWall, settings);
  assert.equal(calculateOcclusionTransmission('double-slit', worldWall.x, worldWall.z, worldWall.y, settings), 0);
  const offScreen = slitScreenLocalToWorld({ x: 0.3, y: 0.8, z: 0 }, settings);
  assert.equal(calculateOcclusionTransmission('double-slit', offScreen.x, offScreen.z, offScreen.y, settings), 1);

  const aperture = prepareApertureField([{
    wavelength: 2,
    amplitude: 1,
    phaseMode: 'Standard',
    phaseOffset: 0,
    phaseRate: 0,
    enabled: true
  }], 'double-slit', settings);
  const expectedEmitter = slitScreenLocalToWorld({ x: 0, y: -geometry.openingHeight * 0.4, z: geometry.centers[0] - geometry.widths[0] * 3 / 7 }, settings);
  assert.ok(Math.abs(aperture.emitters[0].x - expectedEmitter.x) < 1e-12);
  assert.ok(Math.abs(aperture.emitters[0].y - expectedEmitter.y) < 1e-12);
  assert.ok(Math.abs(aperture.emitters[0].z - expectedEmitter.z) < 1e-12);
});

test('detector response integrates exposure and retains configurable glow', () => {
  let response = { average: 0, glow: 0 };
  for (let step = 0; step < 100; step += 1) response = advanceDetectorResponse(response, 1, 0.1, 0.5, 2);
  assert.ok(response.average > 0.99);
  assert.ok(response.glow > 0.99);
  for (let step = 0; step < 20; step += 1) response = advanceDetectorResponse(response, 0, 0.1, 0.5, 2);
  assert.ok(response.glow > 0.3 && response.glow < 0.5);
});

test('tensor Gaussian splatters are strongest on-axis and vanish toward the beam edge', () => {
  const wave = { wavelength: 4, amplitude: 1, phaseMode: 'Standard', phaseOffset: Math.PI / 2, phaseRate: 0, beamWaist: 2, polarization: 'EM-Tensor-Gaussian' };
  const center = calculateWaveTensorGaussian([wave], 0, 0, 0);
  const edge = calculateWaveTensorGaussian([wave], 0, 6, 0);
  assert.ok(center > edge);
  assert.ok(center > 0);
  assert.ok(edge < 0.02);
});

test('tensor Gaussian uses electric energy consistently across phase and direction modes', () => {
  const interferenceModes = { constructive: false, superposition: true };
  const modes = ['Standard', 'Quadrature', 'Inverted', 'Standing', 'Circular-Left', 'Circular-Right', 'Helical-Left', 'Helical-Right'];
  for (const phaseMode of modes) {
    const wave = {
      wavelength: 3.7,
      amplitude: 0.82,
      phaseMode,
      phaseOffset: 0.31,
      phaseRate: -0.4,
      beamWaist: 2.3,
      origin: { x: -0.7, y: 0.4, z: 0.2 },
      direction: { x: 0.3, y: 0.6, z: -0.2 },
      rotation: { x: 0.2, y: -0.4, z: 0.1 },
      polarization: 'EM-Tensor-Gaussian'
    };
    const x = 1.3;
    const y = -0.5;
    const z = 2.1;
    const time = 0.73;
    const field = calculateElectromagneticField(wave, x, z, time, y);
    const electricEnergy = field.electric.x ** 2 + field.electric.y ** 2 + field.electric.z ** 2;
    const expected = Math.min(1, electricEnergy) * field.gaussian;
    const waveSlots = [{ polarization: 'Scalar', enabled: true }, wave];
    const optimized = calculateWaveTensorGaussian(waveSlots, x, z, time, interferenceModes, y);
    const combined = calculateWaveDisplacementAndTensorGaussian(waveSlots, x, z, time, interferenceModes, y);
    assert.ok(Math.abs(optimized - expected) < 1e-12, `${phaseMode}: ${optimized} should match ${expected}`);
    assert.ok(Math.abs(combined.tensorGaussian - expected) < 1e-12, `${phaseMode}: fused tensor response should match ${expected}`);
    assert.deepEqual(combined.displacement, calculateWaveDisplacement(waveSlots, x, z, time, interferenceModes, y));
    const normalizedTensorNorm = Math.sqrt(field.tensor.reduce((sum, value) => sum + value * value, 0));
    if (electricEnergy > 1e-12) assert.ok(Math.abs(normalizedTensorNorm - 1) < 1e-12, `${phaseMode}: normalized tensor norm should be one`);
  }
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
    'none', 'pinhole', 'single-slit', 'double-slit', 'diffraction-grating', 'sierpinski-carpet', 'unilluminable-room', 'boulder'
  ]);
  assert.equal(calculateOcclusionTransmission('none', 4, 8), 1);
  assert.equal(calculateOcclusionTransmission('pinhole', 2, 0), 1);
  assert.equal(calculateOcclusionTransmission('pinhole', 2, 2), 1);
  assert.equal(calculateOcclusionTransmission('pinhole', 0, 0), 1);
  assert.equal(calculateOcclusionTransmission('pinhole', 0, 1), 0);
  assert.equal(calculateOcclusionTransmission('pinhole', 0, 0, 0.5), 1);
  assert.equal(calculateOcclusionTransmission('pinhole', 0, 0, 0.7), 1);
  assert.equal(calculateOcclusionTransmission('pinhole', 0, 0.7, 0.7), 0);
  assert.equal(calculateOcclusionTransmission('single-slit', 2, 1), 1);
  assert.equal(calculateOcclusionTransmission('double-slit', 2, 2.1), 1);
  assert.equal(calculateOcclusionTransmission('double-slit', 2, 0), 1);
  assert.equal(calculateOcclusionTransmission('double-slit', 0, 0), 0);
  assert.equal(calculateOcclusionTransmission('double-slit', 0, 2.1), 1);
  assert.equal(calculateOcclusionTransmission('double-slit', -1, 0), 1);
  assert.equal(calculateOcclusionTransmission('diffraction-grating', 0, GRATING_SLIT_CENTERS[0]), 1);
  assert.equal(calculateOcclusionTransmission('diffraction-grating', 0, 0.8), 0);
  assert.equal(calculateOcclusionTransmission('sierpinski-carpet', 1, -8), 1);
  assert.equal(calculateOcclusionTransmission('sierpinski-carpet', 1.5, 0), 0);
  assert.equal(calculateOcclusionTransmission('unilluminable-room', 4, 0), 0);
  assert.equal(calculateOcclusionTransmission('unilluminable-room', 4, 6), 1);
  assert.equal(calculateOcclusionTransmission('boulder', 2.8, 0), 0);
  assert.equal(calculateOcclusionTransmission('boulder', 6, 3), 1);
});
