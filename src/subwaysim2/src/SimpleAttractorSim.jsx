import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls, TransformControls } from '@react-three/drei';
import { AdditiveBlending, Color, DoubleSide, Euler, InstancedBufferAttribute, PlaneGeometry, ShaderMaterial, SRGBColorSpace, Vector3 } from 'three';
import { createGpuParticleField, createSimulationUvs } from './simulations/gpuParticleRuntime.js';

const MAX_ATTRACTORS = 20;
const PARTICLE_COUNT = 2 ** 18;
const PRESET_STORAGE_KEY = 'sqgsim-attractor-presets';

const INITIAL_ATTRACTORS = [
  { position: [-1, 0, 0], rotation: [0, 0, 0], name: 'Attractor 0', magnitude: 1 },
  { position: [1, 0, -0.5], rotation: [0, 0, 0], name: 'Attractor 1', magnitude: 1 },
  { position: [0, 0.5, 1], rotation: [-0.51, 0.41, -1.35], name: 'Attractor 2', magnitude: 1 }
];

const NINE_BODY_POSITIONS = [
  [0, 0, 0], [-0.364457, -0.221686, -0.080653], [-0.111425, -0.657243, -0.288691],
  [-0.000267, 0.902619, 0.391272], [0.000708, 0.900418, 0.390124], [0.1978, -1.293942, -0.598836],
  [-1.62131, 4.534772, 1.983192], [9.511834, 0.337141, -0.270341], [9.914935, 15.423234, 6.614591],
  [29.872943, 0.724464, -0.447144]
];
const NINE_BODY_NAMES = ['Sun', 'Mercury', 'Venus', 'Earth', 'Moon', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
const NINE_BODY_MAGNITUDES = [1, 1.66e-7, 2.447e-6, 3.003e-6, 3.694e-8, 3.227e-7, 9.545e-4, 2.858e-4, 4.366e-5, 5.151e-5];

const ATTRACTOR_POSITION_SHADER = `
  uniform float uDt;
  uniform float uBoundHalfExtent;

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 positionData = texture2D(uPositionTex, uv);
    vec4 velocityData = texture2D(uVelocityTex, uv);
    positionData.xyz += velocityData.xyz * uDt;
    positionData.xyz = mod(positionData.xyz + uBoundHalfExtent, uBoundHalfExtent * 2.0) - uBoundHalfExtent;
    gl_FragColor = positionData;
  }
`;

const ATTRACTOR_VELOCITY_SHADER = `
  uniform float uDt;
  uniform float uAttractorMass;
  uniform float uParticleGlobalMass;
  uniform float uSpinningStrength;
  uniform float uMaxSpeed;
  uniform float uVelocityDamping;
  uniform float uAttractorCount;
  uniform vec3 uAttractorPositions[20];
  uniform vec3 uAttractorRotationAxes[20];
  uniform float uAttractorMagnitudes[20];

  const float GRAVITY_CONSTANT = 6.67e-11;

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 positionData = texture2D(uPositionTex, uv);
    vec4 velocityData = texture2D(uVelocityTex, uv);
    vec3 force = vec3(0.0);
    vec3 particlePosition = positionData.xyz;
    vec3 particleVelocity = velocityData.xyz;
    float particleMass = uParticleGlobalMass * positionData.w;

    for (int index = 0; index < 20; index += 1) {
      if (float(index) >= uAttractorCount) break;
      vec3 toAttractor = uAttractorPositions[index] - particlePosition;
      float distanceToAttractor = max(length(toAttractor), 0.08);
      vec3 direction = toAttractor / distanceToAttractor;
      float gravityStrength = uAttractorMass * particleMass * GRAVITY_CONSTANT
        * uAttractorMagnitudes[index] / (distanceToAttractor * distanceToAttractor);
      force += direction * gravityStrength;
      vec3 spinningForce = uAttractorRotationAxes[index] * gravityStrength * uSpinningStrength;
      force += cross(spinningForce, toAttractor);
    }

    particleVelocity += force * uDt;
    float speed = length(particleVelocity);
    if (speed > uMaxSpeed) particleVelocity = particleVelocity / speed * uMaxSpeed;
    particleVelocity *= (1.0 - uVelocityDamping);
    gl_FragColor = vec4(particleVelocity, 0.0);
  }
`;

const ATTRACTOR_VERTEX_SHADER = `
  uniform sampler2D uPositionTex;
  uniform sampler2D uVelocityTex;
  uniform float uScale;
  uniform float uMaxSpeed;
  uniform bool uCameraFacing;
  attribute vec2 aSimulationUv;
  varying float vSpeed;
  varying float vMass;

  void main() {
    vec4 positionData = texture2D(uPositionTex, aSimulationUv);
    vec3 velocity = texture2D(uVelocityTex, aSimulationUv).xyz;
    vSpeed = clamp(length(velocity) / max(uMaxSpeed, 0.001), 0.0, 1.0);
    vMass = positionData.w;
    float particleScale = uScale * (0.25 + vMass * 0.75);
    vec4 particlePosition;
    if (uCameraFacing) {
      particlePosition = modelViewMatrix * vec4(positionData.xyz, 1.0);
      particlePosition.xy += position.xy * particleScale;
    } else {
      particlePosition = modelViewMatrix * vec4(positionData.xyz + position * particleScale, 1.0);
    }
    gl_Position = projectionMatrix * particlePosition;
  }
`;

const ATTRACTOR_FRAGMENT_SHADER = `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying float vSpeed;
  varying float vMass;

  void main() {
    vec3 color = mix(uColorA, uColorB, smoothstep(0.0, 0.65, vSpeed));
    float glow = 0.55 + vMass * 0.45;
    gl_FragColor = vec4(color * glow, 0.88);
  }
`;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createConfiguration(variant = 'simple') {
  return {
    attractorMassExponent: 7,
    particleGlobalMassExponent: 4,
    maxSpeed: 8,
    velocityDamping: 0.1,
    spinningStrength: 2.75,
    scale: 0.008,
    boundHalfExtent: 8,
    colorA: variant === 'blackhole' ? '#080b16' : '#5900ff',
    colorB: variant === 'blackhole' ? '#ff6a3d' : '#ffa575',
    controlsColorX: '#e66b5d',
    controlsColorY: '#74d3c5',
    controlsColorZ: '#f2c14e',
    controlsMode: 'rotate',
    particleFacing: 'world',
    helperVisible: true,
    helperShowName: false,
    helperNamePlacement: 'above',
    helperShowAttributes: false,
    newAttractorPlacement: 'origin',
    newAttractorRandomDist: 3.14,
    replayCameraTrack: 'easing',
    replayCameraEasing: 0.1,
    replayCameraOrbitSpeed: 0.1,
    replayCameraOrbitX: 1,
    replayCameraOrbitY: 0,
    replayCameraOrbitZ: 0,
    cameraOrbitOn: true,
    cameraZoomEnabled: false,
    cameraPosX: 3,
    cameraPosY: 5,
    cameraPosZ: 8,
    cameraTargetX: 0,
    cameraTargetY: 0,
    cameraTargetZ: 0,
    cameraZoom: 1,
    cameraFov: 25,
    cameraNear: 0.1,
    cameraFar: 100,
    timeScale: 1,
    playbackSpeed: 1,
    attractors: clone(INITIAL_ATTRACTORS)
  };
}

function makeBodyPreset(base, magnitudes = NINE_BODY_MAGNITUDES, rotations = false) {
  return {
    ...clone(base),
    boundHalfExtent: 50,
    attractors: NINE_BODY_POSITIONS.map((position, index) => ({
      position,
      name: NINE_BODY_NAMES[index],
      magnitude: magnitudes[index] ?? 1,
      rotation: rotations ? [0.126536 / (index + 1), 0, 0] : [0, 0, 0]
    }))
  };
}

function createPresetLibrary(variant) {
  const base = createConfiguration(variant);
  return {
    Default: clone(base),
    Chaos: { ...clone(base), spinningStrength: 8, velocityDamping: 0.02 },
    Galaxy: { ...clone(base), spinningStrength: 2, maxSpeed: 5, scale: 0.06 },
    Ring2: { ...clone(base), spinningStrength: 3.51, scale: 0.07 },
    Ring3: { ...clone(base), spinningStrength: 3.51, scale: 0.07, attractors: clone(INITIAL_ATTRACTORS).map((item, index) => ({ ...item, position: index === 0 ? [-1, 2, 0] : item.position })) },
    'Nine Fixed Attractors and equal magnitude': makeBodyPreset(base, NINE_BODY_POSITIONS.map(() => 1), true),
    'Nine Fixed Attractors with equal magnitude': makeBodyPreset(base, NINE_BODY_POSITIONS.map(() => 1), true),
    'Nine Fixed Attractors': makeBodyPreset(base)
  };
}

function readSavedPresets(variant) {
  const library = createPresetLibrary(variant);
  try {
    const saved = JSON.parse(localStorage.getItem(PRESET_STORAGE_KEY) || '{}');
    Object.assign(library, saved);
  } catch {
    return library;
  }
  return library;
}

function sanitizeConfiguration(data, variant) {
  const base = createConfiguration(variant);
  const next = { ...base, ...data };
  const placement = data.helperNamePlacement ?? (data.helperShowNamesBelow ? 'below' : base.helperNamePlacement);
  next.helperNamePlacement = ['above', 'center', 'below'].includes(placement) ? placement : base.helperNamePlacement;
  next.particleFacing = data.particleFacing === 'camera' ? 'camera' : base.particleFacing;
  next.cameraZoomEnabled = Boolean(data.cameraZoomEnabled);
  next.helperShowAttributes = Boolean(data.helperShowAttributes);
  next.attractors = Array.isArray(data.attractors) && data.attractors.length > 0
    ? data.attractors.slice(0, MAX_ATTRACTORS).map((attractor, index) => ({
      position: Array.isArray(attractor.position) ? attractor.position.slice(0, 3) : [0, 0, 0],
      rotation: Array.isArray(attractor.rotation) ? attractor.rotation.slice(0, 3) : [0, 0, 0],
      name: attractor.name || `Attractor ${index}`,
      magnitude: Math.max(0, Number(attractor.magnitude ?? 1))
    }))
    : clone(base.attractors);
  return next;
}

function AttractorParticles({ configuration, onGpuError }) {
  const { gl } = useThree();
  const computeRef = useRef(null);
  const positionVariableRef = useRef(null);
  const velocityVariableRef = useRef(null);
  const configurationRef = useRef(configuration);
  configurationRef.current = configuration;
  const resolution = Math.ceil(Math.sqrt(PARTICLE_COUNT));
  const geometry = useMemo(() => {
    const nextGeometry = new PlaneGeometry(1, 1);
    nextGeometry.setAttribute('aSimulationUv', new InstancedBufferAttribute(createSimulationUvs(resolution, PARTICLE_COUNT), 2));
    return nextGeometry;
  }, [resolution]);
  const material = useMemo(() => new ShaderMaterial({
    uniforms: {
      uPositionTex: { value: null },
      uVelocityTex: { value: null },
      uScale: { value: configuration.scale },
      uMaxSpeed: { value: configuration.maxSpeed },
      uCameraFacing: { value: configuration.particleFacing === 'camera' },
      uColorA: { value: new Color(configuration.colorA) },
      uColorB: { value: new Color(configuration.colorB) }
    },
    vertexShader: ATTRACTOR_VERTEX_SHADER,
    fragmentShader: ATTRACTOR_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending
  }), []);

  useEffect(() => {
    let gpuCompute;
    try {
      const simulation = createGpuParticleField({
        gl,
        resolution,
        positionShader: ATTRACTOR_POSITION_SHADER,
        velocityShader: ATTRACTOR_VELOCITY_SHADER,
        initialize: ({ positionData, velocityData, offset }) => {
          positionData[offset] = (Math.random() - 0.5) * 5;
          positionData[offset + 1] = (Math.random() - 0.5) * 0.2;
          positionData[offset + 2] = (Math.random() - 0.5) * 5;
          positionData[offset + 3] = 0.25 + Math.random() * 0.75;
          const phi = Math.random() * Math.PI * 2;
          const theta = Math.random() * Math.PI;
          velocityData[offset] = Math.sin(theta) * Math.sin(phi) * 0.05;
          velocityData[offset + 1] = Math.cos(theta) * 0.05;
          velocityData[offset + 2] = Math.sin(theta) * Math.cos(phi) * 0.05;
          velocityData[offset + 3] = 0;
        }
      });
      gpuCompute = simulation.gpuCompute;
      computeRef.current = gpuCompute;
      positionVariableRef.current = simulation.positionVariable;
      velocityVariableRef.current = simulation.velocityVariable;
      const positionUniforms = simulation.positionVariable.material.uniforms;
      positionUniforms.uDt = { value: 1 / 60 };
      positionUniforms.uBoundHalfExtent = { value: configurationRef.current.boundHalfExtent };
      const velocityUniforms = simulation.velocityVariable.material.uniforms;
      velocityUniforms.uDt = { value: 1 / 60 };
      velocityUniforms.uAttractorMass = { value: 10 ** configurationRef.current.attractorMassExponent };
      velocityUniforms.uParticleGlobalMass = { value: 10 ** configurationRef.current.particleGlobalMassExponent };
      velocityUniforms.uSpinningStrength = { value: configurationRef.current.spinningStrength };
      velocityUniforms.uMaxSpeed = { value: configurationRef.current.maxSpeed };
      velocityUniforms.uVelocityDamping = { value: configurationRef.current.velocityDamping };
      velocityUniforms.uAttractorCount = { value: configurationRef.current.attractors.length };
      velocityUniforms.uAttractorPositions = { value: Array.from({ length: MAX_ATTRACTORS }, () => new Vector3()) };
      velocityUniforms.uAttractorRotationAxes = { value: Array.from({ length: MAX_ATTRACTORS }, () => new Vector3(0, 1, 0)) };
      velocityUniforms.uAttractorMagnitudes = { value: new Float32Array(MAX_ATTRACTORS).fill(1) };
      const initializationError = gpuCompute.init();
      if (initializationError) throw new Error(initializationError);
    } catch (error) {
      onGpuError(error instanceof Error ? error.message : 'GPU attractor simulation could not initialize.');
    }
    return () => {
      computeRef.current = null;
      positionVariableRef.current = null;
      velocityVariableRef.current = null;
      gpuCompute?.dispose();
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, gl, onGpuError, material, resolution]);

  useFrame((_, delta) => {
    const compute = computeRef.current;
    const positionVariable = positionVariableRef.current;
    const velocityVariable = velocityVariableRef.current;
    if (!compute || !positionVariable || !velocityVariable) return;
    const current = configurationRef.current;
    const frameDelta = Math.min(delta, 1 / 30);
    const positionUniforms = positionVariable.material.uniforms;
    const velocityUniforms = velocityVariable.material.uniforms;
    positionUniforms.uDt.value = frameDelta;
    positionUniforms.uBoundHalfExtent.value = current.boundHalfExtent;
    velocityUniforms.uDt.value = 1 / 60 * current.timeScale;
    velocityUniforms.uAttractorMass.value = 10 ** current.attractorMassExponent;
    velocityUniforms.uParticleGlobalMass.value = 10 ** current.particleGlobalMassExponent;
    velocityUniforms.uSpinningStrength.value = current.spinningStrength;
    velocityUniforms.uMaxSpeed.value = current.maxSpeed;
    velocityUniforms.uVelocityDamping.value = current.velocityDamping;
    velocityUniforms.uAttractorCount.value = current.attractors.length;
    current.attractors.forEach((attractor, index) => {
      velocityUniforms.uAttractorPositions.value[index].fromArray(attractor.position);
      velocityUniforms.uAttractorRotationAxes.value[index].set(0, 1, 0).applyEuler(new Euler(...attractor.rotation)).normalize();
      velocityUniforms.uAttractorMagnitudes.value[index] = attractor.magnitude;
    });
    compute.compute();
    material.uniforms.uPositionTex.value = compute.getCurrentRenderTarget(positionVariable).texture;
    material.uniforms.uVelocityTex.value = compute.getCurrentRenderTarget(velocityVariable).texture;
    material.uniforms.uScale.value = current.scale;
    material.uniforms.uMaxSpeed.value = current.maxSpeed;
    material.uniforms.uCameraFacing.value = current.particleFacing === 'camera';
    material.uniforms.uColorA.value.set(current.colorA);
    material.uniforms.uColorB.value.set(current.colorB);
  });

  return <instancedMesh args={[geometry, material, PARTICLE_COUNT]} frustumCulled={false} />;
}

function AttractorHandle({ attractor, index, configuration, onChange }) {
  const objectRef = useRef();
  const controlsRef = useRef();
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls?.setColors) return;
    controls.setColors(
      new Color(configuration.controlsColorX).getHex(SRGBColorSpace),
      new Color(configuration.controlsColorY).getHex(SRGBColorSpace),
      new Color(configuration.controlsColorZ).getHex(SRGBColorSpace)
    );
  }, [configuration.controlsColorX, configuration.controlsColorY, configuration.controlsColorZ]);
  const onObjectChange = () => {
    if (!objectRef.current) return;
    onChange(index, {
      position: objectRef.current.position.toArray(),
      rotation: [objectRef.current.rotation.x, objectRef.current.rotation.y, objectRef.current.rotation.z]
    });
  };
  const labelOffset = configuration.helperNamePlacement === 'center' ? 0 : configuration.helperNamePlacement === 'below' ? -1.5 : 1.5;
  const showLabel = configuration.helperShowName || configuration.helperShowAttributes;
  return (
    <TransformControls ref={controlsRef} object={objectRef} mode={configuration.controlsMode === 'none' ? 'translate' : configuration.controlsMode} enabled={configuration.controlsMode !== 'none'} size={0.5} onObjectChange={onObjectChange}>
      <group ref={objectRef} position={attractor.position} rotation={attractor.rotation}>
        <group visible={configuration.helperVisible} scale={0.325}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1, 1.02, 32, 1, 0, Math.PI * 1.5]} />
            <meshBasicMaterial color={configuration.controlsColorY} side={DoubleSide} />
          </mesh>
          <mesh position={[1, 0, 0.2]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.25 + Math.min(attractor.magnitude, 10) / 10 * 0.75, 1]}>
            <coneGeometry args={[0.1, 0.4, 12]} />
            <meshBasicMaterial color={configuration.controlsColorX} />
          </mesh>
        </group>
        {showLabel && <Html position={[0, labelOffset, 0]} center distanceFactor={8} className="attractor-label">{configuration.helperShowName && <strong>{attractor.name}</strong>}{configuration.helperShowAttributes && <span>mag {attractor.magnitude.toFixed(2)} / pos {attractor.position.map((value) => value.toFixed(2)).join(', ')}</span>}</Html>}
      </group>
    </TransformControls>
  );
}

