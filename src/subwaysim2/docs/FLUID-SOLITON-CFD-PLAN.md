# Fluid Soliton, Plasma Wave, and CFD Simulator Plan

## Goal

Extend `WaveInterferenceSim.jsx` with a dedicated **Soliton & Plasma Wave** simulation mode that supports both:

1. **Pneumatic surfing wave pool hydrodynamics** (shallow-water solitary waves, viscous attenuation, bilateral pneumatic caisson emission, overtaking and head-on collisions, and optional 2D free-surface Navier-Stokes CFD).
2. **Electrostatic and magnetized plasma wave dynamics** (Washimi-Taniuti ion-acoustic KdV solitons, bidirectional ion-acoustic Boussinesq collisions, Gardner/mKdV compressive and rarefactive plasma solitons, coupled vector/Manakov envelope solitons, and optional 2D plasma fluid-momentum CFD).

Preserve the existing linear/interference and aperture-diffraction experiments and their saved snapshots without regression.

## Review and Critique of the Initial Plan

A critical review of the v1 plan identified six major gaps when evaluated against the combined requirements for wave-pool engineering intuition and plasma-wave physics:

1. **Missing plasma-wave physics and dispersion closure:** The initial plan treated Hydrogen, Helium 3, Helium 4, and Argon only as deferred cryogenic liquids or generic gases. In plasma physics, these same species ($\mathrm{H^+}$, $\mathrm{^3He^+}$, $\mathrm{^4He^+}$, $\mathrm{Ar^+}$) are canonical media for **ion-acoustic solitons** (Washimi & Taniuti, 1966) and **magnetosonic / Alfvén wave packets**. Both shallow-water waves and ion-acoustic plasma waves map onto the Korteweg-de Vries (KdV) and Boussinesq equations through distinct physical scales:
   - *Wave pool:* linear long-wave speed $c_0 = \sqrt{g h_0}$, dispersive length $h_0$, nonlinear coefficient $\alpha = \frac{3 c_0}{2 h_0}$, dispersion $\beta = \frac{c_0 h_0^2}{6}$.
   - *Plasma wave:* ion sound speed $c_s = \sqrt{\frac{Z k_B T_e + \gamma_i k_B T_i}{m_i}}$, electron Debye length $\lambda_{De} = \sqrt{\frac{\varepsilon_0 k_B T_e}{n_{e0} e^2}}$, nonlinear coefficient $\alpha = c_s$, dispersion $\beta = \frac{1}{2} c_s \lambda_{De}^2$ (modified by magnetization $B_0$ via the ion gyroradius $\rho_s = c_s / \Omega_{ci}$).
2. **Unidirectional KdV vs. bilateral wave-pool / plasma-grid emission:** Standard KdV is strictly unidirectional; blocking opposite-side emission until a later phase leaves a core user workflow incomplete. The simulator should ship with **both** unidirectional KdV (for classic overtaking two-soliton interactions and analytic verification) and a **bidirectional Boussinesq / regularized two-way solver** so users can emit solitons from the **left, right, or both ends** immediately and observe head-on collision crest amplification and Poincaré / Byatt-Smith phase shifts.
3. **Under-specified vector and non-KdV solitons:** A "vector soliton" must evolve coupled multi-component state variables $(u_1, u_2)$ with explicit self-phase and cross-phase / nonlinear coupling $\sigma_{12}$ and group-velocity mismatch $\Delta c$ (such as coupled KdV or Manakov coupled NLS), not merely draw angled arrows on a scalar profile. Additionally, plasmas with two electron temperatures or negative ions require quadratic-plus-cubic nonlinearity (**Gardner / mKdV**), which produces both compressive and rarefactive solitons and flat-top breathers.
4. **Deferred CFD vs. actionable real-time 2D CFD:** Rather than leaving CFD as a distant phase, a compact, real-time 2D longitudinal-vertical $(x,z)$ staggered-grid Navier-Stokes / fluid-momentum solver (e.g., $128 \times 28$ grid with bounded substeps, projection / acoustic pressure closure, explicit viscosity $\nu \nabla^2 \mathbf{u}$, and pneumatic/grid boundary forcing) can run interactively in the browser while reporting divergence residuals, kinetic/potential energy, and viscous dissipation.
5. **Passive vs. interactive "Water (HDL+LDL)" modeling:** While Li et al., *Nature Physics* 22, 1144–1151 (2026) and Krieger, *Science* (2004) do not justify treating ambient pool water as two separate bulk fluids, leaving `Water (HDL+LDL)` as a static placeholder misses the educational value of the paper. The revised plan models a coarse-grained local tetrahedral order fraction $x_{\mathrm{LDL}}(x,t) \in [0,1]$ ($x_{\mathrm{HDL}} = 1 - x_{\mathrm{LDL}}$) with a selectable reaction-pathway topology (**3-saddle full-loop near the HDL/LDL boundary**, **1-saddle semi-loop away from the boundary**, or **2004 Reichert/Krieger confined 5-molecule interfacial HDL layer**) and a bounded, clearly labeled structural-compressibility/viscosity coupling.
6. **Unified telemetry and comparison:** Wave-pool users need Froude number $\mathrm{Fr} = u / \sqrt{g h_0}$, crest elevation $\eta_{\max}$, pneumatic chamber impulse, and viscous decay rate; plasma users need Mach number $M = V / c_s$, normalized potential $e\Phi / k_B T_e$, Debye length $\lambda_{De}$, ion plasma frequency $\omega_{pi}/2\pi$, Alfvén speed $v_A$, and Landau/collisional damping rate. The revised simulator exposes domain-appropriate telemetry from a single pure model contract.

