import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const baseUrl = process.env.BASE_URL ?? 'http://localhost:5173/';
const expectedDefaultParticleCount = new URL(baseUrl).searchParams.has('e2e') ? '2048' : '4096';

function countParticlePixels(buffer) {
  const image = PNG.sync.read(buffer);
  let count = 0;
  for (let index = 0; index < image.data.length; index += 4) {
    const red = image.data[index];
    const green = image.data[index + 1];
    const blue = image.data[index + 2];
    const brightness = Math.max(red, green, blue);
    const colorSpread = brightness - Math.min(red, green, blue);
    if (brightness > 105 && colorSpread > 35) count += 1;
  }
  return count;
}

function countChangedPixels(beforeBuffer, afterBuffer) {
  const before = PNG.sync.read(beforeBuffer);
  const after = PNG.sync.read(afterBuffer);
  assert.equal(before.width, after.width);
  assert.equal(before.height, after.height);
  let count = 0;
  for (let index = 0; index < before.data.length; index += 4) {
    const difference = Math.abs(before.data[index] - after.data[index])
      + Math.abs(before.data[index + 1] - after.data[index + 1])
      + Math.abs(before.data[index + 2] - after.data[index + 2]);
    if (difference > 30) count += 1;
  }
  return count;
}

async function selectParam(page, label, value, scope = page) {
  await scope.getByRole('combobox', { name: label }).click();
  await page.locator(`[role="option"][data-value="${value}"]`).click();
}

async function exerciseRangeSliders(container) {
  const sliders = container.locator('input[type="range"]');
  const sliderCount = await sliders.count();
  assert.ok(sliderCount > 0, 'expected wave parameter sliders');
  for (let index = 0; index < sliderCount; index += 1) {
    const slider = sliders.nth(index);
    const before = Number(await slider.inputValue());
    const maximum = Number(await slider.getAttribute('max'));
    const minimum = Number(await slider.getAttribute('min'));
    await slider.focus();
    const endpointKey = Math.abs(before - maximum) > 0.000001 ? 'End' : 'Home';
    await slider.press(endpointKey);
    let after = Number(await slider.inputValue());
    if (after === before) {
      await slider.press(endpointKey);
      after = Number(await slider.inputValue());
    }
    assert.notEqual(after, before, `wave parameter slider ${index} should change value`);
    assert.ok(after >= minimum && after <= maximum, `wave parameter slider ${index} should stay within bounds`);
  }
  return sliderCount;
}

