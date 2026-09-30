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

#### Research translation of the excluded mechanisms

The exclusion does not mean that every engineering objective behind those claims is inaccessible. It means that the proposed cause must be replaced by a mechanism with measured couplings, conservation laws, and a validated domain.

| Transcript claim | Closest physical mechanisms | What transfers | What does not transfer |
| --- | --- | --- | --- |
| Massive longitudinal Proca photons | Massive vector bosons; a hypothetical dark photon; longitudinal plasmons; phonons; exciton-, phonon-, and plasmon-polaritons; transverse-magnetic guided modes; and the effective gauge-field mass associated with plasma or superconducting response | A massive spin-1 field has three physical polarizations. Matter can also support longitudinal collective modes and mixed light-matter quasiparticles with an effective dispersion or mass. | $W^\pm$ and $Z$ bosons are short-lived electroweak particles, not controllable RF carriers. Dark photons remain hypothetical. A plasmon or polariton exists only in its material or plasma environment and does not become a freely propagating massive vacuum photon. A waveguide TM field can have a longitudinal electric component while the underlying photon remains massless. |
| SQG or optical pressure confinement | Ordinary FRC magnetic pressure and field-line tension, diamagnetic current, RMF current drive, electrostatic sheaths, ponderomotive forces, neutral-beam momentum, and externally driven acoustic or MHD pressure | Time-averaged wave forces and driven currents can alter density, flow, current, and stability if their deposited momentum and power are included. | No source establishes an SQG vacuum pressure, gravitational optical pressure, or pressure independent of field energy and boundary reaction forces. These names cannot replace $\mathbf J\times\mathbf B$, $-\nabla p$, Maxwell stress, or a measured material stress. |
| Deterministic helicity locking | RMF current drive, RF wave-particle resonance, coaxial or oscillating-field magnetic-helicity injection, injection locking of a collective mode, spin-polarized fuel, and feedback phase control | A driven plasma can acquire current, flow, magnetic helicity, or a phase-correlated collective response. Nuclear polarization can modify angular distributions and reaction rates for supported channels. | Magnetic helicity, particle kinetic helicity, spin polarization, and optical phase are different observables. None forces two nuclei into the same six-dimensional phase-space point, and none changes a fusion cross section into a deterministic step function. |
| Barrier-free fusion | Maxwellian or beam-target tunneling, electron screening, muon-catalyzed molecular fusion, lattice-confinement experiments, resonant reactions, and polarized-fuel enhancement | Screening or a heavy negative particle can reduce the effective separation or barrier width; polarization may change a supported reaction rate. | The Coulomb interaction and nuclear branching remain. Muon production energy, muon decay and sticking, finite screening energies, target damage, stopping power, depolarization, and reaction-product losses prevent these mechanisms from being a barrier-free power source by definition. |

##### Which excitations are actually similar to a Proca photon?

Similarity must be qualified by the property being compared:

- **Same spin count:** a fundamental massive vector boson has spin one and three on-shell polarizations. Standard Model $W^\pm$ and $Z$ bosons are examples, but their mass, lifetime, coupling, and production energy make them irrelevant to an FRC actuator. A dark photon would be a closer formal analogue, but no validated reactor-scale source or coupling exists.
- **Longitudinal electric response:** a longitudinal plasmon or ion-acoustic wave is a collective density oscillation. Its longitudinal field follows from charge separation and a dielectric response, not from a vacuum photon mass.
- **Effective mass or cutoff:** photons in a plasma, superconductor, cavity, or waveguide can obey a massive-looking dispersion. This is a property of the coupled system and boundary conditions. Removing the medium removes the quasiparticle or changes the mode.
- **Mixed light and matter:** polaritons are legitimate quasiparticles, but their lifetime, group velocity, longitudinal fraction, and coupling are material- and wave-vector-dependent. They do not inherit arbitrary Proca interactions.

For a Proca field $A^\mu$, the mass term and constraint leave three physical polarizations. A twistor construction may encode the same massive state, just as spinor-helicity variables may encode a scattering amplitude, but neither construction supplies an additional physical component. In a plasma, the longitudinal degree of freedom is obtained from the dielectric tensor, Poisson's equation, and the particle or fluid response. **Twistors are not necessary for the third component of a longitudinal wave.** They are an optional mathematical representation, not a polarization-generating medium or force law.

##### Longitudinal-drive geometry in a magnetized FRC

