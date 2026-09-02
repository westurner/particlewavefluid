import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFrcModel, FRC_CONFIGURATIONS, FRC_INPUTS, FRC_SHAPES } from './frcModel.js';

test('every FRC shape produces a contained plasma volume', () => {
  for (const shape of Object.keys(FRC_SHAPES)) {
    const model = calculateFrcModel({ shape });
    assert.ok(model.plasmaRadius > 0);
    assert.ok(model.plasmaHalfLength > 0);
    assert.ok(model.plasmaRadius < model.wallRadius);
    assert.ok(model.plasmaHalfLength < model.wallHalfLength);
    assert.ok(model.plasmaVolume > 0);
  }
});

test('all device configurations preserve field reversal', () => {
  for (const configuration of Object.keys(FRC_CONFIGURATIONS)) {
    const model = calculateFrcModel({ configuration });
    assert.equal(model.reversedField, true);
    assert.ok(model.axialField < 0);
    assert.ok(model.confinement >= 0 && model.confinement <= 1);
    assert.ok(model.stability >= 0 && model.stability <= 1);
  }
});

test('the model responds monotonically to applied field and temperature inputs', () => {
  const lowField = calculateFrcModel({ magneticField: 1.5 });
  const highField = calculateFrcModel({ magneticField: 3.5 });
  const lowTemperature = calculateFrcModel({ ionTemperature: 0.5 });
  const highTemperature = calculateFrcModel({ ionTemperature: 4 });

  assert.ok(highField.magneticPressureKPa > lowField.magneticPressureKPa);
  assert.ok(highField.plasmaCurrentMA > lowField.plasmaCurrentMA);
  assert.ok(highTemperature.plasmaPressureKPa > lowTemperature.plasmaPressureKPa);
  assert.ok(highTemperature.beta > lowTemperature.beta);
});

test('invalid selection falls back to the baseline device', () => {
  const model = calculateFrcModel({ shape: 'missing-shape', configuration: 'missing-configuration' });
  assert.equal(model.shape, 'missing-shape');
  assert.equal(model.configuration, 'missing-configuration');
  assert.equal(model.wallRadius, FRC_SHAPES.elongated.wallRadius);
  assert.equal(model.magneticField, FRC_CONFIGURATIONS.thetaPinch.magneticField);
});

test('fusion outputs remain positive and captured power follows capture efficiency', () => {
  const thetaPinch = calculateFrcModel({ configuration: 'thetaPinch' });
  const steadyState = calculateFrcModel({ configuration: 'steadyState' });

  assert.ok(thetaPinch.fusionPowerMW > 0);
  assert.ok(thetaPinch.capturedPowerMW > 0);
  assert.equal(thetaPinch.outputFrequencyHz, 60);
  assert.ok(thetaPinch.plasmaFrequencyHz > 1e10);
  assert.equal(thetaPinch.plasmaPeriodSeconds, 1 / thetaPinch.plasmaFrequencyHz);
  assert.ok(thetaPinch.electricConversionEfficiency > 0);
  assert.ok(thetaPinch.electricConversionEfficiency < 1);
  assert.equal(thetaPinch.electricPowerMW, thetaPinch.capturedPowerMW * thetaPinch.electricConversionEfficiency);
  assert.ok(thetaPinch.nitrogenOutputSLM > 0);
  assert.ok(thetaPinch.heliumOutputGPerHour > 0);
  assert.ok(thetaPinch.neutronProductionRate > 0);
  assert.ok(thetaPinch.neutronFlux > 0);
  assert.ok(thetaPinch.capturedPowerMW > steadyState.capturedPowerMW);
});

test('plasma cycle matches the electron plasma frequency equation', () => {
  const density = 1.8;
  const model = calculateFrcModel({ density });
  const electronDensity = density * 1e20;
  const expectedFrequencyHz = Math.sqrt(
    electronDensity * (1.602176634e-19) ** 2
      / (9.1093837015e-31 * 8.8541878128e-12)
  ) / (2 * Math.PI);

  assert.ok(Math.abs(model.plasmaFrequencyHz - expectedFrequencyHz) / expectedFrequencyHz < 1e-12);
  assert.equal(model.plasmaPeriodSeconds, 1 / expectedFrequencyHz);
});

test('grid frequency and electricity conversion efficiency use the declared values', () => {
  const model = calculateFrcModel({ input: 'DT' });

  assert.equal(model.outputFrequencyHz, 60);
  assert.ok(model.electricConversionEfficiency > 0);
  assert.ok(model.electricConversionEfficiency < 1);
  assert.equal(model.electricPowerMW, model.capturedPowerMW * model.electricConversionEfficiency);
});

test('electric conversion efficiency responds to fuel and operating conditions', () => {
  const baseline = calculateFrcModel({ input: 'DT', density: 1, ionTemperature: 1, rotation: 0.8 });
  const optimized = calculateFrcModel({ input: 'DT', density: 2, ionTemperature: 3, rotation: 0.1 });
  const deuteriumHelium3 = calculateFrcModel({ input: 'DHe_3' });
  const argon = calculateFrcModel({ input: 'Argon' });

  assert.ok(optimized.electricConversionEfficiency > baseline.electricConversionEfficiency);
  assert.ok(deuteriumHelium3.electricConversionEfficiency > optimized.electricConversionEfficiency);
  assert.equal(argon.electricConversionEfficiency, 0);
  assert.equal(argon.electricPowerMW, 0);
});

test('neutron and helium output increase with hotter denser plasma', () => {
  const baseline = calculateFrcModel({ density: 1, ionTemperature: 1 });
  const energized = calculateFrcModel({ density: 2, ionTemperature: 3 });

  assert.ok(energized.neutronProductionRate > baseline.neutronProductionRate);
  assert.ok(energized.heliumOutputGPerHour > baseline.heliumOutputGPerHour);
  assert.ok(energized.fusionPowerMW > baseline.fusionPowerMW);
});

test('all supported plasma inputs produce finite model values', () => {
  for (const input of Object.keys(FRC_INPUTS)) {
    const model = calculateFrcModel({ input });
    assert.equal(model.input, input);
    assert.ok(Number.isFinite(model.fusionPowerMW));
    assert.ok(Number.isFinite(model.heliumOutputGPerHour));
    assert.ok(Number.isFinite(model.neutronProductionRate));
    assert.ok(model.nitrogenOutputSLM > 0);
  }
});

test('DHe_3 suppresses the neutron branch and Argon has no fusion products', () => {
  const deuteriumHelium3 = calculateFrcModel({ input: 'DHe_3' });
  const deuteriumTritium = calculateFrcModel({ input: 'DT' });
  const argon = calculateFrcModel({ input: 'Argon' });

  assert.ok(deuteriumHelium3.neutronProductionRate < deuteriumTritium.neutronProductionRate);
  assert.ok(deuteriumHelium3.heliumOutputGPerHour > 0);
  assert.equal(argon.fusionPowerMW, 0);
  assert.equal(argon.electricPowerMW, 0);
  assert.equal(argon.heliumOutputGPerHour, 0);
  assert.equal(argon.neutronProductionRate, 0);
  assert.equal(argon.nitrogenOutputSLM > 0, true);
});

test('invalid plasma input falls back to DT', () => {
  const fallback = calculateFrcModel({ input: 'unknownInput' });
  const baseline = calculateFrcModel({ input: 'DT' });

  assert.equal(fallback.input, 'DT');
  assert.equal(fallback.fusionPowerMW, baseline.fusionPowerMW);
  assert.equal(fallback.neutronProductionRate, baseline.neutronProductionRate);
});
