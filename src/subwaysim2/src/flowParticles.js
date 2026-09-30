export const FLOW_PARTICLE_STREAMS = {
  gas: {
    label: 'Nitrogen gas flow',
    color: '#47d9f2',
    pathKey: 'nitrogenPath',
    speed: 0.11
  },
  charge: {
    label: 'Charge flow',
    color: '#ff4d43',
    pathKey: 'chargePath',
    speed: 0.1375
  },
  helium: {
    label: 'Helium alpha product',
    color: '#82e0c0',
    pathKey: 'heliumPath',
    speed: 0.12
  },
  neutrons: {
    label: 'Neutron flux',
    color: '#f3ad63',
    pathKey: 'neutronPath',
    speed: 0.095
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

export function toroidalPoint({ angle, majorRadius, minorOffset = 0, verticalOffset = 0, helicalExcursion = 0, fieldPeriods = 1 }) {
  const helicalPhase = fieldPeriods * angle;
  const centerRadius = majorRadius + helicalExcursion * Math.cos(helicalPhase);
  const centerZ = helicalExcursion * Math.sin(helicalPhase);
  const radius = centerRadius + minorOffset;
  return [Math.cos(angle) * radius, Math.sin(angle) * radius, centerZ + verticalOffset];
}

export function createFlowPathPoints({ wallHalfLength, wallRadius, scale = 1, outputSpread = 1.8, geometry = 'frc', fieldPeriods = 1, helicalExcursion = 0 }) {
  const halfLength = wallHalfLength * scale;
  const radius = wallRadius * scale;
  if (geometry !== 'frc') {
    const point = (angle, minorOffset, verticalOffset = 0) => toroidalPoint({
      angle,
      majorRadius: halfLength,
      minorOffset: minorOffset * scale,
      verticalOffset: verticalOffset * scale,
      helicalExcursion: helicalExcursion * scale,
      fieldPeriods
    });
    const outputPath = (verticalOffset) => [
      point(-0.22, wallRadius * 0.72, verticalOffset * 0.15),
      point(0.05, wallRadius + 0.28, verticalOffset * 0.35),
      point(0.36, wallRadius + 0.95, verticalOffset * 0.7),
      point(0.72, wallRadius + 1.7, verticalOffset)
    ];
    return {
      nitrogenPath: outputPath(Number(outputSpread)),
      chargePath: [-1.2, -0.72, -0.24, 0.24, 0.72].map((angle, index) => (
        point(angle, wallRadius + 0.55, (index - 2) * 0.12)
      )),
      heliumPath: outputPath(0),
      neutronPath: outputPath(-Number(outputSpread))
    };
  }
  const outputPath = (outputY) => [
    [halfLength * 0.92, 0, radius * 0.82],
    [halfLength + 0.7, outputY * 0.3, radius + 0.45],
    [halfLength + 1.45, outputY, radius + 0.85],
    [halfLength + 2.35, outputY, radius + 0.85]
  ];
  return {
    nitrogenPath: outputPath(Number(outputSpread)),
    chargePath: [
      [-halfLength * 0.58, radius + 0.35, 0],
      [-halfLength * 0.18, radius + 1.15, 0],
      [halfLength * 0.46, radius + 1.35, 0],
      [halfLength * 1.18, radius + 1.15, 0]
    ],
    heliumPath: outputPath(0),
    neutronPath: outputPath(-Number(outputSpread))
  };
}

export function createInputParticlePathPoints({ plasmaHalfLength, plasmaRadius, scale = 1, geometry = 'frc', fieldPeriods = 1, helicalExcursion = 0 }) {
  const halfLength = plasmaHalfLength * scale;
  const radius = plasmaRadius * scale;
  if (geometry !== 'frc') {
    const lanes = {
      DT: [-0.14 * plasmaRadius, -0.32 * plasmaRadius],
      DHe_3: [0.18 * plasmaRadius, 0.24 * plasmaRadius],
      Argon: [-0.2 * plasmaRadius, 0.22 * plasmaRadius]
    };
    return Object.fromEntries(Object.entries(lanes).map(([input, [radialLane, verticalLane]]) => [input,
      [2.2, 1.7, 1.1, 0.5].map((angle, index) => toroidalPoint({
        angle,
        majorRadius: halfLength,
        minorOffset: ([plasmaRadius + 1.25, plasmaRadius * 0.86, plasmaRadius * 0.55, plasmaRadius * 0.3][index] + radialLane) * scale,
        verticalOffset: verticalLane * scale,
        helicalExcursion: helicalExcursion * scale,
        fieldPeriods
      }))
    ]));
  }
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

export function getFlowParticleVisibility({ showCabling = true, showGasFlow = true, showChargeFlow = true, showOutputManifold = true, showHeliumOutput = true, showNeutronOutput = true } = {}) {
  return {
    gas: showCabling && showGasFlow,
    charge: showCabling && showChargeFlow,
    helium: showCabling && showOutputManifold && showHeliumOutput,
    neutrons: showCabling && showOutputManifold && showNeutronOutput
  };
}