## Design Principles

- Keep the existing linear/interference and optional GPE response behavior unchanged. Add a dedicated **Soliton & Plasma Wave** mode with its own time-integrated state and controls.
- Separate physical model state and numerical stepping (`src/solitonWaveModel.js`) from React UI and Three.js rendering (`src/WaveInterferenceSim.jsx`).
- Support two physical environments—**Pneumatic Wave Pool (`wave-pool`)** and **Plasma Wave Chamber (`plasma-wave`)**—that share the nonlinear PDE & 2D CFD numerical core while applying physically appropriate dispersion relations, units, boundary actuators, and diagnostics.
- Distinguish established continuum/plasma equations from reduced approximations and exploratory hypotheses (such as macroscopic HDL/LDL structural coupling).
- Make all soliton, fluid, plasma, and CFD parameters serializable through the existing simulator snapshot, undo/redo, and parameter journal infrastructure.

## Simulation Modes and Governing Equations

### 1. Korteweg-de Vries (KdV) and Viscous KdV-Burgers (`kdv`)

In **Wave Pool** mode, surface elevation $\eta(x,t)$ over still depth $h_0$ evolves according to the dimensional KdV-Burgers equation:

$$
\eta_t + c_0\eta_x + \alpha_{\mathrm{pool}}\eta\eta_x + \beta_{\mathrm{pool}}\eta_{xxx}
= \nu_{\mathrm{eff}}\eta_{xx} + S_{\mathrm{pneumatic}}(x,t),
\qquad
c_0 = \sqrt{g h_0},\quad
\alpha_{\mathrm{pool}} = \frac{3c_0}{2h_0},\quad
\beta_{\mathrm{pool}} = \frac{c_0 h_0^2}{6}\left(1 - 3\,\mathrm{Bo}^{-1}\right),
$$

where $\mathrm{Bo} = \rho g h_0^2 / \sigma$ is the Bond number accounting for capillary dispersion and $\nu_{\mathrm{eff}}$ is the calibrated viscous attenuation coefficient.

In **Plasma Wave** mode, normalized ion density perturbation $n_1/n_0 \simeq \phi = e\Phi/(k_B T_e)$ evolves according to the Washimi-Taniuti ion-acoustic KdV-Burgers equation:

$$
\phi_t + c_s\phi_x + \alpha_{\mathrm{plasma}}\phi\phi_x + \beta_{\mathrm{plasma}}\phi_{xxx}
= \nu_{\mathrm{plasma}}\phi_{xx} - \gamma_{\mathrm{Landau}}\phi + S_{\mathrm{grid}}(x,t),
$$

