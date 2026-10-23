# Fluid Soliton and CFD Simulator Plan

## Goal

Extend `WaveInterferenceSim.jsx` with a distinct fluid-wave mode for solitons in a pneumatic surfing wave pool. Preserve the existing interference experiment and its saved states. Offer a fast reduced-order solver by default and an optional, more physically complete CFD mode for users who want fluid motion, boundaries, and wave generation resolved rather than prescribed.

The simulator is an educational and exploratory model. CFD mode must state its dimensionality, numerical resolution, constitutive assumptions, and validated operating range; it must not be presented as a certified wave-pool design tool.

## Design Principles

- Keep the existing linear/interference and optional GPE response behavior unchanged. Put a visible **Fluid Waves** mode alongside it, with its own solver state and controls.
- Separate physical model state and numerical stepping from React UI and Three.js rendering. Use pure CPU references for model tests and backend-specific GPU implementations for interactive speed.
- Distinguish equations that are exact within their assumptions from visualization proxies and exploratory material hypotheses.
- Never silently switch to a different physical model when a GPU, WebGPU, or precision capability is unavailable. Explain the selected backend and limitations in the UI.
- Make presets reproducible through existing simulator snapshots, parameter journal, and export/import paths. Add schema defaults so older snapshots continue to load.

## Simulation Modes

### 1. Reduced-order soliton mode

Implement scalar shallow-water Korteweg-de Vries (KdV) as the first time-integrated fluid-wave solver. For surface elevation $\eta(x,t)$ over still-water depth $h_0$, one standard dimensional form is

$$
\eta_t+c_0\eta_x+\frac{3c_0}{2h_0}\eta\eta_x+
\frac{c_0h_0^2}{6}\eta_{xxx}=0,
\qquad c_0=\sqrt{g h_0}.
$$

This is a weakly nonlinear, weakly dispersive, long-wave, unidirectional approximation. It is not the full free-surface Navier-Stokes system. Add an optional calibrated dissipative term for a KdV-Burgers-style approximation:

$$
\eta_t+c_0\eta_x+\frac{3c_0}{2h_0}\eta\eta_x+
\frac{c_0h_0^2}{6}\eta_{xxx}=\nu_{\mathrm{eff}}\eta_{xx}.
$$

Treat $\nu_{\mathrm{eff}}$ as a model coefficient to derive or fit for the reduced equation, not as an automatic synonym for tabulated kinematic viscosity. Track its provenance and show that the model dissipates wave energy as expected.

Use an analytic solitary-pulse initial condition, such as $\eta=A\,\mathrm{sech}^2((x-x_0)/L)$, to validate the solver's speed and shape. Use a stable periodic spectral or conservative finite-difference discretization with fixed simulation timesteps, resolution-aware stability checks, and explicit boundary behavior. Do not claim periodic boundaries model a finite pool.

### 2. Bidirectional shallow-water mode

KdV evolves waves in one preferred direction. It cannot faithfully represent independently launched pulses traveling toward one another from opposite pool ends. Add a bidirectional Boussinesq-family model for bilateral launch and reflection experiments. State the selected equation, assumptions, dispersion range, and boundary treatment in the model metadata. A two-source visualization may be prototyped sooner, but it must not label simple superposition as a solved nonlinear head-on collision.

### 3. Optional 2D free-surface CFD

Add an opt-in grid-based, incompressible free-surface Navier-Stokes solver for the pool's longitudinal/vertical cross-section. This is the first CFD milestone, not a claim of fully resolved 3D turbulence.

Baseline continuum equations for a Newtonian incompressible liquid:

$$
\nabla\cdot\mathbf u=0,
\qquad
\rho\left(\partial_t\mathbf u+\mathbf u\cdot\nabla\mathbf u\right)
=-\nabla p+\nabla\cdot\boldsymbol\tau+\rho\mathbf g+\mathbf f_{\mathrm{actuator}}.
$$

For constant viscosity, $\boldsymbol\tau=\mu(\nabla\mathbf u+\nabla\mathbf u^T)$. Represent the air-water interface with a volume-of-fluid (VOF) fraction and surface-tension force where that effect is resolved. Use a staggered MAC grid, finite-volume fluxes, a pressure-projection step, and a bounded interface advection scheme. Pneumatic launch hardware should act as a prescribed boundary velocity/pressure or momentum source with an explicit waveform and power/impulse readout, not as a free energy multiplier.

