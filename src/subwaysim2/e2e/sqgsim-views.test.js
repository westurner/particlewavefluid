import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.BASE_URL ?? 'http://localhost:5173/';
const viewLabels = ['Front', 'Back', 'Left', 'Right', 'Ortho 1', 'Ortho 2', 'Orbital tracking'];

async function readCameraPosition(page) {
  return Promise.all(['X', 'Y', 'Z'].map((axis) => page.getByRole('slider', { name: new RegExp(`Camera Pos${axis}`) }).inputValue()));
}

async function selectParam(page, label, value) {
  await page.getByRole('combobox', { name: label }).click();
  await page.locator(`[role="option"][data-value="${value}"]`).click();
}

async function dragWithSamples(page, start, points, pause = 40) {
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const samples = [];
  const screenshots = [];
  for (const point of points) {
    await page.mouse.move(point.x, point.y);
    await page.waitForTimeout(pause);
    samples.push(await readCameraPosition(page));
    screenshots.push(await page.screenshot({ type: 'png' }));
  }
  await page.mouse.up();
  return { samples, screenshots };
}

test('SQGSIM camera views and orbital tracking are selectable', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /02 \/ LOAD FIELD/ }).click();
  await page.waitForFunction(() => Boolean(document.querySelector('canvas')));
  const cameraPanel = page.locator('details.attractor-details').filter({ has: page.locator('summary').filter({ hasText: /^Camera$/ }) });
  await cameraPanel.locator('summary').evaluate((summary) => summary.click());
  const canvasBox = await page.locator('canvas').boundingBox();
  assert.ok(canvasBox);
  const dragStart = { x: canvasBox.x + canvasBox.width * 0.35, y: canvasBox.y + canvasBox.height * 0.5 };
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

  const beforeDrag = await readCameraPosition(page);
  const mouseDrag = await dragWithSamples(page, dragStart, [
    { x: dragStart.x + 30, y: dragStart.y },
    { x: dragStart.x + 60, y: dragStart.y },
    { x: dragStart.x + 90, y: dragStart.y },
    { x: dragStart.x + 120, y: dragStart.y }
  ]);
  await page.waitForTimeout(100);
  const afterMouseDrag = await readCameraPosition(page);
  assert.equal(await toolbar.getByRole('button', { name: 'Orbital tracking' }).getAttribute('aria-pressed'), 'false');
  assert.equal(await toolbar.locator('button.active').count(), 0);
  assert.notDeepEqual(afterMouseDrag, beforeDrag, 'mouse drag should update the camera');
  assert.ok(mouseDrag.screenshots.filter((sample, index) => index === 0 || !sample.equals(mouseDrag.screenshots[index - 1])).length >= 3, 'mouse drag should render several camera updates');

  await toolbar.getByRole('button', { name: 'Front' }).evaluate((button) => button.click());
  await page.waitForTimeout(100);
  const beforeTouch = await readCameraPosition(page);
  const touchClient = await page.context().newCDPSession(page);
  await touchClient.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: dragStart.x, y: dragStart.y, id: 1 }] });
  const touchSamples = [];
  const touchScreenshots = [];
  for (const x of [dragStart.x + 30, dragStart.x + 60, dragStart.x + 90, dragStart.x + 120]) {
    await touchClient.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: dragStart.y, id: 1 }] });
    await page.waitForTimeout(40);
    touchScreenshots.push(await page.screenshot({ type: 'png' }));
  }
  await touchClient.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(100);
  const afterTouch = await readCameraPosition(page);
  assert.notDeepEqual(afterTouch, beforeTouch, 'touch drag should update the camera');
  assert.ok(touchScreenshots.filter((sample, index) => index === 0 || !sample.equals(touchScreenshots[index - 1])).length >= 3, 'touch drag should render several camera updates');

  const scrollMode = cameraPanel.getByRole('combobox', { name: 'Scroll mode' });
  await selectParam(page, 'Scroll mode', 'zoom');
  const readCamera = async () => ({
    position: await Promise.all(['X', 'Y', 'Z'].map((axis) => page.getByRole('slider', { name: new RegExp(`Camera Pos${axis}`) }).inputValue())),
    zoom: await page.getByRole('slider', { name: /^Zoom/ }).inputValue()
  });
  const beforeWheel = await readCamera();
  await page.mouse.move(640, 500);
  await page.mouse.wheel(0, 100);
  await page.waitForTimeout(150);
  const afterWheel = await readCamera();
  assert.deepEqual(afterWheel.position, beforeWheel.position);
  assert.notEqual(afterWheel.zoom, beforeWheel.zoom);
});

