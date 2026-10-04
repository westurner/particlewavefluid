import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, CatmullRomCurve3, DoubleSide, EdgesGeometry, Quaternion, TubeGeometry, Vector3 } from 'three';

const LASER_COLORS = ['#76e3d4', '#f2b45f', '#8bb8ff', '#f27d79', '#c1e77d', '#d59df2', '#6fd7f0', '#f08fae'];
const R2R_WEB_LENGTH = 6.1;
const R2R_WEB_WIDTH = 2.95;
const R2R_REEL_RADIUS = 0.46;
const R2R_FLANGE_RADIUS = 0.64;
const POLARIZATIONS = [
  { value: 'H', label: 'Linear H' },
  { value: 'V', label: 'Linear V' },
  { value: 'D', label: 'Linear 45°' },
  { value: 'R', label: 'Circular R' },
  { value: 'L', label: 'Circular L' }
];
const CIRCUITS = {
  interconnect: {
    label: 'Logic interconnect',
    paths: [
      [[-2.05, -1.06], [-1.55, -1.06], [-1.55, -0.52], [-0.62, -0.52], [-0.62, 0.1], [0.22, 0.1], [0.22, 1.08], [1.7, 1.08], [1.7, 1.28], [2.05, 1.28]],
      [[-2.04, 0.84], [-1.18, 0.84], [-1.18, 0.42], [-0.48, 0.42], [-0.48, -0.06], [1.33, -0.06], [1.33, -0.82], [2.03, -0.82]],
      [[-2.0, -0.04], [-1.63, -0.04], [-1.63, -0.33], [-0.78, -0.33], [-0.78, -1.18], [0.1, -1.18], [0.1, -0.68], [0.9, -0.68], [0.9, 0.34], [2.02, 0.34]],
      [[-1.94, 1.25], [-1.82, 1.25], [-1.82, 0.26], [-0.2, 0.26], [-0.2, 1.24], [0.98, 1.24], [0.98, 0.74], [1.52, 0.74], [1.52, 0.98], [2.0, 0.98]],
      [[-1.98, -1.28], [-0.98, -1.28], [-0.98, -0.9], [0.58, -0.9], [0.58, -0.27], [1.72, -0.27], [1.72, -0.48], [2.02, -0.48]]
    ]
  },
  sensor: {
    label: 'Spiral sensor',
    paths: [
      [[-1.8, -1.12], [-1.8, 1.12], [1.8, 1.12], [1.8, -1.12], [-1.35, -1.12], [-1.35, 0.78], [1.32, 0.78], [1.32, -0.77], [-0.94, -0.77], [-0.94, 0.42], [0.88, 0.42], [0.88, -0.38], [-0.5, -0.38], [-0.5, 0.1], [0.38, 0.1]],
      [[-2.0, 0], [-1.62, 0], [-1.62, 0.25], [-1.02, 0.25]],
      [[0.4, 0.1], [1.0, 0.1], [1.0, 0.58], [2.02, 0.58]],
      [[-0.12, 0.1], [-0.12, -0.9], [0.42, -0.9], [0.42, -1.27], [2.02, -1.27]]
    ]
  },
  photonic: {
    label: 'Photonic splitter',
    paths: [
      [[-2.03, 0], [-1.3, 0], [-0.72, 0], [-0.1, 0], [0.48, 0]],
      [[-0.1, 0], [0.26, 0.34], [0.9, 0.34], [1.2, 0.72], [2.02, 0.72]],
      [[-0.1, 0], [0.24, -0.34], [0.9, -0.34], [1.2, -0.72], [2.02, -0.72]],
      [[-1.1, 0], [-1.1, 0.72], [-0.55, 0.72], [-0.28, 1.15], [1.25, 1.15], [1.5, 1.38], [2.02, 1.38]],
      [[-1.1, 0], [-1.1, -0.72], [-0.55, -0.72], [-0.28, -1.15], [1.25, -1.15], [1.5, -1.38], [2.02, -1.38]]
    ]
  }
};
const BLOCK_EDGE_GEOMETRY = new EdgesGeometry(new BoxGeometry(5.2, 0.86, 3.25));

