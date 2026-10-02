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