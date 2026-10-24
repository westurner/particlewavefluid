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

1. **Pure physics & numerical solver module (`src/solitonWaveModel.js`):**
   - Owns the fluid and plasma media catalog (`SOLITON_FLUIDS`), HDL/LDL reaction-pathway definitions (`WATER_HDL_LDL_PATHWAY_OPTIONS`), parameter normalization (`normalizeSolitonConfig`, `normalizeSolitonPulse`), dispersion/scaling derivation (`deriveSolitonPhysicsParameters`), analytic solitary-wave initialization (`evaluateAnalyticSolitonProfile`), PDE & 2D CFD time stepping (`stepSolitonSolver`), bilateral pneumatic/grid impulse injection (`triggerSolitonLauncherImpulse`), 3D field sampling (`sampleSolitonFieldAt`), and telemetry reduction (`computeSolitonTelemetry`).
2. **Scene & UI integration (`src/WaveInterferenceSim.jsx`):**
   - Preserves the existing linear/interference wave field, aperture diffraction screens, Wigner/pilot-wave detectors, and snapshot/journal format.
   - Adds `SolitonChamberRig` to render the left and right pneumatic caissons / plasma grids, the 3D free-surface / potential soliton ribbon, and the 2D longitudinal-vertical $(x,z)$ CFD velocity/vorticity curtain.
   - Adds `SolitonWaveControlsSection` and `Experiment mode` entries (`Pneumatic wave pool solitons` and `Plasma wave solitons`) with one-click scenario presets, domain/equation/fluid/side/boundary selectors, per-soliton pulse editors, and live domain-specific telemetry.
3. **Bounded real-time stepping:**
   - Advances the 1D PDE grid (`160` nodes with `6` substeps per frame and hyper-viscous de-aliasing filter) and the optional 2D cross-section CFD grid (`64 x 16` staggered grid with Jacobi pressure-Poisson projection) in `useFrame` with clamped frame delta and throttled React telemetry updates.

## User Experience

- **Experiment modes & scenario presets:** Users can switch directly to **Pneumatic wave pool solitons** or **Plasma wave solitons** from `Experiment mode`, or click scenario presets (**Wave Pool KdV**, **Bilateral Pool Collision**, **Vector Soliton Pair**, **Water (HDL+LDL) 3-Saddle**, **Argon Ion-Acoustic Plasma**, **Hydrogen Magnetized Plasma**, **2D Free-Surface CFD**).
- **Bilateral and two-soliton controls:** Users can emit 1 or 2 solitons from the **left**, **right**, or **both** sides of the fluid/plasma chamber, trigger live pneumatic/grid impulses on either side, and configure each soliton's amplitude, width, initial position offset, vector polarization angle, and compressive/rarefactive polarity.
- **Transparent physical guardrails:** When standard unidirectional `KdV` is paired with `Both sides`, an inline note explains that KdV evolves in a single directional frame and recommends `Bidirectional Boussinesq` or `2D CFD` for head-on collisions. Cryogenic (`Hydrogen`, `Helium 3`, `Helium 4`, `Argon`) and `Water (HDL+LDL)` presets display explicit state and literature caveats.

## Implementation Phases And Gates

### Phase 1: Pure Soliton, Plasma, HDL+LDL, and 2D CFD Model (`src/solitonWaveModel.js`)

- Implement the 7-medium catalog (`water`, `glycerin`, `hydrogen`, `helium-3`, `helium-4`, `argon`, `water-hdl-ldl`) with both hydrodynamic wave-pool and ionized plasma-wave physical parameters.
- Implement `kdv`, `boussinesq`, `vector-coupled`, `gardner-mkdv`, `sine-gordon`, and `cfd-2d` solvers plus `Water (HDL+LDL)` reaction-coordinate relaxation (`near-boundary-3-saddle`, `ambient-1-saddle`, `confined-hdl-2004`).
- Gate: unit tests in `src/solitonWaveModel.test.js` verify catalog completeness, KdV rightward propagation, Glycerin vs. Water viscous attenuation, Boussinesq bilateral head-on collisions, coupled vector soliton evolution and decoupling at $\sigma_{12}=0$, ion-acoustic speed ordering across $\mathrm{H^+}, \mathrm{^3He^+}, \mathrm{^4He^+}, \mathrm{Ar^+}$, HDL/LDL saddle-point pathway behavior, and bounded 2D CFD divergence.