function AttractorCamera({ configuration, onCameraChange, playing }) {
  const { camera } = useThree();
  const controlsRef = useRef();
  const configurationRef = useRef(configuration);
  configurationRef.current = configuration;
  useEffect(() => {
    const nextPosition = new Vector3(configuration.cameraPosX, configuration.cameraPosY, configuration.cameraPosZ);
    const target = new Vector3(configuration.cameraTargetX, configuration.cameraTargetY, configuration.cameraTargetZ);
    if (nextPosition.distanceTo(target) < 0.25) nextPosition.set(target.x, target.y, target.z + 0.25);
    camera.position.copy(nextPosition);
    camera.zoom = configuration.cameraZoomEnabled ? configuration.cameraZoom : 1;
    camera.fov = configuration.cameraFov;
    camera.near = configuration.cameraNear;
    camera.far = configuration.cameraFar;
    camera.updateProjectionMatrix();
    if (controlsRef.current) {
      controlsRef.current.target.set(configuration.cameraTargetX, configuration.cameraTargetY, configuration.cameraTargetZ);
      controlsRef.current.update();
    }
  }, [camera, configuration.cameraFar, configuration.cameraFov, configuration.cameraNear, configuration.cameraPosX, configuration.cameraPosY, configuration.cameraPosZ, configuration.cameraTargetX, configuration.cameraTargetY, configuration.cameraTargetZ, configuration.cameraZoom, configuration.cameraZoomEnabled]);
  useFrame((_, delta) => {
    const current = configurationRef.current;
    if (current.cameraOrbitOn || (playing && current.replayCameraTrack === 'orbit')) {
      const angle = delta * current.replayCameraOrbitSpeed;
      const offset = camera.position.clone().sub(controlsRef.current?.target || new Vector3());
      offset.applyEuler(new Euler(angle * current.replayCameraOrbitX, angle * current.replayCameraOrbitY, angle * current.replayCameraOrbitZ));
      camera.position.copy(controlsRef.current?.target || new Vector3()).add(offset);
      controlsRef.current?.update();
    }
  });
  const recordCamera = () => {
    if (!controlsRef.current) return;
    onCameraChange({
      cameraPosX: camera.position.x,
      cameraPosY: camera.position.y,
      cameraPosZ: camera.position.z,
      cameraTargetX: controlsRef.current.target.x,
      cameraTargetY: controlsRef.current.target.y,
      cameraTargetZ: controlsRef.current.target.z,
      cameraZoom: camera.zoom,
      cameraFov: camera.fov,
      cameraNear: camera.near,
      cameraFar: camera.far
    });
  };
  return <OrbitControls ref={controlsRef} makeDefault enableDamping enableZoom={configuration.cameraZoomEnabled} dampingFactor={0.08} minDistance={0.25} maxDistance={50} onEnd={recordCamera} />;
}