The initial CFD domain is 2D. Validate wave height, propagation, reflection, momentum, fluid volume, and viscosity trends against analytic limits, published benchmarks, or a trusted reference solver before adding the pool as the default CFD example. A later 3D option should be a separate, substantially larger milestone with its own performance and validation budget.

### 4. Compressible and cryogenic model extensions

Do not apply the incompressible-liquid solver to every catalog entry. A compressible finite-volume solver is a separate optional backend for gases and conditions where density variation matters. Helium-3/helium-4 superfluid behavior needs a specialized two-fluid model and cryogenic parameterization; ordinary Newtonian viscosity is not an adequate proxy. Keep these presets disabled or visibly marked as unsupported until the matching solver and reliable state-dependent properties exist.

## Soliton Catalog

Make the model selector an extensible catalog with equation, state variables, dimensionality, applicable media, parameters, and validity notes. Start with:

- Scalar KdV solitary waves and their dissipative KdV-Burgers approximation for shallow-water demonstrations.
- A bidirectional Boussinesq-family solver for opposite-end pulse collisions.
- One explicit coupled/vector soliton model, with the coupled fields and cross-phase/nonlinear terms shown in the model definition. “Vector soliton” must not mean a visual arrow or a polarization label alone.
- Additional mathematical families only as separate models with distinct state and equation contracts, such as coupled nonlinear Schrödinger (Manakov) bright/dark solitons. Do not imply that every family describes a surface wave in an ordinary pool.

Allow two independently configured pulses, with launch side left/right/both, amplitude, width, time, phase where meaningful, and coupling/polarization for supported vector models. Model collisions by advancing the governing PDE. For unsupported combinations, disable the control with a reason rather than inventing cross-model interactions.

## Fluid Presets And State Requirements

Provide a data-driven catalog for Water, Glycerin, Hydrogen, Helium 3, Helium 4, Argon, and Water (HDL+LDL). A preset must include or request temperature, pressure, material phase, density, dynamic viscosity, surface tension where applicable, source/provenance, and uncertainty. The UI must distinguish user-tuned illustrative values from validated/reference values.

| Preset | Initial model applicability | Required guardrail |
| --- | --- | --- |
| Water | KdV, bidirectional shallow-water, and 2D incompressible free-surface CFD | Require pool depth and temperature; expose viscosity and surface tension assumptions. |
| Glycerin | KdV and 2D incompressible free-surface CFD | Viscosity is strongly temperature-dependent; do not use one unqualified value across temperatures. |
| Hydrogen | Compressible gas or liquid CFD only after phase/state selection | Require cryogenic/pressure state and phase-specific properties; do not label unspecified hydrogen simply as a pool liquid. |
| Helium 3 | Future cryogenic/superfluid model | Require phase, temperature, and pressure; ordinary liquid CFD is not a superfluid solver. |
| Helium 4 | Future cryogenic/superfluid model | Distinguish normal and superfluid regimes; use a two-fluid model where applicable. |
| Argon | Compressible gas or liquid CFD only after phase/state selection | Require phase and temperature/pressure; no universal liquid preset. |
| Water (HDL+LDL) | Experimental structural-order extension of a water model | Do not present HDL and LDL as ordinary pool phases or assign invented bulk coefficients. |

Use a state/phase validator before calculating derived coefficients. If material data is unavailable, allow an explicitly marked user scenario but do not call it validated. Avoid hard-coded precision that the selected source does not support.

## Water (HDL+LDL) Evidence And Modeling Boundary