For an electrostatic ion-acoustic drive, $\mathbf E_1\parallel\mathbf k$. The relevant angle is local,

$$
	heta_B=\cos^{-1}(\hat{\mathbf k}\cdot\hat{\mathbf B}_0),
\qquad
k_\parallel=k\cos\theta_B,
\qquad
k_\perp=k\sin\theta_B.
$$

The ordinary low-frequency ion-acoustic branch is primarily a parallel-compression mode. A useful baseline is therefore $\theta_B=0^\circ$ with a near-parallel scan at $0^\circ$, $5^\circ$, $10^\circ$, $15^\circ$, and $30^\circ$. Larger-angle points at $45^\circ$, $60^\circ$, $75^\circ$, and $90^\circ$ are controls for oblique coupling, damping, mode conversion, and transition toward lower-hybrid, ion-cyclotron/Bernstein, drift, or sheath-dominated responses. At $90^\circ$, $k_\parallel=0$ and the drive is not the ordinary parallel ion-acoustic mode.

There is no universal optimal angle. An FRC has curved field lines, a field reversal, and a magnetic null, so one laboratory angle cannot remain parallel everywhere. The implementation should use local flux coordinates and optimize a measured objective such as absorbed power, coherent density response, driven current, or damping rate subject to wall loading and stability constraints. Frequency must be scanned with angle rather than held at a nominal acoustic value. A starting dispersion check is

The launcher studies add a second, distinct angle: plasma-gun cant relative to the local inward radial direction. A radial ring has zero cant and emphasizes convergent compression. Giving every launcher the same signed cant adds net angular momentum and a vortex-like mean flow; alternating signs can add shear while canceling net circulation. Multiple angles are therefore useful experimental degrees of freedom, but they are not automatically superior. The relevant objective must include compression symmetry, absorbed power, angular-momentum transfer, shear stability, wall interception, and gun-to-gun phase error.

The tokamak-like and stellarator-like loop selections remain external-drive topology analogues when applied to an FRC vessel. Matching device presets add an axisymmetric torus and a prescribed three-period helical torus, seed particles in those toroidal domains, and apply a reduced guide-field transport direction. These are geometry and visualization studies only. They do not solve Grad-Shafranov or three-dimensional MHD equilibrium, construct nested flux surfaces, model a tokamak plasma-current transformer, or calculate an optimized stellarator coil set and rotational transform. Their displayed $Q$ change is deliberately capped as a reduced sensitivity factor and must not be interpreted as a predictive comparison among FRC, tokamak, and stellarator reactors.

$$
\omega_r\simeq\frac{k_\parallel c_s}{\sqrt{1+k^2\lambda_D^2}},
$$

followed by kinetic calculation of electron and ion Landau damping and magnetized corrections. "Strong" must be represented by dimensionless amplitudes such as $e\Phi/(k_B T_e)$, $\delta n/n_0$, and wave Mach number. Once these cease to be small, the solver must include trapping, harmonic generation, shocks, sheath coupling, and nonlinear damping rather than extrapolate a linear wave.

Acceptance criteria:

- [ ] The drive angle is defined against the local equilibrium field, with magnetic-null cells treated separately.
- [ ] Angle-frequency scans report launched, reflected, absorbed, and wall-coupled power rather than selecting an angle from field amplitude alone.
- [ ] The parallel limit reproduces a cited ion-acoustic dispersion and damping benchmark; the perpendicular limit is not labeled ion-acoustic without a branch-identification test.
- [ ] Nonlinear runs report $e\Phi/(k_B T_e)$, $\delta n/n_0$, Mach number, trapped-particle fraction, and harmonic energy.
- [ ] Gun-ring scans conserve injected energy and angular momentum and report radial compression, tangential momentum, phase balance, and wall loading separately.
- [ ] Tokamak and stellarator labels remain topology analogues until device-specific equilibrium, orbit, stability, and transport benchmarks are implemented.

##### DDF as a constitutive stress, not a confinement source

The current DDF option is a bounded phenomenological dilatancy model. A physically testable continuation would place it in the viscous stress,

$$
\boldsymbol\tau_{DDF}=2\eta_{eff}(\dot\gamma,|\mathbf u|,\rho,T)\mathbf S
+\zeta_{eff}(\nabla\cdot\mathbf u)\mathbf I,
$$

