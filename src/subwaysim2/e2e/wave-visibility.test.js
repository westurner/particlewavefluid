import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const baseUrl = process.env.BASE_URL ?? 'http://localhost:5173/';

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

test('wave interference renders visible particles after mode changes', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(() => localStorage.clear());

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /05 \/ LOAD FIELD/ }).click();
  await page.locator('.wave-panel').waitFor();
  await page.waitForTimeout(600);

  const sceneClip = { x: 0, y: 140, width: 1120, height: 560 };
  const initialPixels = countParticlePixels(await page.screenshot({ clip: sceneClip }));
  assert.ok(initialPixels > 500, `expected visible wave particles, found ${initialPixels} colored pixels`);

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
  assert.equal(await particleCount.inputValue(), '4096');
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
