import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const baseUrl = process.env.BASE_URL ?? 'http://localhost:5173/';
const screenshotPath = new URL('../test-results/frc-flow-particles.png', import.meta.url).pathname;
const parallelScreenshotPath = new URL('../test-results/frc-reactor-parallel.png', import.meta.url).pathname;
const plasmaColorsScreenshotPath = new URL('../test-results/frc-plasma-colors.png', import.meta.url).pathname;
const screenshotSettleMs = 500;

async function captureScreenshot(page) {
  return PNG.sync.read(await page.screenshot({ clip: { x: 0, y: 0, width: 699, height: 700 } }));
}

async function captureReactorView(page) {
  return PNG.sync.read(await page.screenshot({ clip: { x: 250, y: 150, width: 800, height: 650 } }));
}

function countChangedPixels(first, second) {
  assert.equal(first.width, second.width);
  assert.equal(first.height, second.height);
  let changed = 0;
  for (let index = 0; index < first.data.length; index += 4) {
    const colorDistance = Math.abs(first.data[index] - second.data[index])
      + Math.abs(first.data[index + 1] - second.data[index + 1])
      + Math.abs(first.data[index + 2] - second.data[index + 2]);
    if (colorDistance > 35) changed += 1;
  }
  return changed;
}

function meanColorDistance(first, second) {
  assert.equal(first.width, second.width);
  assert.equal(first.height, second.height);
  let totalDistance = 0;
  for (let index = 0; index < first.data.length; index += 4) {
    totalDistance += Math.abs(first.data[index] - second.data[index])
      + Math.abs(first.data[index + 1] - second.data[index + 1])
      + Math.abs(first.data[index + 2] - second.data[index + 2]);
  }
  return totalDistance / (first.width * first.height);
}

function countPinkPixels(buffer) {
  const image = PNG.sync.read(buffer);
  let count = 0;
  for (let index = 0; index < image.data.length; index += 4) {
    const red = image.data[index];
    const green = image.data[index + 1];
    const blue = image.data[index + 2];
    if (red > 150 && blue > 80 && red > green * 1.35 && blue > green * 1.05) count += 1;
  }
  return count;
}

function countForestGreenPixels(buffer) {
  const image = PNG.sync.read(buffer);
  let count = 0;
  for (let index = 0; index < image.data.length; index += 4) {
    const red = image.data[index];
    const green = image.data[index + 1];
    const blue = image.data[index + 2];
    if (green > 75 && green > red * 1.12 && green > blue * 0.92) count += 1;
  }
  return count;
}

function changedPixelBounds(firstBuffer, secondBuffer) {
  const first = PNG.sync.read(firstBuffer);
  const second = PNG.sync.read(secondBuffer);
  assert.equal(first.width, second.width);
  assert.equal(first.height, second.height);
  let minX = first.width;
  let minY = first.height;
  let maxX = -1;
  let maxY = -1;
  let count = 0;
  for (let y = 0; y < first.height; y += 1) {
    for (let x = 0; x < first.width; x += 1) {
      const offset = (y * first.width + x) * 4;
      const distance = Math.abs(first.data[offset] - second.data[offset])
        + Math.abs(first.data[offset + 1] - second.data[offset + 1])
        + Math.abs(first.data[offset + 2] - second.data[offset + 2]);
      if (distance > 45) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        count += 1;
      }
    }
  }
  return maxX < minX
    ? { width: 0, height: 0, count: 0 }
    : { width: maxX - minX + 1, height: maxY - minY + 1, count };
}

async function waitForMatchingReactorView(page, expectedView) {
  const startedAt = Date.now();
  const deadline = startedAt + 3000;
  let currentView = await captureReactorView(page);
  while (Date.now() < deadline) {
    if (meanColorDistance(expectedView, currentView) < 5) {
      return currentView;
    }
    await page.waitForTimeout(100);
    currentView = await captureReactorView(page);
  }
  return currentView;
}

async function waitForInputAnnotation(page, label) {
  await page.waitForFunction((expectedLabel) => document.querySelector('.frc-input-label strong')?.textContent === expectedLabel, label);
}

async function uncheckFrcControls(page, names) {
  await page.evaluate((expectedNames) => {
    for (const name of expectedNames) {
      const label = [...document.querySelectorAll('.frc-toggle-row')].find((candidate) => candidate.textContent.includes(name));
      const input = label?.querySelector('input');
      if (input?.checked) input.click();
    }
  }, names);
  await page.waitForFunction((expectedNames) => expectedNames.every((name) => {
    const label = [...document.querySelectorAll('.frc-toggle-row')].find((candidate) => candidate.textContent.includes(name));
    return label && !label.querySelector('input')?.checked;
  }), names);
}

async function setFrcControl(page, name, checked) {
  await page.evaluate(({ expectedName, expectedChecked }) => {
    const label = [...document.querySelectorAll('.frc-toggle-row')].find((candidate) => candidate.textContent.includes(expectedName));
    const input = label?.querySelector('input');
    if (input && input.checked !== expectedChecked) input.click();
  }, { expectedName: name, expectedChecked: checked });
  await page.waitForFunction(({ expectedName, expectedChecked }) => {
    const label = [...document.querySelectorAll('.frc-toggle-row')].find((candidate) => candidate.textContent.includes(expectedName));
    return label?.querySelector('input')?.checked === expectedChecked;
  }, { expectedName: name, expectedChecked: checked });
  await page.waitForTimeout(50);
}

async function assertFrcControlsAvailable(page, names) {
  for (const name of names) {
    const control = page.getByRole('checkbox', { name });
    assert.equal(await control.isChecked(), true, `${name} should be ON`);
    assert.equal(await control.isDisabled(), false, `${name} should be available`);
  }
}