with ion sound speed $c_s = \sqrt{(Z k_B T_e + 3 k_B T_i)/m_i}$, Debye length $\lambda_{De} = \sqrt{\varepsilon_0 k_B T_e / (n_0 e^2)}$, magnetized dispersion scale $\ell_d = \sqrt{\lambda_{De}^2 + \rho_s^2\sin^2\theta_B}$, $\alpha_{\mathrm{plasma}} = c_s$, and $\beta_{\mathrm{plasma}} = \frac{1}{2}c_s \ell_d^2$.

### 2. Bidirectional Boussinesq Soliton Mode (`boussinesq`)

Because standard KdV evolves waves in a single directional frame, launching waves simultaneously from **left, right, or both ends** of the wave pool or plasma chamber uses a regularized bidirectional Boussinesq system for $(u(x,t), v(x,t))$:

$$
\partial_t u + \partial_x v + \partial_x\left(\frac{\alpha}{c_0} u v\right) = \nu_{\mathrm{eff}}\partial_{xx}u + S_u(x,t),
\qquad
\left(1 - \frac{3\beta}{c_0}\partial_{xx}\right)\partial_t v + c_0^2\partial_x u + \frac{\alpha c_0}{2}\partial_x(u^2) = \nu_{\mathrm{eff}}\partial_{xx}v + S_v(x,t).
$$

This system supports left-traveling ($v \simeq +c_0 u$), right-traveling ($v \simeq -c_0 u$), and counter-propagating soliton launches, reflective or sponge-damped boundaries, and nonlinear head-on and overtaking collisions.

### 3. Coupled Vector Soliton Mode (`vector-coupled`)

Evolves a genuine two-component vector field $\mathbf U = (u_1, u_2)$ representing either two coupled orthogonal/internal wave modes or coupled Manakov / Langmuir-ion-acoustic polarization components:

$$
\partial_t u_1 + (c_0 + \Delta c)\partial_x u_1 + \alpha(u_1 + \sigma_{12} u_2)\partial_x u_1 + \beta\partial_{xxx}u_1 = \nu_{\mathrm{eff}}\partial_{xx}u_1,
$$

$$
\partial_t u_2 + (c_0 - \Delta c)\partial_x u_2 + \alpha(u_2 + \sigma_{12} u_1)\partial_x u_2 + \beta\partial_{xxx}u_2 = \nu_{\mathrm{eff}}\partial_{xx}u_2.
$$

When $\sigma_{12} = 0$, the two components decouple into independent scalar solitons. For $\sigma_{12} \neq 0$, cross-nonlinear coupling produces vector shadow components, polarization rotation, and inelastic/phase-shifted collisions.

### 4. Extended Quadratic-Cubic Gardner / mKdV (`gardner-mkdv`) and Sine-Gordon (`sine-gordon`)

- **Gardner / mKdV:** $\partial_t u + c_0\partial_x u + (\alpha u + \alpha_2 u^2)\partial_x u + \beta\partial_{xxx}u = \nu_{\mathrm{eff}}\partial_{xx}u$, supporting both compressive ($u > 0$) and rarefactive ($u < 0$) solitons and flat-top solitons in stratified fluids and multi-species/negative-ion plasmas.
- **Sine-Gordon:** $\partial_{tt}u - c_0^2\partial_{xx}u + \omega_0^2\sin(u) = -\gamma\partial_t u + \nu_{\mathrm{eff}}\partial_{xx}(\partial_t u)$, supporting topological kinks, antikinks, and kink-antikink breathers.

### 5. Optional Real-Time 2D Cross-Section CFD (`cfd-2d`)

Provides an interactive 2D longitudinal-vertical $(x,z)$ staggered-grid solver over the pool depth or plasma slab:

$$
\partial_t \mathbf u + (\mathbf u\cdot\nabla)\mathbf u = -\frac{1}{\rho}\nabla p + \nu_{\mathrm{CFD}}\nabla^2\mathbf u + \mathbf f_{\mathrm{body}} + \mathbf f_{\mathrm{actuator}},
\qquad
\nabla\cdot\mathbf u = \mathcal D_{\mathrm{comp}},
$$

coupled to free-surface height / plasma density evolution $\partial_t \eta + \partial_x(\int u\,dz) = S(x,t)$, a Jacobi/SOR pressure-Poisson projection step that enforces low velocity divergence, and explicit viscous momentum diffusion. The 3D scene renders both the top wave surface and the vertical $(x,z)$ CFD velocity/vorticity/pressure curtain.

