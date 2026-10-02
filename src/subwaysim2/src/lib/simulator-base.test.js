import test from 'node:test';
import assert from 'node:assert/strict';
import { appendJournalEntry, buildParameterReplayJournal, deletePresetLibrary, parameterLogCategory, parseParameterEditLogYaml, parseSimulatorJson, readPresetLibrary, rewindJournal, serializeParameterEditLog, snapshotAtJournalTime, writePresetLibrary } from './simulator-base.js';

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
}

test('preset storage preserves defaults and round-trips simulator snapshots', () => {
  const storage = createStorage();
  const defaults = { Default: { value: 1 } };
  assert.deepEqual(readPresetLibrary(storage, 'presets', defaults), defaults);
  assert.equal(writePresetLibrary(storage, 'presets', { ...defaults, Saved: { value: 2 } }), true);
  assert.deepEqual(readPresetLibrary(storage, 'presets', defaults), { ...defaults, Saved: { value: 2 } });
  assert.equal(deletePresetLibrary(storage, 'presets'), true);
  assert.deepEqual(readPresetLibrary(storage, 'presets', defaults), defaults);
});

test('preset JSON accepts objects and rejects invalid simulator shapes', () => {
  assert.deepEqual(parseSimulatorJson('{"waves":[]}'), { waves: [] });
  assert.throws(() => parseSimulatorJson(''), SyntaxError);
  assert.throws(() => parseSimulatorJson('[]'), /JSON object/);
  assert.throws(() => parseSimulatorJson('null'), /JSON object/);
});

test('parameter edit log serialization always produces parseable YAML', () => {
  const emptyYaml = serializeParameterEditLog(undefined);
  assert.deepEqual(parseParameterEditLogYaml(emptyYaml), []);
  const log = [{ sequence: 1, type: 'parameter-edit', path: 'waves[0].amplitude', value: 0.8 }];
  assert.deepEqual(parseParameterEditLogYaml(serializeParameterEditLog(log)), log);
});

test('journal helpers append entries and resolve the latest snapshot at a time', () => {
  const initial = [{ time: 0, snapshot: { value: 1 } }];
  const journal = appendJournalEntry(initial, { time: 25, path: 'value', value: 2, snapshot: { value: 2 } });
  assert.deepEqual(rewindJournal(journal), initial);
  assert.equal(rewindJournal(initial), initial);
  assert.equal(snapshotAtJournalTime(journal, 24), initial[0].snapshot);
  assert.equal(snapshotAtJournalTime(journal, 25), journal[1].snapshot);
  assert.equal(snapshotAtJournalTime(journal, -1), null);
});

test('parameter log replay builds a time-ordered complete journal and filters categories', () => {
  const initial = { physics: { strength: 1 }, particleSize: 0.1, cameraPosX: 0 };
  const log = [
    { sequence: 1, type: 'parameter-edit', path: 'physics.strength', oldValue: 1, newValue: 2, offsetMs: 45 },
    { sequence: 2, type: 'parameter-edit', path: 'particleSize', oldValue: 0.1, newValue: 0.2, offsetMs: 20 },
    { sequence: 3, type: 'parameter-edit', path: 'cameraPosX', oldValue: 0, newValue: 5, offsetMs: 30 }
  ];
  const all = buildParameterReplayJournal(initial, log);
  assert.deepEqual(all.map(({ time }) => time), [0, 20, 30, 45]);
  assert.deepEqual(all.at(-1).snapshot, { physics: { strength: 2 }, particleSize: 0.2, cameraPosX: 5 });
  const filtered = buildParameterReplayJournal(initial, log, { ignoreVisualization: true, ignoreCamera: true });
  assert.deepEqual(filtered.map(({ time }) => time), [0, 45]);
  assert.deepEqual(filtered.at(-1).snapshot, { physics: { strength: 2 }, particleSize: 0.1, cameraPosX: 0 });
  assert.equal(parameterLogCategory('detectorBrightness'), 'visualization');
  assert.equal(parameterLogCategory('cameraTargetX'), 'camera');
});

test('parameter replay applies added and removed fields with explicit existence metadata', () => {
  const journal = buildParameterReplayJournal({ a: 1, b: 2 }, [
    { type: 'parameter-edit', path: 'a', oldValue: 1, newValue: null, newExists: false, offsetMs: 5 },
    { type: 'parameter-edit', path: 'c', oldValue: null, newValue: 3, newExists: true, offsetMs: 10 }
  ]);
  assert.deepEqual(journal.at(-1).snapshot, { b: 2, c: 3 });
});

test('parameter replay seeds its initial state from the first old value for each path', () => {
  const journal = buildParameterReplayJournal({ strength: 99 }, [
    { type: 'parameter-edit', path: 'strength', oldValue: 3, newValue: 4, oldExists: true, newExists: true, offsetMs: 8 }
  ]);
  assert.equal(journal[0].snapshot.strength, 3);
  assert.equal(journal.at(-1).snapshot.strength, 4);
});

test('parameter replay accepts older value-only logs and derives offsets from timestamps', () => {
  const journal = buildParameterReplayJournal({ value: 0 }, [
    { type: 'parameter-edit', sequence: 2, path: 'value', value: 3, at: '2026-10-02T00:00:00.025Z' },
    { type: 'parameter-edit', sequence: 1, path: 'value', value: 2, at: '2026-10-02T00:00:00.010Z' }
  ]);
  assert.deepEqual(journal.map(({ time }) => time), [0, 0, 15]);
  assert.equal(journal.at(-1).snapshot.value, 3);
});