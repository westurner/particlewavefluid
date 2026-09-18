import { createContext, useContext, useEffect, useRef, useState } from "react";
import { parseNumericValue } from "./simulation-state.js";

function formatNumber(value, step) {
  const precision = step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0;
  return Number(value).toFixed(precision);
}

const ParamEditingContext = createContext(false);

export function ParamEditingProvider({ editing, children }) {
  return <ParamEditingContext.Provider value={editing}>{children}</ParamEditingContext.Provider>;
}

export function ParamEditingToggle({ checked, onChange }) {
  return <label className="param-editing-toggle"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>Allow editing params</span></label>;
}

export function HistoryControls({ canUndo, canRedo, onUndo, onRedo }) {
  return <div className="history-controls" aria-label="Parameter history"><button type="button" onClick={onUndo} disabled={!canUndo} aria-label="Undo parameter change">Undo</button><button type="button" onClick={onRedo} disabled={!canRedo} aria-label="Redo parameter change">Redo</button></div>;
}

export function YamlTextArea({ label, value }) {
  return <label className="param-yaml-textarea"><span>{label}</span><textarea readOnly value={value} aria-label={label} /></label>;
}

export function NumericParamControl({ label, value, min, max, step, onChange, suffix = "", editing = false, isDefault = true, onReset, description, showDescription, className = "" }) {
  const [draft, setDraft] = useState(formatNumber(value, step));
  const scopedEditing = useContext(ParamEditingContext);
  const editingEnabled = editing || scopedEditing;
  const focusValueRef = useRef(value);
  useEffect(() => setDraft(formatNumber(value, step)), [step, value]);
  const commitDraft = () => {
    const parsed = parseNumericValue(draft, { min, max, step });
    if (parsed == null) {
      setDraft(formatNumber(value, step));
      return;
    }
    onChange(parsed);
    setDraft(formatNumber(parsed, step));
  };
  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      setDraft(formatNumber(focusValueRef.current, step));
      event.currentTarget.blur();
    } else if (event.key === "Enter") {
      commitDraft();
      event.currentTarget.blur();
    }
  };
  return <label className={"param-control " + className}><span className="param-control-label"><span>{label}</span><strong>{formatNumber(value, step)}{suffix}</strong>{onReset && !isDefault && <button type="button" className="param-reset" onClick={(event) => { event.preventDefault(); onReset(); }} aria-label={"Reset " + label}>Reset</button>}</span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />{editingEnabled && <input className="param-text-input" type="text" inputMode="decimal" value={draft} onFocus={() => { focusValueRef.current = value; }} onChange={(event) => setDraft(event.target.value)} onBlur={commitDraft} onKeyDown={handleKeyDown} aria-label={label + " value"} />}{showDescription && description && <small className="parameter-description">{description}</small>}</label>;
}

export function ColorParamControl({ label, value, onChange, editing = false, isDefault = true, onReset }) {
  const [draft, setDraft] = useState(value);
  const focusValueRef = useRef(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (/^#[\da-f]{6}$/i.test(draft)) onChange(draft.toLowerCase());
    else setDraft(value);
  };
  return <label className="param-color-control"><span>{label}{onReset && !isDefault && <button type="button" className="param-reset" onClick={(event) => { event.preventDefault(); onReset(); }} aria-label={"Reset " + label}>Reset</button>}</span><div><input type="color" value={value} onChange={(event) => onChange(event.target.value)} /><input className="param-text-input" type={editing ? "text" : "hidden"} value={draft} onFocus={() => { focusValueRef.current = value; }} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === "Escape") { setDraft(focusValueRef.current); event.currentTarget.blur(); } if (event.key === "Enter") { commit(); event.currentTarget.blur(); } }} aria-label={label + " hex"} maxLength={7} spellCheck="false" /></div></label>;
}
