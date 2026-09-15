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
- `CameraController` is the sole owner of `OrbitControls`. Add fixed perspectives through `CAMERA_VIEWS`; fixed modes animate to their destination and `orbital` enables auto-rotation. OrbitControls `start` must synchronously disable camera/target easing before clearing the active React mode so manual rotate, Shift-drag pan, and zoom are never overwritten and no preset remains selected. Re-enable easing only when the user explicitly selects a preset. When the parameter panel is visible, offset only the camera position for unobscured framing; keep `controls.target` at `CAMERA_TARGET` so zoom remains anchored to the model rather than the GUI-adjusted frame.
- Keep `ViewToolbar` outside the conditional parameter panel so Show params remains reachable after hiding. On mobile, the panel must start below the toolbar and never intercept its controls.
- The particle simulation owns its GPU resources in a React effect and advances them from R3F's `useFrame`. Dispose compute textures, geometry, and materials when the component unmounts.
- Train position and velocity are the shared boundary between the animated train and the GPU uniforms. Keep those values in world coordinates and clamp frame delta to prevent unstable jumps after tab suspension.

## Simulation constraints

- Particle positions are stored in `uPositionTex`; velocity and thermal intensity share `uVelocityTex`.
- The fluid domain is `x = [-48, 48]`, `y = [-6.2, 24]`, and `z = [-5, 5]`. X wraps across the full route; the lower bound includes the flood gallery and the upper bound preserves a visible upper-air band above the street.
- `surfaceTemperature` is the top-level platform-temperature input, ranging from `60` to `110` degrees Fahrenheit; it changes floor-level buoyancy, particle thermal intensity, and the telemetry baseline. `passengerHeat` drives the 18 shared visible passenger positions. `roadSurfaceTemperature` and `ambientAirTemperature` are separate outdoor inputs: their signed difference drives road convection, while ambient temperature relaxes the upper-air band. `density`, `stiffness`, and `viscosity` are live uniforms inside the collapsed Fluid parameters group. Train piston force, AC exhaust, and brake friction are independent toggles.
- `shaftExchange` captures particles horizontally toward the nearest of three street shafts and vents them upward. Shaft lift begins in the intake band at `y = 0.4`; strong X/Z restoring forces keep particles near the shaft centerline, ceiling sweep is suppressed inside the column, and the position opening matches the capture region so particles are not roof-clamped before entering. `shaftFans` gates visible powered fan hardware, while `shaftFanVelocity` adds controllable upward shaft velocity. Each street cap has a visible slatted vent grille. `surfaceCrosswind` drives outdoor particles along Z and adds magnitude-based suction to the shaft columns and stair route. `downFans` remains a separate station/ceiling force; `floorAirMovers` drives visible low fans across the platform floor toward the stair route; `ceilingFans` sweeps the ceiling band toward the egress; `grooves` adds low-energy passive flow; and `stackEffect` modulates thermal lift and heat removal through the shafts.
- `shaftControls` contains independent signed west, central, and east speeds from `-1` to `1`. Magnitude controls inward capture and containment while sign controls vertical flow and visible fan rotation; keep CPU `shaftControlAtX()`, GPU `uShaftControls` selection, fan animation, and the three UI sliders synchronized. `measureShaftEndpoints()` reads live position and velocity/thermal textures and uses inverse-distance weighting near each intake and road-level outlet; charts report signed vertical velocity (positive upward), while each temperature chart uses a padded range derived from its visible history. Keep telemetry readback throttled rather than running it every frame.
- Near the roof, a normal spring targets a particle offset of `0.25` below the envelope and a slope-aware tangential force moves particles toward the ridge. Keep the CPU `roofUnderside` response synchronized with this GLSL force; trajectory tests depend on both adhesion and ridgeward movement.
- `floodFlow` pulls warmer lower-station air through a visible cooling waterfall, down into the flood gallery, and laterally through the gallery; `floodPumpDirection` sets its X-axis air-pump direction from `-1` to `1`; and `floodTunnels` enables the gallery. `FLOOD_GALLERY.minX/maxX` must remain equal to `TRACK_ROUTE.minX/maxX`; the shell, floor, end rings, and tracer wrapping consume those endpoints. When disabled, the position pass treats the gallery ceiling at `y = -3.8` as solid ground. When enabled with positive flow, falling droplets and cool tracers show the waterfall and pump direction. Particles are seeded into the gallery band at approximately `y = -5`, while the particle floor extends to `y = -6.2`.
- The stair route has a flat entry from `x = 9.5` to `11`, a lower flight to `x = 19.5`, a level landing through `x = 22.5`, and an upper flight ending at `x = 32`. `stairUndergroundOpeningHeight` is tunnel and doorway clear height only: it must never alter `STAIR_ROUTE.baseY`, stair-step elevations, underfill, or turnstile bases. `stairLandingHeight` and `stairSurfaceOpeningHeight` set the intermediate and surface elevations. Both compute shaders, steps, walls, ceiling, and underfill must use the same piecewise interpolation. `verticalLayoutFromSurfaceY()` derives the street plane, shaft outlet, outdoor ceiling, and surface-particle floor while keeping the shaft throat fixed. The transparent underfill and its unconditional position-pass boundary are permanent and independent of thermal intensity and `windOcclusion`; keep the wall, ceiling, and underfill as continuous profile meshes so flight-to-landing joins remain closed. Thermally active particles receive uphill transport and exit directly into the street volume; this remains a directional heuristic, not a rigid-body stair solver.
- `TURNSTILE_ROUTE` owns four fare-gate pedestals before the underground stair opening. Their visible solids and unconditional position-pass collision must remain synchronized; the spaces between pedestals are passable fare lanes.
- `GROUND_LAYOUT` owns permanent track subgrade, stair foundation, and outer stair-wall soil boundaries. The track floor spans `TRACK_ROUTE.minX/maxX` and `tunnelWidth`; the stair foundation spans the route footprint to `STAIR_ROUTE.baseY`; and outer soil occupies the negative-Z side from `STAIR_ROUTE.baseY` to the dynamic tunnel ceiling. Their visible meshes and position-pass constraints are unconditional and must stay synchronized. Do not extend outer soil below `STAIR_ROUTE.baseY`, because the flood gallery runs outboard beneath it.
- The street ground is the solid `verticalLayoutFromSurfaceY(stairSurfaceOpeningHeight).streetY` boundary. Surface particles are clamped above its derived particle floor except within the three shaft apertures and the stair-exit opening. The visible surface includes an asphalt road, dashed center markings, white edge lines, a curb, and sidewalk slabs segmented around those openings.
- Keep `STREET_LAYOUT` as the source of truth for the sidewalk/road edge, vent aperture size, and paving thickness. `stairStreetPortalX()` accounts for the stair enclosure's rotated height; using only the centerline stair profile will overlap the sidewalk.
- Surface crosswind must create upward pressure draw at each shaft outlet and return below the fluid ceiling. Preserve both terms together so particles form outlet plumes without collecting at `FLUID_BOUNDS.maxY`. Road heat adds a one-sided upward/downward thermal response only above the road footprint; it must not turn the street boundary into an attractive sink.
- Shaft capture/recentering belongs below the street and must fade to zero just above the derived street plane; surface outlet pressure owns the flow above that point. Keep the surface floor return and particle floor above the paving faces so the visible wind does not collapse into or hide behind the street meshes.
- Surface Z wrapping is periodic and must use modulo semantics; a one-span add/subtract can leave fast particles outside the domain and visually bunch the wind at one road edge.
- SPH pressure must point along `particlePosition - neighborPosition` so it is repulsive. Compute density before pressure force, and use minimum-image Z offsets whenever both particles carry the surface region tag. Keep the pairwise seam-direction and multi-particle occupancy tests when changing this loop.
- Surface particles use a persistent region tag in the position texture. Train AC heat, brake heat, and piston force must remain gated to underground particles; do not couple those sources directly to the outdoor crosswind. Underground particles retain thermal intensity when they physically reach the derived street plane, providing delayed heat transport through shaft and stair openings. A translucent overburden volume between the roof and street visualizes this insulation and is segmented around the shafts.
- `TRACK_ROUTE` owns the full bed, rail, and translucent train-tunnel extent. It includes the train route plus an 8 m half-car allowance at both ends.
- `train` is the user-facing "Allow trains to run" gate. While enabled, a train crosses from `x = 35` to `x = -35` once per `trainInterval`; `trainStopFrequency` deterministically selects a fraction from `0` to `1` of passes to stop at the platform, and `trainStopDuration` sets their dwell time. The train is hidden and exerts no piston, AC, or brake force between passes. `particleDiameter` scales the rendered particle geometry without changing the SPH neighbor radius.
- `routeModel.js` is the source of truth for fluid bounds, stair profile, shaft outlet height, and street-volume containment. Keep its constants synchronized with the GLSL interpolation and translucent enclosure geometry.
- `roofPitch` supports `-28` to `28` degrees. `roofOffset` shifts the ridge across Z from `-2` to `2`; `roofGapHorizontal` opens the visible roof panels symmetrically around the ridge, and `roofGapVertical` sets clerestory height. Both compute shaders use the same independent horizontal and vertical aperture values.
- `clerestoryWindows` hides the clerestory panes and disables their exchange when false. When enabled, one continuous pane per longitudinal bay bridges directly between the two roof-section edges. `clerestoryOpen` ranges from `0` (closed exchange) to `1` (fully open exchange).
- `particleCount` ranges from `1024` to `9216`; changing it remounts the field with the smallest square compute texture that contains the requested instance count. `particleDiameter` sets base size, while `particleMagnitudeScale` adds per-particle scaling from velocity magnitude.
- `windOcclusion` enables approximate GPU deflection around the station columns, platform mass, and moving train. Roof, stair, flood-ground, and shaft constraints continue to provide their existing boundary behavior.
- `npm test` runs the Node route-contract tests in `src/routeModel.test.js`; browser validation is still required for GPU shader compilation and visible transport.
- The Params panel keeps descriptions hidden by default; the `Show descriptions` toggle reveals a short explanation for every slider and physical toggle without changing simulation state.
- The Thermal resilience readout opens a report screen backed by `thermalResilienceReport()`, which explains the fixed baseline, passive cooling credits, active airflow load, and the resulting clamped score. Platform, passenger, road, and ambient temperatures are physical field inputs rather than score terms.
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