test('SQGSIM parameter menus stay inside a narrow viewport', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /02 \/ LOAD FIELD/ }).click();
  await page.waitForFunction(() => Boolean(document.querySelector('canvas')));
  await page.getByRole('combobox', { name: 'Transform mode' }).click();
  const menu = page.locator('.param-select-menu');
  const menuBox = await menu.boundingBox();
  assert.ok(menuBox);
  assert.ok(menuBox.x >= 0 && menuBox.y >= 0, `menu should not start outside viewport: ${JSON.stringify(menuBox)}`);
  assert.ok(menuBox.x + menuBox.width <= 390 && menuBox.y + menuBox.height <= 844, `menu should fit viewport: ${JSON.stringify(menuBox)}`);
  await page.locator('[role="option"][data-value="translate"]').click();
  assert.equal(await page.getByRole('combobox', { name: 'Transform mode' }).getAttribute('aria-expanded'), 'false');
});

test('SQGSIM zoom slider changes magnification without rotating the camera', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /02 \/ LOAD FIELD/ }).click();
  await page.waitForFunction(() => Boolean(document.querySelector('canvas')));
  const cameraPanel = page.locator('details.attractor-details').filter({ has: page.locator('summary').filter({ hasText: /^Camera$/ }) });
  await cameraPanel.locator('summary').evaluate((summary) => summary.click());
  const canvas = await page.locator('canvas').boundingBox();
  assert.ok(canvas);
  await page.mouse.move(canvas.x + canvas.width * 0.42, canvas.y + canvas.height * 0.48);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * 0.58, canvas.y + canvas.height * 0.56, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);

  const cameraPosition = () => readCameraPosition(page);
  const beforeZoom = await cameraPosition();
  const zoom = page.getByRole('slider', { name: /^Zoom/ });
  const nextZoom = Number(await zoom.inputValue()) < 5 ? '5' : '2';
  await zoom.fill(nextZoom);
  await page.waitForTimeout(150);
  assert.deepEqual(await cameraPosition(), beforeZoom, 'zoom slider should not alter camera orientation or position');
});

test('SQGSIM transform controls move an attractor without stealing camera drag', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1336, height: 828 }, deviceScaleFactor: 1 });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /02 \/ LOAD FIELD/ }).click();
  await page.waitForFunction(() => Boolean(document.querySelector('canvas')));
  await page.getByRole('button', { name: 'Front' }).evaluate((button) => button.click());
  await selectParam(page, 'Transform mode', 'translate');
  await page.waitForTimeout(500);
  const sceneBox = await page.locator('canvas').boundingBox();
  assert.ok(sceneBox);
  const gizmoStart = { x: sceneBox.x + sceneBox.width * 0.48, y: sceneBox.y + sceneBox.height * 0.5 };
  const attractor = page.locator('details.attractor-editor').first();
  await attractor.locator('summary').click();
  const positionX = page.getByRole('spinbutton', { name: 'Attractor 0 position 0' });
  const beforePosition = await positionX.inputValue();
  await page.mouse.move(gizmoStart.x, gizmoStart.y);
  await page.mouse.down();
  for (const x of [20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220, 240].map((offset) => gizmoStart.x + offset)) {
    await page.mouse.move(x, gizmoStart.y);
    await page.waitForTimeout(40);
  }
  await page.mouse.up();
  await page.waitForTimeout(100);
  assert.notEqual(await positionX.inputValue(), beforePosition, 'transform drag should update the attractor position');
  const cameraPanel = page.locator('details.attractor-details').filter({ has: page.locator('summary').filter({ hasText: /^Camera$/ }) });
  await cameraPanel.locator('summary').evaluate((summary) => summary.click());
  assert.deepEqual(await readCameraPosition(page), ['3', '5', '8'], 'transform drag should not move the camera');
});

test('SQGSIM rotation controls follow an attractor rotation', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /02 \/ LOAD FIELD/ }).click();
  await page.waitForFunction(() => Boolean(document.querySelector('canvas')));
  await page.getByRole('button', { name: 'Front' }).evaluate((button) => button.click());
  await selectParam(page, 'Transform mode', 'rotate');
  const attractor = page.locator('details.attractor-editor').first();
  await attractor.locator('summary').click();
  const canvas = page.locator('canvas');
  const beforeRotation = await canvas.screenshot({ type: 'png' });
  await page.getByRole('spinbutton', { name: 'Attractor 0 rotation 1' }).fill('0.8');
  await page.waitForTimeout(100);
  const afterRotation = await canvas.screenshot({ type: 'png' });
  assert.notDeepEqual(afterRotation, beforeRotation, 'rotation gizmo should follow the attractor rotation');
});
