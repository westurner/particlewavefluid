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
| Quantum fluid lab | Complex split-step Fourier Gross-Pitaevskii evolution, independent Euler-Korteweg stepping, density/phase/current/quantum-pressure views, vortex winding, phase-slip counts, and conservation/model-difference telemetry. |
| Thermal loop lab | Provenance-aware fluid properties, steady heat balance, Darcy pressure drop, pump and chiller power, economizer availability, PUE, water comparison, and uncertainty bands. |
| Fracture / phase-signal lab | Synthetic complex I/Q generation, carrier demodulation, residual-phase unwrapping, slip/fracture detection, event markers, and opt-in timestamp correlation with synthetic vortex events. |

`src/mechanicsModels.js` is the CPU reference for model selectors, bounds, response equations, and comparison metrics. GPU formulas must remain synchronized with it.

## Dedicated simulators to add

### 1. Quantum Fluid Lab - phase 1 implemented

`src/quantumFluidModel.js` now implements periodic two-dimensional complex Gross-Pitaevskii evolution with a dependency-free split-step Fourier integrator. It derives density, phase, current, and regularized quantum pressure; detects integer phase winding around grid cells; reports norm and energy drift; and advances an independent finite-difference Euler-Korteweg state from identical initial conditions. The lab provides side-by-side, individual, and signed density-difference views.

The Euler-Korteweg implementation is an explicit reference discretization rather than a production shock-capturing scheme. Vacuum nodes use a declared density floor, and phase-slip counts are changes in detected grid winding rather than a claim about microscopic dissipation.

Acceptance criteria:

- [x] Norm and energy drift are reported during evolution.
- [x] Vortex winding is computed from wrapped phase differences around closed cells.
- [x] Vacuum nodes are handled without dividing by zero in the Madelung transform.
- [x] CPU fixtures cover plane waves, stationary vortices, and dispersive packets.
- [x] GPE and Euler-Korteweg states use identical initial conditions and time steps.
- [ ] Add higher-order conservative Euler-Korteweg fluxes for long-horizon comparison.

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

The lab now includes the standard analytic 1PN Schwarzschild test-particle periapsis advance and a labeled leading weak-field 1PM massive-particle scattering estimate. These are observables beside the simulation, not force substitutions. It also reports numerical energy, momentum, and angular-momentum residuals from the evolving N-body state.

Acceptance criteria:

- [x] Positive-cell minors remain positive and satisfy the $Gr(2,4)$ Plücker relation.
- [x] Pair forces are equal and opposite to floating-point tolerance.
- [x] Newtonian mode exactly matches the displayed spin-2 reference kernel.
- [x] Model differences use identical bodies, time, and camera state.
- [x] Sourced analytic 1PN periapsis and leading 1PM scattering observables are displayed.
- [x] Momentum, angular momentum, and integration-energy residuals are displayed over time.
- [ ] Implement and validate velocity-dependent PN/PM force terms against two-body trajectories.
- [ ] Every post-Newtonian or post-Minkowskian correction identifies its source equation and approximation order.
- [x] Amplituhedron/Grassmannian views remain kinematic visualizations unless an explicit derivation supplies the dynamics map.

### 4. Thermal Loop Lab - phase 1 implemented

`src/thermalLoopModel.js` now closes a steady thermal balance and derives required flow, Reynolds number, Darcy pressure drop, pump power, annualized chiller/economizer split, cooling power, and modeled PUE. Water, an aqueous propylene-glycol reference, user-defined assumptions, and the explicitly hypothetical h-BN/farnesane fluid carry status, provenance text, and uncertainty. The lab compares every selected fluid against water under identical facility assumptions.

The included property records are representative scenario inputs, not procurement specifications. Design use requires temperature-dependent supplier or laboratory curves and a calibrated site climate distribution.

Acceptance criteria:

- [x] Energy and pressure-drop balances close within a declared tolerance.
- [x] Reference property values carry bibliographic citations, temperature ranges, status, and uncertainty; unsupported fluids are labeled user input or hypothesis.
- [x] PUE changes are outputs of workload, climate, and equipment assumptions rather than fixed percentages.
- [x] Water comparison uses identical load, geometry, climate, and equipment assumptions.
- [ ] Replace representative references with temperature-indexed measured property tables and site weather bins.

### 5. Fracture / Phase-slip Signal Lab - phase 1 implemented

`src/phaseSignalModel.js` now generates deterministic complex I/Q carriers with optional phase discontinuities and transient fracture-like bursts, demodulates amplitude and residual phase, unwraps branch cuts, detects thresholded events with refractory windows, and correlates event timestamps. The lab renders synchronized I, Q, amplitude, and unwrapped-phase traces with detected-event markers.

Synthetic vortex-event correlation is disabled by default and visibly labeled as an analogy. It compares timestamps only and does not assert a shared fracture/quantum-fluid mechanism.

Acceptance criteria:

- [x] Clean carriers recover unit amplitude in the noise-free fixture.
- [x] Wrapped phase branch cuts are removed without discontinuity.
- [x] Synthetic fracture bursts are detected near their injected times.
- [x] Vortex-event correlation is optional and labeled analogical.
- [ ] Add recorded sensor import with sample-rate and calibration metadata.

## Delivery sequence

1. **In progress:** adapt throttled trajectory sampling from current GPU fields to the completed FTLE core.
2. **Complete:** build Quantum Fluid Lab and compare GPE with Euler-Korteweg from identical initial state and time.
3. **Complete:** synchronized comparison views share seed, camera, and time in Quantum Fluid and amplitude-gravity labs.
4. **Phase 1 complete:** Thermal Loop Lab uses provenance-aware representative properties; measured temperature tables remain follow-up work.
5. **Phase 1 diagnostics complete:** amplitude lab includes sourced weak-field observables and conservation residuals; validated PN/PM dynamics remain follow-up work.
6. **Phase 1 complete:** phase-signal lab supports synthetic events and opt-in analogy; recorded/live stream import remains follow-up work.

Each phase requires pure-model tests, GPU shader compilation in-browser, desktop/mobile screenshots, nonblank canvas checks, and conservation/error telemetry appropriate to the model.