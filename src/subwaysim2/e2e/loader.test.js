import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.BASE_URL ?? 'http://localhost:5173/';

test('SIM LOADER scrolls its content inside the viewport', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 720 }, deviceScaleFactor: 1 });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('.sqg-loader').waitFor();

  const metrics = await page.locator('.sqg-loader').evaluate((loader) => {
    const footer = loader.querySelector('.sqg-loader-footer');
    const before = { clientHeight: loader.clientHeight, scrollHeight: loader.scrollHeight };
    loader.scrollTop = loader.scrollHeight;
    return {
      ...before,
      overflowY: getComputedStyle(loader).overflowY,
      scrollTop: loader.scrollTop,
      footerVisible: footer.getBoundingClientRect().bottom <= loader.getBoundingClientRect().bottom + 1
    };
  });

  assert.equal(metrics.overflowY, 'auto');
  assert.ok(metrics.scrollHeight > metrics.clientHeight);
  assert.ok(metrics.scrollTop > 0);
  assert.equal(metrics.footerVisible, true);
});

test('DDF loads as a distinct hypothesis model with comparison controls', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });

  await page.goto(`${baseUrl}?e2e=1`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /05 \/ LOAD FIELD/ }).click();
  await page.locator('.attractor-panel').waitFor();

  const model = page.getByRole('combobox', { name: 'Active model' });
  assert.match(await model.textContent(), /DDF hypothesis/);
  const comparison = page.getByRole('checkbox', { name: 'Show model difference' });
  assert.equal(await comparison.isChecked(), false);
  await comparison.click();
  await page.getByText(/Reference delta at 2 core radii:/).waitFor();
});

test('amplitude gravity lab exposes positive-cell and model-difference diagnostics', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

  await page.goto(`${baseUrl}?e2e=1`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /07 \/ LOAD FIELD/ }).click();
  await page.locator('.amplitude-panel').waitFor();
  await page.locator('canvas').waitFor();

  assert.match(await page.getByRole('combobox', { name: 'Gravity model' }).textContent(), /Spin-2 EFT tree proxy/);
  const pluckerResidual = Number(await page.getByText('Plücker residual').locator('..').locator('strong').textContent());
  assert.ok(Math.abs(pluckerResidual) < 1e-12, `expected a negligible Plücker residual, received ${pluckerResidual}`);
  const difference = page.getByRole('checkbox', { name: 'Show acceleration difference from Newtonian' });
  await difference.click();
  assert.equal(await difference.isChecked(), true);
  await page.waitForTimeout(500);
  assert.deepEqual(errors, []);
});
