export const QUANTUM_FLUID_PRESETS = [
  { value: 'plane-wave', label: 'Plane wave' },
  { value: 'vortex', label: 'Quantized vortex' },
  { value: 'packet', label: 'Dispersive packet' },
  { value: 'collision', label: 'Counter-propagating packets' }
];

function assertPowerOfTwo(size) {
  if (size < 2 || (size & (size - 1)) !== 0) throw new Error('Grid size must be a power of two.');
}

function indexAt(size, x, y) {
  return ((y + size) % size) * size + ((x + size) % size);
}

function wrappedPhaseDifference(difference) {
  return Math.atan2(Math.sin(difference), Math.cos(difference));
}

function finiteClamp(value, minimum, maximum, fallback) {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

function fft1d(real, imaginary, inverse = false) {
  const size = real.length;
  assertPowerOfTwo(size);
  for (let index = 1, reversed = 0; index < size; index += 1) {
    let bit = size >> 1;
    while (reversed & bit) {
      reversed ^= bit;
      bit >>= 1;
    }
    reversed ^= bit;
    if (index < reversed) {
      [real[index], real[reversed]] = [real[reversed], real[index]];
      [imaginary[index], imaginary[reversed]] = [imaginary[reversed], imaginary[index]];
    }
  }
  for (let length = 2; length <= size; length <<= 1) {
    const angle = (inverse ? 2 : -2) * Math.PI / length;
    const stepReal = Math.cos(angle);
    const stepImaginary = Math.sin(angle);
    for (let start = 0; start < size; start += length) {
      let twiddleReal = 1;
      let twiddleImaginary = 0;
      for (let offset = 0; offset < length / 2; offset += 1) {
        const even = start + offset;
        const odd = even + length / 2;
        const oddReal = real[odd] * twiddleReal - imaginary[odd] * twiddleImaginary;
        const oddImaginary = real[odd] * twiddleImaginary + imaginary[odd] * twiddleReal;
        real[odd] = real[even] - oddReal;
        imaginary[odd] = imaginary[even] - oddImaginary;
        real[even] += oddReal;
        imaginary[even] += oddImaginary;
        const nextReal = twiddleReal * stepReal - twiddleImaginary * stepImaginary;
        twiddleImaginary = twiddleReal * stepImaginary + twiddleImaginary * stepReal;
        twiddleReal = nextReal;
      }
    }
  }
  if (inverse) {
    for (let index = 0; index < size; index += 1) {
      real[index] /= size;
      imaginary[index] /= size;
    }
  }
}

function fft2d(real, imaginary, size, inverse = false) {
  const rowReal = new Float64Array(size);
  const rowImaginary = new Float64Array(size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = indexAt(size, x, y);
      rowReal[x] = real[index];
      rowImaginary[x] = imaginary[index];
    }
    fft1d(rowReal, rowImaginary, inverse);
    for (let x = 0; x < size; x += 1) {
      const index = indexAt(size, x, y);
      real[index] = rowReal[x];
      imaginary[index] = rowImaginary[x];
    }
  }
  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y < size; y += 1) {
      const index = indexAt(size, x, y);
      rowReal[y] = real[index];
      rowImaginary[y] = imaginary[index];
    }
    fft1d(rowReal, rowImaginary, inverse);
    for (let y = 0; y < size; y += 1) {
      const index = indexAt(size, x, y);
      real[index] = rowReal[y];
      imaginary[index] = rowImaginary[y];
    }
  }
}

