# SQGSIM

A React, Three.js, React Three Fiber, and Drei particle-simulation loader. The GPU particle runtime was extracted from the subway airflow experiment so multiple simulations can share the same resource lifecycle and instanced-field boundary.

## Simulation menu

The first screen loads one of four fields:

- **subwaysim2:** the subway airflow and thermal-dispersion experiment with GPU SPH-style transport, train heat, ventilation, stair, street, and flood-gallery controls.
- **simpleattractorsim:** a React/R3F reimplementation of `three.js/examples/webgpu_tsl_compute_attractors_particles.html`. It keeps the source example's inverse-square attraction, spinning force, bounded particle loop, 20-attractor limit, transform helpers, presets, JSON IO, local snapshots, camera controls, and change playback.
- **sqgblackholesim:** a separate black-hole sandbox entry point that currently starts from the simple attractor rig and its complete control surface.
- **frcfusionsim:** a physical FRC device and GPU plasma transport field with transparent vessel and confinement coils, selectable elongated, compact, double-lobed, and oblate shapes, and theta-pinch, rotating-field, translated-toroid, and steady-state configurations. Phase 02 exposes device geometry, derived field quantities, and a bounded 4,096-particle transport field; a kinetic plasma solver is reserved for phase 03.

The subway mode remains the detailed fluid framework. `src/simulations/gpuParticleRuntime.js` owns the reusable GPU computation setup and simulation UV allocation used by both the subway and attractor fields.

The FRC device model is CPU-side while plasma transport runs on the GPU. `src/frcModel.js` derives plasma dimensions, volume, pressure, beta, reversed axial field, current, confinement, and stability from the selected physical configuration. The Plasma input dropdown supports `DHe_3`, `DT`, and `Argon`: `DHe_3` uses an aneutronic primary branch with a small side-neutron allowance, `DT` produces the high-neutron baseline, and `Argon` is a non-fusing working gas with zero fusion products. The model also estimates blanket energy capture, nitrogen purge/blanket flow, helium alpha-product output, neutron production rate and flux, electricity conversion, and the electron plasma frequency. The output telemetry uses a 60 Hz conversion-stage grid interface. Electrical conversion efficiency is dynamic: it combines each input's modeled charged-energy fraction with the current confinement, beta, and rotation state; `electricPowerMW` is the captured power after that calculated efficiency. The plasma frequency treats the configured density as electron density and uses the cold-plasma relation $f_{pe}=(2\pi)^{-1}\sqrt{n_e e^2/(m_e\epsilon_0)}$, with `plasmaPeriodSeconds` equal to its reciprocal. This is a natural microscopic oscillation scale, not an AC frequency emitted by the reactor. `FrcFusionSim.jsx` presents those values alongside the transparent Three.js device, an outer energy-collector cable harness, color-coded nitrogen/helium/neutron output conduits, and a `GPUComputationRenderer` field. Nitrogen is a plant-side stream rather than a fusion product, and the neutron value represents radiation production rather than a material cable output. These figures are engineering estimates for the visualization, not a validated power-plant design. The transport is a bounded visualization model with axial wrapping, azimuthal flow, radial magnetic confinement, temperature-dependent damping, and field-reversal direction; it is not yet a kinetic or MHD solver.

## Simulation Architecture And Methods

### System architecture

The application is organized into four cooperating layers:

- **React and R3F application layer:** `App.jsx` owns the control state, telemetry, scene composition, animated train, infrastructure meshes, and the control/report panels. React state changes are translated into shader uniform values during the render loop.
- **GPU simulation layer:** `GPUComputationRenderer` maintains two 64 × 64 floating-point textures, representing 4,096 particles. One texture stores position and the other stores velocity plus a thermal intensity value in its alpha channel. The textures are ping-ponged by the computation renderer.
- **Shared route model:** `routeModel.js` defines the fluid bounds, stair route, shafts, street volume, flood gallery, passenger locations, airflow capture zones, and resilience-score calculation. Keeping these definitions outside the shaders gives the tests and the UI a common geometric vocabulary.
- **Three.js presentation layer:** an instanced mesh reads each particle's simulation UV and samples the current position and velocity textures in custom vertex and fragment shaders. Scene infrastructure is rendered with ordinary Three.js meshes and materials, while OrbitControls and contact shadows provide navigation and grounding.

### Time integration and particle state

Each animation frame is capped at a maximum timestep of 33 milliseconds. The velocity shader computes an acceleration, advances velocity with an explicit Euler step, applies drag, and writes the result back to the velocity texture. The position shader then advances position from the updated velocity.

The velocity calculation is a deliberately compact, GPU-friendly fluid approximation. For each particle it samples a reduced neighborhood from the position and velocity textures, evaluates a cubic spline kernel, and accumulates density, pressure, and viscosity terms. A constant longitudinal drift keeps the field moving through the station. This is not a high-fidelity CFD solver: it is an interactive visualization model designed to expose directional relationships between geometry, heat, and airflow at browser frame rates.