function AttractorWorld({ configuration, onAttractorChange, onGpuError, playing, onCameraChange }) {
  return (
    <>
      <color attach="background" args={['#050810']} />
      <fog attach="fog" args={['#050810', 14, 55]} />
      <ambientLight color="#9bb4ff" intensity={0.55} />
      <directionalLight color="#fff2d4" intensity={1.5} position={[4, 5, 2]} />
      <pointLight color="#ff885e" intensity={2.2} distance={18} position={[0, 0, 0]} />
      <gridHelper args={[16, 16, '#25304c', '#101827']} />
      <AttractorParticles configuration={configuration} onGpuError={onGpuError} />
      {configuration.attractors.map((attractor, index) => (
        <AttractorHandle key={`${index}:${attractor.name}`} attractor={attractor} index={index} configuration={configuration} onChange={onAttractorChange} />
      ))}
      <AttractorCamera configuration={configuration} onCameraChange={onCameraChange} playing={playing} />
    </>
  );
}

function RangeControl({ label, value, min, max, step, onChange, disabled = false }) {
  return <label className="attractor-control"><span>{label}<strong>{Number(value).toFixed(step < 0.01 ? 3 : step < 1 ? 2 : 0)}</strong></span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} disabled={disabled} /></label>;
}

function ColorControl({ label, value, onChange }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (/^#[\da-f]{6}$/i.test(draft)) onChange(draft.toLowerCase());
    else setDraft(value);
  };
  return <label className="attractor-color"><span>{label}</span><div className="attractor-color-inputs"><input type="color" value={value} onChange={(event) => onChange(event.target.value)} /><input type="text" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} aria-label={`${label} hex`} maxLength={7} spellCheck="false" /></div></label>;
}

