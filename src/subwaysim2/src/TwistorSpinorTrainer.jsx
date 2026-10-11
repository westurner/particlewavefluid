import { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Line, OrbitControls } from '@react-three/drei';
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Quaternion, Vector3 } from 'three';
import { SimulatorBase } from './lib/SimulatorBase.jsx';
import { buildTwistorState, DEFAULT_TWISTOR_PARAMETERS } from './twistorModel.js';
import './twistorTrainer.css';

const LESSONS = [
  {
    id: 'twistors',
    label: 'Twistors',
    subtitle: 'Incidence geometry',
    title: 'A null ray, packaged',
    goal: 'Build a projective twistor from a spacetime event and one primed spinor.',
    description: 'The incidence relation connects a real spacetime point x to a null direction π. Together they give one four-component twistor; multiplying every component by the same nonzero complex number changes its representative, not its projective point.',
    background: 'Roger Penrose developed twistor theory in the 1960s as a way to recast aspects of relativistic physics in terms of complex geometry. In the projective correspondence, a point in complexified spacetime determines a CP¹ line of incident twistors. Null directions and massless fields become especially natural in this language, shifting attention from spacetime points to geometric relationships among them.',
    connection: 'Choose an event x and a null spinor π; the incidence relation computes ω and assembles Z. The 3D view shows the associated real null direction, not the full complex projective twistor space.',
    wikipediaTitle: 'Twistor theory',
    wikipediaUrl: 'https://en.wikipedia.org/wiki/Twistor_theory',
    equation: 'Z^α = (ω^A, π_A′),     ω^A = i x^{AA′} π_A′',
    takeaway: 'Move the event or spinor direction; the same Z updates in every representation.',
    check: 'Which part of the construction selects the null direction?',
    answer: 'The two-component spinor π_A′ selects it. The incidence relation places the associated null ray through the event x.'
  },
  {
    id: 'spinors',
    label: 'Spinors',
    subtitle: 'Massless kinematics',
    title: 'Momentum factorizes',
    goal: 'Read a null four-momentum as a rank-one spinor dyadic.',
    description: 'A future-directed, positive-energy massless momentum is represented by a Hermitian 2 × 2 matrix of determinant zero. Its factorization p^{AA′} = λ^A λ̄^{A′} makes the null condition automatic; the spinor phase cancels from the momentum.',
    background: 'Spinors transform under double covers of rotation and Lorentz groups: a 2π rotation can change a spinor’s sign even though its associated vector returns to its starting value. In four-dimensional relativity, a real four-vector can be encoded as a Hermitian 2 × 2 matrix. For a null momentum that matrix has rank one, so it factorizes into a pair of spinors. This factorization is the starting point for spinor-helicity methods.',
    connection: 'The scale and direction sliders set λ, while its common phase cancels in p = λλ̄. The CP¹ chart plots a ratio of spinor components: it is a coordinate for spinor direction, not an ordinary spatial plane.',
    wikipediaTitle: 'Spinor',
    wikipediaUrl: 'https://en.wikipedia.org/wiki/Spinor',
    equation: 'p^{AA′} = λ^A λ̄^{A′},     det(p) = E² − |p⃗|² = 0',
    takeaway: 'The spinor carries direction and scale; its common phase is projectively redundant.',
    check: 'Why does the spinor dyadic have zero determinant?',
    answer: 'It is an outer product of one column and one row, so it has rank one (unless it is zero) and its determinant vanishes.'
  },
  {
    id: 'yang-mills',
    label: 'Yang–Mills',
    subtitle: 'Scattering amplitudes',
    title: 'Spinors meet gauge theory',
    goal: 'See why scattering amplitudes are written in spinor brackets.',
    description: 'For massless external particles, spinor-helicity variables factorize each momentum; helicity is encoded in how amplitudes transform under little-group rescalings. A standard color-ordered tree-level MHV gluon amplitude has a simple bracket expression. This trainer constructs one null leg at a time; the examples do not impose momentum conservation or calculate a multi-particle amplitude.',
    background: 'Yang–Mills theory generalizes electromagnetism’s U(1) gauge symmetry to non-Abelian groups such as SU(N). Its gauge bosons can interact with one another. In perturbative scattering calculations, color decomposition separates group-theory factors from kinematic partial amplitudes. For massless particles, spinor-helicity variables encode each momentum and helicity compactly; angle and square brackets contract the corresponding spinors.',
    connection: 'The displayed Parke–Taylor expression is a color-ordered tree-level MHV example with two negative-helicity gluons. It needs a set of external legs and their spinors; this trainer constructs only one null kinematic state, so the equation is a reading example rather than a computed output.',
    wikipediaTitle: 'Yang–Mills theory',
    wikipediaUrl: 'https://en.wikipedia.org/wiki/Yang%E2%80%93Mills_theory',
    equation: 'A_n(1⁻,2⁻,3⁺,…,n⁺) = i g^{n−2} ⟨12⟩⁴ / (⟨12⟩⟨23⟩⋯⟨n1⟩)',
    takeaway: 'Angle and square brackets contract external spinors; each leg also carries a little-group weight.',
    check: 'What information do the spinor-helicity variables encode for each external leg?',
    answer: 'They factorize its null momentum and carry its little-group/helicity weight; amplitudes combine these variables through spinor contractions.'
  },
  {
    id: 'amplituhedron',
    label: 'Amplituhedron',
    subtitle: 'Positive geometry',
    title: 'Geometry encodes an amplitude',
    goal: 'Place spinor kinematics in the larger positive-geometry picture.',
    description: 'For planar N = 4 super-Yang–Mills, a positive Grassmannian matrix acts on ordered external momentum-twistor data to construct an amplituhedron. Its canonical form encodes the tree-level amplitude; related loop geometries encode loop integrands. The amplituhedron is a positive geometry, not an ordinary solid in three-dimensional space.',
    background: 'The amplituhedron, introduced by Nima Arkani-Hamed and Jaroslav Trnka, is a positive geometry associated with scattering in planar N = 4 super-Yang–Mills theory. In a basic construction, a matrix C from a positive Grassmannian acts on ordered external momentum-twistor data Z to generate points Y. The geometry’s canonical form captures the tree-level amplitude; related loop constructions encode loop integrands. Its dimension and coordinates depend on the amplitude being studied.',
    connection: 'The Z^α built earlier is an incidence twistor from a spacetime event and null spinor; it is not by itself a momentum twistor. Momentum twistors encode dual region-momentum data for a planar scattering configuration. The 3D ray here shows neither those data nor an amplituhedron. The equation is schematic and omits the full super-kinematic setup.',
    wikipediaTitle: 'Amplituhedron',
    wikipediaUrl: 'https://en.wikipedia.org/wiki/Amplituhedron',
    equation: '𝒜^{tree}_{n,k}(𝒵) = {Y = C · 𝒵 | C ∈ G₊(k,n)},     m = 4',
    takeaway: 'The constructed twistor is a kinematic building block, not an amplituhedron by itself.',
    check: 'Does the 3D ray in this trainer visualize the amplituhedron?',
    answer: 'No. It visualizes one real null direction in space. The amplituhedron is a higher-dimensional positive geometry whose canonical form encodes an amplitude.'
  }
];

