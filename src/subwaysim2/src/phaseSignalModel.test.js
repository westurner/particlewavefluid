import assert from 'node:assert/strict';
import test from 'node:test';
import { correlateEvents, demodulateIq, detectSignalEvents, generateIqSignal, unwrapPhase } from './phaseSignalModel.js';

test('phase unwrapping removes branch-cut jumps', () => {
  const wrapped = Float64Array.from([2.8, 3.05, -3.0, -2.7]);
  const unwrapped = unwrapPhase(wrapped);
  assert.ok(unwrapped[2] > unwrapped[1]);
  assert.ok(Math.abs(unwrapped[2] - unwrapped[1]) < Math.PI);
});

test('clean carrier demodulates to near-unit amplitude', () => {
  const signal = generateIqSignal({ preset: 'clean', noise: 0 });
  const demodulated = demodulateIq(signal);
  const mean = demodulated.amplitude.reduce((sum, value) => sum + value, 0) / demodulated.amplitude.length;
  assert.ok(Math.abs(mean - 1) < 1e-12);
});

test('fracture burst is detected near its injected time', () => {
  const signal = generateIqSignal({ preset: 'fracture', noise: 0.005 });
  const events = detectSignalEvents(signal, demodulateIq(signal));
  assert.ok(events.some((event) => event.type === 'fracture' && Math.abs(event.time - signal.duration * 0.7) < 0.08));
});

test('resolved phase traversal through an amplitude node is detected as a slip', () => {
  const signal = generateIqSignal({ preset: 'phase-slip', noise: 0 });
  const events = detectSignalEvents(signal, demodulateIq(signal), { slipThreshold: 2.4 });
  assert.ok(events.some((event) => event.type === 'phase-slip' && Math.abs(event.time - signal.duration * 0.48) < 0.01));
});

test('event correlation reports matched analogical events', () => {
  const result = correlateEvents([{ type: 'phase-slip', time: 1 }], [{ type: 'vortex-crossing', time: 1.02 }], 0.05);
  assert.equal(result.matches.length, 1);
  assert.equal(result.fraction, 1);
});