with non-negative dissipative coefficients and a declared relaxation time. This can change momentum diffusion, shear-layer thickness, rotation damping, normal-stress differences, and instability growth. It does **not** directly add an inward thermodynamic pressure. FRC balance still requires plasma pressure, magnetic pressure and tension, inertia, and boundary traction. If DDF is intended to supply a reversible elastic or quantum stress, that stress must come from a free-energy functional and appear consistently in momentum and total-energy equations; otherwise it is only drag and generally increases the sustainment power required.

Acceptance criteria:

- [ ] DDF stress is objective, dimensionally consistent, and dissipates rather than creates energy for every tested strain state.
- [ ] Magnetic equilibrium is unchanged when DDF strain rate is zero.
- [ ] Any claimed confinement improvement is decomposed into reduced transport, altered stability, and extra actuator power; it is not reported as a new static pressure.
- [ ] DDF coefficients are fitted to an identified material or plasma data set and rejected outside its calibration domain.

##### Piezoelectric-to-RMF transfer model

A piezoelectric element alone does not generate a useful rotating magnetic field. Two plausible architectures should be modeled separately:

1. **Mechanically tuned coil:** piezoelectric displacement changes coil geometry, spacing, capacitance, ferrite position, or matching-network state, thereby modulating the amplitude and phase of conventional polyphase RMF coils.
2. **Magnetoelectric transducer:** voltage drives a piezoelectric strain, elastic coupling drives a magnetostrictive layer, and oscillating magnetization produces a near magnetic field. This is the mechanism demonstrated by resonant magnetoelectric composites and NEMS antennas, but scaling field strength, aperture, temperature, radiation tolerance, and distance to an FRC remains unvalidated.

The model must retain the cascaded complex transfer functions,

$$
\frac{\delta B_{plasma}(\omega)}{V_{drive}(\omega)}=
H_{piezo}(\omega,T)H_{structure}(\omega,T)H_{mag}(\omega,B_{bias})
H_{vacuum}(\omega,\mathbf x)H_{plasma}(\omega,n,T,B),
$$

rather than replace them with one optimistic coupling slider. A minimal mechanical state is

$$
M\ddot q+C\dot q+Kq=\Theta V+F_{back},
$$

coupled to either a measured coil perturbation $\delta L(q),\delta M(q)$ or a magnetostrictive constitutive relation and then to the plasma induction/current-drive model. I/Q demodulation should identify the complex gain and phase of each stage with plasma off, cold plasma, and hot plasma. Required parameters include piezoelectric tensor and dielectric loss, elastic mode shape, resonance and quality factor, preload, magnetostriction curve, magnetic bias, hysteresis, coil mutual inductance, matching impedance, thermal drift, fatigue, radiation damage, vacuum compatibility, plasma loading, and uncertainty.

Acceptance criteria:

- [ ] Bench measurements identify voltage-to-strain and strain-to-field transfer functions, including phase, bandwidth, harmonics, hysteresis, and uncertainty.
- [ ] A calibrated field map predicts $\delta\mathbf B(\mathbf x,\omega)$ at the plasma boundary and closes electrical, mechanical, magnetic, and thermal power.
- [ ] Polyphase channels report amplitude/phase imbalance and the resulting rotating-to-counter-rotating field ratio.
- [ ] Plasma-on measurements identify penetration, shielding, driven current, torque transfer, and back-reaction without reusing validation shots for calibration.
- [ ] The model enforces displacement, stress, depoling, fatigue, temperature, voltage, magnetic saturation, and vacuum-feedthrough limits.

##### Why deterministic helicity locking and barrier-free fusion remain infeasible

The present claims skip several necessary maps:

1. **Observable mismatch:** optical phase, spinor phase, nuclear spin, particle helicity, fluid vorticity, and magnetic helicity $K=\int\mathbf A\cdot\mathbf B\,dV$ are not interchangeable. A coupling Hamiltonian or transport equation must state which observable is driven.
2. **Scale mismatch:** an RF or acoustic field acts collectively over Debye, gyroradius, skin-depth, and device scales. Fusion occurs at femtometer nuclear range after close Coulomb approach. A derivation must bridge those scales without inserting an assumed unit cross section.
3. **Conservation gap:** instantaneous or infinite torque violates finite field energy, angular-momentum transfer, causality, and actuator bandwidth. Current drive and helicity injection must include the equal reaction torque and dissipated power.
4. **Kinetic gap:** a deterministic collision claim needs a normalized distribution function, two-body correlation, impact-parameter distribution, stopping and scattering, decoherence, and a measured reaction cross section. Matching one phase does not localize position and momentum arbitrarily.
5. **Barrier gap:** screening changes the tunneling exponent by a finite energy; it does not delete the Coulomb potential. Muon catalysis forms compact molecules but is limited by muon creation cost, $2.2\,\mu\mathrm{s}$ lifetime, sticking, and finite cycles. Polarized fuel changes supported spin-channel probabilities but does not guarantee reaction.
6. **Plasma gap:** coherent forcing competes with collisions, Landau/cyclotron damping, turbulence, field-line curvature, phase mixing, neutral friction, and instabilities. A lock range and decoherence rate must be measured, not asserted.
7. **Power-balance gap:** any enhancement must include source wall-plug power, failed interactions, radiation, products, target replacement, and recirculating loads in $Q_{eng}$.

