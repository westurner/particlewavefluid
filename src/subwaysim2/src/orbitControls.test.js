import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

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
    this.clientHeight = 600;
    this.clientWidth = 800;
    this.style = {};
  }

  getRootNode() {
    return this.ownerDocument;
  }

  setPointerCapture() {}

  releasePointerCapture() {}
}

function createControls() {
  const ownerDocument = new FakeEventTarget();
  const canvas = new FakeCanvas(ownerDocument);
  const camera = new PerspectiveCamera(45, 4 / 3, 0.1, 1000);
  camera.position.set(0, 0, 10);
  const controls = new OrbitControls(camera, canvas);
  controls.update();
  return { camera, canvas, controls, ownerDocument };
}

function pointer(type, button, clientX, clientY) {
  return {
    type,
    button,
    clientX,
    clientY,
    pageX: clientX,
    pageY: clientY,
    pointerId: 1,
    pointerType: 'mouse',
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    preventDefault() {}
  };
}

function click(canvas, button) {
  canvas.dispatchEvent(pointer('pointerdown', button, 400, 300));
  canvas.ownerDocument.dispatchEvent(pointer('pointerup', button, 400, 300));
}

function drag(canvas, button, start, end) {
  canvas.dispatchEvent(pointer('pointerdown', button, start[0], start[1]));
  canvas.ownerDocument.dispatchEvent(pointer('pointermove', button, end[0], end[1]));
  canvas.ownerDocument.dispatchEvent(pointer('pointerup', button, end[0], end[1]));
}

test('OrbitControls handles click and drag on every camera axis', async (t) => {
  const cases = [
    {
      name: 'horizontal orbit',
      button: 0,
      end: [520, 300],
      before: ({ controls }) => ({ azimuth: controls.getAzimuthalAngle(), polar: controls.getPolarAngle() }),
      assertDrag: ({ controls }, before) => {
        assert.notEqual(controls.getAzimuthalAngle(), before.azimuth);
        assert.equal(controls.getPolarAngle(), before.polar);
      }
    },
    {
      name: 'vertical orbit',
      button: 0,
      end: [400, 420],
      before: ({ controls }) => ({ azimuth: controls.getAzimuthalAngle(), polar: controls.getPolarAngle() }),
      assertDrag: ({ controls }, before) => {
        assert.equal(controls.getAzimuthalAngle(), before.azimuth);
        assert.notEqual(controls.getPolarAngle(), before.polar);
      }
    },
    {
      name: 'depth dolly',
      button: 1,
      end: [400, 420],
      before: ({ camera }) => ({ distance: camera.position.length() }),
      assertDrag: ({ camera }, before) => assert.notEqual(camera.position.length(), before.distance)
    },
    {
      name: 'horizontal pan',
      button: 2,
      end: [520, 300],
      before: ({ controls }) => ({ x: controls.target.x, y: controls.target.y }),
      assertDrag: ({ controls }, before) => {
        assert.notEqual(controls.target.x, before.x);
        assert.equal(controls.target.y, before.y);
      }
    },
    {
      name: 'vertical pan',
      button: 2,
      end: [400, 420],
      before: ({ controls }) => ({ x: controls.target.x, y: controls.target.y }),
      assertDrag: ({ controls }, before) => {
        assert.equal(controls.target.x, before.x);
        assert.notEqual(controls.target.y, before.y);
      }
    }
  ];

  for (const interaction of cases) {
    await t.test(interaction.name, () => {
      const context = createControls();
      const events = [];
      context.controls.addEventListener('start', () => events.push('start'));
      context.controls.addEventListener('end', () => events.push('end'));

      click(context.canvas, interaction.button);
      assert.deepEqual(events, ['start', 'end']);

      const before = interaction.before(context);
      drag(context.canvas, interaction.button, [400, 300], interaction.end);
      interaction.assertDrag(context, before);
      assert.deepEqual(events, ['start', 'end', 'start', 'end']);

      context.controls.dispose();
    });
  }
});