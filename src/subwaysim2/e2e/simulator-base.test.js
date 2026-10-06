import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { parse as parseYaml } from 'yaml';

const baseUrl = process.env.BASE_URL ?? 'http://localhost:5173/';

test('Wave uses the shared simulator base for presets, JSON, and a valid edit journal', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

  const url = new URL(baseUrl);
  url.searchParams.set('e2e', '1');
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /01 \/ LOAD FIELD/ }).click();
  await page.locator('.wave-panel').waitFor({ state: 'visible' });

  assert.equal(await page.locator('.wave-topbar .simulator-base-brand b').textContent(), 'WAVE FIELD LAB');
  assert.equal(await page.locator('.wave-app').getAttribute('data-simulator-mode'), '3d');
  assert.match(await page.locator('.wave-topbar .simulator-base-brand em').textContent(), /Phase geometry/);
  assert.equal(await page.getByRole('link', { name: 'Lab menu' }).getAttribute('href'), '/');

  await page.locator('.wave-io-journal > summary').click();
  const showLog = page.getByRole('checkbox', { name: 'Show param edit log' });
  await showLog.check();
  const logArea = page.getByRole('textbox', { name: 'Parameter edit log YAML' });
  assert.deepEqual(parseYaml(await logArea.inputValue()), []);

  const snapshotName = `Browser snapshot ${Date.now()}`;
  await page.getByRole('textbox', { name: 'Snapshot name' }).fill(snapshotName);
  await page.getByRole('button', { name: 'Save snapshot' }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Run', exact: true }).count(), 1);
  const brightness = page.getByRole('slider', { name: /Detector brightness/ });
  await brightness.press('End');
  assert.equal(await brightness.inputValue(), '2.5');

  await page.getByRole('combobox', { name: 'Saved snapshot' }).click();
  await page.locator(`[role="option"][data-value="${snapshotName}"]`).click();
  await page.waitForFunction(() => document.querySelector('input[type="range"][max="2.5"]')?.value === '1');
  assert.equal(await page.getByRole('button', { name: 'Pause', exact: true }).count(), 1);
  assert.equal(await brightness.inputValue(), '1');

  const recordedLog = parseYaml(await logArea.inputValue());
  const brightnessEdit = recordedLog.find((entry) => entry.type === 'parameter-edit' && entry.path === 'detectorBrightness' && entry.newValue === 2.5);
  assert.ok(brightnessEdit, 'the log should retain old and new detector brightness values');
  assert.equal(brightnessEdit.oldValue, 1);
  assert.ok(Number.isFinite(brightnessEdit.offsetMs));
  assert.ok(recordedLog.some((entry) => entry.type === 'parameter-edit'));
  assert.ok(recordedLog.some((entry) => entry.type === 'preset-save'));

  const presetJson = page.getByRole('textbox', { name: 'Preset JSON' });
  const importedSnapshot = JSON.parse(await presetJson.inputValue());
  importedSnapshot.detectorBrightness = 1.25;
  await presetJson.fill(JSON.stringify(importedSnapshot));
  await page.getByRole('button', { name: 'Load JSON' }).click();
  await page.waitForFunction(() => document.querySelector('input[type="range"][max="2.5"]')?.value === '1.25');
  assert.equal(await brightness.inputValue(), '1.25');

  await page.locator('.simulator-replay-log > summary').click();
  await page.getByRole('slider', { name: /Playback speed/ }).fill('10');
  await page.getByRole('checkbox', { name: 'Ignore visualization config' }).check();
  await page.getByRole('checkbox', { name: 'Ignore camera config' }).check();
  await page.getByRole('textbox', { name: 'Parameter edit log YAML to replay' }).fill([
    '- type: parameter-edit',
    '  sequence: 1',
    '  offsetMs: 0',
    '  path: waveCount',
    '  oldValue: 6',
    '  newValue: 4',
    '  oldExists: true',
    '  newExists: true',
    '- type: parameter-edit',
    '  sequence: 2',
    '  offsetMs: 5',
    '  path: detectorBrightness',
    '  oldValue: 1',
    '  newValue: 2',
    '  oldExists: true',
    '  newExists: true',
    '- type: parameter-edit',
    '  sequence: 3',
    '  offsetMs: 10',
    '  path: cameraPosX',
    '  oldValue: 0',
    '  newValue: 5',
    '  oldExists: true',
    '  newExists: true'
  ].join('\n'));
  await page.getByRole('button', { name: 'Replay param log' }).click();
  await page.waitForFunction(() => document.querySelector('.wave-status')?.textContent.includes('4 wave slots'));
  assert.equal(await brightness.inputValue(), '1');
  assert.doesNotMatch(await presetJson.inputValue(), /cameraPosX/);
  assert.deepEqual(errors, []);
});

