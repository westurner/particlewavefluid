import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const baseUrl = process.env.BASE_URL ?? 'http://localhost:5173/';
const screenshotPath = new URL('../test-results/frc-flow-particles.png', import.meta.url).pathname;
const parallelScreenshotPath = new URL('../test-results/frc-reactor-parallel.png', import.meta.url).pathname;
const plasmaColorsScreenshotPath = new URL('../test-results/frc-plasma-colors.png', import.meta.url).pathname;

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
  const pinkPixels = countPinkPixels(await page.locator('.frc-scene canvas').screenshot());
  assert.ok(pinkPixels > 40, `expected pink plasma pixels inside the reactor, found ${pinkPixels}`);

  await page.getByRole('combobox', { name: 'Plasma input' }).selectOption('Argon');
  assert.equal(await plasmaColorInput.inputValue(), '#5ed9e8');
  await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
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
  await page.waitForTimeout(250);
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
  const plasmaInputSelect = page.getByRole('combobox', { name: 'Plasma input' });
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

  await plasmaInputSelect.selectOption('DHe_3');
  await waitForInputAnnotation(page, 'DHe_3');
  assert.equal(await dtToggle.isChecked(), false);
  assert.equal(await dhe3Toggle.isChecked(), true);
  assert.equal(await argonToggle.isChecked(), false);
  assert.equal(await dtToggle.isDisabled(), true);
  assert.equal(await dhe3Toggle.isDisabled(), false);
  assert.equal(await argonToggle.isDisabled(), true);
  assert.deepEqual(await page.locator('.frc-input-label strong').allTextContents(), ['DHe_3']);
  assert.equal(await page.locator('.frc-device-label strong').count(), 6);

  await plasmaInputSelect.selectOption('Argon');
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

  await plasmaInputSelect.selectOption('DT');
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
  const bothVisible = await captureScreenshot(page);
  await page.waitForTimeout(180);
  const bothMoved = await captureScreenshot(page);
  assert.ok(countChangedPixels(bothVisible, bothMoved) > 100, 'flow particles should visibly move through the conduits');

  await page.getByRole('button', { name: 'Hide params' }).first().click();
  await page.waitForTimeout(180);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  await page.getByRole('button', { name: 'Show params' }).click();

  await setFrcControl(page, 'DT particles', false);
  await page.waitForTimeout(180);
  const dtHidden = await captureScreenshot(page);
  assert.ok(countChangedPixels(bothMoved, dtHidden) > 100, 'DT particle pixels should change when DT input is disabled');

  await plasmaInputSelect.selectOption('DHe_3');
  await waitForInputAnnotation(page, 'DHe_3');
  await setFrcControl(page, 'DHe_3 particles', false);
  await page.waitForTimeout(180);
  const dhe3Hidden = await captureScreenshot(page);
  assert.ok(countChangedPixels(dtHidden, dhe3Hidden) > 100, 'DHe_3 selection and particle visibility should change the scene');
  assert.equal(await dhe3Toggle.isChecked(), false);
  assert.equal(await argonToggle.isChecked(), false);

  await plasmaInputSelect.selectOption('Argon');
  await waitForInputAnnotation(page, 'Argon');
  await setFrcControl(page, 'Argon particles', false);
  await page.waitForTimeout(180);
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
  await page.waitForTimeout(180);
  const gasHidden = await captureScreenshot(page);
  assert.ok(countChangedPixels(bothMoved, gasHidden) > 100, 'gas particle pixels should change when gas flow is disabled');
  assert.equal(await chargeToggle.isChecked(), true);

  await setFrcControl(page, 'Charge flow', false);
  await page.waitForTimeout(180);
  const bothHidden = await captureScreenshot(page);
  assert.ok(countChangedPixels(gasHidden, bothHidden) > 100, 'charge particle pixels should change when charge flow is disabled');
});