function BooleanControl({ label, value, onChange }) {
  return <label className="attractor-toggle"><input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>;
}

function SelectControl({ label, value, options, onChange }) {
  return <label className="attractor-select"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} onPointerDown={(event) => event.stopPropagation()}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function AttractorPanel({ configuration, presets, currentPreset, jsonText, setJsonText, onChange, onApplyPreset, onSavePreset, onReset, onExport, onLoad, onDeletePresets, journal, playing, playbackTime, onPlaybackTime, onTogglePlayback, onStop, recording, onRecording, onAddAttractor, onRemoveAttractor, onBack, paramsVisible }) {
  return (
    <aside className={`attractor-panel ${paramsVisible ? '' : 'is-hidden'}`} aria-hidden={!paramsVisible} onPointerDown={(event) => event.stopPropagation()}>
      <div className="attractor-panel-header"><div><span className="attractor-eyebrow">SQGSIM / GPU COMPUTE</span><h2>Attractor particles</h2></div><button type="button" className="attractor-back" onClick={onBack}>Lab menu</button></div>
      <p className="attractor-intro">A bounded field of particles orbiting configurable gravitational and spinning attractors.</p>
      <div className="attractor-status"><span className="status-pip" />{configuration.attractors.length} attractors / {PARTICLE_COUNT.toLocaleString()} particles</div>

      <section className="attractor-section">
        <div className="attractor-section-heading"><span>Preset</span><div className="attractor-actions attractor-preset-actions"><button type="button" onClick={onSavePreset}>Save snapshot</button><button type="button" onClick={onReset}>Reset</button></div></div>
        <select className="attractor-preset" value={currentPreset} onChange={(event) => onApplyPreset(event.target.value)} onPointerDown={(event) => event.stopPropagation()}>{Object.keys(presets).map((name) => <option key={name} value={name}>{name}</option>)}</select>
      </section>

      <details className="attractor-details" open>
        <summary>Particle field</summary>
        <RangeControl label="Attractor mass exponent" value={configuration.attractorMassExponent} min={1} max={10} step={1} onChange={(value) => onChange({ attractorMassExponent: value }, 'attractorMassExponent')} />
        <RangeControl label="Particle mass exponent" value={configuration.particleGlobalMassExponent} min={1} max={10} step={1} onChange={(value) => onChange({ particleGlobalMassExponent: value }, 'particleGlobalMassExponent')} />
        <RangeControl label="Maximum speed" value={configuration.maxSpeed} min={0} max={10} step={0.01} onChange={(value) => onChange({ maxSpeed: value }, 'maxSpeed')} />
        <RangeControl label="Velocity damping" value={configuration.velocityDamping} min={0} max={0.1} step={0.001} onChange={(value) => onChange({ velocityDamping: value }, 'velocityDamping')} />
        <RangeControl label="Spinning strength" value={configuration.spinningStrength} min={0} max={10} step={0.01} onChange={(value) => onChange({ spinningStrength: value }, 'spinningStrength')} />
        <RangeControl label="Particle scale" value={configuration.scale} min={0} max={0.1} step={0.001} onChange={(value) => onChange({ scale: value }, 'scale')} />
        <RangeControl label="Bound half extent" value={configuration.boundHalfExtent} min={0.5} max={20} step={0.01} onChange={(value) => onChange({ boundHalfExtent: value }, 'boundHalfExtent')} />
        <SelectControl label="Particle facing" value={configuration.particleFacing} options={['world', 'camera']} onChange={(value) => onChange({ particleFacing: value }, 'particleFacing')} />
      </details>

      <details className="attractor-details" open>
        <summary>Attractor rig</summary>
        <SelectControl label="Transform mode" value={configuration.controlsMode} options={['translate', 'rotate', 'none']} onChange={(value) => onChange({ controlsMode: value }, 'controlsMode')} />
        <BooleanControl label="Show helper rings" value={configuration.helperVisible} onChange={(value) => onChange({ helperVisible: value }, 'helperVisible')} />
        <BooleanControl label="Show names" value={configuration.helperShowName} onChange={(value) => onChange({ helperShowName: value }, 'helperShowName')} />
        <BooleanControl label="Show attractor attributes" value={configuration.helperShowAttributes} onChange={(value) => onChange({ helperShowAttributes: value }, 'helperShowAttributes')} />
        <SelectControl label="Label placement" value={configuration.helperNamePlacement} options={['above', 'center', 'below']} onChange={(value) => onChange({ helperNamePlacement: value }, 'helperNamePlacement')} />
        <SelectControl label="New placement" value={configuration.newAttractorPlacement} options={['origin', 'previous', 'centroid', 'random', 'random within distance']} onChange={(value) => onChange({ newAttractorPlacement: value }, 'newAttractorPlacement')} />
        <RangeControl label="Random distance" value={configuration.newAttractorRandomDist} min={0} max={20} step={0.01} onChange={(value) => onChange({ newAttractorRandomDist: value }, 'newAttractorRandomDist')} />
        <div className="attractor-actions"><button type="button" onClick={onAddAttractor}>Add attractor</button><button type="button" onClick={onRemoveAttractor}>Remove last</button></div>
        <div className="attractor-list">{configuration.attractors.map((attractor, index) => <AttractorEditor key={`${index}:${attractor.name}`} attractor={attractor} index={index} onChange={onChange} />)}</div>
      </details>

      <details className="attractor-details">
        <summary>Colors</summary>
        <ColorControl label="Color A" value={configuration.colorA} onChange={(value) => onChange({ colorA: value }, 'colorA')} />
        <ColorControl label="Color B" value={configuration.colorB} onChange={(value) => onChange({ colorB: value }, 'colorB')} />
        <ColorControl label="Controls X" value={configuration.controlsColorX} onChange={(value) => onChange({ controlsColorX: value }, 'controlsColorX')} />
        <ColorControl label="Controls Y" value={configuration.controlsColorY} onChange={(value) => onChange({ controlsColorY: value }, 'controlsColorY')} />
        <ColorControl label="Controls Z" value={configuration.controlsColorZ} onChange={(value) => onChange({ controlsColorZ: value }, 'controlsColorZ')} />
      </details>

      <details className="attractor-details">
        <summary>IO / journal</summary>
        <textarea className="attractor-json" value={jsonText} onChange={(event) => setJsonText(event.target.value)} aria-label="Preset JSON" />
        <div className="attractor-actions"><button type="button" onClick={onLoad}>Load JSON</button><button type="button" onClick={() => onExport('current')}>Export current</button></div>
        <div className="attractor-actions"><button type="button" onClick={() => onExport('all')}>Export all</button><button type="button" onClick={() => onExport('saved')}>Export saved</button></div>
        <button type="button" className="attractor-danger" onClick={onDeletePresets}>Delete local presets</button>
        <BooleanControl label="Record simulation (slow)" value={recording} onChange={onRecording} />
        <div className="journal-controls"><button type="button" onClick={onTogglePlayback}>{playing ? 'Pause' : 'Play'}</button><button type="button" onClick={onStop}>Stop / reset</button></div>
        <RangeControl label="Playback speed" value={configuration.playbackSpeed} min={0.1} max={10} step={0.1} onChange={(value) => onChange({ playbackSpeed: value }, 'playbackSpeed')} />
        <RangeControl label="Timeline" value={playbackTime} min={0} max={Math.max(1, journal.at(-1)?.time || 1)} step={1} onChange={onPlaybackTime} />
      </details>

      <details className="attractor-details">
        <summary>Camera</summary>
        <SelectControl label="Replay mode" value={configuration.replayCameraTrack} options={['false', 'exact', 'easing', 'orbit']} onChange={(value) => onChange({ replayCameraTrack: value }, 'replayCameraTrack')} />
        <BooleanControl label="Orbit on" value={configuration.cameraOrbitOn} onChange={(value) => onChange({ cameraOrbitOn: value }, 'cameraOrbitOn')} />
        <BooleanControl label="Enable zoom" value={configuration.cameraZoomEnabled} onChange={(value) => onChange({ cameraZoomEnabled: value }, 'cameraZoomEnabled')} />
        <RangeControl label="Orbit speed" value={configuration.replayCameraOrbitSpeed} min={0.01} max={2} step={0.01} onChange={(value) => onChange({ replayCameraOrbitSpeed: value }, 'replayCameraOrbitSpeed')} />
        <RangeControl label="Orbit X" value={configuration.replayCameraOrbitX} min={-1} max={1} step={0.01} onChange={(value) => onChange({ replayCameraOrbitX: value }, 'replayCameraOrbitX')} />
        <RangeControl label="Orbit Y" value={configuration.replayCameraOrbitY} min={-1} max={1} step={0.01} onChange={(value) => onChange({ replayCameraOrbitY: value }, 'replayCameraOrbitY')} />
        <RangeControl label="Orbit Z" value={configuration.replayCameraOrbitZ} min={-1} max={1} step={0.01} onChange={(value) => onChange({ replayCameraOrbitZ: value }, 'replayCameraOrbitZ')} />
        {['cameraPosX', 'cameraPosY', 'cameraPosZ', 'cameraTargetX', 'cameraTargetY', 'cameraTargetZ'].map((key) => <RangeControl key={key} label={key.replace('camera', 'Camera ')} value={configuration[key]} min={-50} max={50} step={0.01} onChange={(value) => onChange({ [key]: value }, key)} />)}
        <RangeControl label="Zoom" value={configuration.cameraZoom} min={0.1} max={10} step={0.01} onChange={(value) => onChange({ cameraZoom: value }, 'cameraZoom')} disabled={!configuration.cameraZoomEnabled} />
        <RangeControl label="FOV" value={configuration.cameraFov} min={1} max={179} step={1} onChange={(value) => onChange({ cameraFov: value }, 'cameraFov')} />
        <RangeControl label="Near" value={configuration.cameraNear} min={0.001} max={10} step={0.001} onChange={(value) => onChange({ cameraNear: value }, 'cameraNear')} />
        <RangeControl label="Far" value={configuration.cameraFar} min={10} max={10000} step={1} onChange={(value) => onChange({ cameraFar: value }, 'cameraFar')} />
      </details>
    </aside>
  );
}