function createLaserModule(index) {
  return {
    id: index + 1,
    enabled: true,
    power: 86,
    phase: (index * 53) % 360,
    focusX: 0,
    focusZ: 0,
    polarization: POLARIZATIONS[index % POLARIZATIONS.length].value
  };
}

function sourcePosition(index, count, numericalAperture = 0.62) {
  const apertureScale = numericalAperture / 0.62;
  const x = count === 1 ? 0 : (-2.55 + (5.1 * index) / (count - 1)) * apertureScale;
  return new Vector3(x, 3.55, -3.05);
}

function makeCircuitPaths(layout, circuitId) {
  const route = CIRCUITS[circuitId] || CIRCUITS.interconnect;
  const baseHeight = layout === 'block' ? 0 : layout === 'wafer' ? 0.13 : 0.045;
  const layerHeights = [-0.28, -0.13, 0.04, 0.21, 0.29];
  const paths = route.paths.map((coordinates, index) => {
    const height = layout === 'block' ? layerHeights[index % layerHeights.length] : baseHeight;
    const points = coordinates.map(([x, z]) => new Vector3(x, height, z));
    return new CatmullRomCurve3(points, false, 'centripetal');
  });
  if (layout === 'block') {
    for (let index = 0; index < Math.min(4, paths.length - 1); index += 1) {
      const start = route.paths[index][Math.floor(route.paths[index].length * 0.48)];
      paths.push(new CatmullRomCurve3([
        new Vector3(start[0], layerHeights[index % layerHeights.length], start[1]),
        new Vector3(start[0], layerHeights[(index + 1) % layerHeights.length], start[1])
      ]));
    }
  }
  return paths;
}

function focusAlongPaths(paths, progress) {
  const totalLength = paths.reduce((sum, path) => sum + path.getLength(), 0);
  let distance = Math.max(0, Math.min(1, progress)) * totalLength;
  for (const path of paths) {
    const length = path.getLength();
    if (distance <= length) return path.getPointAt(length > 0 ? distance / length : 0);
    distance -= length;
  }
  return paths.at(-1)?.getPointAt(1) || new Vector3(0, 0, 0);
}

function polarizationComponents(polarization) {
  const diagonal = Math.SQRT1_2;
  if (polarization === 'V') return [0, 0, 1, 0];
  if (polarization === 'D') return [diagonal, 0, diagonal, 0];
  if (polarization === 'R') return [diagonal, 0, 0, diagonal];
  if (polarization === 'L') return [diagonal, 0, 0, -diagonal];
  return [1, 0, 0, 0];
}

function arrayCoherence(modules) {
  let xReal = 0;
  let xImaginary = 0;
  let yReal = 0;
  let yImaginary = 0;
  let totalAmplitude = 0;
  for (const module of modules) {
    if (!module.enabled || module.power <= 0) continue;
    const amplitude = Math.sqrt(module.power / 100);
    const phase = (module.phase * Math.PI) / 180;
    const cosine = Math.cos(phase);
    const sine = Math.sin(phase);
    const [pxr, pxi, pyr, pyi] = polarizationComponents(module.polarization);
    xReal += amplitude * (pxr * cosine - pxi * sine);
    xImaginary += amplitude * (pxr * sine + pxi * cosine);
    yReal += amplitude * (pyr * cosine - pyi * sine);
    yImaginary += amplitude * (pyr * sine + pyi * cosine);
    totalAmplitude += amplitude;
  }
  if (totalAmplitude === 0) return 0;
  const intensity = xReal ** 2 + xImaginary ** 2 + yReal ** 2 + yImaginary ** 2;
  return Math.max(0, Math.min(1, intensity / totalAmplitude ** 2));
}

