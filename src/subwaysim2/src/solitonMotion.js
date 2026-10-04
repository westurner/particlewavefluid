export const SOLITON_GATE_START_X = -0.48;
export const SOLITON_GATE_END_X = 0.48;
export const SOLITON_OUTPUT_END_X = 4.6;
export const SOLITON_PULSE_SPEED = 0.82;
export const SOLITON_PULSE_MARGIN = 0.72;

export function getSolitonTravelLength(startX, endX) {
  const span = Math.max(0, endX - startX);
  const margin = Math.min(SOLITON_PULSE_MARGIN, span * 0.1);
  return Math.max(span - margin * 2, 0.1);
}

export function getSolitonPulseCenter(startX, endX, elapsed, pulseOffset = 0) {
  const margin = Math.min(SOLITON_PULSE_MARGIN, Math.max(0, endX - startX) * 0.1);
  const travelLength = getSolitonTravelLength(startX, endX);
  const distance = elapsed * SOLITON_PULSE_SPEED + pulseOffset;
  const phase = ((distance % travelLength) + travelLength) % travelLength;
  return startX + margin + phase;
}

export function getSolitonGateProgress(x) {
  const progress = Math.max(0, Math.min(1, (x - SOLITON_GATE_START_X) / (SOLITON_GATE_END_X - SOLITON_GATE_START_X)));
  return progress * progress * (3 - 2 * progress);
}

export function getSolitonSurfaceRadius(intensity, phase, amplitudeScale) {
  return Math.max(0.025, 0.13 + intensity * amplitudeScale * (0.055 + 0.025 * Math.cos(phase)));
}