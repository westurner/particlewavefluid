import { Color } from 'three';

export const COLOR_PALETTES = [
  { value: 'thermal', label: 'Thermal', stops: ['#10242d', '#37c4c8', '#f4bf66', '#fff4dc'] },
  { value: 'phosphor', label: 'Phosphor', stops: ['#071b19', '#187b59', '#a6df75', '#f3ffd1'] },
  { value: 'monochrome', label: 'Monochrome', stops: ['#101820', '#63737a', '#c5d3d2', '#ffffff'] },
  { value: 'plasma', label: 'Plasma', stops: ['#15132c', '#285ab5', '#e84e86', '#ffd77b'] },
  { value: 'black-red', label: 'Black & red', stops: ['#030405', '#26050a', '#a10e1c', '#ff3948'] }
];

export const COLOR_PALETTE_OPTIONS = [
  { value: 'native', label: 'Native / encoded', stops: ['#f4bf66', '#66d5d1', '#df7d8d', '#a899ed', '#d7e681', '#7da8ec', '#f28e5d', '#86d3a5'] },
  ...COLOR_PALETTES.map(({ value, label, stops }) => ({ value, label, stops }))
];

const COLOR_STOPS = Object.fromEntries(COLOR_PALETTES.map(({ value, stops }) => [value, stops.map((stop) => new Color(stop))]));

export function sampleColorPalette(palette, amount, target = new Color()) {
  const stops = COLOR_STOPS[palette];
  if (!stops) return target.setHSL((Number(amount) || 0) % 1, 0.82, 0.52);
  const position = Math.max(0, Math.min(1, Number(amount) || 0)) * (stops.length - 1);
  const lower = Math.floor(position);
  return target.copy(stops[lower]).lerp(stops[Math.min(lower + 1, stops.length - 1)], position - lower);
}