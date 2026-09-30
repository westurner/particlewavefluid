# Mechanics Simulation Roadmap

## Source integrity

The three `*.md` session transcripts are rendered companions to their matching `*.json` exports. `src/docsTranscript.test.js` verifies that every textual JSON content block appears in the Markdown in role order while tolerating export line wrapping.

The transcripts are inputs to experiments, not authorities. Implementations must distinguish:

- **Established models:** Newtonian gravity, SPH-style Navier-Stokes approximations, finite-time Lyapunov exponents (FTLE), Gross-Pitaevskii/Euler-Korteweg equations, ion-acoustic plasma waves, and effective-field-theory scattering methods.
- **Engineering hypotheses requiring measured coefficients:** h-BN/farnesane viscosity, conductivity, stability, datacenter energy savings, and piezoelectric-structure coupling into an FRC rotating-field actuator.
- **Speculative hypotheses:** SQG, DDF, longitudinal vacuum Proca photons, infinite-effective-mass "flat light," twistor-spinor fusion locking, and claimed direct maps from amplituhedron boundaries or scattering residues to fluid density, viscosity, horizons, or vortex reconnection.

## Implemented foundation

| Simulator | Optional mechanics |
| --- | --- |
| Attractor particles | Newtonian baseline plus reduced compressible and divergence-free incompressible NS response fields when a black-hole attractor is present. |
| SQG black hole | Compressible/incompressible NS comparisons, SQG finite core-pressure response, and DDF hypothesis behavior. |
| DDF black hole | SQG-like sink flow plus speed-limited, strain-dependent dilatancy; defaults to comparison against SQG. |
| Transit thermodynamics | Baseline Newtonian SPH, temperature/shear-dependent h-BN farnesane hypothesis, or DDF dilatant viscosity. |
| FRC fusion / Argon MHD | Classical, bounded GPE/Euler-Korteweg, or DDF transport overlays plus independent axial-FRC, rotating-field, magnetic-nozzle, piezo-modulated RMF, and longitudinal ion-acoustic Argon configurations. |
| Wave interference | Linear superposition or a bounded GPE-inspired cubic/curvature response, with optional difference coloring. |
| Amplitude geometry gravity | Newtonian reference, spin-2 EFT tree proxy, and a positive-$Gr(2,4)$ gravituhedron hypothesis with Newtonian acceleration-difference halos. |
| FTLE / LCS lab | Reusable RK4 trajectory histories, finite-difference deformation gradients, Cauchy-Green eigenvalues, volume change, ridge confidence, and forward/backward field views. |
| Quantum fluid lab | Complex split-step Fourier Gross-Pitaevskii evolution, independent Euler-Korteweg stepping, density/phase/current/quantum-pressure views, vortex winding, phase-slip counts, and conservation/model-difference telemetry. |
| Thermal loop lab | Provenance-aware fluid properties, steady heat balance, Darcy pressure drop, pump and chiller power, economizer availability, PUE, water comparison, and uncertainty bands. |
| Fracture / phase-signal lab | Synthetic complex I/Q generation, carrier demodulation, residual-phase unwrapping, slip/fracture detection, event markers, and opt-in timestamp correlation with synthetic vortex events. |

`src/mechanicsModels.js` is the CPU reference for model selectors, bounds, response equations, and comparison metrics. GPU formulas must remain synchronized with it.

### Fluid-response and Argon MHD experiments - phase 1 implemented

The black-hole attractor engine now compares Newtonian, compressible NS, incompressible NS, SQG, and DDF response fields from identical particle and camera state. The compressible benchmark reports negative local divergence and volume-change rate; the incompressible benchmark reports zero divergence away from its regularized core. These are tracer response fields, not finite-volume shock capture or a pressure-Poisson projection solver. The dedicated Quantum Fluid and FTLE labs remain the rigorous numerical surfaces for Euler-Korteweg evolution and deformation diagnostics.

FRC now keeps Argon as an independent input while offering axial field-reversed, rotating-field, magnetic-nozzle, piezo-modulated rotating-field, and longitudinal ion-acoustic MHD configurations. Pairing Argon with one of those configurations activates reduced ideal-MHD GPU forcing and derives argon mass density, Alfvén speed, ion sound speed, ion cyclotron frequency, and thermal gyroradius. Fusion and electrical output remain zero for Argon.

The piezo configuration represents a structure-side strain command modulating an external rotating-field actuator through a bounded coupling coefficient. It does not assume that a piezoelectric crystal directly drives the plasma. The longitudinal configuration represents a finite-width electrostatic ion-acoustic packet with wavelength derived from the modeled ion sound speed and drive frequency. Renderer phase is slowed for visibility, so it is not a time-resolved kHz solver. Neither drive modifies confinement, fusion power, or $Q$.

