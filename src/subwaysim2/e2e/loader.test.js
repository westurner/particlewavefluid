import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { AMPLITUDE_GRAVITY_MODES } from '../src/amplitudeGravityModel.js';

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
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

  await page.goto(`${baseUrl}?e2e=1`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /05 \/ LOAD FIELD/ }).click();
  await page.locator('.attractor-panel').waitFor();
  assert.match(await page.locator('.attractor-status').innerText(), /2,048 particles/);
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.attractor-error').count(), 0, 'reduced GPU particle field should initialize');

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

  for (const label of ['SQG / GR + GPE', 'SQG / normed tensor-Gaussian splat', 'DDF hypothesis', 'DDF / normed tensor-Gaussian splat', 'GR(2,4) / amplituhedron splat']) {
    await model.click();
    await page.getByRole('option', { name: label }).click();
    await page.waitForTimeout(100);
    assert.ok((await model.textContent()).includes(label), `expected ${label} in ${await model.textContent()}`);
  }
  assert.deepEqual(errors, []);
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
  const rotationalCorrections = page.getByRole('checkbox', { name: 'Include sourced J2 and GR spin corrections' });
  assert.equal(await rotationalCorrections.isChecked(), false);
  await rotationalCorrections.click();
  assert.equal(await rotationalCorrections.isChecked(), true);
  await page.getByText(/J2 acts in every N-body mode/).waitFor();
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.waitForTimeout(250);
  const canvas = page.locator('.amplitude-scene canvas');
  const beforeFocus = await canvas.screenshot();
  const focusButton = page.getByRole('button', { name: 'Focus' });
  await focusButton.click();
  await page.waitForTimeout(1100);
  assert.equal(await focusButton.getAttribute('aria-pressed'), 'true');
  const afterFocus = await canvas.screenshot();
  assert.notDeepEqual(afterFocus, beforeFocus, 'focusing a body should change the rendered camera view');

  await page.setViewportSize({ width: 390, height: 844 });
  await inspectedBody.click();
  await page.getByRole('option', { name: 'Titan / Saturn' }).click();
  await page.waitForTimeout(250);
  const mobileBeforeFocus = await canvas.screenshot();
  await focusButton.click();
  await page.waitForTimeout(1100);
  const mobileAfterFocus = await canvas.screenshot();
  assert.notDeepEqual(mobileAfterFocus, mobileBeforeFocus, 'focused camera should move on a mobile-sized canvas');
  await page.setViewportSize({ width: 1280, height: 900 });

  const diameterScale = page.getByRole('combobox', { name: 'Planet diameter scale' });
  await diameterScale.click();
  await page.getByRole('option', { name: 'Actual diameters' }).click();
  assert.equal(await page.getByRole('slider', { name: 'Illustrative planet size' }).count(), 0);
  await diameterScale.click();
  await page.getByRole('option', { name: 'Illustrative diameters' }).click();
  assert.equal(await page.getByRole('slider', { name: 'Illustrative planet size' }).count(), 1);

  const gravityModel = page.getByRole('combobox', { name: 'Gravity model' });
  const sharedFieldLabels = [
    'Default particle mechanics', 'Newtonian response', 'NS compressible fluid',
    'NS incompressible fluid', 'SQG / GR + GPE', 'SQG / normed tensor-Gaussian splat',
    'DDF hypothesis', 'DDF / normed tensor-Gaussian splat', 'GR(2,4) / amplituhedron splat'
  ];
  for (const label of sharedFieldLabels) {
    await gravityModel.click();
    await page.getByRole('option', { name: label }).click();
    assert.ok((await gravityModel.textContent()).includes(label), `expected ${label} in AmplitudeGravitySim`);
    if (label === 'Default particle mechanics') {
      assert.equal(await page.getByRole('slider', { name: 'Field spin strength' }).count(), 1);
    }
    if (label === 'SQG / GR + GPE') {
      assert.equal(await page.getByRole('slider', { name: 'Quantum pressure' }).count(), 1);
      assert.equal(await page.getByRole('slider', { name: 'SQG phase/vorticity spin coupling' }).count(), 1);
    }
    if (label === 'DDF / normed tensor-Gaussian splat') {
      assert.equal(await page.getByRole('slider', { name: 'Tensor-Gaussian waist' }).count(), 1);
      assert.equal(await page.getByRole('slider', { name: 'DDF dilatancy' }).count(), 1);
    }
    if (label === 'GR(2,4) / amplituhedron splat') {
      assert.equal(await page.getByRole('slider', { name: 'Gr(2,4) spin-axis coupling' }).count(), 1);
    }
  }
  await gravityModel.click();
  await page.getByRole('option', { name: 'GR (General Relativity)' }).click();
  assert.match(await page.locator('.amplitude-warning').textContent(), /pairwise two-body 1PN/);
  await gravityModel.click();
  await page.getByRole('option', { name: 'GR / normed tensor-Gaussian' }).click();
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
  const historicMission = page.getByRole('combobox', { name: 'Historic mission path' });
  for (const label of ['Apollo 11 · First lunar landing', 'Artemis II · Crewed lunar flyby', 'Viking 1 · Mars orbiter / lander', 'Perseverance / Ingenuity · Mars', 'Juno · Jupiter orbiter']) {
    await historicMission.click();
    await page.getByRole('option', { name: label }).click();
    assert.match(await historicMission.textContent(), new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(await gravityModel.textContent(), /GR \/ normed tensor-Gaussian/);
  const pluckerResidual = Number(await page.getByText('Plücker residual').locator('..').locator('strong').textContent());
  assert.ok(Math.abs(pluckerResidual) < 1e-12, `expected a negligible Plücker residual, received ${pluckerResidual}`);
  const difference = page.getByRole('checkbox', { name: 'Show acceleration difference from Newtonian' });
  await difference.click();
  assert.equal(await difference.isChecked(), true);
  await page.waitForTimeout(500);
  assert.deepEqual(errors, []);
});

