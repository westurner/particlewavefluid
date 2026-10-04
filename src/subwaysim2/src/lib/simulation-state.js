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
  return { past: [], present: createEntry(initialValue, baseline), future: [], log: [], logStartedAtMs: Date.now() };
}

function resolveNext(currentValue, nextValue) {
  const next = typeof nextValue === 'function' ? nextValue(cloneState(currentValue)) : nextValue;
  return cloneState(next);
}

function appendLog(log, event) {
  if (!event) return log;
  return [...log, { ...cloneState(event), sequence: log.length + 1, at: event.at ?? new Date().toISOString() }];
}

function appendEvents(log, events) {
  const list = events == null ? [] : Array.isArray(events) ? events : [events];
  return list.reduce((nextLog, event) => appendLog(nextLog, event), log);
}

export function diffParameterValues(previous, next, event = {}) {
  const changes = [];
  const visit = (previousValue, nextValue, path) => {
    if (JSON.stringify(previousValue) === JSON.stringify(nextValue)) return;
    const previousIsRecord = previousValue !== null && typeof previousValue === 'object';
    const nextIsRecord = nextValue !== null && typeof nextValue === 'object';
    if (previousIsRecord && nextIsRecord && Array.isArray(previousValue) === Array.isArray(nextValue)) {
      if (Array.isArray(previousValue) && previousValue.length !== nextValue.length) {
        changes.push({ ...event, type: 'parameter-edit', path, oldValue: cloneState(previousValue), newValue: cloneState(nextValue), value: cloneState(nextValue), oldExists: true, newExists: true });
        return;
      }
      const keys = new Set([...Object.keys(previousValue), ...Object.keys(nextValue)]);
      for (const key of keys) {
        const childPath = Array.isArray(nextValue) ? `${path}[${key}]` : path ? `${path}.${key}` : key;
        visit(previousValue[key], nextValue[key], childPath);
      }
      return;
    }
    if (!path) return;
    changes.push({ ...event, type: 'parameter-edit', path, oldValue: previousValue === undefined ? null : cloneState(previousValue), newValue: nextValue === undefined ? null : cloneState(nextValue), value: nextValue === undefined ? null : cloneState(nextValue), oldExists: previousValue !== undefined, newExists: nextValue !== undefined });
  };
  visit(previous, next, '');
  return changes;
}

export function historyReducer(state, action) {
  if (action.type === 'commit') {
    const nextValue = resolveNext(state.present.value, action.next);
    if (statesEqual(nextValue, state.present.value)) return state;
    const events = action.recordParameterEdits && action.event?.type === 'parameter-edit'
      ? diffParameterValues(state.present.value, nextValue, action.event)
      : [action.event];
    return { past: [...state.past, state.present], present: createEntry(nextValue, state.present.baseline), future: [], log: appendEvents(state.log, events), logStartedAtMs: state.logStartedAtMs };
  }
  if (action.type === 'load') {
    const nextValue = resolveNext(state.present.value, action.next);
    const nextBaseline = action.baseline === undefined ? nextValue : resolveNext(state.present.value, action.baseline);
    if (statesEqual(nextValue, state.present.value) && statesEqual(state.present.baseline, nextBaseline)) return state;
    const events = action.recordParameterEdits
      ? [action.event, ...diffParameterValues(state.present.value, nextValue, { offsetMs: action.event?.offsetMs })]
      : action.event;
    return { past: [...state.past, state.present], present: createEntry(nextValue, nextBaseline), future: [], log: appendEvents(state.log, events), logStartedAtMs: state.logStartedAtMs };
  }
  if (action.type === 'record') return { ...state, log: appendLog(state.log, action.event) };
  if (action.type === 'replace') {
    const nextValue = resolveNext(state.present.value, action.next);
    return { ...state, present: createEntry(nextValue, state.present.baseline) };
  }
  if (action.type === 'undo' && state.past.length > 0) {
    const previous = state.past.at(-1);
    const offsetMs = Date.now() - state.logStartedAtMs;
    const events = [{ type: 'undo', offsetMs }, ...(action.recordParameterEdits ? diffParameterValues(state.present.value, previous.value, { offsetMs }) : [])];
    return { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future], log: appendEvents(state.log, events), logStartedAtMs: state.logStartedAtMs };
  }
  if (action.type === 'redo' && state.future.length > 0) {
    const next = state.future[0];
    const offsetMs = Date.now() - state.logStartedAtMs;
    const events = [{ type: 'redo', offsetMs }, ...(action.recordParameterEdits ? diffParameterValues(state.present.value, next.value, { offsetMs }) : [])];
    return { past: [...state.past, state.present], present: next, future: state.future.slice(1), log: appendEvents(state.log, events), logStartedAtMs: state.logStartedAtMs };
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
  if (nextValue === undefined) delete target[parts.at(-1)];
  else target[parts.at(-1)] = cloneState(nextValue);
  return next;
}