This translation deliberately excludes the transcript's unsupported longitudinal-vacuum-photon, massive-Proca, "flat light," SQG-confinement, twistor-spinor-locking, eliminated-bremsstrahlung, and deterministic-fusion claims. Those ideas have no sourced constitutive law or validated coupling to the FRC equations and therefore are not reactor configurations.

The FRC model also provides a reproducible bounded parameter-grid search. For each MHD mode it evaluates 5,760 combinations across vessel shape, magnetic field, density, temperature, and rotation at fixed 12 MW auxiliary heating. Candidates must satisfy declared beta, stability, confinement, and gyroradius-containment bounds. The three selectable `DT projection from Argon grid optimum` configurations maximize a projected DT gain from the same modeled state; actual Argon gain remains zero, and the projection is not experimental validation.

Acceptance criteria:

- [x] Compressible and incompressible response modes expose distinct volume-change diagnostics.
- [x] SQG and DDF remain visibly labeled speculative hypotheses.
- [x] CPU and GPU model-selector ordering is covered by fixtures.
- [x] Argon remains independent from reactor configuration selection.
- [x] Every Argon MHD mode reports finite derived diagnostics and zero fusion products.
- [x] Piezo-modulated RMF and ion-acoustic packet modes expose bounded drive controls without changing fusion power or $Q$.
- [x] Longitudinal response is labeled as an electrostatic plasma wave, not a vacuum Proca polarization.
- [x] Grid-derived presets reproduce the bounded search winners and identify projected DT gain as a counterfactual rather than actual Argon gain.
- [ ] Replace reduced NS fields with conservative compressible and projected incompressible grid solvers.
- [ ] Add resistive/Hall-MHD induction evolution and magnetic-energy conservation telemetry.

### FRC predictive simulation plan

The present grid search is worth retaining as a deterministic sensitivity and UI regression experiment. It is not yet suitable for reactor optimization: its objective rises monotonically with the current density and temperature proxies, so the winning points sit on parameter-grid boundaries. A predictive result requires the following models and validation gates.

#### Phase 0 - terminology and reproducibility

- Keep actual Argon fusion gain fixed at zero.
- Distinguish plasma gain $Q_{plasma}=P_{fusion}/P_{aux,plasma}$ from engineering gain $Q_{eng}=P_{electric,gross}/P_{electric,recirculating}$.
- Store the complete search domain, constraints, objective version, winning point, and rejected-point reasons with each result.
- Report boundary hits and parameter sensitivities; never label a boundary winner a physical optimum.

Acceptance criteria:

- [x] DT counterfactual presets are named separately from Argon MHD configurations.
- [ ] Every optimization result reports whether each parameter is interior or boundary-limited.
- [ ] Re-running an objective version produces byte-identical ranked candidates.

#### Phase 1 - zero-dimensional DT burn and power balance

Replace the scalar reaction factor with temperature-dependent Maxwellian reactivity $\langle\sigma v\rangle(T_i)$ from a cited DT fit or evaluated table. Evolve volume-averaged species and energy balances:

$$
\frac{dn_D}{dt}=S_D-\frac{n_D}{\tau_p}-n_Dn_T\langle\sigma v\rangle,
\qquad
\frac{dn_T}{dt}=S_T-\frac{n_T}{\tau_p}-n_Dn_T\langle\sigma v\rangle,
$$

$$
\frac{dW}{dt}=P_{aux}+f_\alpha P_{fusion}-P_{transport}-P_{brems}-P_{line}-P_{cyclotron}-P_{CX}.
$$

Track DT fraction, electron and ion temperatures, ash, effective charge $Z_{eff}$, alpha deposition, neutron power, and particle/energy confinement times. Use separate electron and ion energy equations once equilibration time is comparable to confinement time.

Acceptance criteria:

- [ ] DT reactivity fixtures reproduce cited tabulated values over the supported temperature range.
- [ ] Fusion power uses $n_Dn_T\langle\sigma v\rangle E_{fusion}V$ with dimensional-unit tests.
- [ ] Particle and energy balances close within declared numerical tolerances.
- [ ] Ignition, extinction, and steady-burn fixtures agree with independent 0D calculations.

#### Phase 2 - losses, impurities, and heating efficiency

Add bremsstrahlung, synchrotron/cyclotron, charge-exchange, line-radiation, conduction, and convective losses. Use provenance-tagged atomic-rate tables for argon and wall impurities rather than one effective coefficient. Model neutral-beam, RF, compression, and rotating-field heating with plasma-coupling and wall-plug efficiencies.