async function assertPlasmaAndFuelLabelsDoNotOverlap(page) {
  const labels = await page.locator('.frc-device-label, .frc-input-label').evaluateAll((elements) => elements.map((element) => {
    const bounds = element.getBoundingClientRect();
    return { text: element.innerText.trim(), left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom };
  }));
  const plasma = labels.find((label) => label.text.startsWith('Plasma'));
  const fuel = labels.find((label) => label.text.startsWith('DT'));
  assert.ok(plasma, 'Plasma annotation should be rendered');
  assert.ok(fuel, 'DT annotation should be rendered');
  const overlaps = plasma.left < fuel.right && plasma.right > fuel.left
    && plasma.top < fuel.bottom && plasma.bottom > fuel.top;
  assert.equal(overlaps, false, `Plasma and DT labels overlap in 2D: ${JSON.stringify({ plasma, fuel })}`);
}

async function measureVisiblePlasmaBounds(page) {
  const plasmaToggle = page.getByRole('checkbox', { name: 'Plasma particles' });
  await plasmaToggle.check();
  await page.waitForTimeout(60);
  const visible = await page.locator('.frc-scene canvas').screenshot();
  await plasmaToggle.uncheck();
  await page.waitForTimeout(60);
  const hidden = await page.locator('.frc-scene canvas').screenshot();
  await plasmaToggle.check();
  return changedPixelBounds(visible, hidden);
}

async function selectParam(page, label, value) {
  await page.getByRole('combobox', { name: label }).click();
  await page.locator(`[role="option"][data-value="${value}"]`).click();
}

async function assertAnnotationHoverBrightens(page, annotationId) {
  const annotation = page.locator(`[data-annotation-id="${annotationId}"]`);
  const baseline = PNG.sync.read(await page.locator('.frc-scene canvas').screenshot());
  await annotation.hover({ position: { x: 10, y: 10 } });
  await page.waitForTimeout(120);
  const highlighted = PNG.sync.read(await page.locator('.frc-scene canvas').screenshot());
  assert.ok(countChangedPixels(baseline, highlighted) > 20, `${annotationId} should brighten its referenced scene object`);
}

test('FRC recovery architectures retain independent parameters and separate net electric output from Q', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /04 \/ LOAD FIELD/ }).click();
  await page.locator('.frc-panel').waitFor();

  const fusionGain = page.getByLabel('Plasma fusion gain');
  const netElectric = page.getByLabel('Net electric power');
  const driveInput = page.getByRole('slider', { name: 'Pulsed drive input' });
  const initialFusionGain = await fusionGain.innerText();
  assert.match(await netElectric.innerText(), /gross recovery.*electrical loads/);
  assert.equal(await fusionGain.isVisible(), true);
  assert.equal(await netElectric.isVisible(), true);
  await page.locator('.frc-panel').evaluate((panel) => { panel.scrollTop = panel.scrollHeight; });
  assert.equal(await fusionGain.isVisible(), true, 'fusion gain should remain visible while the parameter panel scrolls');
  assert.equal(await netElectric.isVisible(), true, 'net electric objective should remain visible while the parameter panel scrolls');
  await page.getByRole('button', { name: 'Hide params' }).first().click();
  assert.equal(await fusionGain.isVisible(), true, 'fusion gain should remain visible when parameters are hidden');
  assert.equal(await netElectric.isVisible(), true, 'net electric objective should remain visible when parameters are hidden');
  await page.getByRole('button', { name: 'Show params' }).click();
  await page.getByRole('checkbox', { name: 'Performance readouts' }).uncheck();
  assert.equal(await page.getByLabel('Plasma fusion gain').count(), 0);
  assert.equal(await page.getByLabel('Net electric power').count(), 0);
  await page.getByRole('checkbox', { name: 'Performance readouts' }).check();
  assert.equal(await fusionGain.isVisible(), true);
  assert.equal(await netElectric.isVisible(), true);
  const desktopDock = await page.locator('.frc-key-readouts').evaluate((element) => ({
    position: getComputedStyle(element).position,
    zIndex: Number(getComputedStyle(element).zIndex),
    bounds: element.getBoundingClientRect().toJSON()
  }));
  assert.equal(desktopDock.position, 'absolute');
  assert.ok(desktopDock.zIndex > 0);
  assert.ok(desktopDock.bounds.width > 0 && desktopDock.bounds.height > 0);
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileDockBounds = await page.locator('.frc-key-readouts').boundingBox();
  const mobilePanelBounds = await page.locator('.frc-panel').boundingBox();
  assert.ok(mobileDockBounds.x >= 0 && mobileDockBounds.x + mobileDockBounds.width <= 390, 'readout dock should fit mobile width');
  assert.ok(mobileDockBounds.y + mobileDockBounds.height < mobilePanelBounds.y, 'readout dock should remain visible above the mobile parameter panel');
  assert.equal(await fusionGain.isVisible(), true);
  assert.equal(await netElectric.isVisible(), true);
  await page.setViewportSize({ width: 1440, height: 1000 });

  await driveInput.fill('33');
  await selectParam(page, 'Recovery architecture', 'thermalCycle');
  assert.equal(await driveInput.inputValue(), '8');
  await driveInput.fill('7');

  await selectParam(page, 'Recovery architecture', 'inductiveDirect');
  assert.equal(await driveInput.inputValue(), '33');
  await selectParam(page, 'Recovery architecture', 'thermalCycle');
  assert.equal(await driveInput.inputValue(), '7');
  assert.equal(await fusionGain.innerText(), initialFusionGain);
  assert.ok(await page.getByText(/not measured Helion performance/).isVisible());
});

