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

test('ParamSelect supports ArrowUp and ArrowDown option navigation and selection', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });

  await page.goto(`${baseUrl}?e2e=1`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /11 \/ LOAD FIELD/ }).evaluate((button) => button.click());
  await page.locator('.signal-panel').waitFor();

  const select = page.getByRole('combobox', { name: 'Synthetic case' });
  const initialValue = await select.textContent();
  await select.focus();
  await select.press('ArrowDown');
  assert.equal(await select.getAttribute('aria-expanded'), 'true');
  let activeOption = page.locator('.param-select-option[data-active="true"]');
  assert.equal(await activeOption.count(), 1);
  assert.equal(await select.getAttribute('aria-activedescendant'), await activeOption.getAttribute('id'));

  await select.press('ArrowDown');
  activeOption = page.locator('.param-select-option[data-active="true"]');
  const downSelection = await activeOption.textContent();
  assert.notEqual(downSelection, initialValue?.trim());
  await select.press('Enter');
  assert.match(await select.textContent(), new RegExp(downSelection.trim()));
  assert.equal(await select.getAttribute('aria-expanded'), 'false');
  assert.equal(await select.evaluate((element) => element === document.activeElement), true);

  await select.press('ArrowUp');
  assert.equal(await select.getAttribute('aria-expanded'), 'true');
  activeOption = page.locator('.param-select-option[data-active="true"]');
  const upSelection = await activeOption.textContent();
  assert.notEqual(upSelection, downSelection);
  await select.press('Enter');
  assert.match(await select.textContent(), new RegExp(upSelection.trim()));
  assert.equal(await select.getAttribute('aria-expanded'), 'false');
  assert.deepEqual(await page.locator('.param-select-menu').count(), 0);
});