const VIEWS = [
  { id: 'expression', label: 'Expression' },
  { id: 'tensor', label: 'Tensor' },
  { id: 'plane', label: '2D / CP¹' },
  { id: 'space', label: '3D ray' }
];

const COMPLEX_PARAMETERS = [
  { key: 'scale', label: 'Spinor scale ρ', min: 0.25, max: 2, step: 0.01, format: (value) => value.toFixed(2) },
  { key: 'polar', label: 'Polar angle θ', min: 0, max: Math.PI, step: 0.01, format: (value) => `${value.toFixed(2)} rad` },
  { key: 'azimuth', label: 'Azimuth φ', min: -Math.PI, max: Math.PI, step: 0.01, format: (value) => `${value.toFixed(2)} rad` },
  { key: 'phase', label: 'Common phase χ', min: -Math.PI, max: Math.PI, step: 0.01, format: (value) => `${value.toFixed(2)} rad` }
];

const POSITION_PARAMETERS = [
  { key: 'time', label: 'Time t' },
  { key: 'x', label: 'Position x' },
  { key: 'y', label: 'Position y' },
  { key: 'z', label: 'Position z' }
];

const EXTERNAL_INCIDENCE_CONFIGURATIONS = [
  { event: [0, 0, 0, 0], scale: 1, polar: 0.8, azimuth: 0.2, phase: 0 },
  { event: [0, 1, 0, 0], scale: 1, polar: 1.3, azimuth: 1.5, phase: 0.2 },
  { event: [1, 0, 1, -0.5], scale: 0.9, polar: 2, azimuth: -1, phase: -0.35 },
  { event: [2, -1, 0, 1], scale: 1.1, polar: 2.5, azimuth: 2.2, phase: 0.6 }
];

