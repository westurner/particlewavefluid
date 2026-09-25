import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

export function ParamSelect({ label, value, options, onChange, className = "", ariaLabel = label }) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState({});
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const normalizedOptions = options.map((option) => typeof option === "string" ? { value: option, label: option } : option);
  const selectedOption = normalizedOptions.find((option) => option.value === value) ?? normalizedOptions[0];

  useEffect(() => {
    if (!open) return undefined;
    const updateMenuPosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width, 160), window.innerWidth - 16);
      const maxHeight = Math.min(280, window.innerHeight - 16);
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;
      const requiredHeight = Math.min(maxHeight, normalizedOptions.length * 30 + 8);
      const openAbove = spaceBelow < requiredHeight && spaceAbove > spaceBelow;
      const height = Math.min(maxHeight, Math.max(80, openAbove ? spaceAbove : spaceBelow));
      const top = openAbove ? rect.top - height - 4 : rect.bottom + 4;
      setMenuStyle({
        left: Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8)),
        top: Math.min(Math.max(8, top), Math.max(8, window.innerHeight - height - 8)),
        width,
        maxHeight: height
      });
    };
    const closeOnOutsidePointer = (event) => {
      if (!rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    updateMenuPosition();
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [normalizedOptions.length, open]);

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
    }
  };

  return <div ref={rootRef} className={`param-select ${className}`} onPointerDown={(event) => event.stopPropagation()}>
    {label && <span className="param-select-label">{label}</span>}
    <button ref={triggerRef} type="button" className="param-select-trigger" role="combobox" aria-label={ariaLabel} aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen((current) => !current)} onKeyDown={handleKeyDown}>
      <span>{selectedOption?.label ?? value}</span><span className="param-select-chevron" aria-hidden="true">v</span>
    </button>
    {open && createPortal(<div ref={menuRef} className="param-select-menu" role="listbox" style={menuStyle} aria-label={ariaLabel}>
      {normalizedOptions.map((option) => <button key={option.value} type="button" role="option" aria-selected={option.value === value} data-value={option.value} className="param-select-option" onClick={() => { onChange(option.value); setOpen(false); triggerRef.current?.focus(); }}>{option.label}</button>)}
    </div>, document.body)}
  </div>;
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
