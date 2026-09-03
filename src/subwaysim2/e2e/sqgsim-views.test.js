import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.BASE_URL ?? 'http://localhost:5173/';
const viewLabels = ['Front', 'Back', 'Left', 'Right', 'Ortho 1', 'Ortho 2', 'Orbital tracking'];

test('SQGSIM camera views and orbital tracking are selectable', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /02 \/ LOAD FIELD/ }).click();
  await page.waitForFunction(() => Boolean(document.querySelector('canvas')));
  const toolbar = page.locator('.attractor-view-toolbar');
  await toolbar.waitFor();
  assert.deepEqual(await toolbar.getByRole('button').allTextContents(), viewLabels);
  assert.equal(await toolbar.getByRole('button', { name: 'Ortho 1' }).getAttribute('aria-pressed'), 'true');

  await toolbar.getByRole('button', { name: 'Front' }).evaluate((button) => button.click());
  assert.equal(await toolbar.getByRole('button', { name: 'Front' }).getAttribute('aria-pressed'), 'true');
  assert.equal(await toolbar.getByRole('button', { name: 'Ortho 1' }).getAttribute('aria-pressed'), 'false');

  await toolbar.getByRole('button', { name: 'Orbital tracking' }).evaluate((button) => button.click());
  assert.equal(await toolbar.getByRole('button', { name: 'Orbital tracking' }).getAttribute('aria-pressed'), 'true');
  await page.waitForTimeout(250);
  assert.equal(await toolbar.getByRole('button', { name: 'Orbital tracking' }).getAttribute('aria-pressed'), 'true');

  await page.mouse.move(640, 500);
  await page.mouse.down();
  await page.mouse.move(760, 500, { steps: 4 });
  await page.mouse.up();
  assert.equal(await toolbar.getByRole('button', { name: 'Orbital tracking' }).getAttribute('aria-pressed'), 'false');
  assert.equal(await toolbar.locator('button.active').count(), 0);
});