test('wave interference renders visible particles after mode changes', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(() => localStorage.clear());

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /01 \/ LOAD FIELD/ }).click();
  await page.locator('.wave-panel').waitFor();
  await page.waitForTimeout(600);

  const sceneClip = { x: 0, y: 140, width: 1120, height: 560 };
  const initialPixels = countParticlePixels(await page.screenshot({ clip: sceneClip }));
  assert.ok(initialPixels > 500, `expected visible wave particles, found ${initialPixels} colored pixels`);

  await selectParam(page, 'Source preset', 'continuous-wave-laser-helical-pair');
  assert.match(await page.getByRole('combobox', { name: 'Source preset' }).textContent(), /laser/i);
  assert.equal(await page.locator('.wave-editor').count(), 3);
  await selectParam(page, 'Named state', 'Mixed phase field');
  assert.equal(await page.locator('.wave-editor').count(), 6);
  await selectParam(page, 'Occlusion map', 'pinhole');
  assert.match(await page.getByRole('combobox', { name: 'Occlusion map' }).textContent(), /pinhole/i);
  assert.equal(await page.locator('.wave-scene').getAttribute('data-occlusion-preset'), 'pinhole');
  await selectParam(page, 'Occlusion map', 'none');

  const firstWaveEditor = page.locator('.wave-editor').first();
  const vectorControls = firstWaveEditor.locator('.wave-vector-control');
  assert.equal(await vectorControls.count(), 3);
  assert.equal(await vectorControls.nth(0).locator('input').count(), 3);
  assert.equal(await vectorControls.nth(1).locator('input').count(), 3);
  assert.equal(await vectorControls.nth(2).locator('input').count(), 3);
  await vectorControls.nth(0).locator('input').nth(0).fill('2');
  await vectorControls.nth(1).locator('input').nth(2).fill('0.5');
  await vectorControls.nth(2).locator('input').nth(1).fill('0.5');
  assert.equal(await vectorControls.nth(0).locator('input').nth(0).inputValue(), '2');
  assert.equal(await vectorControls.nth(1).locator('input').nth(2).inputValue(), '0.5');
  assert.equal(await vectorControls.nth(2).locator('input').nth(1).inputValue(), '0.5');
  const waveSliderCount = await exerciseRangeSliders(firstWaveEditor);
  assert.equal(waveSliderCount, 14, 'wave editor should expose every base wave parameter slider');
  await selectParam(page, 'Polarization', 'EM-Tensor-Gaussian', firstWaveEditor);
  const beamWaist = firstWaveEditor.getByLabel('Beam waist');
  assert.equal(await beamWaist.inputValue(), '6');
  await beamWaist.fill('3');
  assert.equal(await beamWaist.inputValue(), '3');
  await beamWaist.focus();
  await beamWaist.press('ArrowRight');
  assert.equal(await beamWaist.inputValue(), '3.1');
  const orbitControls = page.getByLabel('Allow moving camera');
  assert.equal(await orbitControls.isChecked(), true);
  await orbitControls.uncheck();
  assert.equal(await orbitControls.isChecked(), false);
  assert.equal(await page.locator('.wave-scene').getAttribute('data-orbit-controls'), 'false');
  await orbitControls.check();
  assert.equal(await page.locator('.wave-scene').getAttribute('data-orbit-controls'), 'true');
  const sourceVectors = page.getByLabel('Source vectors visible');
  assert.equal(await sourceVectors.isChecked(), true);
  assert.equal(await page.locator('.wave-scene').getAttribute('data-source-vectors'), 'true');
  await sourceVectors.uncheck();
  assert.equal(await sourceVectors.isChecked(), false);
  assert.equal(await page.locator('.wave-scene').getAttribute('data-source-vectors'), 'false');
  await sourceVectors.check();
  assert.equal(await page.locator('.wave-scene').getAttribute('data-source-vectors'), 'true');
  const paramsToggle = page.getByRole('button', { name: 'Hide params', exact: true });
  assert.equal(await paramsToggle.getAttribute('aria-pressed'), 'true');
  await paramsToggle.click();
  assert.equal(await page.locator('.wave-panel').isVisible(), false);
  const showParams = page.getByRole('button', { name: 'Show params', exact: true });
  assert.equal(await showParams.getAttribute('aria-pressed'), 'false');
  await showParams.click();
  assert.equal(await page.locator('.wave-panel').isVisible(), true);
  await page.waitForTimeout(150);

  const doubleSidedField = page.getByLabel('Double-sided field');
  assert.equal(await doubleSidedField.isChecked(), true);
  await doubleSidedField.uncheck();
  assert.equal(await doubleSidedField.isChecked(), false);
  await page.waitForTimeout(150);
  const frontSidePixels = countParticlePixels(await page.screenshot({ clip: sceneClip }));
  assert.ok(frontSidePixels > 500, `expected visible particles with single-sided field, found ${frontSidePixels} colored pixels`);
  await doubleSidedField.check();
  assert.equal(await doubleSidedField.isChecked(), true);
  await page.waitForTimeout(150);
  const doubleSidePixels = countParticlePixels(await page.screenshot({ clip: sceneClip }));
  assert.ok(doubleSidePixels > 500, `expected visible particles with double-sided field, found ${doubleSidePixels} colored pixels`);

  const modes = page.locator('.wave-interference-mode input');
  await modes.nth(0).check();
  await page.waitForTimeout(250);
  const combinedPixels = countParticlePixels(await page.screenshot({ clip: sceneClip }));
  assert.ok(combinedPixels > 500, `expected particles with both interference layers, found ${combinedPixels} colored pixels`);

  const particleCount = page.locator('.wave-range-control').filter({ hasText: 'Particle count' }).locator('input');
  assert.equal(await particleCount.inputValue(), expectedDefaultParticleCount);
  await particleCount.fill('1024');
  await page.waitForTimeout(250);
  assert.equal(await page.locator('.wave-scene').getAttribute('data-particle-count'), '1024');
  const reducedCountPixels = countParticlePixels(await page.screenshot({ clip: sceneClip }));
  assert.ok(reducedCountPixels > 100, `expected visible particles at reduced count, found ${reducedCountPixels} colored pixels`);

  const removeButton = page.locator('.wave-remove-button').first();
  const beforeCancel = await page.locator('.wave-editor').count();
  page.once('dialog', (dialog) => dialog.dismiss());
  await removeButton.click();
  assert.equal(await page.locator('.wave-editor').count(), beforeCancel, 'cancelled removal should keep the wave');
  page.once('dialog', (dialog) => dialog.accept());
  await removeButton.click();
  assert.equal(await page.locator('.wave-editor').count(), beforeCancel - 1, 'confirmed removal should remove one wave');
  while (await page.locator('.wave-editor').count() > 1) {
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('.wave-remove-button').first().click();
  }
  assert.equal(await page.locator('.wave-remove-button').count(), 1);
  assert.equal(await page.locator('.wave-remove-button').first().isDisabled(), true, 'the final active wave should not be removable');
  assert.deepEqual(pageErrors, [], `wave simulator reported page errors: ${pageErrors.join('; ')}`);
});

