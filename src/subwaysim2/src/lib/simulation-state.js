import { useEffect, useReducer } from 'react';

export function cloneState(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function statesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function createEntry(value, baseline = value) {
  return { value: cloneState(value), baseline: cloneState(baseline) };
}

export function createHistoryState(initialValue, baseline = initialValue) {
  return {
    past: [],
    present: createEntry(initialValue, baseline),
    future: [],
    log: []
  };
}

function resolveNext(currentValue, nextValue) {
  const next = typeof nextValue === 'function' ? nextValue(cloneState(currentValue)) : nextValue;
  return cloneState(next);
}

function appendLog(log, event) {
  if (!event) return log;
  return [...log, { sequence: log.length + 1, at: event.at ?? new Date().toISOString(), ...cloneState(event) }];
}

export function historyReducer(state, action) {
  if (action.type === 'commit') {
    const nextValue = resolveNext(state.present.value, action.next);
    if (statesEqual(nextValue, state.present.value)) return state;
    return {
      past: [...state.past, state.present],
      present: createEntry(nextValue, state.present.baseline),
      future: [],
      log: appendLog(state.log, action.event)
    };
  }
  if (action.type === 'load') {
    const nextValue = resolveNext(state.present.value, action.next);
    const nextBaseline = action.baseline === undefined ? nextValue : resolveNext(state.present.value, action.baseline);
    if (statesEqual(nextValue, state.present.value) && statesEqual(state.present.baseline, nextBaseline)) return state;
    return {
      past: [...state.past, state.present],
      present: createEntry(nextValue, nextBaseline),
      future: [],
      log: appendLog(state.log, action.event)
    };
  }
  if (action.type === 'record') return { ...state, log: appendLog(state.log, action.event) };
  if (action.type === 'replace') {
    const nextValue = resolveNext(state.present.value, action.next);
    return { ...state, present: createEntry(nextValue, state.present.baseline) };
  }
  if (action.type === 'undo' && state.past.length > 0) {
    const previous = state.past.at(-1);
    return {
      past: state.past.slice(0, -1),
      present: previous,
      future: [state.present, ...state.future],
      log: appendLog(state.log, { type: "undo" })
    };
  }
  if (action.type === 'redo' && state.future.length > 0) {
    const next = state.future[0];
    return {
      past: [...state.past, state.present],
      present: next,
      future: state.future.slice(1),
      log: appendLog(state.log, { type: "redo" })
    };
  }
  return state;
}

function pathParts(path) {
  return Array.isArray(path) ? path : String(path).replaceAll('[', '.').replaceAll(']', '').split('.').filter(Boolean);
}

export function getAtPath(value, path) {
  return pathParts(path).reduce((current, part) => current?.[part], value);
}

export function setAtPath(value, path, nextValue) {
  const parts = pathParts(path);
  if (parts.length === 0) return cloneState(nextValue);
  const next = cloneState(value);
  let target = next;
  parts.slice(0, -1).forEach((part) => {
    target[part] = target[part] == null ? {} : target[part];
    target = target[part];
  });
  target[parts.at(-1)] = cloneState(nextValue);
  return next;
}

export function parseNumericValue(rawValue, { min = -Infinity, max = Infinity, step = 0 } = {}) {
  const parsed = typeof rawValue === 'number' ? rawValue : Number(String(rawValue).trim());
  if (!Number.isFinite(parsed)) return null;
  const clamped = Math.min(max, Math.max(min, parsed));
  if (!step) return clamped;
  const origin = Number.isFinite(min) ? min : 0;
  const stepped = origin + Math.round((clamped - origin) / step) * step;
  return Number(stepped.toFixed(10));
}

export function useSimulationEditor(initialValue) {
  const [history, dispatch] = useReducer(historyReducer, initialValue, createHistoryState);
  const value = history.present.value;
  const baseline = history.present.baseline;
  const commit = (next, event) => dispatch({ type: "commit", next, event });
  const load = (next, nextBaseline, event) => dispatch({ type: "load", next, baseline: nextBaseline, event });
  const record = (event) => dispatch({ type: "record", event });
  const resetPath = (path) => commit((current) => setAtPath(current, path, getAtPath(baseline, path)));
  const setPath = (path, next) => commit((current) => setAtPath(current, path, next)); const replace = (next) => dispatch({ type: 'replace', next });
  return {
    value,
    baseline,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    commit,
    load,
    record,
    resetPath,
    setPath, replace,
    undo: () => dispatch({ type: 'undo' }),
    redo: () => dispatch({ type: 'redo' }),
    isDefault: (path) => statesEqual(getAtPath(value, path), getAtPath(baseline, path))
  };
}

export function useUndoRedoShortcuts({ undo, redo, canUndo, canRedo, isTextEditing = () => false }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!(event.ctrlKey || event.metaKey) || isTextEditing(event.target)) return;
      if (event.key.toLowerCase() === 'z' && event.shiftKey) {
        if (!canRedo) return;
        event.preventDefault();
        redo();
        return;
      }
      if (event.key.toLowerCase() === 'z') {
        if (!canUndo) return;
        event.preventDefault();
        undo();
        return;
      }
      if (event.key.toLowerCase() === 'y') {
        if (!canRedo) return;
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canRedo, canUndo, isTextEditing, redo, undo]);
}