export function changedPathsBetween(value, baseline, paths) {
  return paths.filter((path) => !statesEqual(getAtPath(value, path), getAtPath(baseline, path)));
}

export function resetStatePaths(value, baseline, paths) {
  return paths.reduce((next, path) => setAtPath(next, path, getAtPath(baseline, path)), cloneState(value));
}

export function changedParameterPaths(value, baseline) {
  const changed = [];
  const visit = (current, preset, path) => {
    if (statesEqual(current, preset)) return;
    const currentIsRecord = current !== null && typeof current === 'object';
    const presetIsRecord = preset !== null && typeof preset === 'object';
    if (currentIsRecord && presetIsRecord && Array.isArray(current) === Array.isArray(preset)) {
      if (Array.isArray(current) && current.length !== preset.length) {
        changed.push(path);
        return;
      }
      const keys = new Set([...Object.keys(current), ...Object.keys(preset)]);
      for (const key of keys) {
        const childPath = Array.isArray(current) ? `${path}[${key}]` : path ? `${path}.${key}` : key;
        visit(current[key], preset[key], childPath);
      }
      return;
    }
    if (path) changed.push(path);
  };
  visit(value, baseline, '');
  return changed;
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

export function useSimulationEditor(initialValue, { recordParameterEdits = false } = {}) {
  const [history, dispatch] = useReducer(historyReducer, initialValue, createHistoryState);
  const value = history.present.value;
  const baseline = history.present.baseline;
  const getOffsetMs = () => Math.max(0, Date.now() - history.logStartedAtMs);
  const commit = (next, event) => {
    const nextEvent = event ?? (recordParameterEdits ? { type: 'parameter-edit' } : undefined);
    dispatch({ type: 'commit', next, event: nextEvent ? { ...nextEvent, offsetMs: nextEvent.offsetMs ?? getOffsetMs() } : undefined, recordParameterEdits });
  };
  const load = (next, nextBaseline, event) => {
    const nextEvent = event ?? (recordParameterEdits ? { type: 'preset-load' } : undefined);
    dispatch({ type: 'load', next, baseline: nextBaseline, event: nextEvent ? { ...nextEvent, offsetMs: nextEvent.offsetMs ?? getOffsetMs() } : undefined, recordParameterEdits });
  };
  const record = (event) => dispatch({ type: 'record', event: event ? { ...event, offsetMs: event.offsetMs ?? getOffsetMs() } : undefined });
  const resetPath = (path) => commit((current) => setAtPath(current, path, getAtPath(baseline, path)));
  const setPath = (path, next) => commit((current) => setAtPath(current, path, next));
  const replace = (next) => dispatch({ type: 'replace', next });
  return { value, baseline, log: history.log, getOffsetMs, canUndo: history.past.length > 0, canRedo: history.future.length > 0, commit, load, record, resetPath, setPath, replace, undo: () => dispatch({ type: 'undo', recordParameterEdits }), redo: () => dispatch({ type: 'redo', recordParameterEdits }), isDefault: (path) => statesEqual(getAtPath(value, path), getAtPath(baseline, path)) };
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