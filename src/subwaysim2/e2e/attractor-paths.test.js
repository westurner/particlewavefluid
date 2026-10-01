import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = new URL(process.env.BASE_URL ?? 'http://localhost:5173/');
baseUrl.searchParams.set('e2e', '1');

test('attractor paths render after motion and are available in simple, SQG, and DDF labs', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(15000);

  for (const [cardName, variant] of [[/02 \/ LOAD FIELD/, 'simple'], [/03 \/ LOAD FIELD/, 'SQG'], [/05 \/ LOAD FIELD/, 'DDF']]) {
    await page.goto(baseUrl.toString(), { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: cardName }).click();
    await page.locator('.attractor-panel').waitFor({ state: 'visible' });
    assert.equal(await page.getByRole('checkbox', { name: 'Show attractor paths' }).isChecked(), false, `${variant} paths should default off`);
    assert.equal(await page.getByRole('slider', { name: /^Path duration/ }).inputValue(), '6', `${variant} should expose path duration`);

    if (variant === 'simple') {
      const pathToggle = page.getByRole('checkbox', { name: 'Show attractor paths' });
      await pathToggle.check();
      await page.locator('details.attractor-editor').first().locator('summary').click();
      await page.getByRole('spinbutton', { name: 'Attractor 0 position 0' }).fill('-4');
      await page.waitForTimeout(100);
      const withPath = await page.locator('canvas').screenshot({ type: 'png' });
      await pathToggle.uncheck();
      await page.waitForTimeout(50);
      const withoutPath = await page.locator('canvas').screenshot({ type: 'png' });
      assert.notDeepEqual(withPath, withoutPath, 'moving an attractor should render a visible path overlay');
    }
  }
});