Position constraints keep the field inside the expanded fluid bounds. The horizontal axis wraps, while vertical and depth coordinates are clamped. Additional collision and passage rules keep thermally active particles above the rising stair surface and below the roof except where a stair exit, shaft, or clerestory opening provides a route through the boundary.

### Thermal and airflow methods

Thermal intensity is a normalized value in the range $[0, 1]$ and is transported with the velocity state. It is increased by active heat sources and reduced by passive or powered exchange terms:

- Surface temperature applies a localized buoyancy and thermal response near the platform floor.
- The 18 visible passengers are also thermal sources. Their shared route-model positions drive localized upward acceleration and thermal intensity, so the `Passenger heat` control affects the same bodies that are rendered.
- Road convection is driven by the signed difference between `Road surface temperature` and `Ambient air above road`. Above the road footprint, the response is upward for a hot road and downward for a cool road; sidewalks do not receive this source. Ambient air then relaxes the upper outdoor particles toward its configured thermal level instead of pulling the whole outdoor field back to the road.
- The train's air-conditioning and braking zones add heat in different spatial bands.
- Train motion contributes longitudinal acceleration and a small thermal decay during each interval-controlled pass. Stop frequency selects how many passes dwell at the platform, and stop duration controls that dwell.
- The enclosed route has a lower flight, a level intermediate landing, and an upper flight. The underground-opening control changes only tunnel and doorway clear height; the lower stair and turnstiles remain fixed at platform elevation. Independent landing and surface-opening elevations reshape the flights, airflow boundary, and permanent transparent occluding underfill. Continuous profile meshes close the wall, ceiling, and underfill joins across both flights and the landing. The surface opening also raises or lowers the street and ventilation outlets. Four ticket-turnstile pedestals stand before the underground opening and always occlude particles while leaving three fare lanes open.
- Three shafts combine horizontal capture, strong centerline restoring force, and vertical lift beginning at their intake. Their roof openings match the capture columns, and ceiling-band crossflow is suppressed inside each shaft so particles remain in the enclosure while stack effect and optional powered fans lift them through the outlet. Slatted cap vents make each outlet visible.
- The current stack-effect control is a localized interactive approximation rather than a full pressure/density calculation. In the shaft column, passive lift contributes a term proportional to `3.4 * stackEffect`; powered lift contributes `shaftFanVelocity` only when the fan is enabled; crosswind adds a separate `0.3 * abs(surfaceCrosswind)` draw. Shaft exchange supplies horizontal capture, a centerline restoring force keeps the plume aligned, and thermal intensity increases the lift response. This separation makes the control readable while avoiding the claim that it predicts building pressure.
- A signed surface crosswind carries a dedicated outdoor particle layer across Z. Wind magnitude also creates extraction draw up all three ventilation shafts and the stair route, independent of wind direction.
- The outdoor layer is occluded by a solid street plane at the configured stair surface-opening elevation, preventing startup heat from falling through the ground. Only the three shaft apertures and stair exit connect it to the station. A concrete sidewalk, curb, asphalt roadway, dashed centerline, and white lane-edge markings make the surface boundary visible.
- Crosswind creates a localized pressure drop above each shaft, lifting station air through the grate before bending it into the surface flow. A return force below the top of the outdoor domain prevents those plumes from collecting against the simulation ceiling.
- Surface particles wrap periodically across the full road width with modulo arithmetic, preserving a distributed wind field even when one frame crosses multiple domain widths.
- Surface SPH pressure is computed in two passes: density first, then repulsive pressure and viscosity. Surface neighbors use minimum-image Z distances across the periodic road seam, preventing an artificial attraction or discontinuity from collecting wind at one edge.
- Underground shaft capture fades out between the street plane and `y = 10.6`; above that handoff, only the localized outlet pressure and surface crosswind control the plume. A near-floor return keeps outdoor particles above the paving while the ceiling return prevents top-boundary accumulation.
- Sidewalk slabs are segmented around the full vent apertures and stop where the rotated stair enclosure first intersects the paving. The curb and asphalt begin beyond the grate edges, so no street mesh covers a vent or stair opening.
- The outdoor simulation volume extends to `y = 24`, leaving a substantial upper-air band above the street. It is not rendered as a scene-wide transparent box, avoiding transparency-order tinting over the surface particles.
- Train AC exhaust, brake heat, and piston effects apply only to underground particles. A translucent overburden layer visualizes the insulated space between the roof and street. Surface wind can warm only after heated particles physically travel through a shaft or the stair exit, creating transport delay instead of immediate source coupling.
- The track bed and rails extend beyond both train-route endpoints by half a car length. A very translucent tunnel encloses that complete route so the train enters and exits through continuous infrastructure.
- Permanent ground fills the volume below the track slab and below the stair footprint. A third fitted soil volume follows the outer, negative-Z stair wall from platform-floor elevation to the dynamic tunnel roof. These solids always occlude particles; the outer soil starts above the flood gallery so the lower tunnel remains open.
- A near-roof spring keeps particles close to the sloped underside while a slope-aware tangential force carries them toward the ridge. Independent horizontal and vertical roof gaps define the clerestory aperture, with one continuous window pane per longitudinal bay bridging the two roof-section edges. The windows can be disabled independently.
- Downward fans and floor air movers are localized powered forces, so their sliders affect only their intended capture bands.
- The flood-control waterfall captures lower warm air, draws it visibly downward into the gallery, and removes thermal intensity. The gallery spans the complete track route and pumps cooled air laterally between the same endpoints; disabling the tunnels restores a solid ground boundary at the gallery ceiling.

