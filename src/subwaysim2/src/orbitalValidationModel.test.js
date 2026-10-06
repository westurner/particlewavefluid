import assert from 'node:assert/strict';
import test from 'node:test';
import { AMPLITUDE_GRAVITY_MODES } from './amplitudeGravityModel.js';
import {
  calculatePairDistances,
  JPL_DE441_ORBIT_INTERVAL,
  JPL_DE441_SAMPLED_STATES,
  MERCURY_PERIHELION_REFERENCE,
  ORBIT_VALIDATION_DATASET_CITATIONS,
  ORBIT_VALIDATION_MODEL_EXTENSION_PLAN,
  scoreObservedOrbits
} from './orbitalValidationModel.js';

test('JPL benchmark records barycentric DE441 states for both ends of one defined interval', () => {
  assert.equal(JPL_DE441_ORBIT_INTERVAL.center, 'Solar System barycenter');
  assert.equal(JPL_DE441_ORBIT_INTERVAL.intervalDays, 30);
  assert.deepEqual(Object.keys(JPL_DE441_SAMPLED_STATES), ['Sun', 'Mercury', 'Venus', 'EarthMoonBarycenter', 'MarsBarycenter', 'JupiterBarycenter', 'SaturnBarycenter', 'UranusBarycenter', 'NeptuneBarycenter']);
  assert.ok(Object.values(JPL_DE441_SAMPLED_STATES).every((states) => states.length === 7 && states.every((state) => state.length === 6 && state.every(Number.isFinite))));
  assert.deepEqual(JPL_DE441_ORBIT_INTERVAL.objectIds, { Sun: 10, Mercury: 199, Venus: 299, EarthMoonBarycenter: 3, MarsBarycenter: 4, JupiterBarycenter: 5, SaturnBarycenter: 6, UranusBarycenter: 7, NeptuneBarycenter: 8 });
  assert.equal('bodyStates' in JPL_DE441_ORBIT_INTERVAL, false);
  assert.equal(MERCURY_PERIHELION_REFERENCE.valueArcsecondsPerCentury, 42.98);
  assert.ok(ORBIT_VALIDATION_DATASET_CITATIONS.length >= 3);
  assert.ok(ORBIT_VALIDATION_DATASET_CITATIONS.every(({ label, source, usage }) => label && source.startsWith('https://') && usage));
  assert.ok(ORBIT_VALIDATION_MODEL_EXTENSION_PLAN.length >= 5);
});

test('pair-distance calculation covers every unordered attractor pair', () => {
  const distances = calculatePairDistances([
    { id: 'Sun', position: [0, 0, 0] },
    { id: 'Earth', position: [3, 4, 0] },
    { id: 'Mars', position: [0, 0, 12] }
  ]);
  assert.equal(distances.length, 3);
  assert.deepEqual(distances.map(({ distanceAU }) => distanceAU), [5, 12, 13]);
});

test('observed orbit score compares every model and rewards the Mercury GR perihelion residual', () => {
  const results = scoreObservedOrbits({ modes: AMPLITUDE_GRAVITY_MODES });
  assert.equal(results.length, AMPLITUDE_GRAVITY_MODES.length);
  assert.deepEqual(results.map(({ mode }) => mode).sort(), AMPLITUDE_GRAVITY_MODES.map(({ value }) => value).sort());
  assert.ok(results.every((result) => Number.isFinite(result.scorePoints)));
  assert.ok(results.every((result) => result.pairDistances.length === 36));
  assert.ok(results.every((result) => result.tracks.length === 9 && result.tracks.every((track) => track.observed.length === 7 && track.predicted.length === 7)));
  assert.ok(results.every((result) => result.pairDistances.every((distance) => distance.samples.length === 6 && Number.isFinite(distance.residualRmsKm))));
  const newtonian = results.find(({ mode }) => mode === 'newtonian');
  const relativity = results.find(({ mode }) => mode === 'general-relativity');
  const gaussianRelativity = results.find(({ mode }) => mode === 'gr-normed-tensor-gaussian');
  assert.ok(Math.abs(newtonian.mercuryPerihelionArcsecondsPerCentury) < 0.1);
  assert.ok(Math.abs(relativity.mercuryPerihelionArcsecondsPerCentury - MERCURY_PERIHELION_REFERENCE.valueArcsecondsPerCentury) < 0.1);
  assert.ok(relativity.scorePoints < newtonian.scorePoints);
  assert.ok(gaussianRelativity.mercuryPerihelionArcsecondsPerCentury < relativity.mercuryPerihelionArcsecondsPerCentury);
});