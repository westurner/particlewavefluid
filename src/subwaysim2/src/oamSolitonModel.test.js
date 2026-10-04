import assert from 'node:assert/strict';
import test from 'node:test';
import { applyOamOperator, createOamInputState, getActiveOamModes, getOamOperatorMatrix, getQuantumOperatorMatrix, measureOamState, OAM_MODES, OAM_OPERATOR_OPTIONS, QUDIT_DIMENSIONS, QUANTUM_OPERATOR_SCHEMA, QUANTUM_OPERATOR_SUPPORTED_BY } from './oamSolitonModel.js';

const power = (state) => measureOamState(state).totalIntensity;

test('a balanced beam splitter divides a single occupied rail equally', () => {
  const input = createOamInputState({ amplitudeA: 1, amplitudeB: 0, modeA: 2 });
  const output = applyOamOperator(input, { operator: 'beam-splitter', angleRadians: Math.PI / 4 });
  const measurement = measureOamState(output);
  assert.ok(Math.abs(measurement.railProbabilities[0] - 0.5) < 1e-12);
  assert.ok(Math.abs(measurement.railProbabilities[1] - 0.5) < 1e-12);
});

test('each supported operator preserves total intensity', () => {
  const input = createOamInputState({ amplitudeA: 0.82, amplitudeB: 0.61, phaseA: 0.4, phaseB: -1.2, modeA: 2, modeB: -1 });
  for (const { value: operator } of OAM_OPERATOR_OPTIONS) {
    const output = applyOamOperator(input, { operator, angleRadians: 0.63 });
    assert.ok(Math.abs(power(output) - power(input)) < 1e-12, `${operator} changed total intensity`);
  }
});

test('OAM rotation changes mode phase without changing mode probability', () => {
  const input = createOamInputState({ amplitudeA: 1, amplitudeB: 0, modeA: -2 });
  const output = applyOamOperator(input, { operator: 'oam-rotation', angleRadians: Math.PI / 3 });
  const activeIndex = OAM_MODES.indexOf(-2);
  const value = output[activeIndex][0];
  assert.ok(Math.abs(value.re - Math.cos(-2 * Math.PI / 3)) < 1e-12);
  assert.ok(Math.abs(value.im - Math.sin(-2 * Math.PI / 3)) < 1e-12);
  assert.equal(measureOamState(output).modeProbabilities[activeIndex], 1);
});

test('Pauli Y and Z apply their expected single-rail actions', () => {
  const railA = createOamInputState({ amplitudeA: 1, amplitudeB: 0, modeA: 0, modeB: 0 });
  const railB = createOamInputState({ amplitudeA: 0, amplitudeB: 1, phaseB: 0, modeA: 0, modeB: 0 });
  const index = OAM_MODES.indexOf(0);
  const yOutput = applyOamOperator(railA, { operator: 'pauli-y' })[index];
  const zOutput = applyOamOperator(railB, { operator: 'pauli-z' })[index];
  assert.deepEqual(yOutput, [{ re: 0, im: 0 }, { re: 0, im: 1 }]);
  assert.deepEqual(zOutput, [{ re: 0, im: 0 }, { re: -1, im: 0 }]);
});

test('S and T phase gates apply fixed phases to the second rail', () => {
  const input = createOamInputState({ amplitudeA: 0, amplitudeB: 1, phaseB: 0, modeA: 0, modeB: 0 });
  const index = OAM_MODES.indexOf(0);
  const sOutput = applyOamOperator(input, { operator: 'phase-s' })[index][1];
  const tOutput = applyOamOperator(input, { operator: 'phase-t' })[index][1];
  assert.deepEqual(sOutput, { re: 0, im: 1 });
  assert.ok(Math.abs(tOutput.re - Math.SQRT1_2) < 1e-12);
  assert.ok(Math.abs(tOutput.im - Math.SQRT1_2) < 1e-12);
});

test('qudit dimensions select centered OAM levels', () => {
  assert.deepEqual(QUDIT_DIMENSIONS, [2, 3, 4, 5, 6, 7]);
  assert.deepEqual(getActiveOamModes(2), [-1, 0]);
  assert.deepEqual(getActiveOamModes(5), [-2, -1, 0, 1, 2]);
  assert.deepEqual(getActiveOamModes(7), OAM_MODES);
});

test('every quantum operator has schema attributes and all supported-system metadata', () => {
  for (const operator of OAM_OPERATOR_OPTIONS) {
    for (const attribute of QUANTUM_OPERATOR_SCHEMA.required) assert.ok(attribute in operator, `${operator.value} is missing ${attribute}`);
    assert.deepEqual(operator.supportedBy, QUANTUM_OPERATOR_SUPPORTED_BY);
  }
});

