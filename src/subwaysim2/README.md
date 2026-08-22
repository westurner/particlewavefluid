# Subway Thermodynamics

A React, Three.js, React Three Fiber, and Drei simulation of subway airflow and thermal dispersion. The particle solver runs on the GPU in the browser.

## Simulation Architecture And Methods

### System architecture

The application is organized into four cooperating layers:

- **React and R3F application layer:** `App.jsx` owns the control state, telemetry, scene composition, animated train, infrastructure meshes, and the control/report panels. React state changes are translated into shader uniform values during the render loop.
- **GPU simulation layer:** `GPUComputationRenderer` maintains two 64 × 64 floating-point textures, representing 4,096 particles. One texture stores position and the other stores velocity plus a thermal intensity value in its alpha channel. The textures are ping-ponged by the computation renderer.
- **Shared route model:** `routeModel.js` defines the fluid bounds, stair route, shafts, street volume, flood gallery, airflow capture zones, and resilience-score calculation. Keeping these definitions outside the shaders gives the tests and the UI a common geometric vocabulary.
- **Three.js presentation layer:** an instanced mesh reads each particle's simulation UV and samples the current position and velocity textures in custom vertex and fragment shaders. Scene infrastructure is rendered with ordinary Three.js meshes and materials, while OrbitControls and contact shadows provide navigation and grounding.

### Time integration and particle state

Each animation frame is capped at a maximum timestep of 33 milliseconds. The velocity shader computes an acceleration, advances velocity with an explicit Euler step, applies drag, and writes the result back to the velocity texture. The position shader then advances position from the updated velocity.

The velocity calculation is a deliberately compact, GPU-friendly fluid approximation. For each particle it samples a reduced neighborhood from the position and velocity textures, evaluates a cubic spline kernel, and accumulates density, pressure, and viscosity terms. A constant longitudinal drift keeps the field moving through the station. This is not a high-fidelity CFD solver: it is an interactive visualization model designed to expose directional relationships between geometry, heat, and airflow at browser frame rates.

Position constraints keep the field inside the expanded fluid bounds. The horizontal axis wraps, while vertical and depth coordinates are clamped. Additional collision and passage rules keep thermally active particles above the rising stair surface and below the roof except where a stair exit, shaft, or clerestory opening provides a route through the boundary.

### Thermal and airflow methods

Thermal intensity is a normalized value in the range $[0, 1]$ and is transported with the velocity state. It is increased by active heat sources and reduced by passive or powered exchange terms:

- Surface temperature applies a localized buoyancy and thermal response near the platform floor.
- The train's air-conditioning and braking zones add heat in different spatial bands.
- Train motion contributes longitudinal acceleration and a small thermal decay during each interval-controlled pass. Stop frequency selects how many passes dwell at the platform, and stop duration controls that dwell.
- The enclosed rising stair applies directional lift, with stronger transport for hotter particles, then opens into the street volume.
- Shafts combine horizontal capture with vertical lift beginning at their intake. Their roof openings match the capture columns, while stack effect and optional powered fans add adjustable upward velocity.
- Roof grooves guide ceiling flow toward the ridge. Independent horizontal and vertical roof gaps define the clerestory aperture, and the window rows span its full height.
- Downward fans and floor air movers are localized powered forces, so their sliders affect only their intended capture bands.
- The flood-control waterfall captures lower warm air, draws it visibly downward into the gallery, and removes thermal intensity. The gallery then pumps the cooled air laterally; disabling the tunnels restores a solid ground boundary at the gallery ceiling.

Spatial transitions use clamped linear interpolation and smoothstep bands rather than hard on/off boundaries. This keeps force fields visually continuous and avoids abrupt changes as particles cross a control zone. The same response logic is represented in `routeModel.js` for deterministic unit tests; the GLSL shaders contain the frame-by-frame GPU implementation.

### Rendering and interaction

Particle geometry is instanced once and carries a simulation UV per instance. The vertex shader samples the position texture and scales each particle from the adjustable diameter, with a small additional thermal-intensity increase. The fragment shader maps cool, warm, and hot colors across that intensity and uses additive blending to make overlapping flow visible.

The UI updates uniforms without rebuilding the simulation. Geometry controls change the roof pitch, ridge offset, horizontal gap, vertical gap, and clerestory opening; infrastructure controls change force strengths and source toggles; fluid controls adjust density, stiffness, viscosity, and surface temperature. The scene therefore remains a live experiment: users can alter a parameter and observe both the field and the infrastructure that explains it.

### Resilience index

The Thermal resilience report is an explanatory index, not a calibrated engineering metric. It starts from a fixed baseline, adds passive credits for shaft exchange, roof grooves, and flood-gallery flow, then subtracts powered airflow load from downward fans, floor air movers, and ceiling flow. The result is rounded and clamped to 0–100 for display.

Surface temperature affects buoyancy, particle heat, and the live temperature readout, but it is intentionally excluded from the resilience score. This separates the physical scenario input from the design-choice comparison presented by the report.

### Verification approach

The Node test suite checks the CPU-side model without requiring a browser or WebGL context. It verifies that route geometry fits inside the simulation bounds, shaft lift starts at its intake and rises toward the street, the flood waterfall flows downward and cools, powered shaft velocity is gated and adjustable, train frequency produces a mix of stopping and through passes with the configured dwell, independent roof gaps change exchange, and the resilience report balances its contributions. GLSL constants are formatted as explicit floating-point literals to keep shader compilation portable across WebGL implementations.

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
