import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { cloneState, setAtPath } from './simulation-state.js';

export const DEFAULT_SIMULATOR_CAMERA_CONFIGURATION = Object.freeze({
  replayCameraTrack: 'easing',
  replayCameraEasing: 0.1,
  replayCameraOrbitSpeed: 0.1,
  replayCameraOrbitX: 1,
  replayCameraOrbitY: 0,
  replayCameraOrbitZ: 0,
  cameraOrbitOn: true,
  cameraZoomEnabled: true,
  cameraWheelMode: 'zoom',
  cameraPosX: 3,
  cameraPosY: 5,
  cameraPosZ: 8,
  cameraTargetX: 0,
  cameraTargetY: 0,
  cameraTargetZ: 0,
  cameraZoom: 1,
  cameraFov: 25,
  cameraNear: 0.1,
  cameraFar: 100
});

export const DEFAULT_ORBIT_CAMERA_PARAMS = Object.freeze({
  dampingFactor: 0.08,
  minDistance: 7,
  maxDistance: 34,
  target: Object.freeze([0, 0, 0])
});

export const CAMERA_WHEEL_MODE_OPTIONS = Object.freeze([
  { value: 'zoom', label: 'Zoom' },
  { value: 'dolly', label: 'Move camera' }
]);

export function createOrbitCameraParams(overrides = {}) {
  return {
    ...DEFAULT_ORBIT_CAMERA_PARAMS,
    ...overrides,
    target: [...(overrides.target ?? DEFAULT_ORBIT_CAMERA_PARAMS.target)]
  };
}

export function createCameraViews({ target = [0, 0, 0], distance = 24, frontDistance = distance, frontDirection = 1, ortho1Offset, ortho2Offset } = {}) {
  const scale = distance / 24;
  const positions = {
    front: [0, 0, frontDistance * frontDirection],
    back: [0, 0, -frontDistance * frontDirection],
    left: [-24, 0, 0],
    right: [24, 0, 0],
    ortho1: ortho1Offset ?? [14, 14, 20],
    ortho2: ortho2Offset ?? [-14, 12, -20]
  };
  return [
    ...Object.entries(positions).map(([id, offset]) => {
      const customOffset = id === 'ortho1' ? ortho1Offset : id === 'ortho2' ? ortho2Offset : null;
      return {
        id,
        label: id === 'ortho1' ? 'Ortho 1' : id === 'ortho2' ? 'Ortho 2' : `${id[0].toUpperCase()}${id.slice(1)}`,
        position: offset.map((value, axis) => target[axis] + value * (customOffset || id === 'front' || id === 'back' ? 1 : scale))
      };
    }),
    { id: 'orbital', label: 'Orbital tracking', position: null }
  ];
}

export const DEFAULT_CAMERA_VIEWS = createCameraViews();

export function readPresetLibrary(storage, key, defaults = {}) {
  try {
    const saved = JSON.parse(storage?.getItem(key) || '{}');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return { ...defaults };
    return { ...defaults, ...saved };
  } catch {
    return { ...defaults };
  }
}

export function writePresetLibrary(storage, key, presets) {
  try {
    storage?.setItem(key, JSON.stringify(presets));
    return true;
  } catch {
    return false;
  }
}

export function deletePresetLibrary(storage, key) {
  try {
    storage?.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function parseSimulatorJson(text) {
  const value = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('A simulator preset must be a JSON object.');
  }
  return value;
}

export function serializeParameterEditLog(log) {
  return stringifyYaml(Array.isArray(log) ? log : []);
}

export function appendJournalEntry(journal, { time, path, value, snapshot }) {
  return [...journal, { time, path, value, snapshot }];
}

export function rewindJournal(journal) {
  return journal.length > 1 ? journal.slice(0, -1) : journal;
}

export function snapshotAtJournalTime(journal, time) {
  return [...journal].reverse().find((entry) => entry.time <= time)?.snapshot ?? null;
}

const VISUALIZATION_PATHS = new Set([
  'doubleSided', 'particleCount', 'particleSize', 'particleOpacity', 'particleShape',
  'particleDerivativeOrder', 'orbitControlsVisible', 'sourceVectorsVisible',
  'particleFacing', 'scale', 'showDifference', 'visualizationMode',
  'detectorVisible', 'detectorBrightness', 'detectorPalette', 'detectorMaskEnabled',
  'detectorPixelDensity', 'detectorImplementation', 'showTransformControls',
  'helperVisible', 'helperShowName', 'helperShowAttributes', 'helperNamePlacement',
  'blackHoleStarsVisible', 'blackHoleStarColor', 'blackHoleStarOpacity',
  'blackHoleStreamlines', 'particlePathsVisible', 'particlePathDuration',
  'particlePathColor', 'particlePathOpacity', 'attractorPathsVisible',
  'attractorPathLength', 'attractorPathColor', 'attractorPathOpacity',
  'colorA', 'colorB', 'controlsColorX', 'controlsColorY', 'controlsColorZ'
]);

export function parameterLogCategory(path) {
  const parts = String(path).split(/[.[\]]/);
  const root = parts[0];
  const leaf = parts.at(-1);
  if (/camera|viewMode/i.test(path)) return 'camera';
  if (VISUALIZATION_PATHS.has(root) || VISUALIZATION_PATHS.has(leaf)) return 'visualization';
  return 'simulation';
}

export function buildParameterReplayJournal(initialSnapshot, log, { ignoreVisualization = false, ignoreCamera = false } = {}) {
  let snapshot = cloneState(initialSnapshot);
  const sourceChanges = [...log]
    .filter((entry) => entry?.type === 'parameter-edit' && typeof entry.path === 'string')
    .filter((entry) => !(ignoreVisualization && parameterLogCategory(entry.path) === 'visualization'))
    .filter((entry) => !(ignoreCamera && parameterLogCategory(entry.path) === 'camera'));
  const firstAt = Math.min(...sourceChanges.map((entry) => Date.parse(entry.at)).filter(Number.isFinite));
  const changes = sourceChanges
    .map((entry) => ({
      ...entry,
      offsetMs: entry.offsetMs ?? (Number.isFinite(Date.parse(entry.at)) && Number.isFinite(firstAt) ? Math.max(0, Date.parse(entry.at) - firstAt) : 0),
      replayValue: Object.hasOwn(entry, 'newValue') ? entry.newValue : entry.value
    }))
    .sort((left, right) => (left.offsetMs ?? 0) - (right.offsetMs ?? 0) || (left.sequence ?? 0) - (right.sequence ?? 0));

  const initializedPaths = new Set();
  for (const entry of changes) {
    if (initializedPaths.has(entry.path) || !Object.hasOwn(entry, 'oldValue')) continue;
    snapshot = setAtPath(snapshot, entry.path, entry.oldExists === false ? undefined : entry.oldValue);
    initializedPaths.add(entry.path);
  }
  const journal = [{ time: 0, snapshot: cloneState(snapshot) }];

  for (const entry of changes) {
    snapshot = setAtPath(snapshot, entry.path, entry.newExists === false ? undefined : entry.replayValue);
    const time = Math.max(journal.at(-1).time, Number(entry.offsetMs) || 0);
    journal.push({ time, path: entry.path, value: entry.replayValue, snapshot: cloneState(snapshot) });
  }
  return journal;
}

export function parseParameterEditLogYaml(text) {
  const parsed = parseYaml(text);
  if (!Array.isArray(parsed)) throw new TypeError('The parameter edit log must be a YAML sequence.');
  return parsed;
}