test('attractor defaults to its baseline model and separates field from display orientation', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });

  await page.goto(`${baseUrl}?e2e=1`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /02 \/ LOAD FIELD/ }).evaluate((button) => button.click());
  await page.locator('.attractor-panel').waitFor();

  const activeModel = page.getByRole('combobox', { name: 'Active model' });
  const mechanicsEnabled = page.getByRole('checkbox', { name: 'Enable model mechanics' });
  assert.match(await activeModel.innerText(), /Default particle mechanics/);
  assert.equal(await mechanicsEnabled.isChecked(), true);
  await page.getByText(/All choices use the same per-particle GPU compute passes/).waitFor();
  assert.equal(await page.getByRole('checkbox', { name: 'Scale field boundary with camera zoom' }).count(), 1);

  await mechanicsEnabled.click();
  await activeModel.click();
  await page.getByRole('option', { name: 'NS compressible fluid' }).click();
  assert.equal(await mechanicsEnabled.isChecked(), false);
  assert.match(await activeModel.innerText(), /NS compressible fluid/);
  await page.getByText(/When disabled, the selected model is ignored/).waitFor();

  const fieldOrientation = page.getByRole('combobox', { name: 'Particle orientation' });
  await fieldOrientation.click();
  await page.getByRole('option', { name: 'XY plane' }).click();
  const displayOrientation = page.getByRole('combobox', { name: 'Particle display orientation' });
  await displayOrientation.click();
  await page.getByRole('option', { name: 'camera' }).click();
  assert.match(await fieldOrientation.innerText(), /XY plane/);
  assert.match(await displayOrientation.innerText(), /camera/);
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

  const starVisibility = page.getByRole('checkbox', { name: 'Show black-hole star splats' });
  assert.equal(await starVisibility.isChecked(), true);
  await starVisibility.click();
  assert.equal(await starVisibility.isChecked(), false);
  await starVisibility.click();
  assert.equal(await starVisibility.isChecked(), true);

  const starColor = page.getByRole('textbox', { name: 'Black-hole star color hex' });
  await starColor.fill('#ff55cc');
  await starColor.press('Enter');
  assert.equal(await starColor.inputValue(), '#ff55cc');

  const starOpacity = page.getByRole('slider', { name: /Black-hole star opacity/ });
  await starOpacity.focus();
  await starOpacity.press('End');
  assert.equal(await starOpacity.inputValue(), '1');
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

  const attractorModel = page.getByRole('combobox', { name: 'Attractor model' });
  assert.match(await attractorModel.textContent(), /Solar System/);
  await attractorModel.click();
  await page.getByRole('option', { name: 'Solar System + major moons' }).click();
  const inspectedBody = page.getByRole('combobox', { name: 'Inspect body' });
  await inspectedBody.click();
  await page.getByRole('option', { name: 'Io / Jupiter' }).click();
  assert.match(await page.locator('.amplitude-body-facts summary').textContent(), /Io/);
  assert.match(await page.getByText('JPL GM').locator('..').textContent(), /5959\.915 km³\/s²/);
  assert.equal(await page.getByRole('link', { name: 'JPL satellite GM table' }).getAttribute('href'), 'https://ssd.jpl.nasa.gov/sats/phys_par/');

  const diameterScale = page.getByRole('combobox', { name: 'Planet diameter scale' });
  await diameterScale.click();
  await page.getByRole('option', { name: 'Actual diameters' }).click();
  assert.equal(await page.getByRole('slider', { name: 'Illustrative planet size' }).count(), 0);
  await diameterScale.click();
  await page.getByRole('option', { name: 'Illustrative diameters' }).click();
  assert.equal(await page.getByRole('slider', { name: 'Illustrative planet size' }).count(), 1);

  const gravityModel = page.getByRole('combobox', { name: 'Gravity model' });
  await gravityModel.click();
  await page.getByRole('option', { name: 'GR (General Relativity)' }).click();
  assert.match(await page.locator('.amplitude-warning').textContent(), /pairwise two-body 1PN/);
  await gravityModel.click();
  await page.getByRole('option', { name: 'GR (Normed Tensor Gaussian Splatter)' }).click();
  assert.equal(await page.getByRole('slider', { name: 'GR splatter Gaussian waist' }).count(), 1);

  await page.getByRole('combobox', { name: 'Study mode' }).click();
  await page.getByRole('option', { name: 'Model an orbital path through the Solar System' }).click();
  await page.getByRole('button', { name: 'Launch' }).click();
  await inspectedBody.click();
  await page.getByRole('option', { name: 'Spacecraft / Earth' }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('combobox', { name: 'Historic mission path' }).click();
  await page.getByRole('option', { name: 'Voyager 2 · Grand Tour' }).click();
  assert.match(await page.locator('.amplitude-mission-note').textContent(), /schematic/);

  assert.match(await gravityModel.textContent(), /GR \(Normed Tensor Gaussian Splatter\)/);
  const pluckerResidual = Number(await page.getByText('Plücker residual').locator('..').locator('strong').textContent());
  assert.ok(Math.abs(pluckerResidual) < 1e-12, `expected a negligible Plücker residual, received ${pluckerResidual}`);
  const difference = page.getByRole('checkbox', { name: 'Show acceleration difference from Newtonian' });
  await difference.click();
  assert.equal(await difference.isChecked(), true);
  await page.waitForTimeout(500);
  assert.deepEqual(errors, []);
});

test('FTLE lab switches time direction and reports deformation telemetry', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });

  await page.goto(`${baseUrl}?e2e=1`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /08 \/ LOAD FIELD/ }).evaluate((button) => button.click());
  await page.locator('.ftle-panel').waitFor();
  await page.locator('canvas').waitFor();
  assert.match(await page.getByRole('combobox', { name: 'Time direction' }).textContent(), /Forward-time repulsion/);
  await page.getByRole('combobox', { name: 'Time direction' }).click();
  await page.locator('[role="option"][data-value="backward"]').click();
  assert.match(await page.getByRole('combobox', { name: 'Time direction' }).textContent(), /Backward-time attraction/);
  assert.match(await page.getByText('Trajectory samples').locator('..').locator('strong').textContent(), /121/);
  assert.ok(Number.isFinite(Number(await page.getByText('Max ridge confidence').locator('..').locator('strong').textContent())));
  await page.setViewportSize({ width: 390, height: 844 });
  const panel = await page.locator('.ftle-panel').boundingBox();
  assert.ok(panel);
  assert.ok(panel.x >= 0 && panel.y >= 0, `FTLE panel should start inside the mobile viewport: ${JSON.stringify(panel)}`);
  assert.ok(panel.x + panel.width <= 390 && panel.y + panel.height <= 844, `FTLE panel should fit the mobile viewport: ${JSON.stringify(panel)}`);
});