test('annotation hover brightens referenced objects and tap pins focus', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /04 \/ LOAD FIELD/ }).click();
  await page.locator('.frc-panel').waitFor();
  await setFrcControl(page, 'Run plasma transport', false);

  await assertAnnotationHoverBrightens(page, 'plasma');
  await assertAnnotationHoverBrightens(page, 'energy-harness');
  await assertAnnotationHoverBrightens(page, 'output:helium');

  const plasmaAnnotation = page.locator('[data-annotation-id="plasma"]');
  await plasmaAnnotation.click();
  await page.mouse.move(1439, 999);
  await page.waitForTimeout(80);
  assert.equal(await plasmaAnnotation.getAttribute('aria-pressed'), 'true', 'tapping should keep Plasma focus pinned after leaving the label');
  await plasmaAnnotation.click();
  await page.mouse.move(1439, 999);
  await page.waitForTimeout(80);
  assert.equal(await plasmaAnnotation.getAttribute('aria-pressed'), 'false', 'tapping the pinned annotation again should clear focus');
});

test('FRC excitation architectures retain angles and render distinct launcher and loop hardware', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /04 \/ LOAD FIELD/ }).click();
  await page.locator('.frc-panel').waitFor();
  await page.waitForSelector('canvas');
  await uncheckFrcControls(page, ['Run plasma transport', 'Plasma particles']);
  await setFrcControl(page, 'Turn off all annotations', true);
  const axialView = await captureReactorView(page);

  await selectParam(page, 'Excitation architecture', 'vortexGunRings');
  const cant = page.getByRole('slider', { name: 'Flow-relative beam cant' });
  await cant.fill('41');
  assert.match(await page.getByLabel('Excitation geometry diagnostics').innerText(), /NET VORTICITY DRIVE[\s\S]*64\.9%/);
  const tubeCant = page.getByRole('slider', { name: 'Tube-axis beam cant' });
  await tubeCant.fill('30');
  assert.equal(await cant.inputValue(), '41');
  const positiveEndView = await captureReactorView(page);
  await tubeCant.fill('-30');
  assert.equal(await cant.inputValue(), '41');
  const negativeEndView = await captureReactorView(page);
  assert.ok(meanColorDistance(positiveEndView, negativeEndView) > 1, 'FRC launcher beams should aim toward opposite axial ends');
  await tubeCant.fill('0');
  await page.waitForTimeout(150);
  const vortexView = await captureReactorView(page);
  assert.ok(meanColorDistance(axialView, vortexView) > 1, 'vortex launcher arrays should visibly change the reactor hardware');

  await selectParam(page, 'Excitation architecture', 'stellaratorLoop');
  assert.equal(await page.getByRole('slider', { name: 'Helical field periods' }).inputValue(), '3');
  await page.waitForTimeout(150);
  const stellaratorView = await captureReactorView(page);
  assert.ok(meanColorDistance(vortexView, stellaratorView) > 1, 'helical loop hardware should differ visibly from launcher arrays');

  await selectParam(page, 'Excitation architecture', 'vortexGunRings');
  assert.equal(await cant.inputValue(), '41');
  assert.ok(await page.getByText(/No angle is universally optimal/).isVisible());
});

