import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { changedPathsBetween, getAtPath, parseNumericValue, resetStatePaths, setAtPath } from "./simulation-state.js";

function formatNumber(value, step) {
  const precision = step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0;
  return Number(value).toFixed(precision);
}

const ParamEditingContext = createContext(false);
const PresetParametersContext = createContext(null);

export function PresetParametersProvider({ value, preset, onChange, children }) {
  const resetPaths = (paths) => onChange(resetStatePaths(value, preset, paths), paths);
  const setValue = (path, nextValue) => onChange(setAtPath(value, path, nextValue), path);
  const context = {
    value,
    preset,
    isDefault: (path) => JSON.stringify(getAtPath(value, path)) === JSON.stringify(getAtPath(preset, path)),
    resetPath: (path) => resetPaths([path]),
    resetPaths,
    setValue,
    changedPaths: (paths) => changedPathsBetween(value, preset, paths)
  };
  return <PresetParametersContext.Provider value={context}>{children}</PresetParametersContext.Provider>;
}

export function ParameterGroup({ title, paths = [], children, className = 'parameter-group', open, defaultOpen, onResetGroup }) {
  const preset = useContext(PresetParametersContext);
  const changedPaths = preset?.changedPaths(paths) ?? [];
  const resetGroup = () => {
    if (onResetGroup) onResetGroup(changedPaths);
    else preset?.resetPaths(changedPaths);
  };
  return <details className={`${className}${changedPaths.length ? ' has-preset-changes' : ''}`} open={open} defaultOpen={defaultOpen}>
    <summary><span>{title}</span>{changedPaths.length > 0 && <span className="parameter-group-changes"><span>{changedPaths.length} changed</span><button type="button" aria-label={`Reset ${title} to current preset`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); resetGroup(); }}>Reset group</button></span>}</summary>
    {children}
  </details>;
}

export function SimulatorParameterControls({ title, configuration, fields, onChange, className = 'parameter-group', open, defaultOpen }) {
  const paths = fields.map(({ path }) => path);
  const update = (path, nextValue) => onChange(setAtPath(configuration, path, nextValue), path);
  return <ParameterGroup title={title} paths={paths} className={className} open={open} defaultOpen={defaultOpen}>
    {fields.map((descriptor) => {
      const { key: descriptorKey, ...field } = descriptor;
      const componentKey = field.path ?? descriptorKey;
      const value = getAtPath(configuration, field.path) ?? field.defaultValue ?? (field.type === 'toggle' ? field.checked : field.value);
      if (field.type === 'select') return <ParamSelect key={componentKey} {...field} value={value} disabled={field.disabled} onChange={(nextValue) => update(field.path, nextValue)} />;
      if (field.type === 'color') return <ColorParamControl key={componentKey} {...field} value={value} onChange={(nextValue) => update(field.path, nextValue)} />;
      if (field.type === 'toggle') return <BooleanParamControl key={componentKey} {...field} checked={Boolean(value)} onChange={(nextValue) => update(field.path, nextValue)} />;
      return <NumericParamControl key={componentKey} {...field} value={value} disabled={field.disabled} onChange={(nextValue) => update(field.path, nextValue)} />;
    })}
  </ParameterGroup>;
}

export function usePresetParameter(path, suppliedIsDefault = true, onReset) {
  const preset = useContext(PresetParametersContext);
  const isDefault = path ? (preset?.isDefault(path) ?? suppliedIsDefault) : suppliedIsDefault;
  const reset = onReset ?? (path ? () => preset?.resetPath(path) : undefined);
  return { isDefault, reset };
}

function PresetFieldStatus({ path, label, isDefault, onReset }) {
  if (!path || isDefault) return null;
  return <span className="parameter-changed-field"><span>Changed</span><button type="button" className="param-reset" aria-label={`Reset ${label} to current preset`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onReset?.(); }}>Reset</button></span>;
}

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