test('wave visualization moves with orbit drag and wheel zoom', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(() => localStorage.clear());

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /01 \/ LOAD FIELD/ }).click();
  await page.locator('.wave-panel').waitFor();
  await page.getByRole('button', { name: 'Hide params', exact: true }).click();
  assert.equal(await page.locator('.wave-panel').isVisible(), false);
  assert.equal(await page.locator('.wave-scene').getAttribute('data-orbit-controls'), 'true');
  await page.locator('.wave-run-toggle').click();
  const canvas = page.locator('.wave-scene canvas');
  await canvas.waitFor();
  await page.waitForTimeout(300);

  const canvasBox = await canvas.boundingBox();
  assert.ok(canvasBox, 'wave canvas should have a visible bounding box');
  const interactionPoint = {
    x: canvasBox.x + canvasBox.width * 0.35,
    y: canvasBox.y + canvasBox.height * 0.48
  };
  const beforeDrag = await canvas.screenshot();
  await page.mouse.move(interactionPoint.x, interactionPoint.y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(interactionPoint.x + 180, interactionPoint.y + 60, { steps: 8 });
  await page.mouse.up({ button: 'left' });
  await page.waitForTimeout(200);
  const afterDrag = await canvas.screenshot();
  assert.ok(countChangedPixels(beforeDrag, afterDrag) > 1000, 'click-drag should move the rendered visualization');

  const beforeScroll = afterDrag;
  await page.mouse.move(interactionPoint.x, interactionPoint.y);
  await page.mouse.wheel(0, -500);
  await page.waitForTimeout(200);
  const afterScroll = await canvas.screenshot();
  assert.ok(countChangedPixels(beforeScroll, afterScroll) > 1000, 'scroll should zoom the rendered visualization');
  assert.deepEqual(pageErrors, [], `wave simulator reported page errors: ${pageErrors.join('; ')}`);
});

test('source direction edits point vectors and remain inspectable with orbit controls', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(() => localStorage.clear());

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /01 \/ LOAD FIELD/ }).click();
  await page.locator('.wave-panel').waitFor();
  await selectParam(page, 'Source preset', 'continuous-wave-laser');
  const sourceFrame = async () => JSON.parse(await page.locator('.wave-scene').getAttribute('data-source-frame'));
  assert.deepEqual((await sourceFrame()).origin, { x: -8, y: 0, z: 0 });
  assert.ok(Math.abs((await sourceFrame()).direction.x - 1) < 1e-12);
  assert.ok(Math.abs((await sourceFrame()).direction.y) < 1e-12);
  assert.ok(Math.abs((await sourceFrame()).direction.z) < 1e-12);

  const firstWaveEditor = page.locator('.wave-editor').first();
  const vectorControls = firstWaveEditor.locator('.wave-vector-control');
  await vectorControls.nth(0).locator('input').nth(0).fill('-6');
  await vectorControls.nth(1).locator('input').nth(0).fill('0');
  await vectorControls.nth(1).locator('input').nth(1).fill('1');
  await vectorControls.nth(1).locator('input').nth(2).fill('0');
  const editedFrame = await sourceFrame();
  assert.deepEqual(editedFrame.origin, { x: -6, y: 0, z: 0 });
  assert.ok(Math.abs(editedFrame.direction.x) < 1e-12);
  assert.ok(Math.abs(editedFrame.direction.y - 1) < 1e-12);
  assert.ok(Math.abs(editedFrame.direction.z) < 1e-12);

  await page.locator('.wave-run-toggle').click();
  const canvas = page.locator('.wave-scene canvas');
  const canvasBox = await canvas.boundingBox();
  assert.ok(canvasBox, 'wave canvas should have a visible bounding box');
  const interactionPoint = {
    x: canvasBox.x + canvasBox.width * 0.42,
    y: canvasBox.y + canvasBox.height * 0.45
  };
  const beforeOrbit = await canvas.screenshot();
  await page.mouse.move(interactionPoint.x, interactionPoint.y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(interactionPoint.x + 160, interactionPoint.y + 50, { steps: 8 });
  await page.mouse.up({ button: 'left' });
  await page.waitForTimeout(200);
  const afterOrbit = await canvas.screenshot();
  assert.ok(countChangedPixels(beforeOrbit, afterOrbit) > 1000, 'orbit drag should move the edited source visualization');
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(200);
  const afterZoom = await canvas.screenshot();
  assert.ok(countChangedPixels(afterOrbit, afterZoom) > 1000, 'wheel zoom should change the edited source visualization');
  assert.deepEqual(pageErrors, [], `wave simulator reported page errors: ${pageErrors.join('; ')}`);
});