test('shared particle appearance controls reset to the current preset and clear changed paths', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const url = new URL(baseUrl);
  url.searchParams.set('e2e', '1');
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /01 \/ LOAD FIELD/ }).click();
  await page.locator('.wave-panel').waitFor({ state: 'visible' });

  const appearanceGroup = page.locator('.wave-control-section').filter({ has: page.locator('summary', { hasText: 'Particle appearance' }) });
  await appearanceGroup.locator('summary').click();
  const particleSize = appearanceGroup.getByRole('slider', { name: 'Particle size' });
  const particleOpacity = appearanceGroup.getByRole('slider', { name: 'Particle opacity' });
  await particleSize.fill('0.1');
  await particleOpacity.fill('0.5');
  const changedSummary = page.locator('.simulator-preset-change-summary > summary');
  await changedSummary.waitFor({ state: 'visible' });
  assert.match(await changedSummary.textContent(), /2 changed/);

  const resetGroup = appearanceGroup.getByRole('button', { name: 'Reset Particle appearance to current preset' });
  await resetGroup.click();
  const confirmGroup = appearanceGroup.getByRole('button', { name: 'Confirm Reset Particle appearance to current preset' });
  await confirmGroup.waitFor({ state: 'visible' });
  assert.equal(await particleSize.inputValue(), '0.1', 'opening confirmation must not apply the reset');
  assert.equal(await confirmGroup.evaluate((element) => document.activeElement === element), true, 'confirmation should receive keyboard focus');
  await confirmGroup.press('Escape');
  assert.equal(await resetGroup.evaluate((element) => document.activeElement === element), true, 'Escape should cancel and restore focus');
  assert.equal(await particleSize.inputValue(), '0.1');

  await resetGroup.click();
  await appearanceGroup.getByRole('button', { name: 'Confirm Reset Particle appearance to current preset' }).click();
  assert.equal(await particleSize.inputValue(), '0.075');
  assert.equal(await particleOpacity.inputValue(), '0.9');
  await changedSummary.waitFor({ state: 'detached' });

  await particleSize.fill('0.1');
  const resetSize = appearanceGroup.getByRole('button', { name: 'Reset Particle size to current preset' });
  await resetSize.click();
  const confirmSize = appearanceGroup.getByRole('button', { name: 'Confirm Reset Particle size to current preset' });
  await confirmSize.waitFor({ state: 'visible' });
  assert.equal(await particleSize.inputValue(), '0.1');
  await confirmSize.click();
  assert.equal(await particleSize.inputValue(), '0.075');

  await particleSize.fill('0.1');
  await changedSummary.click();
  const resetAll = page.getByRole('button', { name: 'Reset all to preset' });
  await resetAll.click();
  const confirmAll = page.getByRole('button', { name: 'Confirm Reset all to preset' });
  await confirmAll.waitFor({ state: 'visible' });
  assert.equal(await particleSize.inputValue(), '0.1');
  await confirmAll.click();
  assert.equal(await particleSize.inputValue(), '0.075');
  await changedSummary.waitFor({ state: 'detached' });
});

test('Attractor parameter logs include config values, offsets, and replay them', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

  const url = new URL(baseUrl);
  url.searchParams.set('e2e', '1');
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /02 \/ LOAD FIELD/ }).click();
  await page.locator('.attractor-panel').waitFor({ state: 'visible' });
  await page.locator('.simulator-io-journal > summary').click();
  await page.getByRole('checkbox', { name: 'Show param edit log' }).check();

  const massExponent = page.getByRole('slider', { name: /Attractor mass exponent/ });
  const initialValue = Number(await massExponent.inputValue());
  const nextValue = initialValue === 10 ? 9 : initialValue + 1;
  await massExponent.fill(String(nextValue));
  await page.waitForFunction((value) => document.querySelector('input[type="range"]').value === String(value), nextValue);

  const logYaml = page.getByRole('textbox', { name: 'Parameter edit log YAML' });
  const log = parseYaml(await logYaml.inputValue());
  const edit = log.find((entry) => entry.type === 'parameter-edit' && entry.path === 'attractorMassExponent' && entry.newValue === nextValue);
  assert.ok(edit);
  assert.equal(edit.oldValue, initialValue);
  assert.ok(Number.isFinite(edit.offsetMs));

  await massExponent.fill(String(initialValue));
  await page.locator('.simulator-replay-log > summary').click();
  const replay = page.getByRole('textbox', { name: 'Parameter edit log YAML to replay' });
  await replay.fill([
    '- type: parameter-edit',
    '  sequence: 1',
    '  offsetMs: 0',
    '  path: attractorMassExponent',
    `  oldValue: ${initialValue}`,
    `  newValue: ${nextValue}`,
    '  oldExists: true',
    '  newExists: true'
  ].join('\n'));
  await page.getByRole('button', { name: 'Replay param log' }).click();
  await page.waitForFunction((value) => {
    const control = [...document.querySelectorAll('.attractor-control')].find((element) => element.textContent.includes('Attractor mass exponent'));
    return control?.querySelector('input[type="range"]')?.value === String(value);
  }, nextValue);
  assert.deepEqual(errors, []);
});

