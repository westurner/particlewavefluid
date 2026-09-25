import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.BASE_URL ?? 'http://localhost:5173/';
const e2eUrl = new URL(baseUrl);
e2eUrl.searchParams.set('e2e', '1');
const simulations = [
  { card: /01 \/ LOAD FIELD/, panel: '.wave-panel' },
  { card: /02 \/ LOAD FIELD/, panel: '.attractor-panel' },
  { card: /03 \/ LOAD FIELD/, panel: '.attractor-panel' },
  { card: /04 \/ LOAD FIELD/, panel: '.frc-panel' },
  { card: /05 \/ LOAD FIELD/, panel: '.telemetry-panel' }
];

test('Allow editing params shows text inputs in every simulation', async (t) => {
  for (const simulation of simulations) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
    try {
      page.setDefaultTimeout(15000);
      page.setDefaultNavigationTimeout(20000);
      await page.goto(e2eUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.getByRole('button', { name: simulation.card }).click({ timeout: 15000 });
      await page.locator(simulation.panel).waitFor({ state: 'visible', timeout: 15000 });
      assert.equal(await page.locator('.param-text-input:visible').count(), 0, `${simulation.card} should hide text inputs initially`);

      const toggle = page.getByRole('checkbox', { name: 'Allow editing params' });
      assert.equal(await toggle.isChecked(), false);
      await toggle.evaluate((element) => element.click());
      await page.waitForFunction(() => [...document.querySelectorAll('.param-text-input')]
        .some((element) => element.offsetParent !== null), { timeout: 15000 });
      assert.ok(await page.locator('.param-text-input:visible').count() > 0, `${simulation.card} should show text inputs when editing is enabled`);
    } catch (error) {
      throw new Error(`${simulation.card} did not expose an editable text input within the test budget`, { cause: error });
    } finally {
      await page.close();
      await browser.close();
    }
  }
});