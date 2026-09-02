export const FLOW_PARTICLE_STREAMS = {
  gas: {
    label: 'Nitrogen gas flow',
    color: '#47d9f2',
    pathKey: 'nitrogenPath',
    speed: 0.11
  },
  charge: {
    label: 'Charge flow',
    color: '#ff8c2f',
    pathKey: 'chargePath',
    speed: 0.1375
  }
};

export const INPUT_PARTICLE_STREAMS = {
  DT: {
    label: 'DT',
    color: '#ff704f',
    pathKey: 'DT',
    speed: 0.08,
    channel: 'neutron branch'
  },
  DHe_3: {
    label: 'DHe_3',
    color: '#b58cff',
    pathKey: 'DHe_3',
    speed: 0.1,
    channel: 'charged branch'
  },
  Argon: {
    label: 'Argon',
    color: '#5ed9e8',
    pathKey: 'Argon',
    speed: 0.065,
    channel: 'diagnostic gas'
  }
};

export function createFlowPathPoints({ wallHalfLength, wallRadius, scale = 1 }) {
  const halfLength = wallHalfLength * scale;
  const radius = wallRadius * scale;
  return {
    nitrogenPath: [
      [halfLength * 0.92, 0, radius * 0.82],
      [halfLength + 0.7, 0.54, radius + 0.45],
      [halfLength + 1.45, 1.8, radius + 0.85],
      [halfLength + 2.35, 1.8, radius + 0.85]
    ],
    chargePath: [
      [-halfLength * 0.58, radius + 0.35, 0],
      [-halfLength * 0.18, radius + 1.15, 0],
      [halfLength * 0.46, radius + 1.35, 0],
      [halfLength * 1.18, radius + 1.15, 0]
    ]
  };
}

export function createInputParticlePathPoints({ plasmaHalfLength, plasmaRadius, scale = 1 }) {
  const halfLength = plasmaHalfLength * scale;
  const radius = plasmaRadius * scale;
  const lanes = {
    DT: [0, -radius * 0.34],
    DHe_3: [radius * 0.34, radius * 0.16],
    Argon: [-radius * 0.34, radius * 0.16]
  };
  return Object.fromEntries(Object.entries(lanes).map(([input, [y, z]]) => [input, [
    [-halfLength * 0.9, y * 0.7, z * 0.7],
    [-halfLength * 0.32, y, z],
    [halfLength * 0.34, y * 0.86, z * 0.92],
    [halfLength * 0.9, y * 0.7, z * 0.7]
  ]]));
}

export function getInputParticleVisibility({ activeInput, showCabling = true, showInputParticles = true, showDTInput = true, showDHe3Input = true, showArgonInput = true } = {}) {
  return {
    DT: showCabling && showInputParticles && showDTInput && (!activeInput || activeInput === 'DT'),
    DHe_3: showCabling && showInputParticles && showDHe3Input && (!activeInput || activeInput === 'DHe_3'),
    Argon: showCabling && showInputParticles && showArgonInput && (!activeInput || activeInput === 'Argon')
  };
}

export function advanceFlowProgress(progress, speed, elapsedSeconds) {
  return (progress + speed * elapsedSeconds) % 1;
}

export function getFlowParticleVisibility({ showCabling = true, showGasFlow = true, showChargeFlow = true } = {}) {
  return {
    gas: showCabling && showGasFlow,
    charge: showCabling && showChargeFlow
  };
}