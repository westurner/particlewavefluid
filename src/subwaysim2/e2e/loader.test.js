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