## Fluid and Plasma Media Catalog

All seven required media are supported with explicit state metadata, temperature/pressure context, and dual wave-pool / plasma-wave applicability:

| Medium ID | Label | Wave Pool (Hydrodynamic) Regime | Plasma Wave (Ion-Acoustic / MHD) Regime | Key Physical Characteristics & Guardrails |
| --- | --- | --- | --- | --- |
| `water` | Water | Standard ambient liquid ($20\,^\circ\mathrm{C}$, $1\,\mathrm{atm}$, $\rho = 998.2\,\mathrm{kg/m^3}$, $\nu = 1.004\times 10^{-6}\,\mathrm{m^2/s}$) | Water-vapor / $\mathrm{H_2O^+}$ effective ion plasma proxy ($m_i = 18\,\mathrm{u}$) | Reference wave-pool medium; low viscous damping over pool scale. |
| `glycerin` | Glycerin | High-viscosity Newtonian liquid ($20\,^\circ\mathrm{C}$, $\rho = 1261\,\mathrm{kg/m^3}$, $\nu = 1.12\times 10^{-3}\,\mathrm{m^2/s}$) | High-collisionality dusty/complex organic ion proxy | Over $1000\times$ kinematic viscosity of water; strongly damps soliton amplitude and disperses steepness. |
| `hydrogen` | Hydrogen | Cryogenic liquid $\mathrm{LH_2}$ ($20.3\,\mathrm{K}$, $1\,\mathrm{atm}$, $\rho = 70.85\,\mathrm{kg/m^3}$, $\nu = 1.9\times 10^{-7}\,\mathrm{m^2/s}$) | Proton-electron plasma ($\mathrm{H^+-e^-}$, $m_i = 1.008\,\mathrm{u}$) | Fastest ion-acoustic sound speed $c_s \propto m_i^{-1/2}$; lowest liquid density in cryogenic pool mode. |
| `helium-3` | Helium 3 | Cryogenic liquid $\mathrm{^3He}$ ($1.5\,\mathrm{K}$, $\rho = 59.0\,\mathrm{kg/m^3}$, $\nu = 3.4\times 10^{-7}\,\mathrm{m^2/s}$) | $\mathrm{^3He^+-e^-}$ fusion/space plasma ($m_i = 3.016\,\mathrm{u}$) | Lighter helium isotope; higher $c_s$ than $\mathrm{^4He}$. Superfluid pairing occurs only below $2.5\,\mathrm{mK}$ (flagged in UI). |
| `helium-4` | Helium 4 | Cryogenic liquid $\mathrm{^4He}$ ($4.2\,\mathrm{K}$ He-I / $<2.17\,\mathrm{K}$ He-II proxy, $\rho = 125\,\mathrm{kg/m^3}$) | $\mathrm{^4He^+-e^-}$ helium plasma ($m_i = 4.003\,\mathrm{u}$) | Ultra-low viscosity; below the $\lambda$-point ($2.17\,\mathrm{K}$) requires a two-fluid interpretation. |
| `argon` | Argon | Cryogenic liquid $\mathrm{LAr}$ ($87.3\,\mathrm{K}$, $\rho = 1395\,\mathrm{kg/m^3}$, $\nu = 1.94\times 10^{-7}\,\mathrm{m^2/s}$) | $\mathrm{Ar^+-e^-}$ laboratory discharge plasma ($m_i = 39.948\,\mathrm{u}$) | Canonical laboratory plasma for electrostatic ion-acoustic soliton experiments (Washimi-Taniuti / Ikezi benchmarks). |
| `water-hdl-ldl` | Water (HDL+LDL) | Two-state structural water model with dynamically coupled $x_{\mathrm{LDL}}(x,t)$ and $x_{\mathrm{HDL}}(x,t)$ | Two-population bi-Maxwellian / dual-structure effective medium | Explicitly labeled structural-order hypothesis based on Li et al. (2026) and Krieger (2004). |

## Water (HDL+LDL) Evidence and Mathematical Formulation

### Literature Review