test('Phase Signal uses SimulatorBase in non-3D mode without replacing its SVG workbench', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

  const url = new URL(baseUrl);
  url.searchParams.set('e2e', '1');
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /11 \/ LOAD FIELD/ }).click();

  const shell = page.locator('.signal-app');
  await shell.waitFor({ state: 'visible' });
  assert.equal(await shell.getAttribute('data-simulator-mode'), 'non-3d');
  assert.equal(await shell.locator('canvas').count(), 0);
  assert.equal(await shell.locator('svg[role="img"]').count(), 4);
  assert.equal(await page.getByRole('link', { name: 'Lab menu' }).getAttribute('href'), '/');
  await page.getByRole('button', { name: 'Hide params' }).click();
  assert.equal(await page.locator('.signal-panel').isVisible(), false);
  assert.equal(await page.getByRole('link', { name: 'Lab menu' }).isVisible(), true);
  assert.deepEqual(errors, []);
  await page.getByRole('link', { name: 'Lab menu' }).click();
  await page.locator('.sqg-loader').waitFor({ state: 'visible' });
});

test('Longitudinal laser array uses the shared 3D base and orbit controls', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

  const url = new URL(baseUrl);
  url.searchParams.set('e2e', '1');
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /12 \/ LOAD FIELD/ }).click();
  const app = page.locator('.laser-app');
  await app.waitFor({ state: 'visible' });
  assert.equal(await app.getAttribute('data-simulator-mode'), '3d');
  assert.equal(await page.locator('.laser-topbar .simulator-base-brand b').textContent(), 'LONGITUDINAL ARRAY');
  assert.equal(await page.getByRole('link', { name: 'Lab menu' }).getAttribute('href'), '/');
  assert.equal(await page.locator('.laser-scene canvas').count(), 1);
  const laserModules = page.locator('.laser-panel details.laser-module');
  assert.equal(await laserModules.count(), 6);
  const firstLaser = laserModules.first();
  assert.notEqual(await firstLaser.getAttribute('open'), null, 'the first laser module should start expanded');
  await firstLaser.locator('summary').click();
  await page.waitForFunction(() => !document.querySelector('.laser-panel details.laser-module')?.open);
  assert.equal(await firstLaser.getAttribute('open'), null);
  await firstLaser.locator('summary').click();
  await page.waitForFunction(() => document.querySelector('.laser-panel details.laser-module')?.open);
  assert.notEqual(await firstLaser.getAttribute('open'), null);
  assert.deepEqual(errors, []);
});

test('all 3D simulators expose perspectives and pauseable orbital tracking', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const url = new URL(baseUrl);
  url.searchParams.set('e2e', '1');
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });

  for (const index of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12]) {
    await page.getByRole('button', { name: new RegExp(`${String(index).padStart(2, '0')} \/ LOAD FIELD`) }).click();
    const toolbar = page.locator('nav[aria-label="Camera views"]');
    await toolbar.waitFor({ state: 'visible' });
    const front = toolbar.getByRole('button', { name: 'Front', exact: true });
    await front.click();
    assert.equal(await front.getAttribute('aria-pressed'), 'true', `simulator ${index} should select Front`);
    const orbital = toolbar.getByRole('button', { name: 'Orbital tracking', exact: true });
    await orbital.click();
    assert.equal(await orbital.getAttribute('aria-pressed'), 'true', `simulator ${index} should select orbital tracking`);
    const pauseOrbit = toolbar.getByRole('button', { name: 'Pause orbit', exact: true });
    assert.equal(await pauseOrbit.isVisible(), true, `simulator ${index} should show orbital pause`);
    await pauseOrbit.click();
    const playOrbit = toolbar.getByRole('button', { name: 'Play orbit', exact: true });
    assert.equal(await playOrbit.isVisible(), true, `simulator ${index} should show orbital play after pausing`);
    await playOrbit.click();
    assert.equal(await toolbar.getByRole('button', { name: 'Pause orbit', exact: true }).isVisible(), true);
    await page.getByRole('link', { name: 'Lab menu' }).click();
    await page.locator('.sqg-loader').waitFor({ state: 'visible' });
  }

  await page.getByRole('button', { name: /11 \/ LOAD FIELD/ }).click();
  assert.equal(await page.locator('.signal-app').getAttribute('data-simulator-mode'), 'non-3d');
  assert.equal(await page.locator('nav[aria-label="Camera views"]').count(), 0);
  assert.deepEqual(errors, []);
});