### Phase 2: Scene Rendering, Controls, and Snapshot Integration (`src/WaveInterferenceSim.jsx`)

- Render the soliton surface ribbon, pneumatic/grid end launchers, and 2D CFD vertical cross-section curtain in `WaveScene`, and drive the 3D particle field from `sampleSolitonFieldAt` when soliton mode is active.
- Wire `solitonConfig` into `normalizeWaveSnapshot`, `useSimulationEditor`, undo/redo history, JSON import/export, and parameter edit logs.
- Gate: existing wave-interference unit and E2E tests pass without regression, and Vite production build succeeds cleanly.

### Phase 3: End-to-End Browser Verification (`e2e/wave-visibility.test.js`)

- Exercise soliton scenario presets, bilateral emission, `Water (HDL+LDL)` pathway switching (`3 saddle points` vs. `1 saddle point`), coupled vector solitons, `Argon` plasma wave telemetry, and `2D CFD` mode in headless Chromium.
- Gate: Playwright E2E test suite passes with zero page or console errors.

## Verification And Acceptance Criteria

- **KdV & Dissipation:** Analytic $\mathrm{sech}^2$ pulse propagation; monotonic viscous energy loss with higher attenuation in Glycerin than Water.
- **Bilateral & Two-Soliton Interactions:** Left, right, and both-side emission; overtaking two-soliton interactions in KdV and head-on counter-propagating collisions in Boussinesq and 2D CFD.
- **Vector & Extended Solitons:** Coupled 2-component $(u_1, u_2)$ evolution that decouples when `vectorCoupling = 0`; compressive and rarefactive pulses in Gardner/mKdV and topological kinks in Sine-Gordon.
- **Plasma Waves:** Derived ion sound speed $c_s$, Debye length $\lambda_{De}$, ion plasma frequency $f_{pi}$, and Alfvén speed $v_A$ across Hydrogen, Helium 3, Helium 4, and Argon.
- **Water (HDL+LDL):** Dynamic $x_{\mathrm{HDL}} / x_{\mathrm{LDL}}$ fraction tracking and saddle-point readout grounded in Li et al. (*Nature Physics*, 2026) and Krieger (*Science*, 2004).
- **2D CFD:** Bounded divergence $|\nabla\cdot\mathbf u|$ on the $64 \times 16$ cross-section grid with live velocity/vorticity curtain visualization.

### Researched Validation Check Figures (`SOLITON_VALIDATION_CHECK_FIGURES`)

