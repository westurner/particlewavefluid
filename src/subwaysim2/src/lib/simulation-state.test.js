import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistoryState, getAtPath, historyReducer, parseNumericValue, setAtPath } from './simulation-state.js';

test('history commits, undoes, redoes, and drops the redo branch', () => {
  let state = createHistoryState({ value: 1 });
  state = historyReducer(state, { type: 'commit', next: { value: 2 } });
  state = historyReducer(state, { type: 'undo' });
  assert.deepEqual(state.present.value, { value: 1 });
  state = historyReducer(state, { type: 'redo' });
  assert.deepEqual(state.present.value, { value: 2 });
  state = historyReducer(state, { type: 'undo' });
  state = historyReducer(state, { type: 'commit', next: { value: 3 } });
  assert.equal(state.future.length, 0);
  assert.deepEqual(state.present.value, { value: 3 });
});

test('history ignores no-op commits and restores the baseline with nested paths', () => {
  let state = createHistoryState({ attractors: [{ position: [1, 2, 3] }] });
  state = historyReducer(state, { type: 'commit', next: { attractors: [{ position: [1, 2, 3] }] } });
  assert.equal(state.past.length, 0);
  assert.deepEqual(getAtPath(state.present.value, 'attractors[0].position[1]'), 2);
  assert.deepEqual(setAtPath(state.present.value, 'attractors[0].position[1]', 8), { attractors: [{ position: [1, 8, 3] }] });
});

test('loading a preset replaces the reset baseline and remains undoable', () => {
  let state = createHistoryState({ value: 1 });
  state = historyReducer(state, { type: 'load', next: { value: 10 } });
  state = historyReducer(state, { type: 'commit', next: { value: 11 } });
  assert.deepEqual(state.present.baseline, { value: 10 });
  state = historyReducer(state, { type: 'undo' });
  assert.deepEqual(state.present.value, { value: 10 });
  assert.deepEqual(state.present.baseline, { value: 10 });
  state = historyReducer(state, { type: 'undo' });
  assert.deepEqual(state.present.value, { value: 1 });
  assert.deepEqual(state.present.baseline, { value: 1 });
});

test('functional preset loads resolve the new baseline from the resulting snapshot', () => {
  let state = createHistoryState({ value: 1 });
  state = historyReducer(state, { type: 'load', next: (current) => ({ ...current, value: 10 }) });
  assert.deepEqual(state.present.value, { value: 10 });
  assert.deepEqual(state.present.baseline, { value: 10 });
});

test('numeric editing clamps and rounds to the declared step', () => {
  assert.equal(parseNumericValue('1.26', { min: 0, max: 2, step: 0.1 }), 1.3);
  assert.equal(parseNumericValue('-4', { min: 0, max: 2, step: 0.1 }), 0);
  assert.equal(parseNumericValue('nope', { min: 0, max: 2, step: 0.1 }), null);
});


test("history records parameter, preset, undo, and redo events in order", () => {
  let state = createHistoryState({ value: 1 });
  state = historyReducer(state, { type: "commit", next: { value: 2 }, event: { type: "parameter-edit", path: "value", value: 2 } });
  state = historyReducer(state, { type: "load", next: { value: 10 }, event: { type: "preset-load", name: "Orbit" } });
  state = historyReducer(state, { type: "record", event: { type: "preset-save", name: "Snapshot" } });
  state = historyReducer(state, { type: "undo" });
  state = historyReducer(state, { type: "redo" });
  assert.deepEqual(state.log.map(({ type, path, name }) => ({ type, path, name })), [
    { type: "parameter-edit", path: "value", name: undefined },
    { type: "preset-load", path: undefined, name: "Orbit" },
    { type: "preset-save", path: undefined, name: "Snapshot" },
    { type: "undo", path: undefined, name: undefined },
    { type: "redo", path: undefined, name: undefined }
  ]);
});
