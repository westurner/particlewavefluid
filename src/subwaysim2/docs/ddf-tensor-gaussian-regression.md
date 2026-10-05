---
title: "A Gaussian-Localized DDF Response in Particle-Field Mechanics"
subtitle: "Model definition, regression evidence, and limits of interpretation"
date: 2026-10-05
keywords:
  - dilatant dark fluid
  - tensor-Gaussian splat
  - particle simulation
  - regression testing
  - phenomenological model
---

# A Gaussian-Localized DDF Response in Particle-Field Mechanics

## Abstract

This computational note documents a bounded dilatant-dark-fluid (DDF) response used by a particle-field simulator. The DDF mobility is computed from a speed-limited, strain-dependent viscosity and is blended with a normalized tensor-Gaussian weight. The resulting acceleration correction is largest within the Gaussian support and tends to the underlying superfluid-quantum-gravity (SQG) response as the support decays. A regression test compares DDF and SQG responses at matched settings and verifies that their acceleration difference is larger near the configured core than in the far field. The test establishes a software invariant for the implemented model; it does not establish DDF as a physical fluid, validate an SQG constitutive law, or demonstrate a measured propulsion or gravitational effect.

## Scope and status

The result concerns a numerical overlay in a GPU particle simulation. It is useful for verifying that the code localizes a hypothesis where intended, that the classical and reference modes remain available, and that imported parameters are bounded. The words *DDF*, *mobility*, and *tensor-Gaussian* name model components here; they should not be read as evidence that a corresponding material or field has been observed.

The software classifies Newtonian gravity and the baseline electromagnetic/Maxwell response as references. DDF and positive-Grassmannian or amplituhedron-inspired corrections are optional research hypotheses. Their coupling coefficients are user parameters, not measured material constants. No derivation from quantum electrodynamics, general relativity, or a validated constitutive theory is asserted.

## Model

Let $r$ denote distance from the response center, $v \ge 0$ a local speed, $r_c$ the core scale, $v_s$ the configured speed limit, $\delta$ the dilatancy coefficient, and $\nu_0$ the base-viscosity parameter. The implementation forms a capped speed ratio

```{math}
:label: eq:beta
\beta = \min\!\left(\frac{v}{v_s},\,0.9999\right),
\qquad
\Gamma_* = \frac{1}{\sqrt{1-\beta^2}}.
```

The starred factor is a bounded, Lorentz-factor-like scalar in the hypothesis model. Unless $v_s$ is physically calibrated, it is a numerical saturation scale rather than the speed of light. The strain proxy and effective viscosity are

```{math}
:label: eq:viscosity
\dot{\gamma}_* = \frac{v}{\max(r, r_{\min})},
\qquad
\nu_{\mathrm{eff}} = \nu_0\!\left[1+\delta\left((\Gamma_*-1)+\dot{\gamma}_*\right)\right],
\qquad
\mu_{\mathrm{DDF}} = \frac{1}{1+\nu_{\mathrm{eff}}}.
```

Here $r_{\min}$ is the numerical radius floor. Within the UI model, the parameters are sanitized before evaluation; the supported dilatancy, viscosity, speed, and core ranges are finite. For nonnegative parameter values, $0 < \mu_{\mathrm{DDF}} \le 1$.

The normalized Gaussian envelope is

```{math}
:label: eq:gaussian
g(r;\sigma) = \exp\!\left(-\frac{r^2}{2\sigma^2}\right),
\qquad 0 \le g \le 1,
```

where $\sigma$ is the configured tensor-Gaussian waist. The DDF acceleration multiplier blends the constitutive mobility into the classical-to-SQG response:

```{math}
:label: eq:blend
M(r,v) = 1 - \bigl(1-\mu_{\mathrm{DDF}}(r,v)\bigr)g(r;\sigma),
\qquad
\mathbf{a}_{\mathrm{DDF}} = M(r,v)\,\mathbf{a}_{\mathrm{SQG}}.
```

The visual splat weight is separately bounded:

```{math}
:label: eq:splat
S(r,v) = \operatorname{clamp}\!\left(g(r;\sigma)\left[0.25+0.75\mu_{\mathrm{DDF}}(r,v)\right],\,0,\,1\right).
```

Thus $g\to0$ in the far field implies $M\to1$: the DDF-modified acceleration approaches the SQG reference. Near the center, $g\to1$ and $M\to\mu_{\mathrm{DDF}}$, so the constitutive mobility has its greatest influence. This is a designed interpolation property, not an independent conservation law.

The shared implementation also contains a positive-Grassmannian response option. That branch uses a bounded canonical-pole weight and coupling to scale a normalized tensor-Gaussian splat. It is a separate hypothesis; the DDF regression described here does not validate that geometric interpretation.

## Regression method

The test uses identical mechanics settings for the DDF and SQG evaluations. It samples a near-core radius and a far-field radius at the same speed, then compares the absolute radial-acceleration differences:

```{math}
:label: eq:regression
\Delta(r,v) = \left|a_{r,\mathrm{DDF}}(r,v)-a_{r,\mathrm{SQG}}(r,v)\right|,
\qquad
\Delta(r_{\mathrm{near}},v) > \Delta(r_{\mathrm{far}},v).
```

The test also verifies that the normalized tensor-Gaussian weight is greater near the center than in the far field. The production regression is [“DDF mechanics return toward the SQG baseline outside the tensor-Gaussian waist”](../src/mechanicsModels.test.js), using the shared field evaluator in [mechanicsModels.js](../src/mechanicsModels.js) and the reusable scalar response functions in [simulationMechanics.js](../src/lib/simulationMechanics.js).

## Results

The regression passes for its selected near- and far-field inputs. In the test case, the near-core DDF acceleration is distinguishable from the SQG response, while the far-field comparison converges to the reference within floating-point resolution. The corresponding tensor-Gaussian weight also decreases with radius.

This result verifies the intended code path and guards against a regression in the spatial envelope. It is not a parameter-estimation result, a numerical-convergence study, or an experimental observation. In particular, the test does not establish the absolute magnitude of the response as physically meaningful.

## Interpretation and limitations

1. **Phenomenological constitutive response.** The viscosity expression combines a speed-limit term with a strain proxy. It is an explicitly bounded hypothesis and is not derived here from a measured material law.
2. **Reduced particle-field solver.** The model modifies acceleration and visualization weights in a particle system. It is not a finite-volume Navier–Stokes solver, a pressure-Poisson projection, or a shock-capturing method.
3. **No new energy source.** The Gaussian or DDF multiplier is not credited as energy generation. Existing energy-budget code keeps speculative vacuum-fracture gain outside the balance.
4. **No calibration claim.** The configured waist, viscosity, dilatancy, and speed limit are scenario inputs. They require independently justified units, calibration data, and uncertainty analysis before physical interpretation.
5. **No validation of gravity claims.** Convergence to the SQG branch is a comparison between two software response models, not evidence for SQG gravity or a quantum-vacuum mechanism.

## Reproducibility

Run the focused model tests from the simulator project directory:

```bash
node --test src/mechanicsModels.test.js src/lib/simulationMechanics.test.js
```

The core test is deterministic and requires no GPU. GPU rendering, particle appearance, and user-controlled parameters should be checked separately in the browser. The full application build is validated with `npm run build`.

## Conclusion

The verified result is narrow but useful: the implemented DDF response is spatially localized by its tensor-Gaussian envelope and returns toward its SQG reference in the far field. The shared mechanics library makes that behavior explicit and testable. Physical validity remains an open empirical and theoretical question, not a conclusion of the regression.