export function ParamSelect({ label, value, options, onChange, className = "", ariaLabel = label, path, isDefault: suppliedIsDefault = true, onReset, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState({});
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const normalizedOptions = options.map((option) => typeof option === "string" ? { value: option, label: option } : option);
  const selectedOption = normalizedOptions.find((option) => option.value === value) ?? normalizedOptions[0];
  const preset = useContext(PresetParametersContext);
  const { isDefault, reset: resetField } = usePresetParameter(path, suppliedIsDefault, onReset);

  useLayoutEffect(() => {
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

  return <div ref={rootRef} className={`param-select${path && !isDefault ? ' has-preset-change' : ''} ${className}`} onPointerDown={(event) => event.stopPropagation()}>
    {label && <span className="param-select-label">{label}</span>}
    <button ref={triggerRef} type="button" disabled={disabled} className="param-select-trigger" role="combobox" aria-label={ariaLabel} aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen((current) => !current)} onKeyDown={handleKeyDown}>
      <span>{selectedOption?.label ?? value}</span><span className="param-select-chevron" aria-hidden="true">v</span>
    </button>
    {path && !isDefault && <PresetFieldStatus path={path} label={label ?? ariaLabel} isDefault={isDefault} onReset={resetField} />}
    {open && createPortal(<div ref={menuRef} className="param-select-menu" role="listbox" style={menuStyle} aria-label={ariaLabel}>
      {normalizedOptions.map((option) => <button key={option.value} type="button" role="option" aria-selected={option.value === value} data-value={option.value} className="param-select-option" onClick={() => { if (path && preset?.setValue) preset.setValue(path, option.value); else onChange(option.value); setOpen(false); triggerRef.current?.focus(); }}>{option.label}</button>)}
    </div>, document.body)}
  </div>;
}

export function NumericParamControl({ label, value, min, max, step, onChange, suffix = "", editing = false, isDefault: suppliedIsDefault = true, onReset, path, description, showDescription, className = "", disabled = false }) {
  const [draft, setDraft] = useState(formatNumber(value, step));
  const rangeId = useId();
  const scopedEditing = useContext(ParamEditingContext);
  const preset = useContext(PresetParametersContext);
  const { isDefault, reset: resetField } = usePresetParameter(path, suppliedIsDefault, onReset);
  const editingEnabled = editing || scopedEditing;
  const focusValueRef = useRef(value);
  useEffect(() => setDraft(formatNumber(value, step)), [step, value]);
  const commitDraft = () => {
    const parsed = parseNumericValue(draft, { min, max, step });
    if (parsed == null) {
      setDraft(formatNumber(value, step));
      return;
    }
    if (path && preset?.setValue) preset.setValue(path, parsed);
    else onChange(parsed);
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
  return <div className={`param-control${path && !isDefault ? ' has-preset-change' : ''} ${className}`}><span className="param-control-label"><span><label htmlFor={rangeId}>{label}</label></span><strong>{formatNumber(value, step)}{suffix}</strong><PresetFieldStatus path={path} label={label} isDefault={isDefault} onReset={resetField} /></span><input id={rangeId} aria-label={label} type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(event) => { if (path && preset?.setValue) preset.setValue(path, Number(event.target.value)); else onChange(Number(event.target.value)); }} />{editingEnabled && <input className="param-text-input" type="text" inputMode="decimal" value={draft} disabled={disabled} onFocus={() => { focusValueRef.current = value; }} onChange={(event) => setDraft(event.target.value)} onBlur={commitDraft} onKeyDown={handleKeyDown} aria-label={label + " value"} />}{showDescription && description && <small className="parameter-description">{description}</small>}</div>;
}

export function ColorParamControl({ label, value, onChange, editing = false, isDefault: suppliedIsDefault = true, onReset, path }) {
  const [draft, setDraft] = useState(value);
  const colorId = useId();
  const preset = useContext(PresetParametersContext);
  const { isDefault, reset: resetField } = usePresetParameter(path, suppliedIsDefault, onReset);
  const focusValueRef = useRef(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (/^#[\da-f]{6}$/i.test(draft)) {
      if (path && preset?.setValue) preset.setValue(path, draft.toLowerCase());
      else onChange(draft.toLowerCase());
    }
    else setDraft(value);
  };
  return <div className={`param-color-control${path && !isDefault ? ' has-preset-change' : ''}`}><span><label htmlFor={colorId}>{label}</label><PresetFieldStatus path={path} label={label} isDefault={isDefault} onReset={resetField} /></span><div><input id={colorId} type="color" aria-label={label} value={value} onChange={(event) => { if (path && preset?.setValue) preset.setValue(path, event.target.value); else onChange(event.target.value); }} /><input className="param-text-input" type={editing ? "text" : "hidden"} value={draft} onFocus={() => { focusValueRef.current = value; }} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === "Escape") { setDraft(focusValueRef.current); event.currentTarget.blur(); } if (event.key === "Enter") { commit(); event.currentTarget.blur(); } }} aria-label={label + " hex"} maxLength={7} spellCheck="false" /></div></div>;
}

export function BooleanParamControl({ label, checked, onChange, path, className = 'parameter-toggle', onReset }) {
  const preset = useContext(PresetParametersContext);
  const { isDefault, reset: resetField } = usePresetParameter(path, true, onReset);
  return <div className={`parameter-toggle-control${path && !isDefault ? ' has-preset-change' : ''}`}><label className={className}><input type="checkbox" aria-label={label} checked={checked} onChange={(event) => { if (path && preset?.setValue) preset.setValue(path, event.target.checked); else onChange(event.target.checked); }} /><span>{label}</span></label><PresetFieldStatus path={path} label={label} isDefault={isDefault} onReset={resetField} /></div>;
}