export function createQuantumState({ size = 32, domainSize = 12, preset = 'vortex', interaction = 1 } = {}) {
  assertPowerOfTwo(size);
  const real = new Float64Array(size * size);
  const imaginary = new Float64Array(size * size);
  const spacing = domainSize / size;
  for (let y = 0; y < size; y += 1) {
    const coordinateY = (y - size / 2) * spacing;
    for (let x = 0; x < size; x += 1) {
      const coordinateX = (x - size / 2) * spacing;
      const index = indexAt(size, x, y);
      let amplitude = 1;
      let phase = coordinateX * (2 * Math.PI / domainSize);
      if (preset === 'vortex') {
        const radius = Math.hypot(coordinateX, coordinateY);
        amplitude = Math.tanh(radius / 0.75);
        phase = Math.atan2(coordinateY, coordinateX);
      } else if (preset === 'packet') {
        amplitude = Math.exp(-(coordinateX * coordinateX + coordinateY * coordinateY) / 2.2);
        phase = coordinateX * 1.2;
      } else if (preset === 'collision') {
        const left = Math.exp(-((coordinateX + 2.5) ** 2 + coordinateY ** 2) / 1.4);
        const right = Math.exp(-((coordinateX - 2.5) ** 2 + coordinateY ** 2) / 1.4);
        const leftPhase = coordinateX * 1.5;
        const rightPhase = -coordinateX * 1.5 + Math.PI / 3;
        real[index] = left * Math.cos(leftPhase) + right * Math.cos(rightPhase);
        imaginary[index] = left * Math.sin(leftPhase) + right * Math.sin(rightPhase);
        continue;
      }
      real[index] = amplitude * Math.cos(phase);
      imaginary[index] = amplitude * Math.sin(phase);
    }
  }
  return { size, domainSize, interaction, time: 0, real, imaginary };
}

function applyLocalPhase(state, duration, potentialStrength) {
  const spacing = state.domainSize / state.size;
  for (let y = 0; y < state.size; y += 1) {
    const coordinateY = (y - state.size / 2) * spacing;
    for (let x = 0; x < state.size; x += 1) {
      const coordinateX = (x - state.size / 2) * spacing;
      const index = indexAt(state.size, x, y);
      const density = state.real[index] ** 2 + state.imaginary[index] ** 2;
      const potential = potentialStrength * (coordinateX * coordinateX + coordinateY * coordinateY) / 2;
      const phase = -(state.interaction * density + potential) * duration;
      const cosine = Math.cos(phase);
      const sine = Math.sin(phase);
      const nextReal = state.real[index] * cosine - state.imaginary[index] * sine;
      state.imaginary[index] = state.real[index] * sine + state.imaginary[index] * cosine;
      state.real[index] = nextReal;
    }
  }
}

export function stepGrossPitaevskii(state, deltaTime, { potentialStrength = 0 } = {}) {
  applyLocalPhase(state, deltaTime / 2, potentialStrength);
  fft2d(state.real, state.imaginary, state.size);
  const waveNumberScale = 2 * Math.PI / state.domainSize;
  for (let y = 0; y < state.size; y += 1) {
    const ky = (y <= state.size / 2 ? y : y - state.size) * waveNumberScale;
    for (let x = 0; x < state.size; x += 1) {
      const kx = (x <= state.size / 2 ? x : x - state.size) * waveNumberScale;
      const index = indexAt(state.size, x, y);
      const phase = -(kx * kx + ky * ky) * deltaTime / 2;
      const cosine = Math.cos(phase);
      const sine = Math.sin(phase);
      const nextReal = state.real[index] * cosine - state.imaginary[index] * sine;
      state.imaginary[index] = state.real[index] * sine + state.imaginary[index] * cosine;
      state.real[index] = nextReal;
    }
  }
  fft2d(state.real, state.imaginary, state.size, true);
  applyLocalPhase(state, deltaTime / 2, potentialStrength);
  state.time += deltaTime;
  return state;
}

