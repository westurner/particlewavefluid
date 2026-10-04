import { COLOR_PALETTE_OPTIONS } from './color-palettes.js';

export default function PaletteParamControl({ label, value, onChange, className = '' }) {
  return <div className={`palette-param-control ${className}`}>
    <span className="palette-param-label">{label}</span>
    <div className="palette-param-options" role="group" aria-label={label}>
      {COLOR_PALETTE_OPTIONS.map((palette) => <button
        key={palette.value}
        type="button"
        aria-label={`${label}: ${palette.label}`}
        aria-pressed={value === palette.value}
        title={palette.label}
        className={value === palette.value ? 'active' : ''}
        onClick={() => onChange(palette.value)}
      >
        <span className="palette-param-swatch" aria-hidden="true" style={{ background: `linear-gradient(90deg, ${palette.stops.join(', ')})` }} />
        <span>{palette.label}</span>
      </button>)}
    </div>
  </div>;
}