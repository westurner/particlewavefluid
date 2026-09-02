import { HalfFloatType } from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';

export function createSimulationUvs(resolution, particleCount) {
  const uvs = new Float32Array(particleCount * 2);
  for (let particleIndex = 0; particleIndex < particleCount; particleIndex += 1) {
    const row = Math.floor(particleIndex / resolution);
    const column = particleIndex % resolution;
    uvs[particleIndex * 2] = (column + 0.5) / resolution;
    uvs[particleIndex * 2 + 1] = (row + 0.5) / resolution;
  }
  return uvs;
}

export function createGpuParticleField({ gl, resolution, positionShader, velocityShader, initialize }) {
  const gpuCompute = new GPUComputationRenderer(resolution, resolution, gl);
  if (!gl.capabilities.isWebGL2) gpuCompute.setDataType(HalfFloatType);

  const positionTexture = gpuCompute.createTexture();
  const velocityTexture = gpuCompute.createTexture();
  for (let offset = 0; offset < positionTexture.image.data.length; offset += 4) {
    initialize({
      particleIndex: offset / 4,
      positionData: positionTexture.image.data,
      velocityData: velocityTexture.image.data,
      offset
    });
  }

  const positionVariable = gpuCompute.addVariable('uPositionTex', positionShader, positionTexture);
  const velocityVariable = gpuCompute.addVariable('uVelocityTex', velocityShader, velocityTexture);
  gpuCompute.setVariableDependencies(positionVariable, [positionVariable, velocityVariable]);
  gpuCompute.setVariableDependencies(velocityVariable, [positionVariable, velocityVariable]);
  return {
    gpuCompute,
    positionVariable,
    velocityVariable,
    dispose() {
      gpuCompute.dispose();
    }
  };
}