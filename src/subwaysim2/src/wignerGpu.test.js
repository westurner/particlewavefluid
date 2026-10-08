import test from 'node:test';
import assert from 'node:assert/strict';
import { createWignerGpuProcessor, WIGNER_GPU_RESOLUTION, WIGNER_GPU_WGSL } from './wignerGpu.js';

test('Wigner GPU kernel evaluates the detector slice in WGSL', () => {
  assert.match(WIGNER_GPU_WGSL, /@compute @workgroup_size\(8, 8\)/);
  assert.match(WIGNER_GPU_WGSL, /sampleWave\(y \+ offset, z\)/);
  assert.match(WIGNER_GPU_WGSL, /sampleWave\(y - offset, z\)/);
  assert.match(WIGNER_GPU_WGSL, /outputValues\[outputIndex\]/);
  assert.equal(WIGNER_GPU_RESOLUTION, 64);
});

test('Wigner GPU processor cleanly reports unavailable adapters', async () => {
  assert.equal(await createWignerGpuProcessor(undefined), null);
  assert.equal(await createWignerGpuProcessor({ requestAdapter: async () => null }), null);
});
