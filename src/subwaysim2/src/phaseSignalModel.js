export const SIGNAL_EVENT_PRESETS = [
  { value: 'clean', label: 'Clean carrier' },
  { value: 'phase-slip', label: 'Single phase slip' },
  { value: 'fracture', label: 'Fracture burst' },
  { value: 'coupled', label: 'Slip and fracture cascade' }
];

function seededNoise(index, seed = 1) {
  const value = Math.sin(index * 12.9898 + seed * 78.233) * 43758.5453;
  return value - Math.floor(value) - 0.5;
}

export function generateIqSignal({ sampleRate = 1000, duration = 2, carrierHz = 37, noise = 0.02, preset = 'coupled', seed = 1 } = {}) {
  const sampleCount = Math.max(2, Math.round(sampleRate * duration));
  const time = new Float64Array(sampleCount);
  const inPhase = new Float64Array(sampleCount);
  const quadrature = new Float64Array(sampleCount);
  const truth = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const t = index / sampleRate;
    let phase = 2 * Math.PI * carrierHz * t + 0.18 * Math.sin(2 * Math.PI * 1.2 * t);
    let amplitude = 1;
    if (preset === 'phase-slip' || preset === 'coupled') {
      const slipTime = duration * 0.48;
      const slipDuration = 2 / sampleRate;
      const slipProgress = Math.max(0, Math.min(1, (t - slipTime) / slipDuration));
      phase += 2 * Math.PI * slipProgress;
      if (slipProgress > 0 && slipProgress < 1) amplitude *= 0.04;
    }
    if (preset === 'fracture' || preset === 'coupled') {
      const center = duration * 0.7;
      const envelope = Math.exp(-((t - center) ** 2) / (2 * (duration * 0.025) ** 2));
      amplitude += envelope * 1.5;
      phase += envelope * Math.sin(2 * Math.PI * 140 * (t - center)) * 0.7;
    }
    time[index] = t;
    inPhase[index] = amplitude * Math.cos(phase) + seededNoise(index, seed) * noise;
    quadrature[index] = amplitude * Math.sin(phase) + seededNoise(index, seed + 9) * noise;
  }
  if (preset === 'phase-slip' || preset === 'coupled') truth.push({ type: 'phase-slip', time: duration * 0.48 });
  if (preset === 'fracture' || preset === 'coupled') truth.push({ type: 'fracture', time: duration * 0.7 });
  return { sampleRate, duration, carrierHz, time, inPhase, quadrature, truth };
}

export function demodulateIq(signal) {
  const count = signal.time.length;
  const amplitude = new Float64Array(count);
  const wrappedPhase = new Float64Array(count);
  const residualPhase = new Float64Array(count);
  for (let index = 0; index < count; index += 1) {
    amplitude[index] = Math.hypot(signal.inPhase[index], signal.quadrature[index]);
    wrappedPhase[index] = Math.atan2(signal.quadrature[index], signal.inPhase[index]);
    const carrierPhase = 2 * Math.PI * signal.carrierHz * signal.time[index];
    residualPhase[index] = Math.atan2(Math.sin(wrappedPhase[index] - carrierPhase), Math.cos(wrappedPhase[index] - carrierPhase));
  }
  return { amplitude, wrappedPhase, residualPhase, unwrappedPhase: unwrapPhase(residualPhase) };
}

export function unwrapPhase(wrappedPhase) {
  const unwrapped = new Float64Array(wrappedPhase.length);
  if (wrappedPhase.length === 0) return unwrapped;
  unwrapped[0] = wrappedPhase[0];
  let offset = 0;
  for (let index = 1; index < wrappedPhase.length; index += 1) {
    const difference = wrappedPhase[index] - wrappedPhase[index - 1];
    if (difference > Math.PI) offset -= 2 * Math.PI;
    if (difference < -Math.PI) offset += 2 * Math.PI;
    unwrapped[index] = wrappedPhase[index] + offset;
  }
  return unwrapped;
}

export function detectSignalEvents(signal, demodulated, { slipThreshold = Math.PI, fractureThreshold = 0.35, refractorySeconds = 0.04 } = {}) {
  const events = [];
  const baselineWindow = Math.max(4, Math.round(signal.sampleRate * 0.08));
  let lastSlip = -Infinity;
  let lastFracture = -Infinity;
  for (let index = baselineWindow; index < signal.time.length; index += 1) {
    const time = signal.time[index];
    const phaseDelta = demodulated.unwrappedPhase[index] - demodulated.unwrappedPhase[index - 1];
    if (Math.abs(phaseDelta) >= slipThreshold && time - lastSlip >= refractorySeconds) {
      events.push({ type: 'phase-slip', time, magnitude: phaseDelta });
      lastSlip = time;
    }
    let baseline = 0;
    for (let sample = index - baselineWindow; sample < index; sample += 1) baseline += demodulated.amplitude[sample];
    baseline /= baselineWindow;
    const amplitudeResidual = Math.abs(demodulated.amplitude[index] - baseline) / Math.max(baseline, 1e-9);
    if (amplitudeResidual >= fractureThreshold && time - lastFracture >= refractorySeconds) {
      events.push({ type: 'fracture', time, magnitude: amplitudeResidual });
      lastFracture = time;
    }
  }
  return events;
}

export function correlateEvents(firstEvents, secondEvents, toleranceSeconds = 0.05) {
  const matches = [];
  firstEvents.forEach((first) => {
    const second = secondEvents.reduce((nearest, candidate) => {
      const distance = Math.abs(candidate.time - first.time);
      return distance < nearest.distance ? { candidate, distance } : nearest;
    }, { candidate: null, distance: Infinity });
    if (second.candidate && second.distance <= toleranceSeconds) matches.push({ first, second: second.candidate, offset: second.candidate.time - first.time });
  });
  return { matches, fraction: firstEvents.length === 0 ? 0 : matches.length / firstEvents.length };
}