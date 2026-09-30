export const FTLE_FLOW_PRESETS = [
  { value: 'saddle', label: 'Hyperbolic saddle' },
  { value: 'rotation', label: 'Rigid rotation' },
  { value: 'source', label: 'Expanding source' },
  { value: 'sink', label: 'Compressing sink' },
  { value: 'double-gyre', label: 'Time-dependent double gyre' }
];

export function velocityAt(flow, point, time = 0, parameters = {}) {
  const x = point[0];
  const y = point[1];
  const rate = Number.isFinite(parameters.rate) ? parameters.rate : 0.65;
  if (flow === 'rotation') return [-rate * y, rate * x];
  if (flow === 'source') return [rate * x, rate * y];
  if (flow === 'sink') return [-rate * x, -rate * y];
  if (flow === 'double-gyre') {
    const amplitude = Number.isFinite(parameters.amplitude) ? parameters.amplitude : 0.35;
    const epsilon = Number.isFinite(parameters.epsilon) ? parameters.epsilon : 0.25;
    const omega = Number.isFinite(parameters.omega) ? parameters.omega : Math.PI / 5;
    const oscillation = epsilon * Math.sin(omega * time);
    const a = oscillation;
    const b = 1 - 2 * oscillation;
    const mappedX = a * x * x + b * x;
    const mappedDerivative = 2 * a * x + b;
    return [
      -Math.PI * amplitude * Math.sin(Math.PI * mappedX) * Math.cos(Math.PI * y),
      Math.PI * amplitude * Math.cos(Math.PI * mappedX) * Math.sin(Math.PI * y) * mappedDerivative
    ];
  }
  return [rate * x, -rate * y];
}

function addScaled(point, velocity, scale) {
  return [point[0] + velocity[0] * scale, point[1] + velocity[1] * scale];
}

export function integrateTrajectory(velocitySampler, initialPoint, startTime, duration, steps = 80) {
  const stepCount = Math.max(1, Math.round(steps));
  const stepSize = duration / stepCount;
  const points = [[...initialPoint]];
  let point = [...initialPoint];
  let time = startTime;
  for (let index = 0; index < stepCount; index += 1) {
    const first = velocitySampler(point, time);
    const second = velocitySampler(addScaled(point, first, stepSize / 2), time + stepSize / 2);
    const third = velocitySampler(addScaled(point, second, stepSize / 2), time + stepSize / 2);
    const fourth = velocitySampler(addScaled(point, third, stepSize), time + stepSize);
    point = [
      point[0] + stepSize * (first[0] + 2 * second[0] + 2 * third[0] + fourth[0]) / 6,
      point[1] + stepSize * (first[1] + 2 * second[1] + 2 * third[1] + fourth[1]) / 6
    ];
    time += stepSize;
    points.push(point);
  }
  return { initialPoint: [...initialPoint], finalPoint: [...point], points, startTime, duration };
}

export function deformationGradient(velocitySampler, initialPoint, startTime, duration, options = {}) {
  const epsilon = Math.max(1e-6, options.epsilon ?? 1e-3);
  const steps = options.steps ?? 80;
  const endpoints = [];
  for (const axis of [0, 1]) {
    const plus = [...initialPoint];
    const minus = [...initialPoint];
    plus[axis] += epsilon;
    minus[axis] -= epsilon;
    const plusFinal = integrateTrajectory(velocitySampler, plus, startTime, duration, steps).finalPoint;
    const minusFinal = integrateTrajectory(velocitySampler, minus, startTime, duration, steps).finalPoint;
    endpoints.push([
      (plusFinal[0] - minusFinal[0]) / (2 * epsilon),
      (plusFinal[1] - minusFinal[1]) / (2 * epsilon)
    ]);
  }
  return [
    [endpoints[0][0], endpoints[1][0]],
    [endpoints[0][1], endpoints[1][1]]
  ];
}

export function cauchyGreenFromGradient(gradient) {
  const [[a, b], [c, d]] = gradient;
  const xx = a * a + c * c;
  const xy = a * b + c * d;
  const yy = b * b + d * d;
  const trace = xx + yy;
  const determinant = Math.max(0, xx * yy - xy * xy);
  const discriminant = Math.sqrt(Math.max(0, trace * trace - 4 * determinant));
  return {
    tensor: [[xx, xy], [xy, yy]],
    eigenvalues: [(trace + discriminant) / 2, (trace - discriminant) / 2],
    determinant
  };
}

export function evaluateFtle(velocitySampler, initialPoint, startTime, duration, options = {}) {
  if (duration === 0) throw new Error('FTLE duration must be non-zero.');
  const gradient = deformationGradient(velocitySampler, initialPoint, startTime, duration, options);
  const cauchyGreen = cauchyGreenFromGradient(gradient);
  const maximumEigenvalue = Math.max(cauchyGreen.eigenvalues[0], 1e-18);
  const minimumEigenvalue = Math.max(cauchyGreen.eigenvalues[1], 0);
  const determinantF = gradient[0][0] * gradient[1][1] - gradient[0][1] * gradient[1][0];
  const ftle = Math.log(Math.sqrt(maximumEigenvalue)) / Math.abs(duration);
  return {
    ftle,
    gradient,
    cauchyGreen: cauchyGreen.tensor,
    eigenvalues: [maximumEigenvalue, minimumEigenvalue],
    determinantF,
    volumeChange: Math.abs(determinantF),
    ridgeConfidence: (maximumEigenvalue - minimumEigenvalue)
      / Math.max(maximumEigenvalue + minimumEigenvalue, 1e-18)
  };
}

export function sampleFtleGrid(velocitySampler, bounds, resolution, startTime, duration, options = {}) {
  const columns = Math.max(2, Math.round(resolution[0]));
  const rows = Math.max(2, Math.round(resolution[1]));
  const samples = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const point = [
        bounds.minX + (bounds.maxX - bounds.minX) * column / (columns - 1),
        bounds.minY + (bounds.maxY - bounds.minY) * row / (rows - 1)
      ];
      samples.push({ point, ...evaluateFtle(velocitySampler, point, startTime, duration, options) });
    }
  }
  return { columns, rows, samples };
}