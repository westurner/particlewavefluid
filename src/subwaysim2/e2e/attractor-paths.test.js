import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const baseUrl = new URL(process.env.BASE_URL ?? 'http://localhost:5173/');
baseUrl.searchParams.set('e2e', '1');
const particlePathUrl = new URL(process.env.BASE_URL ?? 'http://localhost:5173/');
particlePathUrl.searchParams.delete('e2e');
particlePathUrl.searchParams.set('particle-path-test', '1');

function cyanPathPixelIndices(buffer) {
  const image = PNG.sync.read(buffer);
  const indices = [];
  for (let index = 0; index < image.data.length; index += 4) {
    const red = image.data[index];
    const green = image.data[index + 1];
    const blue = image.data[index + 2];
    if (green > 100 && blue > 100 && green > red * 1.4 && blue > red * 1.3) indices.push(index / 4);
  }
  return indices;
}

function countRedParticlePixels(buffer) {
  const image = PNG.sync.read(buffer);
  let count = 0;
  for (let index = 0; index < image.data.length; index += 4) {
    const red = image.data[index];
    const green = image.data[index + 1];
    const blue = image.data[index + 2];
    if (red > 100 && red > green * 1.5 && red > blue * 1.3) count += 1;
  }
  return count;
}

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
    assert.equal(await page.getByRole('slider', { name: /^Attractor path duration/ }).inputValue(), '6', `${variant} should expose attractor path duration`);

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

test('particle paths do not change when displayed particle size changes', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(15000);

  await page.goto(particlePathUrl.toString(), { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /02 \/ LOAD FIELD/ }).evaluate((button) => button.click());
  await page.locator('.attractor-panel').waitFor({ state: 'visible' });
  await page.waitForTimeout(500);
  const gpuErrorElement = page.locator('.attractor-error');
  const gpuError = await gpuErrorElement.count() ? await gpuErrorElement.textContent() : '';
  if (gpuError) {
    t.skip(`GPU particle paths are unavailable: ${gpuError}`);
    return;
  }

  const setColor = async (label, value) => {
    const input = page.getByRole('textbox', { name: `${label} hex` });
    await input.fill(value);
    await input.press('Enter');
  };
  await setColor('Particle color A', '#ff3000');
  await setColor('Particle color B', '#ff3000');
  await setColor('Particle path color', '#00ffff');
  await page.getByRole('slider', { name: 'Particle path opacity' }).fill('1');
  await page.getByRole('slider', { name: 'Displayed particle size' }).fill('0.01');
  for (const label of ['Show coordinate axes', 'Show helper rings', 'Show transform controls']) {
    const checkbox = page.getByRole('checkbox', { name: label });
    if (await checkbox.isChecked()) await checkbox.evaluate((input) => input.click());
  }
  await page.getByRole('checkbox', { name: 'Show particle paths' }).evaluate((input) => input.click());
  await page.waitForTimeout(2000);
  await page.locator('.attractor-view-toolbar').getByRole('button', { name: 'Front' }).evaluate((button) => button.click());
  await page.waitForTimeout(1800);
  await page.getByRole('button', { name: 'Pause simulation' }).evaluate((button) => button.click());
  await page.waitForTimeout(150);

  const canvas = page.locator('canvas');
  const before = await canvas.screenshot({ type: 'png' });
  const beforePathPixels = cyanPathPixelIndices(before);
  assert.ok(beforePathPixels.length > 20, 'particle paths should be visibly rendered before the size change');
  const beforeParticlePixels = countRedParticlePixels(before);
  const particleSize = page.getByRole('slider', { name: 'Displayed particle size' });
  await particleSize.fill('0.1');
  assert.equal(await particleSize.inputValue(), '0.1');
  await page.waitForTimeout(100);
  const after = await canvas.screenshot({ type: 'png' });
  const afterPathPixels = cyanPathPixelIndices(after);
  const afterParticlePixels = countRedParticlePixels(after);
  const afterPathPixelSet = new Set(afterPathPixels);
  const sharedPixels = beforePathPixels.filter((index) => afterPathPixelSet.has(index)).length;
  const pathOverlap = sharedPixels / (beforePathPixels.length + afterPathPixels.length - sharedPixels);
  assert.ok(afterParticlePixels > beforeParticlePixels, 'the larger size should increase rendered particle coverage');
  assert.ok(pathOverlap >= 0.95, `changing particle size retained only ${(pathOverlap * 100).toFixed(1)}% path-pixel overlap`);
});