The acceptable alternatives are therefore probabilistic and measurable: phase-lock a collective mode, inject magnetic helicity, drive current resonantly, prepare polarized fuel where retention is demonstrated, or include a finite screened/catalyzed reaction rate. None may be labeled deterministic or barrier-free.

##### Research anchors

- Bohm and Gross, "Theory of Plasma Oscillations. A. Origin of Medium-Like Behavior" (1949), [doi:10.1103/PhysRev.75.1851](https://doi.org/10.1103/PhysRev.75.1851).
- Anderson, "Plasmons, Gauge Invariance, and Mass" (1963), [doi:10.1103/PhysRev.130.439](https://doi.org/10.1103/PhysRev.130.439).
- Hirose, Alexeff, and Jones, "Landau Damping of Ion Acoustic Waves in a Uniform Magnetic Field" (1970), [doi:10.1063/1.1693062](https://doi.org/10.1063/1.1693062).
- Ahmadihojatabad, Abbasi, and Hakimi Pajouh, "Influence of superthermal and trapped electrons on oblique propagation of ion-acoustic waves in magnetized plasma" (2010), [doi:10.1063/1.3503664](https://doi.org/10.1063/1.3503664).
- Steinhauer, "Review of field-reversed configurations" (2011), [doi:10.1063/1.3613680](https://doi.org/10.1063/1.3613680).
- Milroy, "A magnetohydrodynamic model of rotating magnetic field current drive in a field-reversed configuration" (2000), [doi:10.1063/1.1290279](https://doi.org/10.1063/1.1290279).
- Guo et al., "Formation and steady-state maintenance of field reversed configuration using rotating magnetic field current drive" (2002), [doi:10.1063/1.1426102](https://doi.org/10.1063/1.1426102).
- Slough and Miller, "Enhanced Confinement and Stability of a Field-Reversed Configuration with Rotating Magnetic Field Current Drive" (2000), [doi:10.1103/PhysRevLett.85.1444](https://doi.org/10.1103/PhysRevLett.85.1444).
- Nan et al., "Multiferroic magnetoelectric composites: Historical perspective, status, and future directions" (2008), [doi:10.1063/1.2836410](https://doi.org/10.1063/1.2836410).
- Nan et al., "Acoustically actuated ultra-compact NEMS magnetoelectric antennas" (2017), [doi:10.1038/s41467-017-00343-8](https://doi.org/10.1038/s41467-017-00343-8).
- Taylor, "Current drive by plasma waves and helicity conservation" (1989), [doi:10.1103/PhysRevLett.63.1384](https://doi.org/10.1103/PhysRevLett.63.1384).
- Kulsrud et al., "Fusion Reactor Plasmas with Polarized Nuclei" (1982), [doi:10.1103/PhysRevLett.49.1248](https://doi.org/10.1103/PhysRevLett.49.1248).
- Assenbaum, Langanke, and Rolfs, "Effects of electron screening on low-energy fusion cross sections" (1987), [doi:10.1007/BF01289572](https://doi.org/10.1007/BF01289572).
- Breunlich et al., "Muon-Catalyzed Fusion" (1989), [doi:10.1146/annurev.ns.39.120189.001523](https://doi.org/10.1146/annurev.ns.39.120189.001523).
- Albonico, Geyer, and Mason, "From Twistor-Particle Models to Massive Amplitudes" (2022), [doi:10.3842/SIGMA.2022.045](https://doi.org/10.3842/SIGMA.2022.045). This supports twistors as a representation of massive-particle phase space and amplitudes, not as an extra plasma-wave polarization.

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