test('Pauli and rotation matrices use standard single-qubit conventions', () => {
  const pauliX = getQuantumOperatorMatrix('pauli-x');
  assert.deepEqual(pauliX, [[{ re: 0, im: 0 }, { re: 1, im: 0 }], [{ re: 1, im: 0 }, { re: 0, im: 0 }]]);
  const rx = getQuantumOperatorMatrix('rotation-x', { angleRadians: Math.PI });
  assert.ok(Math.abs(rx[0][0].re) < 1e-12);
  assert.ok(Math.abs(rx[0][1].im + 1) < 1e-12);
  const ry = getQuantumOperatorMatrix('rotation-y', { angleRadians: Math.PI });
  assert.ok(Math.abs(ry[0][1].re + 1) < 1e-12);
  const rz = getQuantumOperatorMatrix('rotation-z', { angleRadians: Math.PI });
  assert.ok(Math.abs(rz[0][0].im + 1) < 1e-12);
  assert.ok(Math.abs(rz[1][1].im - 1) < 1e-12);
});

test('every operator matrix is unitary at its minimum supported qudit size', () => {
  for (const operator of OAM_OPERATOR_OPTIONS) {
    const matrix = getQuantumOperatorMatrix(operator.value, {
      angleRadians: 0.73,
      quditDimension: Math.max(4, operator.minimumQuditDimension),
      orbitalMode: 2
    });
    for (let firstColumn = 0; firstColumn < matrix.length; firstColumn += 1) {
      for (let secondColumn = 0; secondColumn < matrix.length; secondColumn += 1) {
        let real = 0;
        let imaginary = 0;
        for (let row = 0; row < matrix.length; row += 1) {
          const first = matrix[row][firstColumn];
          const second = matrix[row][secondColumn];
          real += first.re * second.re + first.im * second.im;
          imaginary += first.re * second.im - first.im * second.re;
        }
        const expected = firstColumn === secondColumn ? 1 : 0;
        assert.ok(Math.abs(real - expected) < 1e-12, `${operator.value} matrix is not orthonormal`);
        assert.ok(Math.abs(imaginary) < 1e-12, `${operator.value} matrix has a complex orthogonality error`);
      }
    }
  }
});

test('CNOT, CZ, and Toffoli matrices target their encoded OAM basis states', () => {
  const cnot = getQuantumOperatorMatrix('cnot', { quditDimension: 4 });
  assert.equal(cnot[5][4].re, 1);
  const cz = getQuantumOperatorMatrix('cz', { quditDimension: 4 });
  assert.equal(cz[5][5].re, -1);
  const toffoli = getQuantumOperatorMatrix('toffoli', { quditDimension: 4 });
  assert.equal(toffoli.length, 8);
  assert.equal(toffoli[7][6].re, 1);
  assert.equal(toffoli[6][7].re, 1);
  assert.throws(() => getQuantumOperatorMatrix('toffoli', { quditDimension: 3 }), RangeError);
});

test('controlled OAM SUM shifts the target qudit only when the rail control is active', () => {
  const amplitude = Math.SQRT1_2;
  const input = createOamInputState({ amplitudeA: amplitude, amplitudeB: amplitude, phaseA: 0, phaseB: 0, modeA: 0, modeB: 0 });
  const output = applyOamOperator(input, { operator: 'controlled-oam-sum', quditDimension: 3 });
  const levelZero = OAM_MODES.indexOf(0);
  const levelOne = OAM_MODES.indexOf(1);
  assert.deepEqual(output[levelZero], [{ re: amplitude, im: 0 }, { re: 0, im: 0 }]);
  assert.deepEqual(output[levelOne], [{ re: 0, im: 0 }, { re: amplitude, im: 0 }]);
  assert.ok(Math.abs(measureOamState(output).totalIntensity - 1) < 1e-12);
});

test('controlled OAM phase applies a level-dependent phase only on the active control rail', () => {
  const amplitude = Math.SQRT1_2;
  const input = createOamInputState({ amplitudeA: amplitude, amplitudeB: amplitude, phaseA: 0, phaseB: 0, modeA: -1, modeB: 0 });
  const angleRadians = Math.PI / 2;
  const output = applyOamOperator(input, { operator: 'controlled-oam-phase', angleRadians, quditDimension: 3 });
  const activeRail = output[OAM_MODES.indexOf(0)][1];
  assert.ok(Math.abs(activeRail.re) < 1e-12);
  assert.ok(Math.abs(activeRail.im - amplitude) < 1e-12);
  assert.deepEqual(output[OAM_MODES.indexOf(-1)][0], { re: amplitude, im: 0 });
  assert.ok(Math.abs(measureOamState(output).totalIntensity - 1) < 1e-12);
});

test('relative phase can redirect interference into one output rail', () => {
  const input = createOamInputState({ amplitudeA: 1, amplitudeB: 1, phaseA: 0, phaseB: 0, modeA: 0, modeB: 0 });
  const phaseAdjusted = applyOamOperator(input, { operator: 'phase-shift', angleRadians: Math.PI / 2 });
  const output = applyOamOperator(phaseAdjusted, { operator: 'beam-splitter', angleRadians: Math.PI / 4 });
  const measurement = measureOamState(output);
  assert.ok(measurement.railProbabilities[0] < 1e-12);
  assert.ok(Math.abs(measurement.railProbabilities[1] - 1) < 1e-12);
});

test('unknown operators and malformed states are rejected', () => {
  assert.throws(() => getOamOperatorMatrix('non-unitary'), RangeError);
  assert.throws(() => applyOamOperator([], { operator: 'identity' }), TypeError);
});