function AttractorEditor({ attractor, index, onChange }) {
  const update = (field, axis, value) => {
    const values = [...attractor[field]];
    values[axis] = value;
    onChange({ attractors: null }, `attractors[${index}].${field}.${axis}`, { index, field, values });
  };
  return (
    <details className="attractor-editor">
      <summary>{attractor.name}</summary>
      {['position', 'rotation'].map((field) => <div className="attractor-axis-group" key={field}><span>{field}</span>{[0, 1, 2].map((axis) => <input key={axis} type="number" step="0.01" value={attractor[field][axis]} onChange={(event) => update(field, axis, Number(event.target.value))} aria-label={`${attractor.name} ${field} ${axis}`} />)}</div>)}
      <label className="attractor-number"><span>Magnitude</span><input type="number" min="0" step="0.01" value={attractor.magnitude} onChange={(event) => onChange({ attractors: null }, `attractors[${index}].magnitude`, { index, field: 'magnitude', value: Number(event.target.value) })} /></label>
    </details>
  );
}

function AttractorModal({ title, value, onClose }) {
  return <div className="attractor-modal-backdrop" onClick={onClose}><section className="attractor-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><header><h3>{title}</h3><button type="button" onClick={onClose} aria-label="Close export">Close</button></header><textarea readOnly value={JSON.stringify(value, null, 2)} /></section></div>;
}

