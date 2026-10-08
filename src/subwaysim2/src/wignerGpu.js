export const WIGNER_GPU_RESOLUTION = 64;
const MAX_EMITTERS = 1400;
const EMITTER_FLOATS = 16;

export const WIGNER_GPU_WGSL = /* wgsl */ `
struct Emitter {
  phaseData: vec4<f32>,
  amplitudeData: vec4<f32>,
  polarization: vec4<f32>,
  side: vec4<f32>,
}

struct Parameters {
  width: u32,
  height: u32,
  emitterCount: u32,
  time: f32,
  detectorX: f32,
  detectorSpan: f32,
  intensityScale: f32,
  padding: f32,
}

@group(0) @binding(0) var<uniform> parameters: Parameters;
@group(0) @binding(1) var<storage, read> emitters: array<Emitter>;
@group(0) @binding(2) var<storage, read_write> outputValues: array<vec4<f32>>;

fn sampleWave(sampleY: f32, sampleZ: f32) -> vec2<f32> {
  var field = vec2<f32>(0.0);
  for (var index = 0u; index < parameters.emitterCount; index += 1u) {
    let emitter = emitters[index];
    let offset = vec3<f32>(parameters.detectorX, sampleY, sampleZ) - emitter.phaseData.xyz;
    let distance = max(length(offset), 0.000001);
    let propagation = offset / distance;
    let transverse = emitter.polarization.xyz;
    var polarization = transverse - dot(transverse, propagation) * propagation;
    if (length(polarization) < 0.000001) {
      let side = emitter.side.xyz;
      polarization = side - dot(side, propagation) * propagation;
    }
    let amplitude = emitter.amplitudeData.z * length(polarization) / distance;
    let phase = emitter.phaseData.w * distance + emitter.amplitudeData.x - emitter.amplitudeData.y * parameters.time;
    field += amplitude * vec2<f32>(cos(phase), sin(phase));
  }
  return field;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) invocation: vec3<u32>) {
  if (invocation.x >= parameters.width || invocation.y >= parameters.height) {
    return;
  }
  let y = (f32(invocation.y) + 0.5) / f32(parameters.height) * parameters.detectorSpan - parameters.detectorSpan * 0.5;
  let z = (f32(invocation.x) + 0.5) / f32(parameters.width) * parameters.detectorSpan - parameters.detectorSpan * 0.5;
  var integral = 0.0;
  for (var sampleIndex = 0u; sampleIndex <= 8u; sampleIndex += 1u) {
    let offset = f32(sampleIndex) * 0.25;
    let positive = sampleWave(y + offset, z);
    let negative = sampleWave(y - offset, z);
    let product = positive.x * negative.x + positive.y * negative.y;
    var weight = 2.0;
    if (sampleIndex == 0u || sampleIndex == 8u) {
      weight = 1.0;
    } else if (sampleIndex % 2u == 1u) {
      weight = 4.0;
    }
    integral += weight * product;
  }
  let wigner = (0.5 / (3.0 * 3.14159265359)) * integral;
  let normalized = clamp(wigner / max(parameters.intensityScale, 0.001), -1.0, 1.0);
  let outputIndex = invocation.y * parameters.width + invocation.x;
  outputValues[outputIndex] = vec4<f32>(normalized, abs(normalized), 0.0, 1.0);
}
`;

export async function createWignerGpuProcessor(gpu = globalThis.navigator?.gpu, width = WIGNER_GPU_RESOLUTION, height = width) {
  if (!gpu?.requestAdapter) return null;
  const outputWidth = Math.max(1, Math.floor(width));
  const outputHeight = Math.max(1, Math.floor(height));
  const adapter = await gpu.requestAdapter();
  if (!adapter) return null;
  const device = await adapter.requestDevice();
  const shader = device.createShaderModule({ code: WIGNER_GPU_WGSL });
  const compilation = await shader.getCompilationInfo();
  const errors = compilation.messages.filter((message) => message.type === 'error');
  if (errors.length) {
    device.destroy();
    throw new Error(errors.map(({ message }) => message).join('\n'));
  }
  const pipeline = await device.createComputePipelineAsync({
    layout: 'auto',
    compute: { module: shader, entryPoint: 'main' }
  });
  const pixelCount = outputWidth * outputHeight;
  const outputBytes = pixelCount * 4 * Float32Array.BYTES_PER_ELEMENT;
  const emitterBuffer = device.createBuffer({
    size: MAX_EMITTERS * EMITTER_FLOATS * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });
  const parametersBuffer = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });
  const outputBuffer = device.createBuffer({
    size: outputBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
  });
  const readbackBuffer = device.createBuffer({
    size: outputBytes,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
  });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: parametersBuffer } },
      { binding: 1, resource: { buffer: emitterBuffer } },
      { binding: 2, resource: { buffer: outputBuffer } }
    ]
  });
  let busy = false;
  let disposed = false;

  return {
    async compute({ emitters, detectorX, detectorSpan, time, intensityScale }) {
      if (disposed || busy || !Array.isArray(emitters) || emitters.length === 0) return null;
      busy = true;
      try {
        const activeEmitters = emitters.slice(0, MAX_EMITTERS);
        const packedEmitters = new Float32Array(activeEmitters.length * EMITTER_FLOATS);
        activeEmitters.forEach((emitter, index) => {
          const offset = index * EMITTER_FLOATS;
          packedEmitters.set([emitter.x, emitter.y, emitter.z, emitter.waveNumber], offset);
          packedEmitters.set([emitter.phase, emitter.phaseRate, emitter.amplitude, 0], offset + 4);
          packedEmitters.set([emitter.transverse.x, emitter.transverse.y, emitter.transverse.z, 0], offset + 8);
          packedEmitters.set([emitter.side.x, emitter.side.y, emitter.side.z, 0], offset + 12);
        });
        device.queue.writeBuffer(emitterBuffer, 0, packedEmitters);
        const parameters = new ArrayBuffer(32);
        const integerParameters = new Uint32Array(parameters);
        const floatParameters = new Float32Array(parameters);
        integerParameters[0] = outputWidth;
        integerParameters[1] = outputHeight;
        integerParameters[2] = activeEmitters.length;
        floatParameters[3] = time;
        floatParameters[4] = detectorX;
        floatParameters[5] = detectorSpan;
        floatParameters[6] = intensityScale;
        device.queue.writeBuffer(parametersBuffer, 0, parameters);
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(Math.ceil(outputWidth / 8), Math.ceil(outputHeight / 8));
        pass.end();
        encoder.copyBufferToBuffer(outputBuffer, 0, readbackBuffer, 0, outputBytes);
        device.queue.submit([encoder.finish()]);
        await readbackBuffer.mapAsync(GPUMapMode.READ);
        const values = new Float32Array(readbackBuffer.getMappedRange().slice(0));
        readbackBuffer.unmap();
        return values;
      } finally {
        busy = false;
      }
    },
    dispose() {
      disposed = true;
      emitterBuffer.destroy();
      parametersBuffer.destroy();
      outputBuffer.destroy();
      readbackBuffer.destroy();
      device.destroy();
    }
  };
}