Spatial transitions use clamped linear interpolation and smoothstep bands rather than hard on/off boundaries. This keeps force fields visually continuous and avoids abrupt changes as particles cross a control zone. The same response logic is represented in `routeModel.js` for deterministic unit tests; the GLSL shaders contain the frame-by-frame GPU implementation.

### Rendering and interaction

Particle geometry is instanced once and carries a simulation UV per instance. Changing particle count recreates the compute texture and instance set. The vertex shader samples position and velocity, scales each particle from the adjustable base diameter, and optionally adds diameter according to velocity magnitude. The fragment shader maps cool, warm, and hot colors across thermal intensity and uses additive blending to make overlapping flow visible.

The persistent view toolbar switches between Front, Back, Left, Right, two elevated orthogonal perspectives, and an automatically rotating Orbital tracking mode. Fixed views ease into position. Manual rotate, pan, or zoom cancels the active fixed or orbital mode and clears its selected button so the camera remains under direct user control. Hide params collapses the parameter panel without removing the toolbar, and Show params restores it.

The UI updates uniforms without rebuilding the simulation except when particle count changes. Geometry controls independently change the stair tunnel's underground clear height, intermediate landing elevation, and surface-opening elevation, along with the synchronized street and shaft layout, roof pitch, ridge offset, horizontal gap, vertical gap, and clerestory opening. Infrastructure controls change force strengths, source toggles, and approximate wind occlusion around major station solids; thermal controls adjust platform temperature, passenger heat, road temperature, and ambient air above the road. The scene therefore remains a live experiment: users can alter a parameter and observe both the field and the infrastructure that explains it.

### Resilience index

The Thermal resilience report is an explanatory index, not a calibrated engineering metric. It starts from a fixed baseline, adds passive credits for shaft exchange, roof grooves, and flood-gallery flow, then subtracts powered airflow load from downward fans, floor air movers, and ceiling flow. The result is rounded and clamped to 0–100 for display.

Surface temperature, passenger heat, road temperature, and ambient air temperature affect the physical field and live temperature readout, but they are intentionally excluded from the resilience score. This separates scenario inputs from the design-choice comparison presented by the report.

### Verification approach

The Node test suite checks the CPU-side model without requiring a browser or WebGL context. Multi-step damped trajectory tests verify that a particle stays near the roof underside while moving toward the ridge, and that a particle entering off-center rises through the shaft outlet while converging toward its centerline. Additional tests cover crosswind draw through shafts and stairs, the flood waterfall, powered shaft velocity, train stopping and dwell, independent roof gaps, and resilience scoring. GLSL constants are formatted as explicit floating-point literals to keep shader compilation portable across WebGL implementations.

## Requirements

- Node.js with npm
- A modern browser with WebGL support

## Install

From the simulation directory:

```bash
cd /var/home/wturner/-wrk/-ve311/particleswaves/src/src/src/subwaysim2
npm install
```

## Run The Tests

The test suite uses Node's built-in `node:test` runner and covers the shared route, airflow, and thermal resilience model:

```bash
npm test
```

To run the tests directly:

```bash
node --test src/*.test.js
```

## Start The Development Server

```bash
npm run dev
```

Open [http://localhost:5173/](http://localhost:5173/) in a browser. The development server listens on `0.0.0.0`, so it can also be reached from another device using the host machine's IP address.

## Build For Production

```bash
npm run build
```

The compiled application is written to `dist/`.

## Preview The Production Build

```bash
npm run preview
```

Then open [http://localhost:4173/](http://localhost:4173/) unless Vite reports a different port.

## Available Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server. |
| `npm test` | Run the Node test suite. |
| `npm run build` | Create a production build in `dist/`. |
| `npm run preview` | Serve the production build locally. |

## Running From The Parent Directory

If your terminal is already in `/var/home/wturner/-wrk/-ve311/particleswaves/src/src`, use npm's `--prefix` option:

```bash
npm --prefix /var/home/wturner/-wrk/-ve311/particleswaves/src/src/src/subwaysim2 install
npm --prefix /var/home/wturner/-wrk/-ve311/particleswaves/src/src/src/subwaysim2 test
npm --prefix /var/home/wturner/-wrk/-ve311/particleswaves/src/src/src/subwaysim2 run dev
```