test('radial and canted launcher architectures follow Tokamak and Stellarator loop geometry', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /04 \/ LOAD FIELD/ }).click();
  await page.locator('.frc-panel').waitFor();
  await page.waitForSelector('canvas');
  await uncheckFrcControls(page, ['Run plasma transport', 'Plasma particles']);
  await setFrcControl(page, 'Turn off all annotations', true);

  for (const [shape, loopId, loopLabel, deviceLabel] of [
    ['tokamak', 'tokamakLoop', 'Tokamak-like loop study', 'TOKAMAK'],
    ['stellarator', 'stellaratorLoop', 'Stellarator-like helical loop study', 'STELLARATOR']
  ]) {
    await selectParam(page, 'Vessel shape', shape);
    await selectParam(page, 'Excitation architecture', loopId);
    assert.match(await page.getByRole('combobox', { name: 'Excitation architecture' }).innerText(), new RegExp(`^${loopLabel}`));
    const loopView = await captureReactorView(page);

    await selectParam(page, 'Excitation architecture', 'radialGunRings');
    assert.match(await page.getByRole('combobox', { name: 'Excitation architecture' }).innerText(), /^Inward radial plasma focus arrays/);
    assert.match(await page.locator('.frc-status').innerText(), new RegExp(deviceLabel));
    const voltage = page.getByRole('slider', { name: 'Accelerator voltage' });
    const current = page.getByRole('slider', { name: 'Total beam current' });
    const focusSpecies = page.getByRole('combobox', { name: 'Focus ion species' });
    const beamDiagnostics = page.locator('[aria-label="Plasma focus beam diagnostics"]');
    const expectedRadialVoltage = shape === 'tokamak' ? '30' : '60';
    const expectedRadialCurrent = shape === 'tokamak' ? '2' : '4';
    assert.equal(await voltage.inputValue(), expectedRadialVoltage);
    assert.equal(await current.inputValue(), expectedRadialCurrent);
    assert.match(await beamDiagnostics.innerText(), shape === 'tokamak' ? /30\.0 keV/ : /120\.0 keV/);
    await voltage.fill('60');
    await current.fill('4');
    await selectParam(page, 'Focus ion species', 'alpha');
    assert.match(await beamDiagnostics.innerText(), /120\.0 keV/);
    assert.match(await beamDiagnostics.innerText(), /240\.00 MW/);

    await setFrcControl(page, 'Run plasma transport', true);
    const beamletToggle = page.getByRole('checkbox', { name: 'Accelerated beamlets' });
    assert.equal(await beamletToggle.isChecked(), true);
    await beamletToggle.uncheck();
    await page.waitForTimeout(100);
    const beamletsHidden = PNG.sync.read(await page.locator('.frc-scene canvas').screenshot());
    await beamletToggle.check();
    await page.waitForTimeout(100);
    const beamletsVisible = PNG.sync.read(await page.locator('.frc-scene canvas').screenshot());
    assert.ok(countChangedPixels(beamletsHidden, beamletsVisible) > 20, `${deviceLabel} accelerated beamlets should render visibly`);

    const inwardView = await captureReactorView(page);
    assert.ok(meanColorDistance(loopView, inwardView) > 1, `${deviceLabel} inward radial launchers should render around its toroidal loop`);
    const radialPalettePixels = countForestGreenPixels(await page.locator('.frc-scene canvas').screenshot());
    assert.ok(radialPalettePixels > 20, `${deviceLabel} radial focus array should render muted forest-green hardware, found ${radialPalettePixels} pixels`);

    await selectParam(page, 'Excitation architecture', 'vortexGunRings');
    assert.match(await page.getByRole('combobox', { name: 'Excitation architecture' }).innerText(), /^Canted vortex plasma focus arrays/);
    assert.equal(await voltage.inputValue(), '45', 'vortex-array voltage should retain its independent preset value');
    assert.equal(await current.inputValue(), '3', 'vortex-array current should retain its independent preset value');
    assert.match(await focusSpecies.innerText(), /^Deuteron \(D\+\)/);
    const tubeCant = page.getByRole('slider', { name: 'Tube-axis beam cant' });
    await tubeCant.fill('0');
    const cant = page.getByRole('slider', { name: 'Flow-relative beam cant' });
    await cant.fill('-42');
    assert.equal(await cant.inputValue(), '-42');
    assert.match(await page.getByLabel('Excitation geometry diagnostics').innerText(), /NET VORTICITY DRIVE[\s\S]*-66\.2%/);
    await cant.fill('42');
    assert.equal(await cant.inputValue(), '42');
    assert.match(await page.getByLabel('Excitation geometry diagnostics').innerText(), /NET VORTICITY DRIVE[\s\S]*66\.2%/);
    const vortexView = await captureReactorView(page);
    assert.ok(meanColorDistance(inwardView, vortexView) > 1, `${deviceLabel} canted launchers should change orientation and phase around its toroidal loop`);
    const vortexPalettePixels = countForestGreenPixels(await page.locator('.frc-scene canvas').screenshot());
    assert.ok(vortexPalettePixels > 20, `${deviceLabel} vortex focus array should render deeper forest-green hardware, found ${vortexPalettePixels} pixels`);

    await tubeCant.fill('30');
    assert.equal(await tubeCant.inputValue(), '30');
    assert.equal(await cant.inputValue(), '42', 'end/poloidal bias must remain independent from flow-relative cant');
    assert.match(await page.getByLabel('Excitation geometry diagnostics').innerText(), /TUBE-AXIS CANT[\s\S]*\+30 deg/);
    const positiveBiasView = await captureReactorView(page);
    await tubeCant.fill('-30');
    assert.equal(await tubeCant.inputValue(), '-30');
    assert.equal(await cant.inputValue(), '42');
    assert.match(await page.getByLabel('Excitation geometry diagnostics').innerText(), /TUBE-AXIS CANT[\s\S]*-30 deg/);
    const negativeBiasView = await captureReactorView(page);
    assert.ok(meanColorDistance(positiveBiasView, negativeBiasView) > 1, `${deviceLabel} positive and negative tube-axis cant should render different aims`);
  }

  assert.deepEqual(await page.locator('.frc-gpu-error').allTextContents(), []);
});

