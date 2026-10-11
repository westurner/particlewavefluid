const ZERO = { real: 0, imaginary: 0 };
const IMAGINARY_UNIT = { real: 0, imaginary: 1 };

export const DEFAULT_TWISTOR_PARAMETERS = {
  scale: 1,
  polar: 1.05,
  azimuth: 0.7,
  phase: 0.25,
  time: 0.8,
  x: 0.5,
  y: -0.35,
  z: 0.4
};

function addComplex(left, right) {
  return { real: left.real + right.real, imaginary: left.imaginary + right.imaginary };
}

function multiplyComplex(left, right) {
  return {
    real: left.real * right.real - left.imaginary * right.imaginary,
    imaginary: left.real * right.imaginary + left.imaginary * right.real
  };
}

function conjugate(value) {
  return { real: value.real, imaginary: -value.imaginary };
}

function divideComplex(numerator, denominator) {
  const denominatorMagnitudeSquared = denominator.real ** 2 + denominator.imaginary ** 2;
  if (denominatorMagnitudeSquared < 1e-20) return { ...ZERO };
  return {
    real: (numerator.real * denominator.real + numerator.imaginary * denominator.imaginary) / denominatorMagnitudeSquared,
    imaginary: (numerator.imaginary * denominator.real - numerator.real * denominator.imaginary) / denominatorMagnitudeSquared
  };
}

function multiplyByI(value) {
  return multiplyComplex(IMAGINARY_UNIT, value);
}

export function buildTwistorState(parameters = {}) {
  const values = { ...DEFAULT_TWISTOR_PARAMETERS, ...parameters };
  const scale = Number.isFinite(Number(values.scale)) ? Number(values.scale) : DEFAULT_TWISTOR_PARAMETERS.scale;
  const polar = Number.isFinite(Number(values.polar)) ? Number(values.polar) : DEFAULT_TWISTOR_PARAMETERS.polar;
  const azimuth = Number.isFinite(Number(values.azimuth)) ? Number(values.azimuth) : DEFAULT_TWISTOR_PARAMETERS.azimuth;
  const phase = Number.isFinite(Number(values.phase)) ? Number(values.phase) : DEFAULT_TWISTOR_PARAMETERS.phase;
  const time = Number.isFinite(Number(values.time)) ? Number(values.time) : DEFAULT_TWISTOR_PARAMETERS.time;
  const x = Number.isFinite(Number(values.x)) ? Number(values.x) : DEFAULT_TWISTOR_PARAMETERS.x;
  const y = Number.isFinite(Number(values.y)) ? Number(values.y) : DEFAULT_TWISTOR_PARAMETERS.y;
  const z = Number.isFinite(Number(values.z)) ? Number(values.z) : DEFAULT_TWISTOR_PARAMETERS.z;
  const lambda = [
    { real: scale * Math.cos(polar / 2) * Math.cos(phase), imaginary: scale * Math.cos(polar / 2) * Math.sin(phase) },
    { real: scale * Math.sin(polar / 2) * Math.cos(phase + azimuth), imaginary: scale * Math.sin(polar / 2) * Math.sin(phase + azimuth) }
  ];
  const pi = lambda.map(conjugate);
  const positionMatrix = [
    [{ real: time + z, imaginary: 0 }, { real: x, imaginary: -y }],
    [{ real: x, imaginary: y }, { real: time - z, imaginary: 0 }]
  ];
  const omega = positionMatrix.map((row) => multiplyByI(addComplex(
    multiplyComplex(row[0], pi[0]),
    multiplyComplex(row[1], pi[1])
  )));
  const twistor = [...omega, ...pi];
  const momentumMatrix = [
    [multiplyComplex(lambda[0], conjugate(lambda[0])), multiplyComplex(lambda[0], conjugate(lambda[1]))],
    [multiplyComplex(lambda[1], conjugate(lambda[0])), multiplyComplex(lambda[1], conjugate(lambda[1]))]
  ];
  const energy = (momentumMatrix[0][0].real + momentumMatrix[1][1].real) / 2;
  const momentum = {
    energy,
    x: momentumMatrix[0][1].real,
    y: -momentumMatrix[0][1].imaginary,
    z: (momentumMatrix[0][0].real - momentumMatrix[1][1].real) / 2
  };
  const massSquared = momentum.energy ** 2 - momentum.x ** 2 - momentum.y ** 2 - momentum.z ** 2;
  const stereographicChart = Math.hypot(lambda[0].real, lambda[0].imaginary) >= Math.hypot(lambda[1].real, lambda[1].imaginary)
    ? { name: 'north', coordinate: divideComplex(lambda[1], lambda[0]), expression: 'λ¹ / λ⁰' }
    : { name: 'south', coordinate: divideComplex(lambda[0], lambda[1]), expression: 'λ⁰ / λ¹' };

  return {
    parameters: { scale, polar, azimuth, phase, time, x, y, z },
    lambda,
    pi,
    omega,
    twistor,
    positionMatrix,
    momentumMatrix,
    momentum,
    massSquared,
    direction: {
      x: Math.sin(polar) * Math.cos(azimuth),
      y: Math.sin(polar) * Math.sin(azimuth),
      z: Math.cos(polar)
    },
    stereographicChart
  };
}