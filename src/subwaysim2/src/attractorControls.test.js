import test from 'node:test';
import assert from 'node:assert/strict';
import { Object3D, PerspectiveCamera, Scene, Vector2 } from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event) {
    this.listeners.get(event.type)?.forEach((listener) => listener(event));
  }
}

class FakeCanvas extends FakeEventTarget {
  constructor(ownerDocument) {
    super();
    this.ownerDocument = ownerDocument;
    this.style = {};
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 800, height: 600 };
  }

  setPointerCapture() {}

  releasePointerCapture() {}
}

function createControls() {
  const previousDocument = globalThis.document;
  globalThis.document = { pointerLockElement: null };
  const ownerDocument = new FakeEventTarget();
  const canvas = new FakeCanvas(ownerDocument);
  const camera = new PerspectiveCamera(45, 4 / 3, 0.1, 1000);
  camera.position.set(4, 3, 6);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  const scene = new Scene();
  const object = new Object3D();
  scene.add(object);
  const controls = new TransformControls(camera, canvas);
  controls.attach(object);
  scene.add(controls.getHelper());
  scene.updateMatrixWorld(true);
  return {
    camera,
    canvas,
    controls,
    object,
    restore() {
      controls.dispose();
      if (previousDocument === undefined) delete globalThis.document;
      else globalThis.document = previousDocument;
    }
  };
}

function pointer(type, point, button) {
  return {
    type,
    pointerId: 1,
    pointerType: 'mouse',
    button,
    clientX: (point.x + 1) * 400,
    clientY: (1 - point.y) * 300
  };
}

function findAxisPoint(controls, axis) {
  for (let x = -0.9; x <= 0.9; x += 0.02) {
    for (let y = -0.9; y <= 0.9; y += 0.02) {
      controls.pointerHover(new Vector2(x, y));
      if (controls.axis === axis) return new Vector2(x, y);
    }
  }
  return null;
}

function clickAndDrag(canvas, start, end) {
  canvas.dispatchEvent(pointer('pointerdown', start, 0));
  canvas.dispatchEvent(pointer('pointermove', end, -1));
  canvas.dispatchEvent(pointer('pointerup', end, 0));
}

test('attractor TransformControls click and drag each translation axis', async (t) => {
  for (const axis of ['X', 'Y', 'Z']) {
    await t.test(`${axis} axis`, () => {
      const context = createControls();
      const { canvas, controls, object } = context;
      const events = [];
      controls.addEventListener('mouseDown', () => events.push('down'));
      controls.addEventListener('mouseUp', () => events.push('up'));
      const start = findAxisPoint(controls, axis);
      assert.ok(start, `${axis} gizmo axis should be pickable`);

      canvas.dispatchEvent(pointer('pointerdown', start, 0));
      canvas.dispatchEvent(pointer('pointerup', start, 0));
      assert.deepEqual(events, ['down', 'up']);
      assert.equal(controls.axis, null);

      const before = object.position.clone();
      const end = start.clone().add(new Vector2(0.08, 0.08));
      clickAndDrag(canvas, start, end);
      const delta = object.position.clone().sub(before);
      const changedAxes = ['x', 'y', 'z'].filter((coordinate) => Math.abs(delta[coordinate]) > 1e-8);
      assert.deepEqual(changedAxes, [axis.toLowerCase()]);
      assert.deepEqual(events, ['down', 'up', 'down', 'up']);
      context.restore();
    });
  }
});