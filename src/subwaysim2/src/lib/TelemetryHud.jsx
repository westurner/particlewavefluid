export function TelemetryHud({ label, items, className = '' }) {
  return <div className={`telemetry-hud ${className}`.trim()} aria-label={label}>
    {items.map((item) => <div key={item.id ?? item.label}>
      <span>{item.label}</span>
      <strong className={item.tone ? `is-${item.tone}` : undefined}>{item.value}</strong>
    </div>)}
  </div>;
}