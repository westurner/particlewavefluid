# Mechanics Simulation Roadmap

## Source integrity

The three `*.md` session transcripts are rendered companions to their matching `*.json` exports. `src/docsTranscript.test.js` verifies that every textual JSON content block appears in the Markdown in role order while tolerating export line wrapping.

The transcripts are inputs to experiments, not authorities. Implementations must distinguish:

- **Established models:** Newtonian gravity, SPH-style Navier-Stokes approximations, finite-time Lyapunov exponents (FTLE), Gross-Pitaevskii/Euler-Korteweg equations, and effective-field-theory scattering methods.
- **Engineering hypotheses requiring measured coefficients:** h-BN/farnesane viscosity, conductivity, stability, and datacenter energy savings.
- **Speculative hypotheses:** SQG, DDF, and claimed direct maps from amplituhedron boundaries or scattering residues to fluid density, viscosity, horizons, or vortex reconnection.

## Implemented foundation

| Simulator | Optional mechanics |
| --- | --- |
| Attractor particles | Newtonian baseline; SQG and DDF hypothesis models become available when a black-hole attractor is present. |
| SQG black hole | SQG sink flow, finite core-pressure response, and comparison against Newtonian or DDF behavior. |
| DDF black hole | SQG-like sink flow plus speed-limited, strain-dependent dilatancy; defaults to comparison against SQG. |
| Transit thermodynamics | Baseline Newtonian SPH, temperature/shear-dependent h-BN farnesane hypothesis, or DDF dilatant viscosity. |
| FRC fusion | Classical transport, bounded GPE/Euler-Korteweg core-pressure response, or DDF damping. These overlays do not alter engineering power estimates. |
| Wave interference | Linear superposition or a bounded GPE-inspired cubic/curvature response, with optional difference coloring. |
| Amplitude geometry gravity | Newtonian reference, spin-2 EFT tree proxy, and a positive-$Gr(2,4)$ gravituhedron hypothesis with Newtonian acceleration-difference halos. |
| FTLE / LCS lab | Reusable RK4 trajectory histories, finite-difference deformation gradients, Cauchy-Green eigenvalues, volume change, ridge confidence, and forward/backward field views. |

`src/mechanicsModels.js` is the CPU reference for model selectors, bounds, response equations, and comparison metrics. GPU formulas must remain synchronized with it.

## Dedicated simulators to add

### 1. Quantum Fluid Lab

Implement a real complex-valued Gross-Pitaevskii solver using split-step Fourier integration. Show density, phase, current, quantum pressure, vortices, phase slips, and conservation residuals. Add side-by-side and difference views against an Euler-Korteweg discretization using identical initial conditions.

Acceptance criteria:

- Norm and energy drift are reported every frame.
- Vortex winding is computed from phase around closed cells.
- Vacuum nodes are handled without dividing by zero in the Madelung transform.
- CPU fixtures cover plane waves, stationary vortices, and dispersive packets.

### 2. FTLE / LCS Lab - phase 1 implemented

`src/ftleModel.js` now provides a velocity-sampler contract, RK4 trajectory histories, finite-difference flow-map gradients, Cauchy-Green eigenvalues, volume change, ridge confidence, and grid sampling. The dedicated FTLE lab renders forward/backward diagnostics for analytic saddle, rotation, source, sink, and time-dependent double-gyre fields. It keeps material-particle FTLE explicitly distinct from acoustic-characteristic diagnostics.

Phase 2 should adapt throttled velocity-history samplers for Subway, FRC, and attractor GPU fields without forcing full texture readback every frame.

Acceptance criteria:

- [x] Affine-flow fixtures recover analytic exponents.
- [x] Incompressible fixtures preserve `det(F) = 1` within tolerance.
- [x] Forward and backward integration use the same velocity-sampler contract.
- [x] FTLE, Cauchy-Green eigenvalues, volume change, and ridge confidence are exposed.
- [ ] GPU velocity histories use throttled readback that can be disabled.

### 3. N-body EFT / Amplitude Lab - phase 1 implemented

The Amplitude Geometry Gravity Lab now separates a Newtonian reference, a normalized spin-2 tree proxy, and an explicitly speculative positive-geometry correction. It constructs a positive $Gr(2,4)$ cell from ordered weighted columns, reports all six Plücker minors and the Plücker relation residual, evaluates pair forces symmetrically, and displays the total force residual. A photon-exchange value is shown only as an electromagnetic comparison channel; it is never substituted for the gravity kernel.

The implemented "gravituhedron" mode weights the spin-2 proxy with a bounded function of the positive cell's adjacent-boundary poles. This is a falsifiable visualization ansatz, not a derivation of gravity from QED or proof that an amplituhedron canonical form maps to a fluid, viscosity, horizon, or gravitational potential.

Phase 2 should separate Newtonian, post-Newtonian, and post-Minkowskian approximations with sourced coefficients. It should visualize pairwise terms, genuine many-body residuals, momentum transfer, and uncertainty by approximation order. A future double-copy mode must expose the gauge-theory numerators, color factors, Jacobi relations, and the replacement that produces the gravity integrand rather than merely squaring a scalar diagnostic.

Acceptance criteria:

- [x] Positive-cell minors remain positive and satisfy the $Gr(2,4)$ Plücker relation.
- [x] Pair forces are equal and opposite to floating-point tolerance.
- [x] Newtonian mode exactly matches the displayed spin-2 reference kernel.
- [x] Model differences use identical bodies, time, and camera state.
- [ ] Two-body limits match sourced analytic orbit and scattering checks for each approximation order.
- [ ] Angular momentum and integration-energy residuals are displayed over time.
- [ ] Every post-Newtonian or post-Minkowskian correction identifies its source equation and approximation order.
- [x] Amplituhedron/Grassmannian views remain kinematic visualizations unless an explicit derivation supplies the dynamics map.

### 4. Thermal Loop Lab

Model a datacenter cooling loop with measured fluid property tables, pumps, heat exchangers, economizer hours, and uncertainty bands. Support water, user-supplied fluids, and an explicitly hypothetical h-BN/farnesane formulation. Keep process equipment such as kilns and brake rotors in separate engineering projects.

Acceptance criteria:

- Energy and pressure-drop balances close within a declared tolerance.
- Property values carry citations, temperature ranges, and uncertainty.
- PUE changes are outputs of workload, climate, and equipment assumptions rather than fixed percentages.

### 5. Fracture / Phase-slip Signal Lab

Add I/Q demodulation, phase unwrapping, phase-slip detection, and synthetic fracture/acoustic events. Couple detected events to Quantum Fluid Lab vortex crossings only as a selectable analogy unless a validated physical model is provided.

## Delivery sequence

1. Extract trajectory sampling from the current GPU fields and deliver FTLE overlays.
2. Build Quantum Fluid Lab and use it to validate the current bounded GPE response overlays.
3. Add a reusable synchronized comparison viewport with shared seeds, camera, and time.
4. Build Thermal Loop Lab from measured property tables.
5. Extend the phase-one Amplitude Geometry Gravity Lab with sourced PN/PM terms, scattering observables, and explicit approximation provenance.
6. Add Fracture / Phase-slip Signal Lab after the quantum-fluid event contract exists.

Each phase requires pure-model tests, GPU shader compilation in-browser, desktop/mobile screenshots, nonblank canvas checks, and conservation/error telemetry appropriate to the model.