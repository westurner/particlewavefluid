# Subway Thermodynamics Simulation

## Scope

This directory contains the subway thermal-dispersion experiment. `index.html` is the Vite entry point for the React rewrite; the other standalone HTML files are retained as historical experiments and should not be used as shared imports.

## Stack and commands

- React with Vite
- React Three Fiber for the scene graph and render loop
- Drei for camera controls and scene helpers
- Three.js `GPUComputationRenderer` for the 64 x 64 particle state textures

Run the app from this directory:

```sh
npm install
npm run dev
npm run build
```

The development route is `/index.html` because the earlier HTML experiments are intentionally preserved beside the app.

## Architecture

- `src/App.jsx` owns user-facing state, the canvas, subway set, train rig, particles, and telemetry overlay.
- `src/styles.css` owns the responsive HUD and visual system. Keep the visualization full-bleed and keep controls in compact, readable panels.
- The particle simulation owns its GPU resources in a React effect and advances them from R3F's `useFrame`. Dispose compute textures, geometry, and materials when the component unmounts.
- Train position and velocity are the shared boundary between the animated train and the GPU uniforms. Keep those values in world coordinates and clamp frame delta to prevent unstable jumps after tab suspension.

## Simulation constraints

- Particle positions are stored in `uPositionTex`; velocity and thermal intensity share `uVelocityTex`.
- The fluid domain is `x = [-16, 16]`, `y = [-6.2, 14]`, and `z = [-5, 5]`. X wraps across the full route; the lower bound includes the flood gallery and the upper bound includes the stair exit, shaft outlets, and street volume.
- `surfaceTemperature` is the top-level floor-temperature input, ranging from `60` to `110` degrees Fahrenheit; it changes floor-level buoyancy, particle thermal intensity, and the telemetry baseline. `density`, `stiffness`, and `viscosity` are live uniforms inside the collapsed Fluid parameters group. Train piston force, AC exhaust, and brake friction are independent toggles.
- `shaftExchange` captures particles horizontally toward the nearest of three street shafts and vents them upward. Shaft lift begins in the intake band at `y = 0.4`; strong X/Z restoring forces keep particles near the shaft centerline, ceiling sweep is suppressed inside the column, and the position opening matches the capture region so particles are not roof-clamped before entering. `shaftFans` gates visible powered fan hardware, while `shaftFanVelocity` adds controllable upward shaft velocity. Each street cap has a visible slatted vent grille. `downFans` remains a separate station/ceiling force; `floorAirMovers` drives visible low fans across the platform floor toward the stair route; `ceilingFans` sweeps the ceiling band toward the egress; `grooves` adds low-energy passive flow; and `stackEffect` modulates thermal lift and heat removal through the shafts.
- Near the roof, a normal spring targets a particle offset of `0.25` below the envelope and a slope-aware tangential force moves particles toward the ridge. Keep the CPU `roofUnderside` response synchronized with this GLSL force; trajectory tests depend on both adhesion and ridgeward movement.
- `floodFlow` pulls warmer lower-station air through a visible cooling waterfall, down into the flood gallery, and laterally through the gallery; `floodPumpDirection` sets its X-axis air-pump direction from `-1` to `1`; and `floodTunnels` enables the gallery. When disabled, the position pass treats the gallery ceiling at `y = -3.8` as solid ground. When enabled with positive flow, falling droplets and cool tracers show the waterfall and pump direction. Particles are seeded into the gallery band at approximately `y = -5`, while the particle floor extends to `y = -6.2`.
- The stair run occupies the rendered X range `7` to `15.4` and is represented in the expanded simulation domain. The steps form its floor, with translucent side walls and a ceiling enclosing the route. Thermally active particles receive an uphill transport vector and can exit through a vertical stair tunnel into the street volume; this remains a directional heuristic, not a rigid-body stair solver.
- `train` is the user-facing "Allow trains to run" gate. While enabled, a train crosses from `x = 35` to `x = -35` once per `trainInterval`; `trainStopFrequency` deterministically selects a fraction from `0` to `1` of passes to stop at the platform, and `trainStopDuration` sets their dwell time. The train is hidden and exerts no piston, AC, or brake force between passes. `particleDiameter` scales the rendered particle geometry without changing the SPH neighbor radius.
- `routeModel.js` is the source of truth for fluid bounds, stair profile, shaft outlet height, and street-volume containment. Keep its constants synchronized with the GLSL interpolation and translucent enclosure geometry.
- `roofPitch` supports `-28` to `28` degrees. `roofOffset` shifts the ridge across Z from `-2` to `2`; `roofGapHorizontal` opens the visible roof panels symmetrically around the ridge, and `roofGapVertical` sets clerestory height. Both compute shaders use the same independent horizontal and vertical aperture values.
- `clerestoryWindows` hides the clerestory panes and disables their exchange when false. When enabled, one continuous pane per longitudinal bay bridges directly between the two roof-section edges. `clerestoryOpen` ranges from `0` (closed exchange) to `1` (fully open exchange).
- `particleCount` ranges from `1024` to `9216`; changing it remounts the field with the smallest square compute texture that contains the requested instance count. `particleDiameter` sets base size, while `particleMagnitudeScale` adds per-particle scaling from velocity magnitude.
- `windOcclusion` enables approximate GPU deflection around the station columns, platform mass, and moving train. Roof, stair, flood-ground, and shaft constraints continue to provide their existing boundary behavior.
- `npm test` runs the Node route-contract tests in `src/routeModel.test.js`; browser validation is still required for GPU shader compilation and visible transport.
- The Params panel keeps descriptions hidden by default; the `Show descriptions` toggle reveals a short explanation for every slider and physical toggle without changing simulation state.
- The Thermal resilience readout opens a report screen backed by `thermalResilienceReport()`, which explains the fixed baseline, passive cooling credits, active airflow load, and the resulting clamped score. Surface temperature is called out as a physical field input rather than a score term.
- The thermal-dispersion legend is intentionally compact on desktop and hidden on narrow mobile layouts to preserve scene visibility.
- Sustainable thermal management is represented by heat removal from passive shaft/groove/flood paths plus active fan transport. The HUD's thermal-resilience score is an operational heuristic, not a certified energy model.
- The shader loops over every other texel to keep the SPH pass usable in a browser. Higher particle-count settings increase both rendered instances and neighbor samples, so they require a capable GPU.
- WebGL2 is preferred. The implementation must continue to use half-float textures on WebGL1 where the renderer supports them, and should surface a readable fallback status if GPU initialization fails.

## Review notes from the original experiment

- The original file mixed scene construction, mutable simulation state, DOM event wiring, and the animation loop in one HTML module. This made resource cleanup and state ownership implicit.
- Its import map depended on an unpinned remote CDN at runtime, so local builds and dependency versioning were not possible.
- The rewrite should preserve the useful visual behavior while making shader uniforms, train motion, and telemetry explicit React-owned boundaries.
- Keep the three physical inputs visually connected to the scene; do not replace the simulation with a static illustration or a CPU particle fallback.

## Working rules

- Prefer small components and existing R3F/Drei primitives over imperative scene mutations.
- Keep shader strings close to the component that owns their uniforms.
- Do not silently remove the legacy HTML experiments or change the simulation constants without recording the reason.
- Validate with `npm run build` after changes. For visual changes, also load `/index.html` in a browser and confirm that the canvas renders, the train toggle moves the train, and sliders affect uniforms without console errors.