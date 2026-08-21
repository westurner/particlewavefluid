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
- The tunnel is 22 units long, 8 units tall, and 10 units deep. X wraps; floor, ceiling, and side walls clamp.
- `density`, `stiffness`, and `viscosity` are live uniforms. Train piston force, AC exhaust, and brake friction are independent toggles.
- `shaftExchange` captures particles horizontally toward the nearest of three street shafts and vents them upward; `downFans` injects air downward; `ceilingFans` sweeps the ceiling band toward the egress; `grooves` adds low-energy passive flow; and `stackEffect` modulates thermal lift and heat removal through the shafts.
- `floodFlow` cools the lower flood gallery; `floodPumpDirection` sets its X-axis air-pump direction from `-1` to `1`; and `floodTunnels` enables the gallery. The rendered gallery is below the station slab at approximately `y = -5`, so its solver band begins below `y = -3.8` and the particle floor extends to `y = -6.2`.
- The stair run occupies the rendered X range `7` to `15.4` and is represented across the wrapped simulation domain. Thermally active particles near `z = -2.5` receive an uphill transport vector and are lifted to the ascending stair profile; this is a directional heuristic, not a rigid-body stair solver.
- `roofPitch` supports `-28` to `28` degrees. `roofOffset` shifts the ridge across Z from `-2` to `2`, and both compute shaders use the same piecewise roof envelope as the endpoint-defined visible roof panels.
- `clerestoryOpen` ranges from `0` (louvers absent and no clerestory exchange) to `1` (fully open). The GPU solver adds heat-dependent upward escape near the ridge, and the scene renders matching louver blades.
- Sustainable thermal management is represented by heat removal from passive shaft/groove/flood paths plus active fan transport. The HUD's thermal-resilience score is an operational heuristic, not a certified energy model.
- The shader loops over every other texel to keep the SPH pass usable in a browser. Changes that increase `SIM_RES` or neighbor sampling need a measured performance check.
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