test('toroidal device presets select and render matching tokamak and stellarator vessels', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /04 \/ LOAD FIELD/ }).click();
  await page.locator('.frc-panel').waitFor();
  await page.waitForSelector('canvas');
  await setFrcControl(page, 'Run plasma transport', false);
  await page.waitForTimeout(screenshotSettleMs);
  const frcView = await captureReactorView(page);
  const deviceAncillaryControls = [
    'Energy capture harness',
    'Output manifold',
    'Nitrogen purge',
    'Helium alpha product',
    'Neutron flux',
    'Nitrogen gas flow',
    'Charge flow',
    'Input particle streams',
    'DT particles'
  ];

  await selectParam(page, 'Vessel shape', 'tokamak');
  assert.match(await page.getByRole('combobox', { name: 'Vessel shape' }).innerText(), /^Tokamak torus/);
  assert.match(await page.getByRole('combobox', { name: 'Device configuration' }).innerText(), /^Tokamak magnetic-confinement study/);
  assert.match(await page.getByRole('combobox', { name: 'Excitation architecture' }).innerText(), /^Tokamak-like loop study/);
  assert.match(await page.locator('.frc-status').innerText(), /TOKAMAK \/ REDUCED TOROIDAL STUDY[\s\S]*TOROIDAL GUIDE FIELD/);
  assert.ok(await page.getByText('GUIDE FIELD', { exact: true }).isVisible());
  await assertFrcControlsAvailable(page, deviceAncillaryControls);
  assert.equal(await page.locator('.frc-device-label strong').filter({ hasText: 'Plasma' }).isVisible(), true);
  assert.equal(await page.locator('.frc-input-label strong').isVisible(), true);
  await assertPlasmaAndFuelLabelsDoNotOverlap(page);
  const ancillaryFlowControls = ['Energy capture harness', 'Output manifold', 'Nitrogen gas flow', 'Charge flow', 'Input particle streams'];
  await uncheckFrcControls(page, ancillaryFlowControls);
  await page.waitForTimeout(screenshotSettleMs);
  const tokamakView = await captureReactorView(page);
  assert.ok(meanColorDistance(frcView, tokamakView) > 2, 'tokamak vessel should visibly differ from the axial FRC vessel');
  const tokamakPlasmaAtUnitScale = await measureVisiblePlasmaBounds(page);
  assert.ok(tokamakPlasmaAtUnitScale.count > 40, `tokamak GPU plasma should be visible with the tube layer off; found ${tokamakPlasmaAtUnitScale.count} changed pixels`);
  const toroidalPlasmaTubeToggle = page.getByRole('checkbox', { name: 'Toroidal plasma tube' });
  const toroidalPlasmaTubeOpacity = page.getByRole('slider', { name: 'Toroidal plasma tube opacity' });
  assert.equal(await toroidalPlasmaTubeToggle.isChecked(), false, 'the optional tube should not cover GPU particles by default');
  await toroidalPlasmaTubeToggle.check();
  await toroidalPlasmaTubeOpacity.fill('0.9');
  await page.waitForTimeout(screenshotSettleMs);
  const tokamakTubeAtHighOpacity = PNG.sync.read(await page.locator('.frc-scene canvas').screenshot());
  await toroidalPlasmaTubeOpacity.fill('0.1');
  await page.waitForTimeout(screenshotSettleMs);
  const tokamakTubeAtLowOpacity = PNG.sync.read(await page.locator('.frc-scene canvas').screenshot());
  assert.ok(meanColorDistance(tokamakTubeAtHighOpacity, tokamakTubeAtLowOpacity) > 0.1, 'Tokamak plasma-tube opacity should be adjustable independently');
  await toroidalPlasmaTubeToggle.uncheck();

  const scaleControl = page.getByRole('slider', { name: 'Vessel scale' });
  await scaleControl.fill('1.2');
  const tokamakPlasmaAtLargeScale = await measureVisiblePlasmaBounds(page);
  const tokamakScaleValue = await scaleControl.inputValue();
  assert.ok(tokamakPlasmaAtLargeScale.width > tokamakPlasmaAtUnitScale.width * 1.04, `tokamak plasma should grow with the vessel scale: ${JSON.stringify({ unit: tokamakPlasmaAtUnitScale, large: tokamakPlasmaAtLargeScale, scale: tokamakScaleValue })}`);
  await scaleControl.fill('1');

  const transparencyControl = page.getByRole('slider', { name: 'Vessel transparency' });
  const fieldVolumeOpacityControl = page.getByRole('slider', { name: 'Separatrix volume opacity' });
  assert.equal(await fieldVolumeOpacityControl.inputValue(), '0.06');
  await transparencyControl.fill('0.06');
  await page.waitForTimeout(screenshotSettleMs);
  const tokamakLowTransparency = PNG.sync.read(await page.locator('.frc-scene canvas').screenshot());
  await transparencyControl.fill('0.34');
  await page.waitForTimeout(screenshotSettleMs);
  const tokamakHighTransparency = PNG.sync.read(await page.locator('.frc-scene canvas').screenshot());
  assert.ok(meanColorDistance(tokamakLowTransparency, tokamakHighTransparency) > 0.1, 'tokamak shell should respond to vessel transparency');
  await transparencyControl.fill('0.18');
  await fieldVolumeOpacityControl.fill('0');
  await page.waitForTimeout(screenshotSettleMs);
  const tokamakLowFieldOpacity = PNG.sync.read(await page.locator('.frc-scene canvas').screenshot());
  await fieldVolumeOpacityControl.fill('0.3');
  await page.waitForTimeout(screenshotSettleMs);
  const tokamakHighFieldOpacity = PNG.sync.read(await page.locator('.frc-scene canvas').screenshot());
  assert.ok(meanColorDistance(tokamakLowFieldOpacity, tokamakHighFieldOpacity) > 0.1, 'tokamak separatrix opacity should visibly respond to its control');
  await fieldVolumeOpacityControl.fill('0.06');
  await scaleControl.fill('1');
  for (const name of ancillaryFlowControls) await setFrcControl(page, name, true);

  await selectParam(page, 'Vessel shape', 'stellarator');
  assert.match(await page.getByRole('combobox', { name: 'Vessel shape' }).innerText(), /^Stellarator torus/);
  assert.match(await page.getByRole('combobox', { name: 'Device configuration' }).innerText(), /^Stellarator magnetic-confinement study/);
  assert.match(await page.getByRole('combobox', { name: 'Excitation architecture' }).innerText(), /^Stellarator-like helical loop study/);
  assert.match(await page.locator('.frc-status').innerText(), /STELLARATOR \/ REDUCED TOROIDAL STUDY[\s\S]*TOROIDAL GUIDE FIELD/);
  await assertFrcControlsAvailable(page, deviceAncillaryControls);
  assert.equal(await page.locator('.frc-device-label strong').filter({ hasText: 'Plasma' }).isVisible(), true);
  assert.equal(await page.locator('.frc-input-label strong').isVisible(), true);
  await assertPlasmaAndFuelLabelsDoNotOverlap(page);
  await uncheckFrcControls(page, ancillaryFlowControls);
  await page.waitForTimeout(screenshotSettleMs);
  const stellaratorView = await captureReactorView(page);
  assert.ok(meanColorDistance(tokamakView, stellaratorView) > 1, 'stellarator vessel should visibly differ from the tokamak vessel');
  assert.equal(await page.getByRole('checkbox', { name: 'Plasma particles' }).isChecked(), true);
  assert.equal(await toroidalPlasmaTubeToggle.isChecked(), false);
  await toroidalPlasmaTubeToggle.check();
  await toroidalPlasmaTubeOpacity.fill('0.75');
  assert.equal(await toroidalPlasmaTubeOpacity.inputValue(), '0.75');
  await toroidalPlasmaTubeToggle.uncheck();
  await transparencyControl.fill('0.06');
  await page.waitForTimeout(screenshotSettleMs);
  const stellaratorLowTransparency = PNG.sync.read(await page.locator('.frc-scene canvas').screenshot());
  await transparencyControl.fill('0.34');
  await page.waitForTimeout(screenshotSettleMs);
  const stellaratorHighTransparency = PNG.sync.read(await page.locator('.frc-scene canvas').screenshot());
  assert.ok(meanColorDistance(stellaratorLowTransparency, stellaratorHighTransparency) > 0.1, 'stellarator shell should respond to vessel transparency');
  await transparencyControl.fill('0.18');
  await fieldVolumeOpacityControl.fill('0.3');
  assert.equal(await fieldVolumeOpacityControl.inputValue(), '0.3');
  await fieldVolumeOpacityControl.fill('0.06');
  for (const name of ancillaryFlowControls) await setFrcControl(page, name, true);

  await selectParam(page, 'Vessel shape', 'elongated');
  assert.match(await page.getByRole('combobox', { name: 'Vessel shape' }).innerText(), /^Elongated FRC/);
  assert.match(await page.getByRole('combobox', { name: 'Device configuration' }).innerText(), /^Field-reversed theta pinch/);
  assert.match(await page.getByRole('combobox', { name: 'Excitation architecture' }).innerText(), /^Axial reference drive/);
  assert.ok(await page.getByText('FIELD REVERSAL', { exact: true }).isVisible());
  for (const name of deviceAncillaryControls) {
    const control = page.getByRole('checkbox', { name });
    assert.equal(await control.isChecked(), true, `${name} should retain its FRC setting`);
    assert.equal(await control.isDisabled(), false, `${name} should be available for FRC devices`);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await selectParam(page, 'Vessel shape', 'tokamak');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await assertPlasmaAndFuelLabelsDoNotOverlap(page);
  await page.getByRole('button', { name: 'Hide params' }).first().click();
  await page.waitForTimeout(screenshotSettleMs);
  const mobileTokamakView = PNG.sync.read(await page.locator('.frc-scene canvas').screenshot());
  await page.getByRole('button', { name: 'Show params' }).click();
  await selectParam(page, 'Vessel shape', 'stellarator');
  await assertPlasmaAndFuelLabelsDoNotOverlap(page);
  await page.getByRole('button', { name: 'Hide params' }).first().click();
  await page.waitForTimeout(screenshotSettleMs);
  const mobileStellaratorView = PNG.sync.read(await page.locator('.frc-scene canvas').screenshot());
  assert.ok(meanColorDistance(mobileTokamakView, mobileStellaratorView) > 1, 'mobile toroidal vessel views should remain visually distinct');
  assert.deepEqual(runtimeErrors, []);
});