Li, Zhong, Zhang, Wang, and Zeng, “Evidence for the generic existence of two local structures in liquid water,” *Nature Physics* 22, 1144–1151 (2026), [doi:10.1038/s41567-026-03301-8](https://doi.org/10.1038/s41567-026-03301-8). The authors' abstract reports unsupervised deep-learning analysis of extensive molecular-dynamics simulations using an accurate water model. Their multidimensional reaction coordinates show interconvertible pathways with three saddle points near the high-density/low-density phase boundary and a one-saddle semi-loop pathway away from it. This is molecular-level computational evidence supporting a two-state model of local structures; it is not direct observation of a pool-scale interface or a measurement of KdV coefficients.

The supplied [2004 Science article, “A Tale of Two Waters”](https://www.science.org/content/article/tale-two-waters) describes X-ray evidence interpreted as a roughly five-molecule-thick, unusually dense water layer at an ice-silica interface at -17 C. It is a historical, confined-interface result, distinct from the 2026 molecular-dynamics/reaction-coordinate study. Neither source licenses a claim that ordinary pool water separates into two macroscopic liquids.

Model Water (HDL+LDL) as a research/visualization hypothesis: optionally display a local structural order parameter or learned reaction-coordinate proxy, with conversion between states only if it is calibrated against appropriate molecular data. Do not derive viscosity, density, soliton speed, or transition rates from the article title or qualitative HDL/LDL labels. The paper's Zenodo records include research data and trained autoencoder materials; assess the dataset's schema, provenance, licensing, and suitability before attempting a data-backed parameterization. Keep molecular analysis outside the real-time continuum solver unless a validated coarse-graining map is established.

## Real-Time Architecture

1. Keep model definitions, normalization, validation, and a deterministic CPU reference in pure modules. Suggested boundaries: `fluidSolitonModel.js` for the reduced PDE/catalog and a separate `fluidCfdModel.js` for CFD parameters and reference operations.
2. Integrate the new mode through the existing simulator snapshot/journal pathways without altering the wave-interference representation or detector. Render the evolved free surface and optional velocity/pressure diagnostics in a dedicated scene component.
3. Run expensive stepping outside React render. Prototype a WebGPU compute backend for CFD and benchmark the current Three.js/WebGL application boundary before choosing the final GPU integration. Retain a slower worker/WASM CPU backend only if the supported resolution and timestep are clearly reported. A KdV backend can remain usable on more modest devices.
4. Use fixed simulation timesteps, bounded substeps per rendered frame, and explicit pause/step/reset controls. If the wall clock falls behind, slow the simulation or lower resolution only through an explained user-visible policy; never skip stability limits silently.
5. Use GPU-resident state and render directly from solver fields where possible. Avoid synchronous GPU readback every frame; throttle telemetry and read only compact summaries. Dispose buffers, textures, pipelines, and workers on mode change/unmount.
6. Profile update cost separately from rendering. Establish benchmark hardware/browser profiles before promising a resolution. Initial goal: smooth interactive use at a documented 2D baseline resolution, with frame time, simulated-time factor, and pressure-solver iterations reported. Add adaptive resolution and substep limits only after conservation and convergence checks show the quality tradeoff.
7. Offer WebGPU when supported and tested. Any WebGL or CPU fallback must accurately label the active solver and supported grid size; do not imply the fallback is equivalent if its discretization differs.

## User Experience

- Add a clear mode selector: **Interference**, **Soliton**, and **CFD**. Interference remains the initial/default experience unless a product decision later changes it.
- Show the selected equation/model, medium state, pool depth, boundary conditions, simulation resolution, timestep, backend, and validity caveat in the controls/readout.
- Include launch presets for left-to-right, right-to-left, two same-direction pulses, and two opposite-end pulses only when the active solver supports that configuration.
- Make velocity and pressure overlays optional. Surface elevation, source motion, fluid boundaries, and the two pulses should remain easy to inspect without opening a dense parameter panel.
- Keep physical quantities dimensioned and separate from display scaling. A visualization gain must never feed back into the solver.

## Implementation Phases And Gates

### Phase 0: Physics and performance spike

- Freeze the first KdV equation, boundary conditions, units, and solver discretization.
- Prototype the CFD grid and WebGPU integration in a small, disposable benchmark; measure pressure projection, interface advection, browser support, and memory use.
- Select initial supported 2D resolution and a reference browser/GPU target from measurements. Decide whether a worker/WASM fallback is practical.
- Gate: demonstrate stable stepping and pressure projection without blocking the UI; record backend limitations before committing to the CFD architecture.

### Phase 1: Separate Fluid Waves mode and KdV

- Add mode/state boundaries, a pure CPU KdV reference, an analytic single-soliton preset, and a first interactive surface renderer.
- Integrate fluid settings into save/load, undo/redo, edit journal, and export/import with migration defaults.
- Gate: pass analytic propagation, timestep-refinement, mass/mean-level, and deterministic replay tests; confirm existing interference presets still behave identically.

### Phase 2: Dissipation and two pulses

- Add calibrated effective damping, source controls, two-pulse launch, and same-direction nonlinear interaction tests.
- Add disabled/reasoned UI for opposite-end nonlinear collisions until bidirectional propagation is implemented.
- Gate: increasing calibrated damping reduces pulse amplitude without instability; results converge under grid/timestep refinement.

### Phase 3: Bidirectional solitons and coupled vector model

- Implement and document a Boussinesq-family model, opposite-end sources, and one explicitly defined coupled/vector soliton system.
- Add additional soliton families only as independent model implementations with their own tests and applicable-media annotations.
- Gate: compare collision behavior to analytic or published numerical references; verify coupling-free limits reduce to independent scalar waves.

### Phase 4: Optional 2D free-surface CFD

- Implement the incompressible liquid solver, pool walls, VOF free surface, gravity, viscosity, surface tension if supported, and a bounded pneumatic actuator.
- Add CPU reference tests first, then compare GPU steps against CPU/reference cases at matching resolution.
- Gate: bounded divergence, stable interface, expected mass/momentum accounting, grid convergence on benchmark cases, and no unreported backend substitution.

### Phase 5: More media and CFD extensions

- Populate temperature/pressure-dependent properties with provenance and explicit phase validation.
- Evaluate compressible gas flow separately; prototype cryogenic/superfluid equations only with qualified physical data and specialized validation.
- Add Water (HDL+LDL) structural-order visualization only after assessing the paper-linked dataset and defining a valid molecular-to-continuum mapping.
- Defer 3D CFD until 2D accuracy, GPU cost, memory use, and user demand establish a credible scope.

## Verification And Acceptance Criteria

- **KdV:** analytic pulse speed/shape; stable propagation; mass/mean-level tracking; convergence with grid and timestep; periodic and finite-domain boundary tests.
- **Dissipation:** correct sign and monotonic energy loss for the dissipative term; viscosity trend checks against the chosen reduced model's expected behavior.
- **Interactions:** same-direction and head-on pulses are evolved by the stated PDE; independent vector channels decouple when coupling is zero; test phase/coupling conservation where applicable.
- **CFD:** divergence residual, fluid-volume/interface conservation, pressure-boundary consistency, gravity/static-pool equilibrium, dam-break or solitary-wave benchmark, viscosity and grid-convergence studies, actuator work and momentum accounting.
- **Performance:** report grid dimensions, bytes/state, solver iterations, median and tail step/frame time, achieved simulated-time factor, hardware, browser, and backend. Performance optimizations must not conceal instability or conservation loss.
- **Integration:** existing interference presets, detector behavior, snapshots, and edit history remain compatible. Browser tests cover mode switching, source selection, pause/step/reset, visible wave response, and solver status without console errors.
- **Claims:** clearly mark approximations, exploratory HDL/LDL behavior, and unsupported fluid states. Do not call a KdV surface plot full CFD, and do not claim engineering certification.

## Key Risks And Decisions

- **Model ambiguity:** “soliton” names several distinct PDE families. Resolve the equation and state variables per model before designing shared controls.
- **One-way vs two-way travel:** KdV cannot support faithful head-on collisions. Bidirectional waves require a separate model.
- **CFD scope:** 2D incompressible free-surface CFD is a significant but bounded first step; compressible gas, 3D turbulence, and superfluid helium are separate projects.
- **Browser GPU support:** WebGPU capability, precision, and performance vary. Confirm the R3F integration strategy experimentally and make fallbacks explicit.
- **Real-time tradeoff:** pressure iterations and interface resolution compete with rendering. Use measured device tiers and user-visible fidelity controls, never a single unsupported performance promise.
- **Water structure interpretation:** local HDL/LDL-like structures are not equivalent to two bulk fluids in a surfing pool. A continuum mixture parameter is an explicit research hypothesis until calibrated.

## References

- Li, L. et al. “Evidence for the generic existence of two local structures in liquid water.” *Nature Physics* 22, 1144–1151 (2026). [https://doi.org/10.1038/s41567-026-03301-8](https://doi.org/10.1038/s41567-026-03301-8)
- Krieger, K. “A Tale of Two Waters.” *Science* (28 May 2004). [https://www.science.org/content/article/tale-two-waters](https://www.science.org/content/article/tale-two-waters)
- Li et al. paper-associated Zenodo records: [record 19326505](https://zenodo.org/records/19326505) and [record 19327735](https://zenodo.org/records/19327735). Review data descriptions and licensing before reuse.
