export function rootMeanSquare(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  return Math.sqrt(values.reduce((sum, value) => sum + value ** 2, 0) / values.length);
}

export function scoreWeightedNormalizedMetrics(metrics) {
  const available = metrics.filter(({ value, tolerance, weight }) => (
    value !== null
    && Number.isFinite(value)
    && Number.isFinite(tolerance)
    && tolerance > 0
    && Number.isFinite(weight)
    && weight > 0
  ));
  const availableWeight = available.reduce((sum, metric) => sum + metric.weight, 0);
  const weightedScore = available.reduce((sum, metric) => sum + metric.weight * metric.value / metric.tolerance, 0);
  return {
    scorePoints: availableWeight > 0 ? 100 * weightedScore / availableWeight : 0,
    availableWeight
  };
}

export function summarizeModelDifference(referenceValues, candidateValues) {
  if (!Array.isArray(referenceValues) || !Array.isArray(candidateValues) || referenceValues.length !== candidateValues.length) {
    throw new RangeError('Model outputs must be arrays with matching lengths.');
  }
  if (referenceValues.some((value) => !Number.isFinite(value)) || candidateValues.some((value) => !Number.isFinite(value))) {
    throw new TypeError('Model outputs must contain only finite numbers.');
  }
  const differences = candidateValues.map((value, index) => value - referenceValues[index]);
  const absoluteDifferences = differences.map(Math.abs);
  const referenceRms = rootMeanSquare(referenceValues);
  const rmsDifference = rootMeanSquare(differences);
  const differenceScore = scoreWeightedNormalizedMetrics([{
    value: rmsDifference,
    tolerance: Math.max(referenceRms, 1e-9),
    weight: 1
  }]);
  return {
    sampleCount: differences.length,
    meanDifference: differences.length ? differences.reduce((sum, value) => sum + value, 0) / differences.length : 0,
    meanAbsoluteDifference: absoluteDifferences.length ? absoluteDifferences.reduce((sum, value) => sum + value, 0) / absoluteDifferences.length : 0,
    rmsDifference,
    maximumAbsoluteDifference: absoluteDifferences.length ? Math.max(...absoluteDifferences) : 0,
    referenceRms,
    candidateRms: rootMeanSquare(candidateValues),
    scorePoints: differenceScore.scorePoints
  };
}

export function compareModelVectors(referenceVectors, candidateVectors, referenceFloor = 1e-9) {
  if (!Array.isArray(referenceVectors) || !Array.isArray(candidateVectors) || referenceVectors.length !== candidateVectors.length) {
    throw new RangeError('Model vector outputs must have matching lengths.');
  }
  return referenceVectors.map((reference, index) => {
    const candidate = candidateVectors[index];
    if (!Array.isArray(reference) || !Array.isArray(candidate) || reference.length !== candidate.length) {
      throw new RangeError('Compared model vectors must have matching dimensions.');
    }
    const absoluteDifference = Math.hypot(...candidate.map((value, axis) => value - reference[axis]));
    const referenceMagnitude = Math.hypot(...reference);
    return {
      absoluteDifference,
      relativeDifference: absoluteDifference / Math.max(referenceFloor, referenceMagnitude)
    };
  });
}