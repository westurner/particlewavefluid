import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AniseWasmAdapter,
  createAniseEphemerisAdapter,
  DEFAULT_ANISE_EPHEMERIS_ADAPTER,
  resolveAniseFrame
} from './aniseEphemerisAdapter.js';

function multiply(left, right) {
  return left.map((row) => right[0].map((_, column) => row.reduce((sum, value, index) => sum + value * right[index][column], 0)));
}

test('local ANISE-compatible state queries return frame-tagged AU and AU/day barycentric differences', () => {
  const epoch = new Date('2026-10-06T12:00:00Z');
  const earth = DEFAULT_ANISE_EPHEMERIS_ADAPTER.stateOf('399', 'Sun', epoch);
  assert.equal(earth.targetFrame, '399');
  assert.equal(earth.observerFrame, 'Sun');
  assert.equal(earth.orientationFrame, 'J2000_EQJ');
  assert.deepEqual(earth.units, { position: 'AU', velocity: 'AU/day' });
  assert.ok([...earth.positionAU, ...earth.velocityAUPerDay].every(Number.isFinite));
  const sameFrame = DEFAULT_ANISE_EPHEMERIS_ADAPTER.stateOf('Earth', 'Earth', epoch);
  assert.deepEqual(sameFrame.positionAU, [0, 0, 0]);
  assert.deepEqual(sameFrame.velocityAUPerDay, [0, 0, 0]);
});

test('local frame rotations are orthonormal, reversible, and carry epoch-tagged body orientation', () => {
  const epoch = new Date('2026-10-06T12:00:00Z');
  const forward = DEFAULT_ANISE_EPHEMERIS_ADAPTER.rotate('IAU_EARTH', 'J2000_EQJ', epoch);
  const backward = DEFAULT_ANISE_EPHEMERIS_ADAPTER.rotate('J2000_EQJ', 'IAU_EARTH', epoch);
  const identity = multiply(backward.matrix, forward.matrix);
  assert.equal(forward.epoch, epoch.toISOString());
  assert.equal(forward.fromFrame, 'IAU_EARTH');
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      assert.ok(Math.abs(identity[row][column] - (row === column ? 1 : 0)) < 1e-12);
    }
  }
});

test('local orientation rate agrees with Earth sidereal spin and resolves ANISE NAIF frames', () => {
  const omega = DEFAULT_ANISE_EPHEMERIS_ADAPTER.angularVelocityRadPerSecond('399', 'J2000_EQJ', new Date('2026-10-06T12:00:00Z'));
  const expected = 2 * Math.PI / (23.9345 * 3600);
  assert.ok(Math.abs(Math.hypot(...omega) - expected) / expected < 1e-4);
  assert.equal(resolveAniseFrame('3').body, 'EMB');
  assert.equal(resolveAniseFrame('10').body, 'Sun');
  assert.throws(() => resolveAniseFrame('unsupported'), /Unsupported local ANISE-compatible frame/);
});

test('adapter factory delegates the stable contract to a future ANISE WASM bridge', () => {
  const calls = [];
  const bridge = {
    stateOf: (...args) => { calls.push(['stateOf', ...args]); return { positionAU: [1, 2, 3] }; },
    rotate: (...args) => { calls.push(['rotate', ...args]); return { matrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] }; },
    orientationOf: (...args) => { calls.push(['orientationOf', ...args]); return { poleJ2000: [0, 0, 1], primeMeridianDeg: 0 }; },
    angularVelocityRadPerSecond: (...args) => { calls.push(['angularVelocityRadPerSecond', ...args]); return [0, 0, 1]; }
  };
  const adapter = createAniseEphemerisAdapter({ backend: 'anise-wasm', wasmBridge: bridge });
  assert.ok(adapter instanceof AniseWasmAdapter);
  assert.equal(adapter.backend, 'anise-wasm');
  assert.deepEqual(adapter.stateOf('Earth', 'Sun', 'epoch'), { positionAU: [1, 2, 3] });
  assert.deepEqual(adapter.rotate('IAU_EARTH', 'J2000_EQJ', 'epoch').matrix[0], [1, 0, 0]);
  assert.deepEqual(adapter.orientationOf('IAU_EARTH', 'epoch').poleJ2000, [0, 0, 1]);
  assert.deepEqual(adapter.angularVelocityRadPerSecond('IAU_EARTH', 'J2000_EQJ', 'epoch'), [0, 0, 1]);
  assert.equal(calls.length, 4);
  assert.throws(() => createAniseEphemerisAdapter({ backend: 'anise-wasm' }), /must implement stateOf/);
});