const SPATIAL_EXAMPLES = [
  { id: 'null-ray', label: 'Null ray' },
  { id: 'vortex-loop', label: 'Vortex loop' },
  { id: 'mobius-loop', label: 'Möbius band' }
];

function formatComplex(value) {
  const real = Math.abs(value.real) < 0.0005 ? 0 : value.real;
  const imaginary = Math.abs(value.imaginary) < 0.0005 ? 0 : value.imaginary;
  if (imaginary === 0) return real.toFixed(3);
  const imaginaryPart = `${Math.abs(imaginary).toFixed(3)}i`;
  if (real === 0) return `${imaginary < 0 ? '-' : ''}${imaginaryPart}`;
  return `${real.toFixed(3)} ${imaginary < 0 ? '-' : '+'} ${imaginaryPart}`;
}

function MatrixReadout({ label, values }) {
  return <section className="twistor-matrix-readout">
    <h3>{label}</h3>
    <div className="twistor-matrix" role="img" aria-label={`${label}: ${values.map((row) => row.map(formatComplex).join(', ')).join('; ')}`}>
      {values.flatMap((row, rowIndex) => row.map((value, columnIndex) => <span key={`${rowIndex}-${columnIndex}`}>{formatComplex(value)}</span>))}
    </div>
  </section>;
}

function ExpressionView({ state }) {
  return <div className="twistor-expression-view">
    <div className="twistor-formula-banner"><span>INCIDENCE CONSTRUCTION</span><code>ω^A = i x^AA′ π_A′</code></div>
    <div className="twistor-definition"><span className="twistor-definition-symbol">λᴬ</span><code>( {state.lambda.map(formatComplex).join(' , ')} )</code></div>
    <div className="twistor-definition"><span className="twistor-definition-symbol">π_A′</span><code>( {state.pi.map(formatComplex).join(' , ')} )</code></div>
    <div className="twistor-expression-result">
      <span>Z<sup>α</sup></span>
      <code>( {state.twistor.map(formatComplex).join(' , ')} )</code>
    </div>
    <p className="twistor-form-note">The displayed π is the complex conjugate of λ, so the associated momentum is real and null.</p>
  </div>;
}

function TensorView({ state }) {
  const { energy, x, y, z } = state.momentum;
  return <div className="twistor-tensor-view">
    <div className="twistor-tensor-grid">
      <MatrixReadout label="Event xᴬᴬ′" values={state.positionMatrix} />
      <MatrixReadout label="Null momentum pᴬᴬ′" values={state.momentumMatrix} />
    </div>
    <div className="twistor-four-vector">
      <span>PAULI-MATRIX READOUT</span>
      <code>pᵘ = ( E, pₓ, pᵧ, p_z ) = ( {energy.toFixed(3)}, {x.toFixed(3)}, {y.toFixed(3)}, {z.toFixed(3)} )</code>
      <strong>E² − |p⃗|² = {state.massSquared.toExponential(2)}</strong>
    </div>
  </div>;
}