| Check Figure ID | Physical Law / Equation | Benchmark Input | Reference Value | Tolerance | Primary Citation |
| --- | --- | --- | --- | --- | --- |
| `russell-kdv-celerity` | $c_{\mathrm{KdV}} = \sqrt{g h_0}(1 + \eta_0 / 2h_0)$ | $h_0 = 1.80\,\mathrm{m}$, $\eta_0 = 0.54\,\mathrm{m}$ ($\varepsilon = 0.30$) | $4.8316\,\mathrm{m/s}$ ($\mathrm{Fr} = 1.150$) | $\pm 0.01\,\mathrm{m/s}$ | Russell (1844); Korteweg & de Vries (1895) |
| `kdv-width-amplitude-invariant` | $\mathrm{FWHM}/L = 2\,\mathrm{arccosh}(\sqrt{2})$, $(L/h_0)^2(\eta_0/h_0) = 4/3$ | $\eta(x) = \eta_0\,\mathrm{sech}^2(x/L)$, $L = 1.50\,\mathrm{u}$ | $1.7627$ | $\pm 0.005$ | Korteweg & de Vries (1895); Whitham (1974) |
| `su-mirie-head-on-collision` | $\varepsilon_{\max}/(\varepsilon_L + \varepsilon_R) = 1 + \frac{\varepsilon_L\varepsilon_R}{2(\varepsilon_L+\varepsilon_R)}$ | Counter-propagating Boussinesq pulses $\varepsilon_L = \varepsilon_R = 0.50$ | $1.1250$ | $\pm 0.12$ | Byatt-Smith (1971); Su & Mirie (1980) |
| `keulegan-kdv-burgers-viscosity` | $\nu_{\mathrm{Glycerin}} / \nu_{\mathrm{Water}}$, $dE/dt = -2\nu_{\mathrm{eff}}\int (\partial_x u)^2\,dx$ | $293\,\mathrm{K}$, $1\,\mathrm{atm}$ Glycerin vs. IAPWS Water | $1115.54\times$ | $\pm 0.5$ | Keulegan (1948); Ott & Sudan (1970); IAPWS (2015) |
| `washimi-taniuti-ikezi-plasma` | $c_s = \sqrt{(Z k_B T_e + 3 k_B T_i)/m_i}$, $\lambda_{De} = \sqrt{\varepsilon_0 k_B T_e / n_0 e^2}$ | $\mathrm{Ar^+}$ ($39.948\,\mathrm{u}$), $T_e = 2.5\,\mathrm{eV}$, $T_i = 0.15\,\mathrm{eV}$, $n_0 = 4\times 10^{16}\,\mathrm{m^{-3}}$ | $2663.6\,\mathrm{m/s}$ ($\lambda_{De} = 58.78\,\mu\mathrm{m}$) | $\pm 1.0\,\mathrm{m/s}$ | Washimi & Taniuti (1966); Ikezi et al. (1970) |
| `greens-law-mccowan-iribarren-surf` | $\eta/\eta_0 = (h_0/h)^{1/4}$, $\gamma_b \approx 0.78$, $0.5 \le \xi_0 \le 3.3$ | `surf-reef` with $h_{\min}/h_0 = 0.38$, tubular breaker active | $1.2736$ | $\pm 0.01$ | Green (1838); McCowan (1894); Battjes (1974) |
| `water-hdl-ldl-two-state-pathway` | $x_{\mathrm{HDL}} + x_{\mathrm{LDL}} = 1$, $\Delta x_{\mathrm{LDL}} = x_{\mathrm{LDL,3\text{-}saddle}} - x_{\mathrm{LDL,1\text{-}saddle}}$ | $1800\,\mathrm{bar}, 188\,\mathrm{K}$ (3 saddles) vs. $1\,\mathrm{bar}, 260\,\mathrm{K}$ (1 saddle) | $0.3435$ | $\pm 0.01$ | Li et al., *Nature Physics* (2026); Reichert (2004) |
| `chorin-cfd-projection-manakov-vector` | $\|u_1(\sigma_{12}=0, u_2\neq 0) - u_1(\sigma_{12}=0, u_2=0)\|_\infty = 0$ | $64\times 16$ Jacobi projection & $\sigma_{12} = 0$ decoupling test | $0.0000$ | $10^{-12}$ | Chorin (1968); Manakov (1974) |

## Key Risks And Decisions

- **Model ambiguity:** Each soliton family (`kdv`, `boussinesq`, `vector-coupled`, `gardner-mkdv`, `sine-gordon`, `cfd-2d`) has an explicit state contract and governing equation rather than overloaded sliders.
- **One-way vs. two-way travel:** Standard KdV is kept honest as a single-frame equation while `boussinesq` and `cfd-2d` handle true opposite-end counter-propagation.
- **Real-time browser budget:** Fixed substepping and compact 1D (`160`) + 2D (`64 x 16`) grids keep frame times interactive in standard WebGL without requiring external native dependencies.
- **Water structure interpretation:** `Water (HDL+LDL)` is explicitly presented as a coarse-grained local-structure hypothesis rather than bulk phase separation at ambient pool conditions.

## References

- Li, L. et al. “Evidence for the generic existence of two local structures in liquid water.” *Nature Physics* 22, 1144–1151 (2026). [https://doi.org/10.1038/s41567-026-03301-8](https://doi.org/10.1038/s41567-026-03301-8)
- Krieger, K. “A Tale of Two Waters.” *Science* (28 May 2004). [https://www.science.org/content/article/tale-two-waters](https://www.science.org/content/article/tale-two-waters)
- Washimi, H. & Taniuti, T. “Propagation of Ion-Acoustic Solitary Waves of Small Amplitude.” *Physical Review Letters* 17, 996–998 (1966).
- Li et al. paper-associated Zenodo records: [record 19326505](https://zenodo.org/records/19326505) and [record 19327735](https://zenodo.org/records/19327735).