1. **Li, Zhong, Zhang, Wang, and Zeng, *Nature Physics* 22, 1144–1151 (2026), [doi:10.1038/s41567-026-03301-8](https://doi.org/10.1038/s41567-026-03301-8):**
   - Uses unsupervised deep learning (autoencoders) on large-scale molecular dynamics trajectories of water to identify multidimensional reaction coordinates between high-density liquid (HDL) and low-density liquid (LDL) local structures.
   - Finds that **near the HDL/LDL phase boundary** (deeply supercooled/pressurized regime, e.g., $1800\,\mathrm{bar}, 188\,\mathrm{K}$ in the accompanying Zenodo dataset), interconversion between HDL and LDL proceeds along a **full-loop reaction pathway with three saddle points**.
   - **Away from the phase boundary** (e.g., $1\,\mathrm{bar}, 260\,\mathrm{K}$), interconversion proceeds via a **semi-loop pathway with a single saddle point**.
   - This provides molecular-level computational evidence for the generic existence of two interconvertible *local* hydrogen-bond structures in liquid water.
2. **Krieger, “A Tale of Two Waters,” *Science* (28 May 2004), [https://www.science.org/content/article/tale-two-waters](https://www.science.org/content/article/tale-two-waters):**
   - Reports Harald Reichert et al.’s X-ray reflectivity study of an ultrathin (~5 molecules thick) liquid water layer confined between ice and silica at $-17\,^\circ\mathrm{C}$, exhibiting a density ~17% higher than ambient bulk water and interpreted as confined HDL-like water near an effective $-45\,^\circ\mathrm{C}$ regime.

### Simulator Implementation for `Water (HDL+LDL)`

Rather than claiming bulk phase separation in an ambient surfing pool, `Water (HDL+LDL)` evolves an auxiliary coarse-grained structural fraction field $x_{\mathrm{LDL}}(x,t) \in [0,1]$ (with $x_{\mathrm{HDL}}(x,t) = 1 - x_{\mathrm{LDL}}(x,t)$):

$$
\partial_t x_{\mathrm{LDL}} + u\,\partial_x x_{\mathrm{LDL}}
= -\frac{x_{\mathrm{LDL}} - x_{\mathrm{LDL}}^{\mathrm{eq}}(\eta, \partial_x\eta, T, P)}{\tau_{\mathrm{struct}}(\text{pathway})}
+ D_{\mathrm{struct}}\partial_{xx}x_{\mathrm{LDL}},
$$

where:
- **Pathway topology selector** switches between:
  - `near-boundary-3-saddle`: Li et al. (2026) full-loop pathway near the HDL/LDL coexistence line (3 saddle points, bistable double-well sensitivity, slower barrier-crossing relaxation $\tau_{\mathrm{struct}}$, enhanced isothermal compressibility anomaly).
  - `ambient-1-saddle`: Li et al. (2026) semi-loop pathway away from the boundary (1 saddle point, fast single-barrier relaxation, mild local structural fluctuations).
  - `confined-hdl-2004`: Reichert/Krieger (2004) confined interfacial HDL-dominant reference ($x_{\mathrm{HDL}} \approx 0.85$, $\rho_{\mathrm{eff}} \approx 1.17\rho_0$).
- Wave compression ($\eta > 0$) locally favors the denser, more disordered HDL coordination ($x_{\mathrm{HDL}} \uparrow$), whereas rarefaction/troughs or tetrahedral relaxation favor LDL ($x_{\mathrm{LDL}} \uparrow$).
- Local effective density $\rho_{\mathrm{eff}}(x) = \rho_{\mathrm{HDL}}(1 - x_{\mathrm{LDL}}) + \rho_{\mathrm{LDL}} x_{\mathrm{LDL}}$, effective viscosity $\nu_{\mathrm{eff}}(x)$, and dispersion coefficient $\beta_{\mathrm{eff}}(x)$ are modulated by a bounded, user-inspectable structural coupling parameter $\kappa_{\mathrm{HDL/LDL}}$, with real-time readout of mean $\langle x_{\mathrm{HDL}}\rangle$, $\langle x_{\mathrm{LDL}}\rangle$, active saddle-point count, and delta against pure IAPWS Water.

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