test('amplitude gravity validation scores all models, shows JPL tracks, and reports pair-distance contributions', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

  await page.goto(`${baseUrl}?e2e=1`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /07 \/ LOAD FIELD/ }).click();
  await page.locator('.amplitude-panel').waitFor();
  await page.getByRole('combobox', { name: 'Study mode' }).click();
  await page.getByRole('option', { name: 'Observed-orbit validation' }).click();
  await page.locator('.orbital-validation-panel').waitFor();
  assert.equal(await page.locator('.orbit-validation-table tbody tr').count(), 0);
  assert.match(await page.locator('.orbital-validation-readout').textContent(), /Not run/);
  await page.getByRole('button', { name: 'Run all model tests' }).click();
  await page.locator('.orbit-validation-table tbody tr').nth(AMPLITUDE_GRAVITY_MODES.length - 1).waitFor();
  assert.equal(await page.locator('.orbit-validation-table tbody tr').count(), AMPLITUDE_GRAVITY_MODES.length);
  assert.match(await page.locator('.orbital-validation-readout').textContent(), /pts/);
  assert.match(await page.locator('.orbital-validation-panel .amplitude-note').filter({ hasText: /JPL Horizons DE441/ }).textContent(), /six 5-day DE441 samples/);

  await page.getByRole('button', { name: 'Optimize model parameters' }).click();
  const progressIndicator = page.getByRole('status');
  await progressIndicator.waitFor();
  assert.match(await progressIndicator.textContent(), /candidate scores/);
  const optimizationRows = page.locator('.orbit-optimization-table tbody tr');
  await optimizationRows.nth(AMPLITUDE_GRAVITY_MODES.length - 1).waitFor({ timeout: 120000 });
  assert.equal(await optimizationRows.count(), AMPLITUDE_GRAVITY_MODES.length);
  const applicableResult = page.locator('.orbit-optimization-table tbody tr td button:not([disabled])').first();
  assert.ok(await applicableResult.count(), 'optimizer should find at least one improving model configuration');
  const resultRow = applicableResult.locator('xpath=../..');
  const modelName = (await resultRow.locator('th').textContent()).trim();
  await applicableResult.click();
  assert.match(await page.getByRole('combobox', { name: 'Gravity model' }).textContent(), new RegExp(modelName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  const modelSelect = page.getByRole('combobox', { name: 'Gravity model' });
  await modelSelect.click();
  await page.getByRole('option', { name: 'GR / normed tensor-Gaussian' }).click();
  assert.match(await page.locator('.orbital-validation-readout').textContent(), /pts/);
  const gaussianWaist = page.getByRole('slider', { name: 'GR splatter Gaussian waist' });
  await gaussianWaist.focus();
  await gaussianWaist.press('End');
  await page.getByText(/Settings changed since this report ran/).waitFor();

  await page.getByRole('checkbox', { name: 'Show JPL and predicted tracks together' }).check();
  assert.match(await page.locator('.orbit-validation-legend').textContent(), /JPL observations.*Selected model/);
  await page.getByRole('checkbox', { name: 'Show pair distances contributing to score' }).check();
  assert.equal(await page.locator('.orbit-validation-distance-table tbody tr').count(), 36);
  assert.match(await page.locator('.orbit-validation-distance-table').textContent(), /RMS Δ km/);
  await page.locator('.orbit-validation-distance-table details summary').first().click();
  assert.equal(await page.locator('.orbit-validation-distance-table details').first().locator('.orbit-validation-distance-samples p').count(), 6);

  await page.getByText('About this sim', { exact: true }).click();
  await page.getByText('JPL Horizons / DE441 planetary ephemeris', { exact: true }).waitFor();
  await page.getByText('Adding a future model', { exact: true }).waitFor();
  await page.locator('.amplitude-citation-list a[href="https://ssd.jpl.nasa.gov/sats/elem/"]').waitFor();

  await page.getByRole('button', { name: 'Run all model tests' }).click();
  await page.getByRole('button', { name: 'Run all model tests' }).waitFor();
  const reportSelect = page.getByRole('combobox', { name: 'Validation report' });
  await reportSelect.click();
  assert.equal(await page.getByRole('option').count(), 2);
  await page.keyboard.press('Escape');
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
  const gpeParameters = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^GPE parameters$/ }) });
  assert.equal(await gpeParameters.count(), 1);
  assert.equal(await gpeParameters.getByRole('slider', { name: 'Interaction g' }).count(), 1);
  const vortexCharge = page.getByRole('combobox', { name: 'Vortex charge' });
  assert.equal(await vortexCharge.count(), 1);
  assert.equal(await page.getByText(/Integer phase winding around the core/).count(), 1);
  assert.equal(await page.getByText(/Nonlinear self-interaction strength/).count(), 1);
  await vortexCharge.click();
  await page.locator('[role="option"][data-value="-2"]').click();
  const vortexCoreRadius = page.getByRole('slider', { name: 'Vortex core radius' });
  await vortexCoreRadius.press('ArrowRight');
  assert.equal(await vortexCoreRadius.inputValue(), '0.8');
  const vortexCenterX = page.getByRole('slider', { name: 'Vortex center X' });
  await vortexCenterX.press('ArrowRight');
  assert.equal(await vortexCenterX.inputValue(), '0.1');
  const initialState = page.getByRole('combobox', { name: 'Initial state' });
  await initialState.click();
  await page.locator('[role="option"][data-value="plane-wave"]').click();
  assert.equal(await vortexCharge.count(), 0);
  await initialState.click();
  await page.locator('[role="option"][data-value="vortex"]').click();
  assert.equal(await vortexCharge.count(), 1);
  const hypothesisGroup = page.locator('details.quantum-control-group').filter({ has: page.locator('summary').filter({ hasText: /^SQG \/ DDF hypothesis$/ }) });
  await hypothesisGroup.locator('summary').click();
  const hypothesisModel = page.getByRole('combobox', { name: 'Hypothesis model' });
  assert.match(await hypothesisModel.textContent(), /SQG \/ GR \+ GPE/);
  for (const label of ['Core radius', 'Compressibility', 'Quantum pressure', 'Normalized speed of light', 'SQG phase/vorticity spin coupling']) {
    assert.equal(await hypothesisGroup.getByRole('slider', { name: label, exact: true }).count(), 1);
  }
  assert.equal(await hypothesisGroup.getByText(/does not solve a complex GPE/).count(), 1);
  await hypothesisModel.click();
  await page.locator('[role="option"][data-value="ddf"]').click();
  for (const label of ['Base viscosity', 'Dilatancy', 'Speed limit']) {
    assert.equal(await hypothesisGroup.getByRole('slider', { name: label, exact: true }).count(), 1);
  }
  await hypothesisModel.click();
  await page.locator('[role="option"][data-value="ddf-tensor-gaussian"]').click();
  assert.equal(await hypothesisGroup.getByRole('slider', { name: 'Tensor-Gaussian waist', exact: true }).count(), 1);
  const viewSelector = page.getByRole('combobox', { name: 'View' });
  await viewSelector.click();
  await page.locator('[role="option"][data-value="hypothesis"]').click();
  assert.match(await viewSelector.textContent(), /SQG \/ DDF response/);
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.waitForTimeout(150);
  const hypothesisCanvas = page.locator('.quantum-scene canvas');
  const densityResponse = await hypothesisCanvas.screenshot();
  const gpeField = page.getByRole('combobox', { name: 'GPE field' });
  await gpeField.click();
  await page.locator('[role="option"][data-value="phase"]').click();
  await page.waitForTimeout(150);
  const phaseResponse = await hypothesisCanvas.screenshot();
  assert.notDeepEqual(phaseResponse, densityResponse, 'the SQG/DDF response should use the selected GPE phase field');
  await page.getByRole('button', { name: 'Run' }).click();
  await viewSelector.click();
  await page.locator('[role="option"][data-value="side-by-side"]').click();
  const particleCount = page.getByRole('slider', { name: 'Particle count' });
  await particleCount.press('ArrowLeft');
  assert.equal(await particleCount.inputValue(), '960');
  const gridSize = page.getByRole('combobox', { name: 'Grid size' });
  await gridSize.click();
  await page.locator('[role="option"][data-value="64"]').click();
  await particleCount.press('End');
  assert.equal(await particleCount.inputValue(), '4096');
  const gridShape = page.getByRole('combobox', { name: 'Grid shape' });
  for (const [shape, label] of [['circle', /Circle/], ['torus', /Torus/], ['square', /Square grid/]]) {
    await gridShape.click();
    await page.locator(`[role="option"][data-value="${shape}"]`).click();
    assert.match(await gridShape.textContent(), label);
  }
  await gridShape.click();
  await page.locator('[role="option"][data-value="torus"]').click();
  const torusMajorRadius = page.getByRole('slider', { name: 'Torus major radius' });
  const torusTubeRadius = page.getByRole('slider', { name: 'Torus tube radius' });
  assert.equal(await torusMajorRadius.inputValue(), '1.55');
  assert.equal(await torusTubeRadius.inputValue(), '0.6');
  await torusMajorRadius.press('ArrowRight');
  assert.equal(await torusMajorRadius.inputValue(), '1.6');
  await torusTubeRadius.press('ArrowRight');
  assert.equal(await torusTubeRadius.inputValue(), '0.65');
  const torusClosed = page.getByRole('checkbox', { name: 'Connect torus ends' });
  assert.equal(await torusClosed.isChecked(), true);
  await page.getByRole('button', { name: 'Pause' }).click();
  const closedTorusPixels = await page.locator('canvas').screenshot();
  await torusClosed.uncheck();
  await page.waitForTimeout(200);
  const openTorusPixels = await page.locator('canvas').screenshot();
  assert.notDeepEqual(openTorusPixels, closedTorusPixels, 'disconnecting the torus should open a visible seam');
  await torusClosed.check();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Run' }).click();

  const cameraSummary = page.locator('summary').filter({ hasText: /^Camera$/ });
  await cameraSummary.click();
  const cameraLabels = ['Camera PosX', 'Camera PosY', 'Camera PosZ', 'Camera TargetX', 'Camera TargetY', 'Camera TargetZ', 'Zoom', 'FOV', 'Near', 'Far'];
  const cameraParamsBeforeAppearance = await Promise.all(cameraLabels.map((label) => page.getByRole('slider', { name: label, exact: true }).inputValue()));
  await cameraSummary.click();
  await page.locator('summary').filter({ hasText: 'Particle appearance' }).click();
  const particleSize = page.getByRole('slider', { name: 'Particle size scale' });
  assert.equal(await particleSize.getAttribute('max'), '8');
  await particleSize.press('ArrowRight');
  assert.equal(await particleSize.inputValue(), '1.05');
  const zoomSizeToggle = page.getByRole('checkbox', { name: 'Scale particle size with camera zoom' });
  assert.equal(await zoomSizeToggle.isChecked(), false);
  const zoomSizeSensitivity = page.getByRole('slider', { name: 'Zoom size sensitivity' });
  assert.equal(await zoomSizeSensitivity.isDisabled(), true);
  await zoomSizeToggle.check();
  assert.equal(await zoomSizeSensitivity.isDisabled(), false);
  await zoomSizeSensitivity.press('ArrowRight');
  assert.equal(await zoomSizeSensitivity.inputValue(), '1.05');
  const particleShape = page.getByRole('combobox', { name: 'Particle shape' });
  await particleShape.click();
  await page.locator('[role="option"][data-value="vector"]').click();
  const derivativeOrder = page.getByRole('slider', { name: 'Particle derivative order' });
  await derivativeOrder.press('End');
  assert.equal(await derivativeOrder.inputValue(), '4');
  assert.equal(await page.getByText(/For Vector shape, order 0/).count(), 1);
  assert.equal(await page.getByRole('combobox', { name: 'Particle color mode' }).count(), 0);
  assert.equal(await page.getByLabel('Particle color').count(), 0);
  const particleOpacity = page.getByRole('slider', { name: 'Particle opacity' });
  await particleOpacity.press('ArrowLeft');
  assert.equal(await particleOpacity.inputValue(), '0.99');
  await cameraSummary.click();
  const cameraParamsAfterAppearance = await Promise.all(cameraLabels.map((label) => page.getByRole('slider', { name: label, exact: true }).inputValue()));
  assert.deepEqual(cameraParamsAfterAppearance, cameraParamsBeforeAppearance, 'particle appearance edits should not change camera parameters');
  const orbitSpeed = page.getByRole('slider', { name: 'Orbit speed' });
  await orbitSpeed.press('ArrowRight');
  assert.equal(await orbitSpeed.inputValue(), '0.56');
  const cameraPosition = page.getByRole('slider', { name: 'Camera PosX' });
  await cameraPosition.press('ArrowRight');
  assert.equal(await cameraPosition.inputValue(), '14.01');
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