function RangeControl({ label, value, min, max, step, unit, onChange, digits = 0 }) {
  return (
    <label className="laser-range">
      <span>{label}<strong>{Number(value).toFixed(digits)}{unit}</strong></span>
      <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function Wavefronts({ from, to, phase, color, power }) {
  const refs = useRef([]);
  useFrame(({ clock }) => {
    refs.current.forEach((mesh, index) => {
      if (!mesh) return;
      const travel = (clock.elapsedTime * 0.28 + phase / 360 + index / 3) % 1;
      mesh.position.copy(from).lerp(to, travel);
    });
  });
  return Array.from({ length: 3 }, (_, index) => (
    <mesh key={index} ref={(mesh) => { refs.current[index] = mesh; }}>
      <sphereGeometry args={[0.048 + power * 0.00012, 8, 8]} />
      <meshBasicMaterial color={color} transparent opacity={0.22 + power * 0.004} blending={AdditiveBlending} depthWrite={false} />
    </mesh>
  ));
}

function BeamModule({ module, index, count, scannerFocus, numericalAperture }) {
  const from = sourcePosition(index, count, numericalAperture);
  const to = scannerFocus.clone().add(new Vector3(module.focusX, 0, module.focusZ));
  const direction = to.clone().sub(from);
  const length = direction.length();
  const orientation = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.clone().normalize());
  const position = from.clone().add(to).multiplyScalar(0.5);
  const color = LASER_COLORS[index % LASER_COLORS.length];
  return (
    <group>
      <group position={from.toArray()} quaternion={orientation}>
        <mesh position={[0, -0.31, 0]}>
          <boxGeometry args={[0.5, 0.32, 0.42]} />
          <meshStandardMaterial color={module.enabled ? '#253637' : '#20282a'} metalness={0.66} roughness={0.34} emissive={color} emissiveIntensity={module.enabled ? 0.14 + module.power / 600 : 0.015} />
        </mesh>
        <mesh position={[0, -0.08, 0]}>
          <cylinderGeometry args={[0.16, 0.12, 0.13, 20]} />
          <meshStandardMaterial color="#a8beb3" metalness={0.7} roughness={0.22} />
        </mesh>
        <mesh position={[0, 0.015, 0]}>
          <circleGeometry args={[0.105, 20]} />
          <meshBasicMaterial color={color} transparent opacity={module.enabled ? 0.75 : 0.08} side={DoubleSide} />
        </mesh>
      </group>
      {module.enabled && (
        <>
          <mesh position={position.toArray()} quaternion={orientation}>
            <cylinderGeometry args={[0.026, 0.12, length, 14, 1, true]} />
            <meshBasicMaterial color={color} transparent opacity={0.07 + module.power * 0.0008} blending={AdditiveBlending} depthWrite={false} side={DoubleSide} />
          </mesh>
          <Wavefronts from={from} to={to} phase={module.phase} color={color} power={module.power} />
        </>
      )}
    </group>
  );
}

function InterferenceCloud({ modules, scannerFocus, wavelength, numericalAperture }) {
  const geometry = useMemo(() => {
    const positions = [];
    const colors = [];
    const samples = 15;
    for (let y = 0; y < samples; y += 1) {
      for (let z = 0; z < samples; z += 1) {
        for (let x = 0; x < samples; x += 1) {
          positions.push((x / (samples - 1) - 0.5) * 0.82, (y / (samples - 1) - 0.5) * 0.48, (z / (samples - 1) - 0.5) * 0.82);
          colors.push(0.08, 0.2, 0.19);
        }
      }
    }
    const result = new BufferGeometry();
    result.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    result.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
    return result;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(() => {
    const positions = geometry.getAttribute('position');
    const colors = geometry.getAttribute('color');
    const displayWavelength = 0.68 * wavelength / 515;
    const waveNumber = (Math.PI * 2) / displayWavelength;
    const active = modules.map((module, index) => {
      if (!module.enabled || module.power <= 0) return null;
      const source = sourcePosition(index, modules.length, numericalAperture);
      const target = scannerFocus.clone().add(new Vector3(module.focusX, 0, module.focusZ));
      return { module, source, referenceDistance: source.distanceTo(target), amplitude: Math.sqrt(module.power / 100), components: polarizationComponents(module.polarization) };
    }).filter(Boolean);
    const amplitudeScale = Math.max(active.reduce((sum, item) => sum + item.amplitude, 0) ** 2, 1);
    for (let index = 0; index < positions.count; index += 1) {
      const worldX = scannerFocus.x + positions.getX(index);
      const worldY = scannerFocus.y + positions.getY(index);
      const worldZ = scannerFocus.z + positions.getZ(index);
      let xReal = 0;
      let xImaginary = 0;
      let yReal = 0;
      let yImaginary = 0;
      for (const item of active) {
        const distance = Math.hypot(worldX - item.source.x, worldY - item.source.y, worldZ - item.source.z);
        const phase = (item.module.phase * Math.PI) / 180 + waveNumber * (distance - item.referenceDistance);
        const cosine = Math.cos(phase);
        const sine = Math.sin(phase);
        const [pxr, pxi, pyr, pyi] = item.components;
        xReal += item.amplitude * (pxr * cosine - pxi * sine);
        xImaginary += item.amplitude * (pxr * sine + pxi * cosine);
        yReal += item.amplitude * (pyr * cosine - pyi * sine);
        yImaginary += item.amplitude * (pyr * sine + pyi * cosine);
      }
      const intensity = Math.min(1, (xReal ** 2 + xImaginary ** 2 + yReal ** 2 + yImaginary ** 2) / amplitudeScale);
      colors.setXYZ(index, 0.08 + intensity * 0.78, 0.24 + intensity * 0.64, 0.25 + intensity * 0.4);
    }
    colors.needsUpdate = true;
  });
  return (
    <points position={scannerFocus.toArray()} geometry={geometry}>
      <pointsMaterial size={0.045} vertexColors transparent opacity={0.64} blending={AdditiveBlending} depthWrite={false} sizeAttenuation />
    </points>
  );
}

function CircuitTrace({ curve, progress, index }) {
  const fullGeometry = useMemo(() => new BufferGeometry().setFromPoints(curve.getPoints(100)), [curve]);
  const activeGeometry = useMemo(() => {
    if (progress <= 0.004) return null;
    const pointCount = Math.max(2, Math.ceil(100 * progress));
    const points = curve.getSpacedPoints(pointCount);
    return new TubeGeometry(new CatmullRomCurve3(points), Math.max(8, pointCount * 2), 0.025, 7, false);
  }, [curve, progress]);
  useEffect(() => () => fullGeometry.dispose(), [fullGeometry]);
  useEffect(() => () => activeGeometry?.dispose(), [activeGeometry]);
  const traceColor = ['#b7d58b', '#85d5cd', '#f2b45f', '#91b6dc', '#e8938b'][index % 5];
  return (
    <group>
      <line geometry={fullGeometry}>
        <lineBasicMaterial color={traceColor} transparent opacity={0.25} />
      </line>
      {activeGeometry && (
        <mesh geometry={activeGeometry}>
          <meshStandardMaterial color={traceColor} emissive={traceColor} emissiveIntensity={0.75} metalness={0.45} roughness={0.28} />
        </mesh>
      )}
    </group>
  );
}

function CircuitArtwork({ paths, progress }) {
  const lengths = paths.map((path) => path.getLength());
  const totalLength = lengths.reduce((sum, length) => sum + length, 0);
  let remainingLength = progress * totalLength;
  const routeProgress = lengths.map((length) => {
    const fraction = length > 0 ? Math.max(0, Math.min(1, remainingLength / length)) : 0;
    remainingLength -= length;
    return fraction;
  });
  return <group>{paths.map((path, index) => <CircuitTrace key={index} curve={path} progress={routeProgress[index]} index={index} />)}</group>;
}

function Workpiece({ layout }) {
  if (layout === 'block') {
    return (
      <group>
        <mesh>
          <boxGeometry args={[5.2, 0.86, 3.25]} />
          <meshPhysicalMaterial color="#8fb0a4" transparent opacity={0.13} roughness={0.17} metalness={0.22} clearcoat={0.7} side={DoubleSide} depthWrite={false} />
        </mesh>
        <lineSegments geometry={BLOCK_EDGE_GEOMETRY}>
          <lineBasicMaterial color="#90b5a9" transparent opacity={0.52} />
        </lineSegments>
        <mesh position={[0, -0.445, 0]}>
          <boxGeometry args={[5.35, 0.06, 3.4]} />
          <meshStandardMaterial color="#3a4541" metalness={0.62} roughness={0.47} />
        </mesh>
      </group>
    );
  }
  if (layout === 'wafer') {
    return (
      <group>
        <mesh>
          <cylinderGeometry args={[2.2, 2.2, 0.18, 96]} />
          <meshStandardMaterial color="#507b78" metalness={0.56} roughness={0.29} transparent opacity={0.83} />
        </mesh>
        <mesh position={[0, 0.096, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[2.13, 0.012, 5, 96]} />
          <meshBasicMaterial color="#e2ad67" transparent opacity={0.84} />
        </mesh>
        <mesh position={[1.9, 0.096, 0.54]}>
          <boxGeometry args={[0.2, 0.012, 0.18]} />
          <meshBasicMaterial color="#e9c77a" />
        </mesh>
      </group>
    );
  }
  return (
    <group>
      <mesh position={[0, 0.015, 0]}>
        <boxGeometry args={[R2R_WEB_LENGTH, 0.04, R2R_WEB_WIDTH]} />
        <meshStandardMaterial color="#77817a" metalness={0.42} roughness={0.34} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * R2R_WEB_LENGTH / 2, R2R_REEL_RADIUS + 0.035, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <mesh>
            <cylinderGeometry args={[R2R_REEL_RADIUS, R2R_REEL_RADIUS, R2R_WEB_WIDTH + 0.08, 48]} />
            <meshStandardMaterial color="#a9764b" metalness={0.58} roughness={0.32} />
          </mesh>
          {[-1, 1].map((flangeSide) => (
            <group key={flangeSide} position={[0, flangeSide * (R2R_WEB_WIDTH / 2 + 0.055), 0]}>
              <mesh>
                <cylinderGeometry args={[R2R_FLANGE_RADIUS, R2R_FLANGE_RADIUS, 0.11, 48]} />
                <meshStandardMaterial color="#c18d58" metalness={0.58} roughness={0.3} />
              </mesh>
              <mesh position={[0, flangeSide * 0.105, 0]}>
                <cylinderGeometry args={[0.18, 0.18, 0.12, 32]} />
                <meshStandardMaterial color="#38433e" metalness={0.7} roughness={0.32} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[0, 0.04, side * (R2R_WEB_WIDTH / 2 - 0.035)]}>
          <boxGeometry args={[R2R_WEB_LENGTH, 0.008, 0.022]} />
          <meshBasicMaterial color="#d7d8ca" transparent opacity={0.42} />
        </mesh>
      ))}
    </group>
  );
}

function LaserScene({ layout, circuitId, modules, progress, wavelength, numericalAperture, orbitEnabled }) {
  const paths = useMemo(() => makeCircuitPaths(layout, circuitId), [layout, circuitId]);
  const scannerFocus = useMemo(() => focusAlongPaths(paths, progress), [paths, progress]);
  return (
    <>
      <color attach="background" args={['#101718']} />
      <ambientLight intensity={1.15} />
      <directionalLight position={[4, 8, 5]} intensity={2.2} color="#eff3d7" />
      <pointLight position={[-4, 2, -2]} intensity={13} distance={10} color="#5bbcb1" />
      <pointLight position={[3, 3, 3]} intensity={8} distance={9} color="#e6a35b" />
      <gridHelper args={[18, 36, '#49605b', '#273633']} position={[0, -0.56, 0]} />
      <mesh position={[0, 3.89, -3.05]}>
        <boxGeometry args={[5.1 * numericalAperture / 0.62 + 1.2, 0.12, 0.68]} />
        <meshStandardMaterial color="#45514b" metalness={0.62} roughness={0.35} />
      </mesh>
      <Workpiece layout={layout} />
      <CircuitArtwork paths={paths} progress={progress} />
      {modules.map((module, index) => <BeamModule key={module.id} module={module} index={index} count={modules.length} scannerFocus={scannerFocus} numericalAperture={numericalAperture} />)}
      <InterferenceCloud modules={modules} scannerFocus={scannerFocus} wavelength={wavelength} numericalAperture={numericalAperture} />
      <mesh position={[scannerFocus.x, scannerFocus.y + 0.02, scannerFocus.z]}>
        <sphereGeometry args={[0.13, 16, 16]} />
        <meshBasicMaterial color="#fff0c5" transparent opacity={0.88} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
      <OrbitControls makeDefault enabled={orbitEnabled} target={[0, 0.35, 0]} minDistance={5.8} maxDistance={15} maxPolarAngle={Math.PI * 0.48} enableDamping />
    </>
  );
}

function LaserPanel({ layout, setLayout, modules, setModules, circuitId, setCircuitId, wavelength, setWavelength, numericalAperture, setNumericalAperture, scanSpeed, setScanSpeed, progress, running, paramsVisible, setParamsVisible, orbitEnabled, setOrbitEnabled, onReset, onRunToggle }) {
  const activeCount = modules.filter((module) => module.enabled).length;
  const options = [
    { id: 'block', name: '3D block', note: 'Layered volume' },
    { id: 'wafer', name: 'Wafer', note: 'Planar substrate' },
    { id: 'roll', name: 'R2R web', note: 'Continuous film' }
  ];
  const updateModuleCount = (count) => {
    setModules((current) => Array.from({ length: count }, (_, index) => current[index] || createLaserModule(index)));
  };
  const updateModule = (index, key, value) => {
    setModules((current) => current.map((module, moduleIndex) => moduleIndex === index ? { ...module, [key]: value } : module));
  };
  const focusSize = wavelength / (2000 * numericalAperture);
  return (
    <>
      {!paramsVisible && <button className="laser-panel-toggle" type="button" aria-pressed={false} onClick={() => setParamsVisible(true)}>Show controls</button>}
      <aside className={`laser-panel ${paramsVisible ? '' : 'is-hidden'}`} aria-label="Laser array controls">
        <div className="laser-panel-head">
          <div><span className="laser-kicker">ARRAY CONFIGURATION</span><h2>Optical modules</h2></div>
          <button className="laser-hide" type="button" aria-label="Hide controls" onClick={() => setParamsVisible(false)}>×</button>
        </div>
        <div className="laser-readout"><span><i />{activeCount} / {modules.length} EMITTERS</span><strong>{Math.round(arrayCoherence(modules) * 100)}% coherence</strong></div>

        <section className="laser-section">
          <div className="laser-section-title"><span>ARRAY SIZE</span><strong>{String(modules.length).padStart(2, '0')} CHANNELS</strong></div>
          <div className="laser-count-control" role="group" aria-label="Number of laser modules">
            {[4, 5, 6, 7, 8].map((count) => <button key={count} type="button" aria-pressed={modules.length === count} onClick={() => updateModuleCount(count)}>{count}</button>)}
          </div>
        </section>

        <section className="laser-section">
          <div className="laser-section-title"><span>WORKPIECE</span><strong>{options.find((option) => option.id === layout)?.note}</strong></div>
          <div className="laser-layout-options" role="group" aria-label="Workpiece format">
            {options.map((option) => <button key={option.id} type="button" aria-pressed={layout === option.id} onClick={() => setLayout(option.id)}>{option.name}</button>)}
          </div>
          <label className="laser-select"><span>Pattern</span><select value={circuitId} onChange={(event) => setCircuitId(event.target.value)}>{Object.entries(CIRCUITS).map(([id, circuit]) => <option key={id} value={id}>{circuit.label}</option>)}</select></label>
        </section>

        <section className="laser-section">
          <div className="laser-section-title"><span>COHERENT FIELD</span><strong>LONGITUDINAL FOCUS</strong></div>
          <RangeControl label="Wavelength" value={wavelength} min={447} max={637} step={1} unit=" nm" onChange={setWavelength} />
          <RangeControl label="Numerical aperture" value={numericalAperture} min={0.3} max={0.9} step={0.01} unit=" NA" digits={2} onChange={setNumericalAperture} />
          <RangeControl label="Write speed" value={scanSpeed} min={0.5} max={8} step={0.1} unit=" mm/s" digits={1} onChange={setScanSpeed} />
          <div className="laser-focus-readout"><span>DIFFRACTION-LIMIT ESTIMATE</span><strong>{focusSize.toFixed(2)} µm</strong></div>
        </section>

        <section className="laser-section laser-module-section">
          <div className="laser-section-title"><span>CHANNEL TRIMS</span><strong>PHASE / POWER / POLARIZATION / AIM</strong></div>
          {modules.map((module, index) => {
            const color = LASER_COLORS[index % LASER_COLORS.length];
            return (
              <details className="laser-module" key={module.id} style={{ '--module-color': color }} defaultOpen={index === 0}>
                <summary>
                  <i className={module.enabled ? 'is-on' : ''} />
                  <span>LASER {String(index + 1).padStart(2, '0')}<small>{module.enabled ? `${module.power}% · ${module.phase}°` : 'STANDBY'}</small></span>
                  <label className="laser-enable" aria-label={`Enable laser ${index + 1}`} onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={module.enabled} onChange={(event) => updateModule(index, 'enabled', event.target.checked)} /><span /></label>
                </summary>
                <div className="laser-module-controls">
                  <RangeControl label="Optical power" value={module.power} min={0} max={100} step={1} unit="%" onChange={(value) => updateModule(index, 'power', value)} />
                  <RangeControl label="Phase trim" value={module.phase} min={0} max={360} step={1} unit="°" onChange={(value) => updateModule(index, 'phase', value)} />
                  <div className="laser-focus-pair">
                    <RangeControl label="Aim X" value={module.focusX} min={-0.5} max={0.5} step={0.01} unit=" mm" digits={2} onChange={(value) => updateModule(index, 'focusX', value)} />
                    <RangeControl label="Aim Z" value={module.focusZ} min={-0.5} max={0.5} step={0.01} unit=" mm" digits={2} onChange={(value) => updateModule(index, 'focusZ', value)} />
                  </div>
                  <label className="laser-select"><span>Polarization</span><select value={module.polarization} onChange={(event) => updateModule(index, 'polarization', event.target.value)}>{POLARIZATIONS.map((state) => <option key={state.value} value={state.value}>{state.label}</option>)}</select></label>
                </div>
              </details>
            );
          })}
        </section>

        <section className="laser-section laser-exposure-section">
          <div className="laser-section-title"><span>EXPOSURE PASS</span><strong>{Math.round(progress * 100)}%</strong></div>
          <div className="laser-progress-track"><span style={{ width: `${Math.round(progress * 100)}%` }} /></div>
          <div className="laser-actions"><button type="button" className="laser-primary-action" onClick={onRunToggle}>{progress >= 1 ? '▶ Run write program' : running ? 'Pause write' : 'Resume write'}</button><button type="button" onClick={onReset}>Reset</button></div>
          <label className="laser-toggle"><input type="checkbox" checked={orbitEnabled} onChange={(event) => setOrbitEnabled(event.target.checked)} /><span>Orbit inspection camera</span></label>
        </section>

        <details className="laser-reference">
          <summary>REFERENCE & MODEL SCOPE</summary>
            <p>This conceptual simulator models a phased continuous-wave emitter array and normalized scan pass; it is not a validated nanolithography process model.</p>
        </details>
      </aside>
    </>
  );
}

export default function LongitudinalLaserArraySim({ onBack }) {
  const [modules, setModules] = useState(() => Array.from({ length: 6 }, (_, index) => createLaserModule(index)));
  const [layout, setLayout] = useState('block');
  const [circuitId, setCircuitId] = useState('interconnect');
  const [wavelength, setWavelength] = useState(515);
  const [numericalAperture, setNumericalAperture] = useState(0.62);
  const [scanSpeed, setScanSpeed] = useState(3.2);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(true);
  const [paramsVisible, setParamsVisible] = useState(true);
  const [orbitEnabled, setOrbitEnabled] = useState(true);

  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => setProgress((current) => Math.min(1, current + scanSpeed * 0.0018)), 50);
    return () => window.clearInterval(timer);
  }, [running, scanSpeed]);

  const activeCount = modules.filter((module) => module.enabled).length;
  const progressLabel = progress >= 1 ? 'PATTERN COMPLETE' : running ? 'WRITING / CW ARRAY LOCKED' : 'EXPOSURE HOLD';
  const reset = () => {
    setProgress(0);
    setRunning(false);
  };
  const toggleWriting = () => {
    if (progress >= 1) setProgress(0);
    setRunning((value) => !value || progress >= 1);
  };

  return (
    <main className="laser-app">
      <div className="laser-scene" data-layout={layout} data-laser-count={modules.length} data-active-lasers={activeCount} data-write-progress={progress}>
        <Canvas camera={{ position: [7.2, 6.2, 9.4], fov: 46, near: 0.1, far: 80 }} dpr={[1, 1.5]} gl={{ antialias: true, powerPreference: 'high-performance' }}>
          <LaserScene layout={layout} circuitId={circuitId} modules={modules} progress={progress} wavelength={wavelength} numericalAperture={numericalAperture} orbitEnabled={orbitEnabled} />
        </Canvas>
      </div>
      <header className="laser-topbar">
        <div className="laser-brand"><span className="laser-mark">L/A</span><span><b>LONGITUDINAL ARRAY</b><em>Continuous-wave holographic nanowrite lab</em></span></div>
        <div className="laser-top-meta"><span>FIELD SYNTHESIS / {String(modules.length).padStart(2, '0')} CHANNELS</span><button type="button" className="laser-back" onClick={onBack}>Back to labs</button></div>
      </header>
      <section className="laser-title">
        <p>HOLOGRAPHIC EXPOSURE / {layout === 'block' ? 'VOLUME' : layout === 'wafer' ? 'PLANAR' : 'ROLL-TO-ROLL'}</p>
        <h1>Converge.<br />Write the circuit.</h1>
        <span>Individually phased beams meet at a moving focal point. Inspect the workpiece as a volume, wafer, or continuous web.</span>
      </section>
      <div className="laser-scene-status"><span><i className={running ? 'is-running' : ''} />{progressLabel}</span><strong>{Math.round(progress * 100)}%</strong></div>
      <LaserPanel
        layout={layout}
        setLayout={(next) => { setLayout(next); setProgress(0); }}
        modules={modules}
        setModules={setModules}
        circuitId={circuitId}
        setCircuitId={(next) => { setCircuitId(next); setProgress(0); }}
        wavelength={wavelength}
        setWavelength={setWavelength}
        numericalAperture={numericalAperture}
        setNumericalAperture={setNumericalAperture}
        scanSpeed={scanSpeed}
        setScanSpeed={setScanSpeed}
        progress={progress}
        running={running}
        paramsVisible={paramsVisible}
        setParamsVisible={setParamsVisible}
        orbitEnabled={orbitEnabled}
        setOrbitEnabled={setOrbitEnabled}
        onReset={reset}
        onRunToggle={toggleWriting}
      />
      <footer className="laser-footer"><span>PHASE FRONTS SLOWED FOR DISPLAY</span><span>FOCUS VOLUME / {wavelength} nm · NA {numericalAperture.toFixed(2)}</span></footer>
    </main>
  );
}