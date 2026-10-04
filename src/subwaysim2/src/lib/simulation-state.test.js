import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { changedParameterPaths, changedPathsBetween, createHistoryState, diffParameterValues, getAtPath, historyReducer, parseNumericValue, resetStatePaths, setAtPath, useSimulationEditor } from './simulation-state.js';

test('simulation editor exposes an empty parameter log as valid YAML', () => {
  function LogProbe() {
    const { log } = useSimulationEditor({ value: 1 });
    return createElement('output', { 'data-log': stringifyYaml(log).trim() });
  }

  const markup = renderToStaticMarkup(createElement(LogProbe));
  const yaml = markup.match(/data-log="([^"]*)"/)?.[1];
  assert.equal(yaml, '[]');
  assert.deepEqual(parseYaml(yaml), []);
});

test('simulation editor can log parameter edits for generic simulator controls', () => {
  let state = createHistoryState({ value: 1 });
  state = historyReducer(state, { type: 'commit', next: { value: 2 }, event: { type: 'parameter-edit', offsetMs: 12 }, recordParameterEdits: true });
  assert.equal(state.log[0].type, 'parameter-edit');
  assert.equal(state.log[0].path, 'value');
  assert.equal(state.log[0].oldValue, 1);
  assert.equal(state.log[0].newValue, 2);
  assert.equal(state.log[0].offsetMs, 12);
});

test('parameter edit diffs include nested configuration values and array paths', () => {
  assert.deepEqual(diffParameterValues(
    { detector: { brightness: 1 }, waves: [{ amplitude: 0.5 }] },
    { detector: { brightness: 1.5 }, waves: [{ amplitude: 0.8 }] },
    { offsetMs: 20 }
  ), [
    { type: 'parameter-edit', path: 'detector.brightness', oldValue: 1, newValue: 1.5, value: 1.5, oldExists: true, newExists: true, offsetMs: 20 },
    { type: 'parameter-edit', path: 'waves[0].amplitude', oldValue: 0.5, newValue: 0.8, value: 0.8, oldExists: true, newExists: true, offsetMs: 20 }
  ]);
});

test('preset parameter groups identify changed fields and reset only their paths', () => {
  const preset = { camera: { zoom: 1, fov: 42 }, waves: [{ amplitude: 0.5 }] };
  const current = { camera: { zoom: 2, fov: 55 }, waves: [{ amplitude: 1 }] };
  const cameraPaths = ['camera.zoom', 'camera.fov'];
  assert.deepEqual(changedPathsBetween(current, preset, cameraPaths), cameraPaths);
  assert.deepEqual(resetStatePaths(current, preset, cameraPaths), { camera: { zoom: 1, fov: 42 }, waves: [{ amplitude: 1 }] });
});

test('preset change summary lists only changed leaf paths and groups resized arrays', () => {
  assert.deepEqual(changedParameterPaths(
    { waves: [{ amplitude: 1 }, { amplitude: 0.4 }], cameraZoom: 2, mode: 'a' },
    { waves: [{ amplitude: 0.5 }], cameraZoom: 1, mode: 'a' }
  ), ['waves', 'cameraZoom']);
});

test('undo and redo include old/new values in an enabled parameter log', () => {
  let state = createHistoryState({ amplitude: 0.5 });
  state = historyReducer(state, { type: 'commit', next: { amplitude: 0.8 }, event: { type: 'parameter-edit', offsetMs: 5 }, recordParameterEdits: true });
  state = historyReducer(state, { type: 'undo', recordParameterEdits: true });
  state = historyReducer(state, { type: 'redo', recordParameterEdits: true });
  assert.deepEqual(state.log.filter((entry) => entry.type === 'parameter-edit').map(({ oldValue, newValue }) => [oldValue, newValue]), [[0.5, 0.8], [0.8, 0.5], [0.5, 0.8]]);
});

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