test('FRC reactor is parallel to the ground by default and resettable', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /04 \/ LOAD FIELD/ }).click();
  await page.locator('.frc-panel').waitFor();
  await page.waitForSelector('canvas');
  await page.waitForTimeout(1200);
  await uncheckFrcControls(page, ['Run plasma transport', 'Plasma particles', 'Nitrogen gas flow', 'Charge flow', 'Input particle streams', 'Input names', 'Input attributes', 'Device annotations', 'Device attributes']);

  const roll = page.getByRole('slider', { name: 'Roll' });
  const pitch = page.getByRole('slider', { name: 'Pitch' });
  const yaw = page.getByRole('slider', { name: 'Yaw' });
  assert.deepEqual(await Promise.all([roll.inputValue(), pitch.inputValue(), yaw.inputValue()]), ['0', '0', '0']);
  assert.deepEqual(await page.locator('.frc-range-ticks').evaluateAll((elements) => elements.map((element) => element.children.length)), [9, 9, 9]);
  await roll.fill('42');
  assert.equal(await roll.inputValue(), '45');
  await roll.fill('52');
  assert.equal(await roll.inputValue(), '52');
  await roll.fill('0');
  await page.waitForTimeout(1500);
  const defaultView = await captureReactorView(page);

  await page.getByRole('button', { name: 'Hide params' }).first().click();
  await page.waitForTimeout(1500);
  const centeredView = await captureReactorView(page);
  assert.ok(countChangedPixels(defaultView, centeredView) > 1000, 'hiding params should reframe the reactor away from the panel');
  await page.getByRole('button', { name: 'Show params' }).click();
  const restoredPanelView = await waitForMatchingReactorView(page, defaultView);
  assert.ok(meanColorDistance(defaultView, restoredPanelView) < 5, 'showing params should restore the panel-aware reactor framing');

  await roll.fill('28');
  await pitch.fill('-14');
  await yaw.fill('19');
  await page.waitForTimeout(180);
  const imbalancedView = await captureReactorView(page);
  assert.ok(countChangedPixels(defaultView, imbalancedView) > 1000, 'reactor screenshot should change when operational imbalance is applied');

  await page.getByRole('button', { name: 'Reset parallel to ground' }).click();
  assert.deepEqual(await Promise.all([roll.inputValue(), pitch.inputValue(), yaw.inputValue()]), ['0', '0', '0']);
  const resetView = await waitForMatchingReactorView(page, defaultView);
  const resetDifference = meanColorDistance(defaultView, resetView);
  assert.ok(resetDifference < 5, `reset reactor should visually match the parallel default (mean color distance: ${resetDifference})`);
  await page.screenshot({ path: parallelScreenshotPath, fullPage: false });
});

