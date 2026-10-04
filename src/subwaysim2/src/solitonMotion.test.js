import test from 'node:test';
import assert from 'node:assert/strict';
import { getSolitonGateProgress, getSolitonPulseCenter, getSolitonPulseCenters, getSolitonPulseEnvelope, getSolitonSurfaceRadius, getSolitonTravelLength, SOLITON_PULSE_SPEED, SOLITON_REPEAT_COUNT } from './solitonMotion.js';

test('3D pulse motion traverses the whole field before its boundary wrap', () => {
  const startX = -4.6;
  const endX = 4.6;
  const travelLength = getSolitonTravelLength(startX, endX);
  const initial = getSolitonPulseCenter(startX, endX, 0);
  const middle = getSolitonPulseCenter(startX, endX, travelLength / SOLITON_PULSE_SPEED / 2);
  const beforeWrap = getSolitonPulseCenter(startX, endX, (travelLength - 0.01) / SOLITON_PULSE_SPEED);
  const afterWrap = getSolitonPulseCenter(startX, endX, travelLength / SOLITON_PULSE_SPEED);

  assert.ok(initial > startX);
  assert.ok(middle > initial && middle < endX);
  assert.ok(beforeWrap > middle && beforeWrap < endX);
  assert.ok(afterWrap < initial + 0.02);
});

test('OAM state transitions smoothly across the operator region', () => {
  assert.equal(getSolitonGateProgress(-1), 0);
  assert.equal(getSolitonGateProgress(-0.48), 0);
  assert.equal(getSolitonGateProgress(0.48), 1);
  assert.equal(getSolitonGateProgress(1), 1);
  assert.equal(getSolitonGateProgress(0), 0.5);
});

test('beam and splatter samples share one amplitude-scaled surface displacement', () => {
  const intensity = 0.6;
  const phase = Math.PI / 3;
  const amplitudeScale = 1.2;
  const beamRadius = getSolitonSurfaceRadius(intensity, phase, amplitudeScale);
  const splatterRadius = getSolitonSurfaceRadius(intensity, phase, amplitudeScale);
  assert.equal(beamRadius, splatterRadius);
  assert.ok(beamRadius > getSolitonSurfaceRadius(intensity, phase, 0.4));
});

test('continuous splatter mode spreads four synchronized pulses across the field', () => {
  const startX = -4.6;
  const endX = 4.6;
  const single = getSolitonPulseCenters(startX, endX, 0, 0, false);
  const repeated = getSolitonPulseCenters(startX, endX, 0, 0, true);

  assert.equal(single.length, 1);
  assert.equal(repeated.length, SOLITON_REPEAT_COUNT);
  assert.ok(repeated.every((center) => center > startX && center < endX));
  assert.ok(repeated[0] < repeated[1] && repeated[1] < repeated[2] && repeated[2] < repeated[3]);
  assert.equal(getSolitonPulseEnvelope(repeated[1], repeated), 1);
});