function ProjectivePlaneView({ state }) {
  const { coordinate, expression, name } = state.stereographicChart;
  const pointX = 240 + coordinate.real * 104;
  const pointY = 150 - coordinate.imaginary * 104;
  return <div className="twistor-plane-view">
    <svg viewBox="0 0 480 300" role="img" aria-label={`Complex projective spinor chart ${expression}, point at ${formatComplex(coordinate)}`}>
      <rect x="0" y="0" width="480" height="300" className="twistor-plane-background" />
      {Array.from({ length: 13 }, (_, index) => <g key={index}>
        <line x1={index * 40} y1="0" x2={index * 40} y2="300" className="twistor-plane-grid" />
        <line x1="0" y1={index * 25} x2="480" y2={index * 25} className="twistor-plane-grid" />
      </g>)}
      <line x1="240" y1="0" x2="240" y2="300" className="twistor-plane-axis" />
      <line x1="0" y1="150" x2="480" y2="150" className="twistor-plane-axis" />
      <circle cx="240" cy="150" r="104" className="twistor-plane-unit-circle" />
      <line x1="240" y1="150" x2={pointX} y2={pointY} className="twistor-plane-radius" />
      <circle cx={pointX} cy={pointY} r="7" className="twistor-plane-point" />
      <text x="16" y="24" className="twistor-plane-annotation">COMPLEX PROJECTIVE CHART · CP¹</text>
      <text x="16" y="282" className="twistor-plane-annotation">Re {expression}</text>
      <text x="437" y="142" className="twistor-plane-annotation">Im</text>
    </svg>
    <div className="twistor-plane-readout"><span>{name.toUpperCase()} CHART · ζ = {expression}</span><strong>{formatComplex(coordinate)}</strong><span>Unit circle marks |ζ| = 1</span></div>
  </div>;
}

function NullRayScene({ state }) {
  const start = new Vector3(state.parameters.x, state.parameters.y, state.parameters.z);
  const direction = new Vector3(state.direction.x, state.direction.y, state.direction.z).normalize();
  const endpoint = start.clone().addScaledVector(direction, 3.2);
  const arrowPosition = endpoint.clone().addScaledVector(direction, -0.16);
  const arrowOrientation = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction);
  return <>
    <color attach="background" args={['#09191d']} />
    <ambientLight intensity={1.5} />
    <directionalLight position={[4, 6, 5]} intensity={2} />
    <gridHelper args={[8, 8, '#3b7975', '#1c3c40']} position={[0, -2.5, 0]} />
    <Line points={[[-3, 0, 0], [3, 0, 0]]} color="#e4a458" lineWidth={1} />
    <Line points={[[0, -2.5, 0], [0, 2.5, 0]]} color="#e17260" lineWidth={1} />
    <Line points={[[0, 0, -3], [0, 0, 3]]} color="#73b7e9" lineWidth={1} />
    <Line points={[start, endpoint]} color="#72d2c3" lineWidth={2.5} />
    <mesh position={start.toArray()}>
      <sphereGeometry args={[0.11, 20, 20]} />
      <meshStandardMaterial color="#f0a23a" emissive="#6b3410" emissiveIntensity={0.7} />
    </mesh>
    <mesh position={endpoint.toArray()}>
      <sphereGeometry args={[0.055, 16, 16]} />
      <meshStandardMaterial color="#d5fff1" emissive="#6fc3a2" emissiveIntensity={0.8} />
    </mesh>
    <mesh position={arrowPosition.toArray()} quaternion={arrowOrientation}>
      <coneGeometry args={[0.12, 0.28, 14]} />
      <meshStandardMaterial color="#72d2c3" emissive="#245c55" emissiveIntensity={0.45} />
    </mesh>
  </>;
}

function VortexLoopScene() {
  return <>
    <mesh>
      <torusGeometry args={[1.55, 0.14, 16, 128]} />
      <meshStandardMaterial color="#72d2c3" roughness={0.48} metalness={0.12} />
    </mesh>
    {Array.from({ length: 12 }, (unusedValue, index) => {
      const angle = (index / 12) * Math.PI * 2;
      const direction = new Vector3(-Math.sin(angle), Math.cos(angle), 0);
      const orientation = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction);
      return <mesh key={index} position={[1.55 * Math.cos(angle), 1.55 * Math.sin(angle), 0]} quaternion={orientation}>
        <coneGeometry args={[0.07, 0.18, 12]} />
        <meshStandardMaterial color="#f1d4a0" emissive="#6b3410" emissiveIntensity={0.3} />
      </mesh>;
    })}
  </>;
}