function SimpleAttractorSim({ variant = 'simple', onBack }) {
  const [configuration, setConfiguration] = useState(() => createConfiguration(variant));
  const configurationRef = useRef(configuration);
  configurationRef.current = configuration;
  const [presets, setPresets] = useState(() => readSavedPresets(variant));
  const [currentPreset, setCurrentPreset] = useState('Default');
  const [jsonText, setJsonText] = useState(() => JSON.stringify(createConfiguration(variant), null, 2));
  const [gpuError, setGpuError] = useState('');
  const [modal, setModal] = useState(null);
  const [paramsVisible, setParamsVisible] = useState(true);
  const [recording, setRecording] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const initialSnapshot = useMemo(() => clone(configuration), []);
  const [journal, setJournal] = useState(() => [{ time: 0, snapshot: initialSnapshot }]);
  const journalRef = useRef(journal);
  const journalStartRef = useRef(Date.now());
  const replayingRef = useRef(false);
  const presetApplyingRef = useRef(false);

  const recordChange = (next, path, value) => {
    if (!recording || replayingRef.current || !path) return;
    const entry = { time: Date.now() - journalStartRef.current, path, value, snapshot: clone(next) };
    const nextJournal = [...journalRef.current, entry];
    journalRef.current = nextJournal;
    setJournal(nextJournal);
    setPlaybackTime(entry.time);
  };

  const applyConfiguration = (data, path = 'configuration', value = null) => {
    const next = sanitizeConfiguration(data, variant);
    configurationRef.current = next;
    setConfiguration(next);
    setJsonText(JSON.stringify(next, null, 2));
    recordChange(next, path, value);
  };

  const onChange = (patch, path, special = null) => {
    let next;
    if (patch.attractors === null && special) {
      const attractors = clone(configurationRef.current.attractors);
      const target = attractors[special.index];
      if (special.field === 'magnitude') target.magnitude = Math.max(0, special.value);
      else target[special.field] = special.values;
      next = { ...configurationRef.current, attractors };
    } else {
      next = { ...configurationRef.current, ...patch };
    }
    configurationRef.current = next;
    setConfiguration(next);
    setJsonText(JSON.stringify(next, null, 2));
    recordChange(next, path, special || Object.values(patch)[0]);
    if (!presetApplyingRef.current && !currentPreset.includes('draft')) {
      const draftName = `${currentPreset} draft`;
      setPresets((current) => ({ ...current, [draftName]: clone(next) }));
      setCurrentPreset(draftName);
    }
  };

  const onAttractorChange = (index, transform) => {
    const attractors = clone(configurationRef.current.attractors);
    attractors[index] = { ...attractors[index], ...transform };
    onChange({ attractors }, `attractors[${index}].transform`);
  };

  const onAddAttractor = () => {
    if (configurationRef.current.attractors.length >= MAX_ATTRACTORS) return;
    const current = configurationRef.current;
    const index = current.attractors.length;
    const position = new Vector3();
    if (current.newAttractorPlacement === 'previous') position.fromArray(current.attractors[index - 1]?.position || [0, 0, 0]);
    if (current.newAttractorPlacement === 'centroid' || current.newAttractorPlacement === 'random within distance') {
      current.attractors.forEach((attractor) => position.add(new Vector3(...attractor.position)));
      position.divideScalar(Math.max(1, current.attractors.length));
    }
    if (current.newAttractorPlacement === 'random') position.set((Math.random() - 0.5) * current.boundHalfExtent * 2, (Math.random() - 0.5) * current.boundHalfExtent * 2, (Math.random() - 0.5) * current.boundHalfExtent * 2);
    if (current.newAttractorPlacement === 'random within distance') position.add(new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(Math.cbrt(Math.random()) * current.newAttractorRandomDist));
    onChange({ attractors: [...current.attractors, { position: position.toArray(), rotation: [0, 0, 0], name: `Attractor ${index}`, magnitude: 1 }] }, 'sys:addAttractor');
  };

  const onRemoveAttractor = () => {
    if (configurationRef.current.attractors.length <= 1) return;
    onChange({ attractors: configurationRef.current.attractors.slice(0, -1) }, 'sys:removeAttractor');
  };

  const onApplyPreset = (name) => {
    if (!presets[name]) return;
    presetApplyingRef.current = true;
    applyConfiguration(presets[name], `preset:${name}`);
    setCurrentPreset(name);
    presetApplyingRef.current = false;
  };

  const onSavePreset = () => {
    const name = new Date().toISOString();
    const nextPresets = { ...presets, [name]: clone(configurationRef.current) };
    setPresets(nextPresets);
    setCurrentPreset(name);
    try {
      localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(nextPresets));
    } catch {
      return;
    }
  };

  const onReset = () => {
    const next = createConfiguration(variant);
    configurationRef.current = next;
    setConfiguration(next);
    setJsonText(JSON.stringify(next, null, 2));
    setCurrentPreset('Default');
    setPlaying(false);
    setPlaybackTime(0);
    journalStartRef.current = Date.now();
    const nextJournal = [{ time: 0, snapshot: clone(next) }];
    journalRef.current = nextJournal;
    setJournal(nextJournal);
  };

  const onLoad = () => {
    try {
      applyConfiguration(JSON.parse(jsonText), 'io:load');
      setCurrentPreset('JSON draft');
    } catch {
      setModal({ title: 'Invalid JSON', value: { error: 'The preset JSON could not be parsed.' } });
    }
  };

  const onDeletePresets = () => {
    localStorage.removeItem(PRESET_STORAGE_KEY);
    setPresets(createPresetLibrary(variant));
    setCurrentPreset('Default');
  };

  const applyStateAt = (time) => {
    const snapshot = [...journalRef.current].reverse().find((entry) => entry.time <= time)?.snapshot;
    if (!snapshot) return;
    replayingRef.current = true;
    const next = sanitizeConfiguration(snapshot, variant);
    configurationRef.current = next;
    setConfiguration(next);
    setJsonText(JSON.stringify(next, null, 2));
    replayingRef.current = false;
  };

  useEffect(() => {
    if (!playing) return undefined;
    let frameId;
    const tick = () => {
      const duration = journalRef.current.at(-1)?.time || 0;
      const nextTime = Math.min(duration, playbackTime + 16 * configurationRef.current.playbackSpeed);
      setPlaybackTime(nextTime);
      applyStateAt(nextTime);
      if (nextTime >= duration) setPlaying(false);
      else frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [playing, playbackTime]);

  useEffect(() => {
    const undo = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.key !== 'z' || journalRef.current.length < 2) return;
      event.preventDefault();
      const nextJournal = journalRef.current.slice(0, -1);
      journalRef.current = nextJournal;
      setJournal(nextJournal);
      const time = nextJournal.at(-1).time;
      setPlaybackTime(time);
      applyStateAt(time);
    };
    window.addEventListener('keydown', undo);
    return () => window.removeEventListener('keydown', undo);
  }, []);

  const reportTitle = variant === 'blackhole' ? 'Black hole particles' : 'Attractor particles';
  return (
    <main className={`attractor-app ${variant === 'blackhole' ? 'blackhole-app' : ''}`}>
      <div className="attractor-scene"><Canvas camera={{ position: [3, 5, 8], fov: 25, near: 0.1, far: 100 }} dpr={[1, 2]} gl={{ antialias: true, powerPreference: 'high-performance' }}><AttractorWorld configuration={configuration} onAttractorChange={onAttractorChange} onGpuError={setGpuError} playing={playing} onCameraChange={(change) => onChange(change, 'sys:camera')} /></Canvas></div>
      <header className="attractor-topbar"><div><span className="sqg-mark">SQG</span><span><b>SQGSIM</b><em>{variant === 'blackhole' ? 'Black-hole sandbox' : 'Particle dynamics lab'}</em></span></div><div className="attractor-top-actions"><span className="attractor-top-meta">WEBGL / GPGPU / {reportTitle.toUpperCase()}</span><button type="button" className="attractor-params-toggle" aria-pressed={paramsVisible} onClick={() => setParamsVisible((value) => !value)}>{paramsVisible ? 'Hide params' : 'Show params'}</button></div></header>
      <AttractorPanel configuration={configuration} presets={presets} currentPreset={currentPreset} jsonText={jsonText} setJsonText={setJsonText} onChange={onChange} onApplyPreset={onApplyPreset} onSavePreset={onSavePreset} onReset={onReset} onExport={(type) => setModal({ title: type === 'all' ? 'All presets' : type === 'saved' ? 'Saved presets' : 'Current parameters', value: type === 'current' ? configuration : presets })} onLoad={onLoad} onDeletePresets={onDeletePresets} journal={journal} playing={playing} playbackTime={playbackTime} onPlaybackTime={(value) => { setPlaybackTime(value); applyStateAt(value); }} onTogglePlayback={() => setPlaying((value) => !value)} onStop={() => { setPlaying(false); setPlaybackTime(0); applyStateAt(0); }} recording={recording} onRecording={setRecording} onAddAttractor={onAddAttractor} onRemoveAttractor={onRemoveAttractor} onBack={onBack} paramsVisible={paramsVisible} />
      <div className="attractor-title"><span>ACTIVE FIELD / {variant === 'blackhole' ? 'SQGBLACKHOLESIM' : 'SIMPLEATTRACTORSIM'}</span><h1>{variant === 'blackhole' ? 'Superfluid Quantum Gravity' : 'Simple Particle Attractor System'}</h1><p>{variant === 'blackhole' ? 'A copied attractor rig reserved for the next experiment.' : 'Tune attractor mass, spin, and geometry within a field of particles.'}</p>{gpuError && <strong className="attractor-error">GPU offline: {gpuError}</strong>}</div>
      {modal && <AttractorModal title={modal.title} value={modal.value} onClose={() => setModal(null)} />}
    </main>
  );
}

export { SimpleAttractorSim };