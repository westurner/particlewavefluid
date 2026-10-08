import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';

const baseUrl = process.env.BASE_URL ?? 'http://localhost:5173/';

test('quantum circuit simulator builds gates and reports intensity measurements', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(`${baseUrl}?e2e=1`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /18 \/ LOAD FIELD/ }).click();
  await page.locator('.qc-panel').waitFor();
  assert.equal(await page.locator('.qc-gate-heading').count(), 2);
  assert.match(await page.locator('.qc-intensity-row').first().textContent(), /\|00⟩[\s\S]*50\.0%/);
  assert.match(await page.locator('.qc-intensity-row').nth(3).textContent(), /\|11⟩[\s\S]*50\.0%/);

  await page.getByRole('button', { name: 'Phase interference' }).click();
  assert.equal(await page.locator('.qc-gate-heading').count(), 3);
  assert.match(await page.locator('.qc-intensity-row').first().textContent(), /\|0⟩[\s\S]*50\.0%/);
  assert.match(await page.locator('.qc-intensity-row').nth(1).textContent(), /\|1⟩[\s\S]*50\.0%/);
  await page.getByRole('button', { name: 'Append H' }).click();
  assert.equal(await page.locator('.qc-gate-heading').count(), 4);
  await page.getByRole('button', { name: 'Remove gate 4' }).click();
  assert.equal(await page.locator('.qc-gate-heading').count(), 3);
  await page.getByRole('button', { name: 'Measure one' }).click();
  assert.match(await page.locator('.qc-last-shot').textContent(), /\|[01]⟩/);
  await page.getByRole('combobox', { name: 'Gate' }).click();
  await page.getByRole('option', { name: 'X / Pauli-X' }).click();
  await page.getByRole('button', { name: 'Append X' }).click();
  assert.equal(await page.locator('.qc-gate-heading').count(), 4);
  const qubitCount = page.getByRole('combobox', { name: 'Qubit count' });
  await qubitCount.click();
  await page.getByRole('option', { name: '2 qubits' }).click();
  await page.getByRole('combobox', { name: 'Gate' }).click();
  await page.getByRole('option', { name: 'CNOT / Controlled-X' }).click();
  await qubitCount.click();
  await page.getByRole('option', { name: '1 qubit' }).click();
  assert.equal(await page.locator('.qc-wire-label').count(), 1);
  assert.match(await page.getByRole('combobox', { name: 'Gate' }).textContent(), /H \/ Hadamard/);
  await qubitCount.click();
  await page.getByRole('option', { name: '2 qubits' }).click();
  assert.equal(await page.locator('.qc-wire-label').count(), 2);

  await page.getByRole('button', { name: 'Bell pair' }).click();
  await page.getByRole('combobox', { name: 'Circuit model' }).click();
  await page.getByRole('option', { name: 'Wave detector / Classical intensity' }).click();
  await page.getByRole('checkbox', { name: 'Compare circuit models' }).check();
  const comparisonReference = page.getByRole('combobox', { name: 'Comparison reference' });
  const comparisonTable = page.locator('.qc-comparison-table');
  await comparisonTable.waitFor();
  assert.match(await page.locator('.qc-model-comparison').textContent(), /Ideal state-vector intensity/);
  assert.equal(await comparisonTable.locator('tbody tr').count(), 4);
  await comparisonReference.click();
  await page.getByRole('option', { name: 'Wave detector / Classical intensity' }).click();
  assert.match(await page.locator('.qc-model-comparison').textContent(), /Wave detector \/ Classical intensity/);

  const optimizeDetector = page.getByRole('button', { name: 'Optimize detector parameters' });
  await optimizeDetector.click();
  const optimizationResult = page.locator('.qc-optimization-result');
  await optimizationResult.waitFor();
  const scoreRows = optimizationResult.locator(':scope > div');
  const baselineScore = Number.parseFloat((await scoreRows.nth(0).locator('strong').textContent()).replace('%', ''));
  const optimizedScore = Number.parseFloat((await scoreRows.nth(1).locator('strong').textContent()).replace('%', ''));
  assert.ok(optimizedScore <= baselineScore);
  assert.ok(optimizedScore < 20, `expected detector calibration to reduce Bell-state error below 20%, got ${optimizedScore}%`);
  assert.ok((await optimizationResult.textContent()).includes('Output port width'));
  await page.getByRole('button', { name: 'Apply best settings' }).click();
  assert.equal(await page.locator('.qc-optimization-stale').count(), 0);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileLayout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    workbenchWidth: document.querySelector('.qc-workbench').getBoundingClientRect().width
  }));
  assert.ok(mobileLayout.documentWidth <= mobileLayout.viewportWidth, 'the circuit page should not overflow the mobile viewport');
  assert.ok(mobileLayout.workbenchWidth > 0);
  assert.deepEqual(pageErrors, [], `quantum circuit simulator reported page errors: ${pageErrors.join('; ')}`);
});