test('quantum fluid lab evolves synchronized models and exposes conservation telemetry', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

  await page.goto(`${baseUrl}?e2e=1`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /09 \/ LOAD FIELD/ }).evaluate((button) => button.click());
  await page.locator('.quantum-panel').waitFor();
  await page.locator('canvas').waitFor();
  await page.waitForTimeout(600);
  assert.match(await page.getByRole('combobox', { name: 'View' }).textContent(), /GPE \/ Euler-Korteweg/);
  assert.ok(Number.isFinite(Number(await page.getByText('Norm drift').locator('..').locator('strong').textContent())));
  assert.ok(Number.isFinite(Number(await page.getByText('Density RMS delta').locator('..').locator('strong').textContent())));
  await page.getByRole('combobox', { name: 'View' }).click();
  await page.locator('[role="option"][data-value="difference"]').click();
  assert.match(await page.getByRole('combobox', { name: 'View' }).textContent(), /Density difference/);
  await page.setViewportSize({ width: 390, height: 844 });
  const panel = await page.locator('.quantum-panel').boundingBox();
  assert.ok(panel && panel.x >= 0 && panel.y >= 0 && panel.x + panel.width <= 390 && panel.y + panel.height <= 844);
  assert.deepEqual(errors, []);
});

test('thermal loop lab closes energy balance and labels hypothetical fluid data', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });

  await page.goto(`${baseUrl}?e2e=1`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /10 \/ LOAD FIELD/ }).evaluate((button) => button.click());
  await page.locator('.thermal-panel').waitFor();
  assert.match(await page.getByText('Energy residual').locator('..').locator('strong').textContent(), /0\.00e\+0 W/);
  await page.getByRole('combobox', { name: 'Fluid' }).click();
  await page.locator('[role="option"][data-value="hbnFarnesane"]').click();
  assert.match(await page.locator('.thermal-provenance').textContent(), /HYPOTHESIS/);
  assert.ok(Number.isFinite(Number((await page.getByText('vs water PUE').locator('..').locator('strong').textContent()).replace('+', ''))));
  assert.match(await page.getByText('PUE uncertainty').locator('..').locator('strong').textContent(), /–/);
  await page.setViewportSize({ width: 390, height: 844 });
  const panel = await page.locator('.thermal-panel').boundingBox();
  assert.ok(panel && panel.x >= 0 && panel.y >= 0 && panel.x + panel.width <= 390 && panel.y + panel.height <= 844);
});

test('phase signal lab detects events and labels vortex correlation as analogy', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });

  await page.goto(`${baseUrl}?e2e=1`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /11 \/ LOAD FIELD/ }).evaluate((button) => button.click());
  await page.locator('.signal-panel').waitFor();
  assert.equal(await page.locator('.signal-trace').count(), 4);
  assert.ok(Number(await page.getByText('Total events').locator('..').locator('strong').textContent()) > 0);
  const analogy = page.getByRole('checkbox', { name: 'Correlate synthetic vortex events' });
  await analogy.click();
  assert.equal(await analogy.isChecked(), true);
  assert.match(await page.locator('.signal-warning').textContent(), /does not assert/);
  assert.ok(Number.isFinite(Number((await page.getByText('Matched fraction').locator('..').locator('strong').textContent()).replace('%', ''))));
  await page.setViewportSize({ width: 390, height: 844 });
  const panel = await page.locator('.signal-panel').boundingBox();
  assert.ok(panel && panel.x >= 0 && panel.y >= 0 && panel.x + panel.width <= 390 && panel.y + panel.height <= 844);
});