test('source orbit control edits origin direction and rotation with pointer input', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(() => localStorage.clear());

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /01 \/ LOAD FIELD/ }).click();
  await page.locator('.wave-panel').waitFor();
  await selectParam(page, 'Source preset', 'continuous-wave-laser');
  const editor = page.locator('.wave-editor').first();
  const orbit = editor.locator('[aria-label="Wave 1 source orbit controls"]');
  for (const option of ['auto', 'above', 'below', 'outward', 'inward']) {
    await selectParam(page, 'Wave 1 parameter placement', option, editor);
    assert.match(await editor.locator('.wave-editor-workbench').getAttribute('class'), new RegExp(`placement-${option}`));
  }
  await selectParam(page, 'Wave 1 parameter placement', 'auto', editor);
  const pad = orbit.locator('.wave-source-orbit-pad');
  await pad.scrollIntoViewIfNeeded();
  const padBox = await pad.boundingBox();
  assert.ok(padBox, 'source orbit pad should have a visible bounding box');
  const center = { x: padBox.x + padBox.width * 0.5, y: padBox.y + padBox.height * 0.5 };
  assert.match(await page.evaluate(({ x, y }) => String(document.elementFromPoint(x, y)?.className || ''), center), /wave-source-orbit-pad|wave-source-orbit-crosshair/);
  const sourceFrame = async () => JSON.parse(await page.locator('.wave-scene').getAttribute('data-source-frame'));

  assert.equal(await orbit.getAttribute('data-source-orbit-mode'), 'direction');
  const initialDirection = (await sourceFrame()).direction;
  await page.mouse.move(center.x, center.y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(padBox.x + padBox.width * 0.75, center.y, { steps: 5 });
  await page.mouse.up({ button: 'left' });
  const direction = (await sourceFrame()).direction;
  assert.ok(Math.abs(direction.z - initialDirection.z) > 0.5, `direction drag should change propagation direction: ${JSON.stringify(initialDirection)} -> ${JSON.stringify(direction)}`);

  await orbit.getByRole('button', { name: 'Origin', exact: true }).click();
  const originBefore = (await sourceFrame()).origin;
  await page.mouse.move(center.x, center.y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(padBox.x + padBox.width * 0.8, padBox.y + padBox.height * 0.2, { steps: 5 });
  await page.mouse.up({ button: 'left' });
  const originAfter = (await sourceFrame()).origin;
  assert.ok(Math.abs(originAfter.x - originBefore.x) > 1, 'origin drag should change source X');
  assert.ok(Math.abs(originAfter.z - originBefore.z) > 1, 'origin drag should change source Z');

  await orbit.getByRole('button', { name: 'Rotation', exact: true }).click();
  const rotationInputs = editor.locator('.wave-vector-control').nth(2).locator('input');
  const rotationBefore = await rotationInputs.nth(0).inputValue();
  await page.mouse.move(center.x, center.y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(padBox.x + padBox.width * 0.65, padBox.y + padBox.height * 0.3, { steps: 5 });
  await page.mouse.up({ button: 'left' });
  assert.notEqual(await rotationInputs.nth(0).inputValue(), rotationBefore, 'rotation drag should change rotation X');
  assert.deepEqual(pageErrors, [], `wave simulator reported page errors: ${pageErrors.join('; ')}`);
});