export function quantumObservables(state, densityFloor = 1e-8) {
  const count = state.size * state.size;
  const density = new Float64Array(count);
  const phase = new Float64Array(count);
  const currentX = new Float64Array(count);
  const currentY = new Float64Array(count);
  const quantumPressure = new Float64Array(count);
  const spacing = state.domainSize / state.size;
  const sqrtDensity = new Float64Array(count);
  for (let index = 0; index < count; index += 1) {
    density[index] = state.real[index] ** 2 + state.imaginary[index] ** 2;
    sqrtDensity[index] = Math.sqrt(density[index]);
    phase[index] = Math.atan2(state.imaginary[index], state.real[index]);
  }
  for (let y = 0; y < state.size; y += 1) {
    for (let x = 0; x < state.size; x += 1) {
      const index = indexAt(state.size, x, y);
      const left = indexAt(state.size, x - 1, y);
      const right = indexAt(state.size, x + 1, y);
      const down = indexAt(state.size, x, y - 1);
      const up = indexAt(state.size, x, y + 1);
      const derivativeRealX = (state.real[right] - state.real[left]) / (2 * spacing);
      const derivativeImaginaryX = (state.imaginary[right] - state.imaginary[left]) / (2 * spacing);
      const derivativeRealY = (state.real[up] - state.real[down]) / (2 * spacing);
      const derivativeImaginaryY = (state.imaginary[up] - state.imaginary[down]) / (2 * spacing);
      currentX[index] = state.real[index] * derivativeImaginaryX - state.imaginary[index] * derivativeRealX;
      currentY[index] = state.real[index] * derivativeImaginaryY - state.imaginary[index] * derivativeRealY;
      const laplacianSqrt = (sqrtDensity[left] + sqrtDensity[right] + sqrtDensity[down] + sqrtDensity[up] - 4 * sqrtDensity[index]) / (spacing * spacing);
      quantumPressure[index] = -0.5 * laplacianSqrt / Math.max(sqrtDensity[index], Math.sqrt(densityFloor));
    }
  }
  return { density, phase, currentX, currentY, quantumPressure };
}

export function quantumDiagnostics(state, initial = null) {
  const observables = quantumObservables(state);
  const spacing = state.domainSize / state.size;
  let norm = 0;
  let energy = 0;
  for (let y = 0; y < state.size; y += 1) {
    for (let x = 0; x < state.size; x += 1) {
      const index = indexAt(state.size, x, y);
      const right = indexAt(state.size, x + 1, y);
      const up = indexAt(state.size, x, y + 1);
      const gradientX = Math.hypot(state.real[right] - state.real[index], state.imaginary[right] - state.imaginary[index]) / spacing;
      const gradientY = Math.hypot(state.real[up] - state.real[index], state.imaginary[up] - state.imaginary[index]) / spacing;
      norm += observables.density[index] * spacing * spacing;
      energy += (0.5 * (gradientX * gradientX + gradientY * gradientY) + 0.5 * state.interaction * observables.density[index] ** 2) * spacing * spacing;
    }
  }
  const vortices = detectVortices(observables.phase, state.size);
  return {
    norm,
    energy,
    normDrift: initial ? (norm - initial.norm) / Math.max(initial.norm, 1e-12) : 0,
    energyDrift: initial ? (energy - initial.energy) / Math.max(Math.abs(initial.energy), 1e-12) : 0,
    vortices,
    observables
  };
}

export function detectVortices(phase, size, threshold = Math.PI) {
  const vortices = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const phases = [
        phase[indexAt(size, x, y)],
        phase[indexAt(size, x + 1, y)],
        phase[indexAt(size, x + 1, y + 1)],
        phase[indexAt(size, x, y + 1)]
      ];
      let winding = 0;
      for (let edge = 0; edge < 4; edge += 1) winding += wrappedPhaseDifference(phases[(edge + 1) % 4] - phases[edge]);
      if (Math.abs(winding) > threshold) vortices.push({ x, y, charge: Math.round(winding / (2 * Math.PI)) });
    }
  }
  return vortices;
}

export function createEulerKortewegState(quantumState) {
  const observables = quantumObservables(quantumState);
  const velocityX = new Float64Array(observables.density.length);
  const velocityY = new Float64Array(observables.density.length);
  for (let index = 0; index < observables.density.length; index += 1) {
    const density = Math.max(observables.density[index], 1e-8);
    velocityX[index] = observables.currentX[index] / density;
    velocityY[index] = observables.currentY[index] / density;
  }
  return {
    size: quantumState.size,
    domainSize: quantumState.domainSize,
    interaction: quantumState.interaction,
    time: quantumState.time,
    density: observables.density.slice(),
    velocityX,
    velocityY
  };
}