function mobiusPoint(angle, across, radius = 1.35) {
  const displacedRadius = radius + across * Math.cos(angle / 2);
  return new Vector3(
    displacedRadius * Math.cos(angle),
    displacedRadius * Math.sin(angle),
    across * Math.sin(angle / 2)
  );
}

function createMobiusGeometry() {
  const alongSegments = 128;
  const acrossSegments = 20;
  const halfWidth = 0.52;
  const vertices = [];
  const indices = [];
  for (let alongIndex = 0; alongIndex <= alongSegments; alongIndex += 1) {
    const angle = (alongIndex / alongSegments) * Math.PI * 2;
    for (let acrossIndex = 0; acrossIndex <= acrossSegments; acrossIndex += 1) {
      const across = (acrossIndex / acrossSegments * 2 - 1) * halfWidth;
      const point = mobiusPoint(angle, across);
      vertices.push(point.x, point.y, point.z);
    }
  }
  for (let alongIndex = 0; alongIndex < alongSegments; alongIndex += 1) {
    for (let acrossIndex = 0; acrossIndex < acrossSegments; acrossIndex += 1) {
      const first = alongIndex * (acrossSegments + 1) + acrossIndex;
      const nextAlong = first + acrossSegments + 1;
      indices.push(first, nextAlong, first + 1, nextAlong, nextAlong + 1, first + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function MobiusLoopScene() {
  const geometry = useMemo(createMobiusGeometry, []);
  const centerline = useMemo(() => Array.from({ length: 129 }, (unusedValue, index) => mobiusPoint((index / 128) * Math.PI * 2, 0)), []);
  const singleBoundary = useMemo(() => Array.from({ length: 257 }, (unusedValue, index) => {
    const angle = (index / 256) * Math.PI * 4;
    return mobiusPoint(angle, angle < Math.PI * 2 ? 0.52 : -0.52);
  }), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <>
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#73b7e9" side={DoubleSide} roughness={0.42} metalness={0.08} />
    </mesh>
    <Line points={centerline} color="#f1d4a0" lineWidth={2} />
    <Line points={singleBoundary} color="#f0a23a" lineWidth={2.5} />
  </>;
}

function SpatialExampleScene({ state, example }) {
  return <>
    <color attach="background" args={['#09191d']} />
    <ambientLight intensity={1.5} />
    <directionalLight position={[4, 6, 5]} intensity={2} />
    <gridHelper args={[8, 8, '#3b7975', '#1c3c40']} position={[0, -2.5, 0]} />
    <Line points={[[-3, 0, 0], [3, 0, 0]]} color="#e4a458" lineWidth={1} />
    <Line points={[[0, -2.5, 0], [0, 2.5, 0]]} color="#e17260" lineWidth={1} />
    <Line points={[[0, 0, -3], [0, 0, 3]]} color="#73b7e9" lineWidth={1} />
    {example === 'null-ray' && <NullRayScene state={state} />}
    {example === 'vortex-loop' && <VortexLoopScene />}
    {example === 'mobius-loop' && <MobiusLoopScene />}
    <OrbitControls makeDefault enableDamping />
  </>;
}

function SpatialRayView({ state, example, onExampleChange }) {
  const { energy, x, y, z } = state.momentum;
  const caption = example === 'null-ray'
    ? `EVENT (t, x, y, z) = (${state.parameters.time.toFixed(1)}, ${state.parameters.x.toFixed(1)}, ${state.parameters.y.toFixed(1)}, ${state.parameters.z.toFixed(1)}) · p / E = (${(x / energy).toFixed(2)}, ${(y / energy).toFixed(2)}, ${(z / energy).toFixed(2)})`
    : example === 'vortex-loop'
      ? 'CLOSED VORTEX FILAMENT · ARROWS SHOW VORTICITY DIRECTION, NOT A SOLVED FLOW FIELD'
      : 'MÖBIUS BAND · ONE CONTINUOUS BOUNDARY, HIGHLIGHTED IN ORANGE';
  return <div className="twistor-space-view">
    <div className="twistor-space-toolbar" role="group" aria-label="3D geometry example">
      {SPATIAL_EXAMPLES.map((item) => <button key={item.id} type="button" aria-pressed={example === item.id} onClick={() => onExampleChange(item.id)}>{item.label}</button>)}
    </div>
    <Canvas camera={{ position: [5.8, 4.8, 6.4], fov: 42 }} dpr={[1, 1.7]}>
      <SpatialExampleScene state={state} example={example} />
    </Canvas>
    <div className="twistor-space-caption"><span>{caption}</span></div>
  </div>;
}

function ExternalIncidenceExamples() {
  const examples = EXTERNAL_INCIDENCE_CONFIGURATIONS.map((configuration, index) => {
    const [time, x, y, z] = configuration.event;
    const state = buildTwistorState({ ...DEFAULT_TWISTOR_PARAMETERS, ...configuration, time, x, y, z });
    return { index, event: configuration.event, state };
  });
  return <section className="twistor-external-examples" aria-labelledby="twistor-external-title">
    <header><h2 id="twistor-external-title">External incidence-twistor examples</h2><span>FOUR NULL LEGS · ILLUSTRATIVE DATA</span></header>
    <p>Each row evaluates Zᵢ = (ωᵢᴬ, πᵢᴬ′), with πᵢ = λ̄ᵢ and ωᵢᴬ = i xᵢᴬᴬ′πᵢᴬ′. These are ordinary incidence twistors, not momentum twistors; the sample legs are on shell individually but are not chosen to conserve total momentum.</p>
    <div className="twistor-external-grid">
      {examples.map(({ index, event, state }) => <article key={index}>
        <strong>LEG {String(index + 1).padStart(2, '0')}</strong>
        <code>xᵢ = ({event.map((value) => value.toFixed(1)).join(', ')})</code>
        <code>πᵢᴬ′ = ({state.pi.map(formatComplex).join(' , ')})</code>
        <code>Zᵢ = ({state.twistor.map(formatComplex).join(' , ')})</code>
      </article>)}
    </div>
  </section>;
}

function ParameterSlider({ definition, value, onChange }) {
  return <label className="twistor-slider">
    <span><span>{definition.label}</span><output>{definition.format(value)}</output></span>
    <input type="range" min={definition.min} max={definition.max} step={definition.step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
  </label>;
}

function ParameterPanel({ parameters, onChange, onReset }) {
  return <aside className="twistor-parameter-panel" aria-label="Twistor construction parameters">
    <header className="twistor-panel-heading"><div><span>LIVE CONSTRUCTION</span><h2>Parameters</h2></div><button type="button" title="Reset parameters" aria-label="Reset parameters" onClick={onReset}>↺</button></header>
    <p className="twistor-panel-intro">One spinor and one event generate every readout.</p>
    <section className="twistor-control-group" aria-label="Spinor parameters">
      <h3>SPINOR λ</h3>
      {COMPLEX_PARAMETERS.map((definition) => <ParameterSlider key={definition.key} definition={definition} value={parameters[definition.key]} onChange={(value) => onChange(definition.key, value)} />)}
    </section>
    <section className="twistor-control-group twistor-event-controls" aria-label="Spacetime event parameters">
      <h3>SPACETIME EVENT x</h3>
      {POSITION_PARAMETERS.map(({ key, label }) => <ParameterSlider
        key={key}
        definition={{ label, min: -2, max: 2, step: 0.01, format: (value) => value.toFixed(2) }}
        value={parameters[key]}
        onChange={(value) => onChange(key, value)}
      />)}
    </section>
    <p className="twistor-control-note">Changing χ rotates all four Z components by one common phase. Its projective point and momentum stay fixed.</p>
  </aside>;
}

export default function TwistorSpinorTrainer({ onBack }) {
  const [parameters, setParameters] = useState(() => ({ ...DEFAULT_TWISTOR_PARAMETERS }));
  const [lessonIndex, setLessonIndex] = useState(0);
  const [highestUnlocked, setHighestUnlocked] = useState(0);
  const [view, setView] = useState('expression');
  const [spatialExample, setSpatialExample] = useState('null-ray');
  const lesson = LESSONS[lessonIndex];
  const state = buildTwistorState(parameters);

  const changeParameter = (key, value) => setParameters((current) => ({ ...current, [key]: value }));
  const advanceLesson = () => {
    if (lessonIndex === LESSONS.length - 1) {
      setLessonIndex(0);
      return;
    }
    const nextIndex = lessonIndex + 1;
    setHighestUnlocked((current) => Math.max(current, nextIndex));
    setLessonIndex(nextIndex);
  };

  return <SimulatorBase
    mode="non-3d"
    className="signal-app twistor-app"
    headerClassName="signal-topbar twistor-topbar"
    brandClassName="signal-brand"
    mark="Z / λ"
    markClassName="signal-mark twistor-mark"
    title="TWISTOR / SPINOR TRAINER"
    subtitle="Incidence geometry / on-shell kinematics / amplitude geometry"
    onHome={onBack}
  >
    <main className="twistor-workbench">
      <nav className="twistor-lesson-rail" aria-label="Learning sequence">
        <div className="twistor-rail-heading"><span>LEARNING PATH</span><strong>0{lessonIndex + 1} / 04</strong></div>
        <ol>
          {LESSONS.map((item, index) => <li key={item.id}>
            <button type="button" disabled={index > highestUnlocked} aria-current={index === lessonIndex ? 'step' : undefined} onClick={() => setLessonIndex(index)}>
              <span className="twistor-step-index">0{index + 1}</span>
              <span><strong>{item.label}</strong><small>{item.subtitle}</small></span>
              {index < highestUnlocked && <span className="twistor-step-check" aria-label="Completed">✓</span>}
            </button>
          </li>)}
        </ol>
        <p className="twistor-sequence-note">Each idea builds on the construction above it.</p>
      </nav>

      <section className="twistor-main" aria-labelledby="twistor-lesson-title">
        <header className="twistor-lesson-heading">
          <span>{String(lessonIndex + 1).padStart(2, '0')} / {lesson.subtitle.toUpperCase()}</span>
          <h1 id="twistor-lesson-title">{lesson.title}</h1>
          <p><strong>Learning goal</strong> {lesson.goal}</p>
          <p>{lesson.description}</p>
        </header>
        <section className="twistor-lesson-background" aria-labelledby="twistor-background-title">
          <div className="twistor-background-heading">
            <h2 id="twistor-background-title">Background and connection</h2>
            <a href={lesson.wikipediaUrl} target="_blank" rel="noreferrer">Wikipedia: {lesson.wikipediaTitle} <span aria-hidden="true">↗</span></a>
          </div>
          <p>{lesson.background}</p>
          <p><strong>In this trainer</strong> {lesson.connection}</p>
        </section>
        {lesson.id === 'yang-mills' && <ExternalIncidenceExamples />}
        <div className="twistor-view-tabs" role="tablist" aria-label="Twistor representations">
          {VIEWS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={view === item.id} className={view === item.id ? 'is-active' : ''} onClick={() => setView(item.id)}>{item.label}</button>)}
        </div>
        <section className={`twistor-view-frame twistor-view-${view}`} aria-label={`${VIEWS.find((item) => item.id === view)?.label} representation`}>
          {view === 'expression' && <ExpressionView state={state} />}
          {view === 'tensor' && <TensorView state={state} />}
          {view === 'plane' && <ProjectivePlaneView state={state} />}
          {view === 'space' && <SpatialRayView state={state} example={spatialExample} onExampleChange={setSpatialExample} />}
        </section>
        <footer className="twistor-lesson-footer">
          <div className="twistor-key-idea"><span>KEY IDEA</span><p>{lesson.takeaway}</p><code>{lesson.equation}</code></div>
          <details className="twistor-checkpoint">
            <summary>Check your understanding</summary>
            <p>{lesson.check}</p>
            <small>{lesson.answer}</small>
          </details>
          <button className="twistor-next-lesson" type="button" onClick={advanceLesson}>{lessonIndex === LESSONS.length - 1 ? 'Restart sequence' : 'Next lesson'} <span aria-hidden="true">→</span></button>
        </footer>
      </section>

      <ParameterPanel parameters={parameters} onChange={changeParameter} onReset={() => setParameters({ ...DEFAULT_TWISTOR_PARAMETERS })} />
    </main>
  </SimulatorBase>;
}