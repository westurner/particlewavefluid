import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFrcModel, FRC_CONFIGURATIONS, FRC_INPUTS, FRC_RECOVERY_CONFIGURATIONS, FRC_SHAPES, getFrcVisualizationVisibility, searchArgonMhdParameterGrid } from './frcModel.js';
import { advanceFlowProgress, createFlowPathPoints, createInputParticlePathPoints, FLOW_PARTICLE_STREAMS, getFlowParticleVisibility, getInputParticleVisibility, INPUT_PARTICLE_STREAMS } from './flowParticles.js';

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

test('fusion gain Q uses explicit auxiliary heating and remains zero for Argon', () => {
  const lowHeating = calculateFrcModel({ input: 'DT', auxiliaryHeatingMW: 6 });
  const highHeating = calculateFrcModel({ input: 'DT', auxiliaryHeatingMW: 18 });
  const argon = calculateFrcModel({ input: 'Argon', auxiliaryHeatingMW: 6 });

  assert.equal(lowHeating.fusionGainQ, lowHeating.fusionPowerMW / 6);
  assert.ok(lowHeating.fusionGainQ > highHeating.fusionGainQ);
  assert.equal(argon.fusionGainQ, 0);
});

test('recovery configurations conserve allocated fusion energy and balance net electric power', () => {
  for (const recoveryConfiguration of Object.keys(FRC_RECOVERY_CONFIGURATIONS)) {
    const model = calculateFrcModel({ input: 'DHe_3', recoveryConfiguration });
    const recovery = model.recovery;

    assert.equal(recovery.configuration, recoveryConfiguration);
    assert.ok(recovery.directlyCapturedFusionPowerMW <= recovery.chargedFusionPowerMW);
    assert.equal(recovery.thermalAvailablePowerMW, model.fusionPowerMW - recovery.directlyCapturedFusionPowerMW);
    assert.equal(recovery.recoveredPowerMW, recovery.directElectricPowerMW + recovery.thermalElectricPowerMW + recovery.inductiveElectricPowerMW);
    assert.equal(recovery.totalElectricLoadMW, recovery.drivePowerMW + recovery.auxiliaryElectricPowerMW + recovery.facilityPowerMW);
    assert.equal(recovery.netElectricPowerMW, recovery.recoveredPowerMW - recovery.totalElectricLoadMW);
    assert.ok(recovery.directElectricPowerMW + recovery.thermalElectricPowerMW <= model.fusionPowerMW);
  }
});

test('recovery scenarios retain independent parameters and do not alter fusion Q', () => {
  const recoveryConfigurations = {
    inductiveDirect: { drivePowerMW: 31, facilityPowerMW: 2 },
    thermalCycle: { drivePowerMW: 7, facilityPowerMW: 11 }
  };
  const direct = calculateFrcModel({ auxiliaryHeatingMW: 9, recoveryConfiguration: 'inductiveDirect', recoveryConfigurations });
  const thermal = calculateFrcModel({ auxiliaryHeatingMW: 9, recoveryConfiguration: 'thermalCycle', recoveryConfigurations });
  const baseline = calculateFrcModel({ auxiliaryHeatingMW: 9 });

  assert.equal(direct.recovery.drivePowerMW, 31);
  assert.equal(direct.recovery.facilityPowerMW, 2);
  assert.equal(thermal.recovery.drivePowerMW, 7);
  assert.equal(thermal.recovery.facilityPowerMW, 11);
  assert.equal(direct.fusionGainQ, baseline.fusionGainQ);
  assert.equal(thermal.fusionGainQ, baseline.fusionGainQ);
  assert.deepEqual(recoveryConfigurations, {
    inductiveDirect: { drivePowerMW: 31, facilityPowerMW: 2 },
    thermalCycle: { drivePowerMW: 7, facilityPowerMW: 11 }
  });
});