export function stepEulerKorteweg(state, deltaTime) {
  const spacing = state.domainSize / state.size;
  const nextDensity = new Float64Array(state.density.length);
  const nextVelocityX = new Float64Array(state.density.length);
  const nextVelocityY = new Float64Array(state.density.length);
  const sqrtDensity = Float64Array.from(state.density, (density) => Math.sqrt(Math.max(density, 1e-8)));
  const quantumPressure = new Float64Array(state.density.length);
  for (let y = 0; y < state.size; y += 1) {
    for (let x = 0; x < state.size; x += 1) {
      const index = indexAt(state.size, x, y);
      const left = indexAt(state.size, x - 1, y);
      const right = indexAt(state.size, x + 1, y);
      const down = indexAt(state.size, x, y - 1);
      const up = indexAt(state.size, x, y + 1);
      const laplacian = (sqrtDensity[left] + sqrtDensity[right] + sqrtDensity[down] + sqrtDensity[up] - 4 * sqrtDensity[index]) / (spacing * spacing);
      quantumPressure[index] = finiteClamp(-0.5 * laplacian / sqrtDensity[index], -40, 40, 0);
    }
  }
  for (let y = 0; y < state.size; y += 1) {
    for (let x = 0; x < state.size; x += 1) {
      const index = indexAt(state.size, x, y);
      const left = indexAt(state.size, x - 1, y);
      const right = indexAt(state.size, x + 1, y);
      const down = indexAt(state.size, x, y - 1);
      const up = indexAt(state.size, x, y + 1);
      const fluxX = (state.density[right] * state.velocityX[right] - state.density[left] * state.velocityX[left]) / (2 * spacing);
      const fluxY = (state.density[up] * state.velocityY[up] - state.density[down] * state.velocityY[down]) / (2 * spacing);
      nextDensity[index] = finiteClamp(state.density[index] - deltaTime * (fluxX + fluxY), 1e-8, 20, state.density[index]);
      const pressureGradientX = (state.interaction * state.density[right] + quantumPressure[right] - state.interaction * state.density[left] - quantumPressure[left]) / (2 * spacing);
      const pressureGradientY = (state.interaction * state.density[up] + quantumPressure[up] - state.interaction * state.density[down] - quantumPressure[down]) / (2 * spacing);
      const derivativeVelocityXX = (state.velocityX[right] - state.velocityX[left]) / (2 * spacing);
      const derivativeVelocityXY = (state.velocityX[up] - state.velocityX[down]) / (2 * spacing);
      const derivativeVelocityYX = (state.velocityY[right] - state.velocityY[left]) / (2 * spacing);
      const derivativeVelocityYY = (state.velocityY[up] - state.velocityY[down]) / (2 * spacing);
      const accelerationX = finiteClamp(
        state.velocityX[index] * derivativeVelocityXX + state.velocityY[index] * derivativeVelocityXY + pressureGradientX
      , -120, 120, 0);
      const accelerationY = finiteClamp(
        state.velocityX[index] * derivativeVelocityYX + state.velocityY[index] * derivativeVelocityYY + pressureGradientY
      , -120, 120, 0);
      nextVelocityX[index] = finiteClamp(state.velocityX[index] - deltaTime * accelerationX, -12, 12, 0);
      nextVelocityY[index] = finiteClamp(state.velocityY[index] - deltaTime * accelerationY, -12, 12, 0);
    }
  }
  state.density = nextDensity;
  state.velocityX = nextVelocityX;
  state.velocityY = nextVelocityY;
  state.time += deltaTime;
  return state;
}

export function compareQuantumHydrodynamicDensity(quantumState, hydrodynamicState) {
  const quantumDensity = quantumObservables(quantumState).density;
  const difference = new Float64Array(quantumDensity.length);
  let squaredError = 0;
  let maximumDifference = 0;
  for (let index = 0; index < difference.length; index += 1) {
    difference[index] = quantumDensity[index] - hydrodynamicState.density[index];
    squaredError += difference[index] ** 2;
    maximumDifference = Math.max(maximumDifference, Math.abs(difference[index]));
  }
  return { difference, rmsDifference: Math.sqrt(squaredError / difference.length), maximumDifference };
}