test('FRC plasma is visible inside the reactor and uses input-specific colors', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /04 \/ LOAD FIELD/ }).click();
  await page.locator('.frc-panel').waitFor();
  await page.waitForSelector('canvas');
  await page.waitForTimeout(1200);

  const plasmaColorInput = page.getByRole('textbox', { name: 'Plasma color' });
  assert.equal(await plasmaColorInput.inputValue(), '#ff4fa3');
  await page.waitForTimeout(screenshotSettleMs);
  const pinkPixels = countPinkPixels(await page.locator('.frc-scene canvas').screenshot());
  assert.ok(pinkPixels > 40, `expected pink plasma pixels inside the reactor, found ${pinkPixels}`);

  await selectParam(page, 'Plasma input', 'Argon');
  assert.equal(await plasmaColorInput.inputValue(), '#5ed9e8');
  await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
  await page.waitForTimeout(screenshotSettleMs);
  await page.screenshot({ path: plasmaColorsScreenshotPath, fullPage: false });
});

test('FRC gas and charge particles are visible in their conduit flows', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 1 });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /04 \/ LOAD FIELD/ }).click();
  await page.locator('.frc-panel').waitFor();
  await page.waitForSelector('canvas');
  await page.waitForTimeout(250 + screenshotSettleMs);
  await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });

  const gasToggle = page.getByRole('checkbox', { name: 'Nitrogen gas flow' });
  const chargeToggle = page.getByRole('checkbox', { name: 'Charge flow' });
  const inputMasterToggle = page.getByRole('checkbox', { name: 'Input particle streams' });
  const dtToggle = page.getByRole('checkbox', { name: 'DT particles' });
  const dhe3Toggle = page.getByRole('checkbox', { name: 'DHe_3 particles' });
  const argonToggle = page.getByRole('checkbox', { name: 'Argon particles' });
  const inputNamesToggle = page.getByRole('checkbox', { name: 'Input names' });
  const inputAttributesToggle = page.getByRole('checkbox', { name: 'Input attributes' });
  const harnessToggle = page.getByRole('checkbox', { name: 'Energy capture harness' });
  const outputManifoldToggle = page.getByRole('checkbox', { name: 'Output manifold' });
  const nitrogenOutputToggle = page.getByRole('checkbox', { name: 'Nitrogen purge' });
  const heliumOutputToggle = page.getByRole('checkbox', { name: 'Helium alpha product' });
  const neutronOutputToggle = page.getByRole('checkbox', { name: 'Neutron flux' });
  assert.equal(await gasToggle.isChecked(), true);
  assert.equal(await chargeToggle.isChecked(), true);
  assert.equal(await inputMasterToggle.isChecked(), true);
  assert.equal(await dtToggle.isChecked(), true);
  assert.equal(await dhe3Toggle.isChecked(), false);
  assert.equal(await argonToggle.isChecked(), false);
  assert.equal(await dhe3Toggle.isDisabled(), true);
  assert.equal(await argonToggle.isDisabled(), true);
  assert.equal(await harnessToggle.isChecked(), true);
  assert.equal(await outputManifoldToggle.isChecked(), true);
  assert.equal(await nitrogenOutputToggle.isChecked(), true);
  assert.equal(await heliumOutputToggle.isChecked(), true);
  assert.equal(await neutronOutputToggle.isChecked(), true);
  assert.equal(await page.getByRole('slider', { name: 'Helium output speed' }).inputValue(), '1');
  assert.equal(await page.getByRole('slider', { name: 'Neutron output speed' }).inputValue(), '1');
  assert.equal(await page.locator('.frc-input-label strong').count(), 1);
  assert.equal(await page.locator('.frc-device-label strong').count(), 6);
  const allAnnotationsToggle = page.getByRole('checkbox', { name: 'Turn off all annotations' });
  assert.equal(await allAnnotationsToggle.isChecked(), false);
  await allAnnotationsToggle.check();
  assert.equal(await page.locator('.frc-device-label strong').count(), 0);
  assert.equal(await page.locator('.frc-input-label strong').count(), 0);
  assert.equal(await page.getByRole('checkbox', { name: 'Plasma metrics' }).isDisabled(), true);
  await allAnnotationsToggle.uncheck();
  assert.equal(await page.locator('.frc-device-label strong').count(), 6);
  assert.ok(await page.getByText(/Deuterium-tritium fuel/).count() > 0);

  await selectParam(page, 'Plasma input', 'DHe_3');
  await waitForInputAnnotation(page, 'DHe_3');
  assert.equal(await dtToggle.isChecked(), false);
  assert.equal(await dhe3Toggle.isChecked(), true);
  assert.equal(await argonToggle.isChecked(), false);
  assert.equal(await dtToggle.isDisabled(), true);
  assert.equal(await dhe3Toggle.isDisabled(), false);
  assert.equal(await argonToggle.isDisabled(), true);
  assert.deepEqual(await page.locator('.frc-input-label strong').allTextContents(), ['DHe_3']);
  assert.equal(await page.locator('.frc-device-label strong').count(), 6);

  await selectParam(page, 'Plasma input', 'Argon');
  await waitForInputAnnotation(page, 'Argon');
  assert.equal(await dtToggle.isChecked(), false);
  assert.equal(await dhe3Toggle.isChecked(), false);
  assert.equal(await argonToggle.isChecked(), true);
  assert.equal(await heliumOutputToggle.isChecked(), false);
  assert.equal(await neutronOutputToggle.isChecked(), false);
  assert.equal(await heliumOutputToggle.isDisabled(), true);
  assert.equal(await neutronOutputToggle.isDisabled(), true);
  assert.deepEqual(await page.locator('.frc-input-label strong').allTextContents(), ['Argon']);
  assert.equal(await page.locator('.frc-device-label strong').count(), 4);

  await selectParam(page, 'Plasma input', 'DT');
  await waitForInputAnnotation(page, 'DT');
  assert.equal(await dtToggle.isChecked(), true);
  assert.equal(await dhe3Toggle.isChecked(), false);
  assert.equal(await argonToggle.isChecked(), false);
  assert.equal(await heliumOutputToggle.isChecked(), true);
  assert.equal(await neutronOutputToggle.isChecked(), true);

  const roll = page.getByRole('slider', { name: 'Roll' });
  const pitch = page.getByRole('slider', { name: 'Pitch' });
  const yaw = page.getByRole('slider', { name: 'Yaw' });
  await roll.fill('28');
  await pitch.fill('-14');
  await yaw.fill('19');
  assert.deepEqual(await Promise.all([roll.inputValue(), pitch.inputValue(), yaw.inputValue()]), ['28', '-14', '19']);
  await page.getByRole('button', { name: 'Reset parallel to ground' }).click();
  assert.deepEqual(await Promise.all([roll.inputValue(), pitch.inputValue(), yaw.inputValue()]), ['0', '0', '0']);

  await setFrcControl(page, 'Nitrogen purge', false);
  assert.equal(await nitrogenOutputToggle.isChecked(), false);
  await setFrcControl(page, 'Nitrogen purge', true);
  await harnessToggle.uncheck();
  assert.equal(await page.locator('.frc-device-label strong').count(), 4);
  await harnessToggle.check();
  await outputManifoldToggle.uncheck();
  assert.equal(await page.locator('.frc-device-label strong').count(), 3);
  await outputManifoldToggle.check();

  await uncheckFrcControls(page, ['Run plasma transport', 'Plasma particles']);
  await page.waitForTimeout(screenshotSettleMs);
  const bothVisible = await captureScreenshot(page);
  await page.waitForTimeout(180);
  await page.waitForTimeout(screenshotSettleMs);
  const bothMoved = await captureScreenshot(page);
  assert.ok(countChangedPixels(bothVisible, bothMoved) > 100, 'flow particles should visibly move through the conduits');

  await page.getByRole('button', { name: 'Hide params' }).first().click();
  await page.waitForTimeout(180);
  await page.waitForTimeout(screenshotSettleMs);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  await page.getByRole('button', { name: 'Show params' }).click();

  await setFrcControl(page, 'DT particles', false);
  await page.waitForTimeout(180 + screenshotSettleMs);
  const dtHidden = await captureScreenshot(page);
  assert.ok(countChangedPixels(bothMoved, dtHidden) > 100, 'DT particle pixels should change when DT input is disabled');

  await selectParam(page, 'Plasma input', 'DHe_3');
  await waitForInputAnnotation(page, 'DHe_3');
  await setFrcControl(page, 'DHe_3 particles', false);
  await page.waitForTimeout(180 + screenshotSettleMs);
  const dhe3Hidden = await captureScreenshot(page);
  assert.ok(countChangedPixels(dtHidden, dhe3Hidden) > 100, 'DHe_3 selection and particle visibility should change the scene');
  assert.equal(await dhe3Toggle.isChecked(), false);
  assert.equal(await argonToggle.isChecked(), false);

  await selectParam(page, 'Plasma input', 'Argon');
  await waitForInputAnnotation(page, 'Argon');
  await setFrcControl(page, 'Argon particles', false);
  await page.waitForTimeout(180 + screenshotSettleMs);
  const allInputsHidden = await captureScreenshot(page);
  assert.ok(countChangedPixels(dhe3Hidden, allInputsHidden) > 100, 'Argon selection and particle visibility should change the scene');
  assert.equal(await argonToggle.isChecked(), false);

  await setFrcControl(page, 'Input names', false);
  await page.waitForFunction(() => document.querySelectorAll('.frc-input-label strong').length === 0);
  assert.equal(await page.locator('.frc-input-label strong').count(), 0);
  await setFrcControl(page, 'Input attributes', false);
  await page.waitForFunction(() => document.querySelectorAll('.frc-input-label').length === 0);
  assert.equal(await page.locator('.frc-input-label').count(), 0);
  await setFrcControl(page, 'Input particle streams', false);
  assert.equal(await inputMasterToggle.isChecked(), false);

  await setFrcControl(page, 'Nitrogen gas flow', false);
  await page.waitForTimeout(180 + screenshotSettleMs);
  const gasHidden = await captureScreenshot(page);
  assert.ok(countChangedPixels(bothMoved, gasHidden) > 100, 'gas particle pixels should change when gas flow is disabled');
  assert.equal(await chargeToggle.isChecked(), true);

  await setFrcControl(page, 'Charge flow', false);
  await page.waitForTimeout(180 + screenshotSettleMs);
  const bothHidden = await captureScreenshot(page);
  assert.ok(countChangedPixels(gasHidden, bothHidden) > 100, 'charge particle pixels should change when charge flow is disabled');
});