test('recovery efficiencies and loads are bounded before accounting', () => {
  const model = calculateFrcModel({
    recoveryConfigurations: {
      inductiveDirect: {
        drivePowerMW: -5,
        inductiveRecoveryEfficiency: 2,
        chargedParticleCaptureEfficiency: 4,
        directConversionEfficiency: -1,
        thermalCaptureEfficiency: 3,
        thermalConversionEfficiency: 2,
        auxiliaryWallPlugEfficiency: 0,
        facilityPowerMW: -8
      }
    }
  });

  assert.equal(model.recovery.drivePowerMW, 0);
  assert.equal(model.recovery.inductiveRecoveryEfficiency, 1);
  assert.equal(model.recovery.chargedParticleCaptureEfficiency, 1);
  assert.equal(model.recovery.directConversionEfficiency, 0);
  assert.equal(model.recovery.thermalCaptureEfficiency, 1);
  assert.equal(model.recovery.thermalConversionEfficiency, 1);
  assert.equal(model.recovery.auxiliaryWallPlugEfficiency, 0.01);
  assert.equal(model.recovery.facilityPowerMW, 0);
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

test('Argon input preserves the calculated plasma readouts and field reversal', () => {
  const model = calculateFrcModel({ input: 'Argon' });

  assert.equal(model.input, 'Argon');
  assert.ok(Math.abs(model.beta - 0.029627730489180604) < 1e-12);
  assert.equal((model.beta * 100).toFixed(1), '3.0');
  assert.equal(model.reversedField, true);
  assert.ok(model.axialField < 0);
  assert.equal(model.axialField.toFixed(2), '-1.18');
  assert.ok(Math.abs(model.plasmaCurrentMA - 1.8054640139073466) < 1e-12);
  assert.equal(model.plasmaCurrentMA.toFixed(2), '1.81');
  assert.ok(Math.abs(model.plasmaVolume - 67.11042724588017) < 1e-12);
  assert.equal(model.plasmaVolume.toFixed(1), '67.1');
  assert.ok(model.plasmaRadius > 0);
  assert.ok(model.plasmaHalfLength > 0);
  assert.ok(model.plasmaPressureKPa > 0);
  assert.ok(model.magneticPressureKPa > model.plasmaPressureKPa);
  assert.ok(model.plasmaFrequencyHz > 0);
  assert.ok(model.plasmaPeriodSeconds > 0);
  assert.ok(model.nitrogenOutputSLM > 0);
  assert.equal(model.fusionPowerMW, 0);
  assert.equal(model.capturedPowerMW, 0);
  assert.equal(model.electricPowerMW, 0);
  assert.equal(model.heliumOutputGPerHour, 0);
  assert.equal(model.neutronProductionRate, 0);
});

test('Argon MHD configurations are non-fusing and expose finite magnetofluid diagnostics', () => {
  const configurations = ['argonMhdAxial', 'argonMhdRotating', 'argonMhdNozzle'];

  for (const configuration of configurations) {
    const model = calculateFrcModel({ configuration, input: 'Argon' });
    assert.equal(model.mhd.active, true);
    assert.equal(model.mhd.workingGas, 'Argon');
    assert.ok(model.mhd.mode);
    assert.ok(model.mhd.massDensityKgM3 > 0);
    assert.ok(model.mhd.alfvenSpeedMps > 0);
    assert.ok(model.mhd.ionSoundSpeedMps > 0);
    assert.ok(model.mhd.ionCyclotronFrequencyHz > 0);
    assert.ok(model.mhd.ionGyroradiusM > 0);
    assert.equal(model.fusionPowerMW, 0);
    assert.equal(model.electricPowerMW, 0);
    assert.equal(model.neutronProductionRate, 0);
    assert.equal(model.heliumOutputGPerHour, 0);
  }
});

test('MHD configuration and Argon input remain independent controls', () => {
  const nonArgon = calculateFrcModel({ configuration: 'argonMhdAxial', input: 'DT' });
  const argonInStandardFrc = calculateFrcModel({ configuration: 'thetaPinch', input: 'Argon' });

  assert.equal(nonArgon.input, 'DT');
  assert.equal(nonArgon.mhd.active, false);
  assert.equal(argonInStandardFrc.input, 'Argon');
  assert.equal(argonInStandardFrc.mhd.active, false);
});

test('piezo and longitudinal-wave drives expose bounded diagnostics without changing Argon gain', () => {
  const piezo = calculateFrcModel({ configuration: 'argonMhdPiezoRmf', input: 'Argon' });
  const longitudinal = calculateFrcModel({ configuration: 'argonMhdIonAcoustic', input: 'Argon' });

  assert.equal(piezo.drive.active, true);
  assert.equal(piezo.drive.mode, 'piezo-rmf');
  assert.ok(piezo.drive.piezoFrequencyHz > 0);
  assert.ok(piezo.drive.piezoCyclotronRatio > 0);
  assert.ok(piezo.drive.coupling > 0 && piezo.drive.coupling <= 1);
  assert.equal(piezo.fusionGainQ, 0);

  assert.equal(longitudinal.drive.active, true);
  assert.equal(longitudinal.drive.mode, 'ion-acoustic');
  assert.ok(longitudinal.drive.acousticFundamentalHz > 0);
  assert.equal(longitudinal.drive.acousticWavelengthM, longitudinal.mhd.ionSoundSpeedMps / longitudinal.drive.longitudinalFrequencyHz);
  assert.ok(longitudinal.drive.longitudinalAmplitude > 0 && longitudinal.drive.longitudinalAmplitude <= 1);
  assert.equal(longitudinal.fusionGainQ, 0);
});

test('experimental longitudinal drives do not create fusion power or activate for non-Argon inputs', () => {
  const baseline = calculateFrcModel({ configuration: 'argonMhdIonAcoustic', input: 'Argon', longitudinalDriveAmplitude: 0 });
  const driven = calculateFrcModel({ configuration: 'argonMhdIonAcoustic', input: 'Argon', longitudinalDriveAmplitude: 1 });
  const dt = calculateFrcModel({ configuration: 'argonMhdIonAcoustic', input: 'DT' });

  assert.equal(driven.fusionPowerMW, baseline.fusionPowerMW);
  assert.equal(driven.fusionGainQ, baseline.fusionGainQ);
  assert.equal(dt.drive.active, false);
});

test('Argon MHD grid search preserves Q zero and ranks admissible DT projections', () => {
  const candidates = searchArgonMhdParameterGrid();

  assert.deepEqual(candidates.map(({ mode }) => mode), ['axial', 'rotating', 'nozzle']);
  for (const candidate of candidates) {
    assert.equal(candidate.argonFusionGainQ, 0);
    assert.ok(candidate.projectedDtFusionGainQ > 0);
    assert.ok(candidate.beta >= 0.05 && candidate.beta <= 0.8);
    assert.ok(candidate.stability >= 0.55);
    assert.ok(candidate.confinement >= 0.45);
    assert.ok(candidate.gyroradiusRatio <= 0.05);
  }
});

test('selectable Q-grid configurations match the reproducible search winners', () => {
  const candidates = searchArgonMhdParameterGrid();
  const optimizedConfigurations = Object.entries(FRC_CONFIGURATIONS)
    .filter(([, configuration]) => configuration.mhdGridOptimized);

  assert.equal(optimizedConfigurations.length, candidates.length);
  for (const [configurationId, configuration] of optimizedConfigurations) {
    const candidate = candidates.find(({ mode }) => mode === configuration.mhdMode);
    const model = calculateFrcModel({
      configuration: configurationId,
      shape: configuration.shape,
      input: 'Argon'
    });
    assert.ok(candidate);
    assert.equal(model.fusionGainQ, 0);
    assert.equal(model.magneticField, candidate.magneticField);
    assert.equal(model.density, candidate.density);
    assert.equal(model.ionTemperature, candidate.ionTemperature);
    assert.equal(model.rotation, candidate.rotation);
    assert.equal(model.mhd.projectedDtFusionGainQ, candidate.projectedDtFusionGainQ);
  }
});

test('grid-derived configuration labels identify the DT counterfactual', () => {
  assert.equal(FRC_CONFIGURATIONS.argonMhdAxialQGrid.label, 'Axial FRC, DT projection from Argon grid optimum');
  assert.equal(FRC_CONFIGURATIONS.argonMhdRotatingQGrid.label, 'Rotating-field FRC, DT projection from Argon grid optimum');
  assert.equal(FRC_CONFIGURATIONS.argonMhdNozzleQGrid.label, 'Magnetic-nozzle FRC, DT projection from Argon grid optimum');
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

test('gas and charge particles flow through their respective conduits', () => {
  const paths = createFlowPathPoints({ wallHalfLength: 5.8, wallRadius: 2.9 });
  const gasStart = paths.nitrogenPath[0];
  const gasOutlet = paths.nitrogenPath.at(-1);
  const chargeStart = paths.chargePath[0];
  const chargeOutlet = paths.chargePath.at(-1);

  assert.ok(FLOW_PARTICLE_STREAMS.gas.color !== FLOW_PARTICLE_STREAMS.charge.color);
  assert.equal(FLOW_PARTICLE_STREAMS.gas.pathKey, 'nitrogenPath');
  assert.equal(FLOW_PARTICLE_STREAMS.charge.pathKey, 'chargePath');
  assert.equal(FLOW_PARTICLE_STREAMS.helium.pathKey, 'heliumPath');
  assert.equal(FLOW_PARTICLE_STREAMS.neutrons.pathKey, 'neutronPath');
  assert.ok(FLOW_PARTICLE_STREAMS.helium.color !== FLOW_PARTICLE_STREAMS.neutrons.color);
  assert.deepEqual(getFlowParticleVisibility(), { gas: true, charge: true, helium: true, neutrons: true });
  assert.deepEqual(getFlowParticleVisibility({ showGasFlow: false }), { gas: false, charge: true, helium: true, neutrons: true });
  assert.deepEqual(getFlowParticleVisibility({ showChargeFlow: false }), { gas: true, charge: false, helium: true, neutrons: true });
  assert.deepEqual(getFlowParticleVisibility({ showHeliumOutput: false }), { gas: true, charge: true, helium: false, neutrons: true });
  assert.deepEqual(getFlowParticleVisibility({ showNeutronOutput: false }), { gas: true, charge: true, helium: true, neutrons: false });
  assert.deepEqual(getFlowParticleVisibility({ showOutputManifold: false }), { gas: true, charge: true, helium: false, neutrons: false });
  assert.deepEqual(getFlowParticleVisibility({ showCabling: false }), { gas: false, charge: false, helium: false, neutrons: false });
  assert.ok(gasStart[0] < gasOutlet[0]);
  assert.ok(chargeStart[0] < chargeOutlet[0]);
  assert.ok(paths.heliumPath[0][0] < paths.heliumPath.at(-1)[0]);
  assert.ok(paths.neutronPath[0][0] < paths.neutronPath.at(-1)[0]);
  assert.ok(advanceFlowProgress(0.25, FLOW_PARTICLE_STREAMS.gas.speed, 1) > 0.25);
  assert.ok(advanceFlowProgress(0.25, FLOW_PARTICLE_STREAMS.charge.speed, 1) > 0.25);
  assert.ok(advanceFlowProgress(0.9, FLOW_PARTICLE_STREAMS.gas.speed, 2) < 0.2);
});

test('plasma input particles have distinct axial lanes and independent visibility', () => {
  const paths = createInputParticlePathPoints({ plasmaHalfLength: 5, plasmaRadius: 2 });
  const streamInputs = Object.keys(INPUT_PARTICLE_STREAMS);

  assert.deepEqual(streamInputs, ['DT', 'DHe_3', 'Argon']);
  assert.equal(new Set(streamInputs.map((input) => INPUT_PARTICLE_STREAMS[input].color)).size, 3);
  for (const input of streamInputs) {
    assert.ok(paths[input][0][0] < paths[input].at(-1)[0]);
    assert.equal(INPUT_PARTICLE_STREAMS[input].pathKey, input);
    assert.ok(advanceFlowProgress(0.25, INPUT_PARTICLE_STREAMS[input].speed, 1) > 0.25);
  }
  assert.deepEqual(getInputParticleVisibility(), { DT: true, DHe_3: true, Argon: true });
  assert.deepEqual(getInputParticleVisibility({ showDTInput: false }), { DT: false, DHe_3: true, Argon: true });
  assert.deepEqual(getInputParticleVisibility({ showDHe3Input: false }), { DT: true, DHe_3: false, Argon: true });
  assert.deepEqual(getInputParticleVisibility({ showArgonInput: false }), { DT: true, DHe_3: true, Argon: false });
  assert.deepEqual(getInputParticleVisibility({ showInputParticles: false }), { DT: false, DHe_3: false, Argon: false });
  assert.deepEqual(getInputParticleVisibility({ showCabling: false }), { DT: false, DHe_3: false, Argon: false });
});

test('selected plasma input controls active particles and reaction output channels', () => {
  const dtVisibility = getFrcVisualizationVisibility({ configuration: 'thetaPinch', input: 'DT' });
  const dHe3Visibility = getFrcVisualizationVisibility({ configuration: 'rotatingField', input: 'DHe_3' });
  const argonVisibility = getFrcVisualizationVisibility({ configuration: 'steadyState', input: 'Argon' });

  assert.deepEqual(dtVisibility.input, { DT: true, DHe_3: false, Argon: false });
  assert.deepEqual(dtVisibility.output, { nitrogen: true, helium: true, neutrons: true });
  assert.deepEqual(dHe3Visibility.input, { DT: false, DHe_3: true, Argon: false });
  assert.deepEqual(dHe3Visibility.output, { nitrogen: true, helium: true, neutrons: true });
  assert.deepEqual(argonVisibility.input, { DT: false, DHe_3: false, Argon: true });
  assert.deepEqual(argonVisibility.output, { nitrogen: true, helium: false, neutrons: false });
});