For piezo/RMF and longitudinal-wave experiments, first measure the unloaded vessel eigenmodes, actuator electrical-to-mechanical transfer function, phase delay, quality factor, and thermal limits. Then measure the loaded transfer into magnetic-field modulation or electrostatic plasma response as a function of density, temperature, field, and frequency. I/Q demodulation may estimate amplitude and phase response, but it is an instrumentation method rather than a new force or confinement law.

Acceptance criteria:

- [ ] Every loss channel carries units, provenance, applicability range, and uncertainty.
- [ ] Total radiated plus transported power never exceeds available stored and injected energy without reducing plasma energy.
- [ ] Increasing impurity fraction raises $Z_{eff}$ and radiation consistently with reference cases.
- [ ] Auxiliary input distinguishes delivered plasma power from facility electrical power.
- [ ] Piezo and longitudinal-drive transfer functions carry measured gain, phase, bandwidth, uncertainty, and hardware limits.
- [ ] Driven plasma-response benchmarks reproduce measured resonance frequency, damping rate, wavelength, and phase lag without fitting the validation shots.

#### Phase 3 - calibrated FRC transport and confinement

Replace the current algebraic confinement score with sourced FRC scaling laws or calibrated transport coefficients. Evolve particle and energy confinement, separatrix radius, excluded flux, and rotation. Keep empirical fits versioned by device and operating regime; do not extrapolate silently beyond their calibration domain.

Acceptance criteria:

- [ ] Reference shots reproduce published radius, temperature, density, lifetime, and excluded-flux trends within stated uncertainty.
- [ ] Out-of-domain operation is rejected or visibly marked as extrapolation.
- [ ] Confinement uncertainty propagates into fusion-power and $Q$ intervals.

#### Phase 4 - axisymmetric resistive MHD

Implement a conservative 2.5D axisymmetric finite-volume solver for mass, momentum, total energy, and induction:

$$
\partial_t\rho+\nabla\cdot(\rho\mathbf u)=S_\rho,
$$

$$
\partial_t(\rho\mathbf u)+\nabla\cdot\left[\rho\mathbf u\mathbf u+\left(p+\frac{B^2}{2\mu_0}\right)I-\frac{\mathbf B\mathbf B}{\mu_0}-\tau\right]=\mathbf S_m,
$$

$$
\partial_t\mathbf B=\nabla\times(\mathbf u\times\mathbf B-\eta\mathbf J),
\qquad \nabla\cdot\mathbf B=0.
$$

Represent coils and vessel boundaries explicitly. Use constrained transport or a verified divergence-control method. Add anisotropic thermal conduction and resistivity before Hall and two-fluid terms.

Acceptance criteria:

- [ ] Brio-Wu, Orszag-Tang, resistive diffusion, and field-reversal equilibria converge at the expected order.
- [ ] Mass and total-energy residuals remain within declared tolerances.
- [ ] Normalized magnetic divergence remains below a fixed threshold.
- [ ] Growth rates for tilt, shift, rotational, and interchange test cases agree with linear benchmarks.

#### Phase 5 - kinetic products and alpha feedback

Use reduced guiding-center or particle methods for alpha slowing-down and loss-orbit fractions. Treat 14.1 MeV neutrons as unconfined transport into a separate blanket/shield model rather than an MHD fluid. Couple deposited alpha power back into the burn equations.

Acceptance criteria:

- [ ] Alpha birth energy partitions into deposition and escape with energy closure.
- [ ] Slowing-down times match analytic limits and reference calculations.
- [ ] Neutron rate, wall loading, and blanket deposition preserve particle and energy accounting.

#### Phase 6 - engineering gain and plant balance

Add coil, pulse-forming, cryogenic, vacuum, pumping, fueling, heating, blanket, thermal-cycle, and balance-of-plant loads. Report $Q_{plasma}$, scientific breakeven, gross electric power, recirculating fraction, and $Q_{eng}$ separately with uncertainty bands.

Acceptance criteria:

- [ ] No electrical output is reported without a thermal/electrical conversion path.
- [ ] Recirculating loads are included in net power and cannot be hidden by plasma gain.
- [ ] Power-flow diagrams close and expose every modeled conversion efficiency.

#### Phase 7 - uncertainty-aware optimization

Only after Phases 1-6 pass should optimization target DT operation. Use multi-objective search over net electric power, stability margin, neutron wall loading, pulse duration, and component limits. Penalize extrapolation and boundary saturation, propagate input uncertainty, and maintain separate Argon commissioning and DT burn scenarios.

Acceptance criteria:

- [ ] Optimized points remain feasible under uncertainty samples, not only nominal inputs.
- [ ] Pareto fronts expose tradeoffs instead of collapsing them into an undocumented scalar score.
- [ ] Independent validation cases are excluded from calibration and optimization.

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