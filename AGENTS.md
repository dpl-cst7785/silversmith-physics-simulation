# AGENTS.md

This file is the working contract for future Codex sessions in this repository. Keep it current when the architecture, solver strategy, renderer pipeline, deployment model, or testing expectations materially change.

## Project Intent

Silversmith / RF EM Sandbox is an RF and electromagnetics engineering tool. Treat it as physics plus code inside a web app, not as a decorative visualization demo.

The near-term product goal is:

```text
editable RF geometry + material stackup
-> analytical textbook model
-> local numerical or mock simulation
-> validation report
-> 3D geometry and field/power-flow visualization
```

The app is not HFSS yet. Do not claim that it is. The direction is to build credible local-first EM tooling incrementally, with tested models and explicit assumptions.

## Current Technical Baseline

- React + TypeScript + Vite frontend.
- Three.js via `@react-three/fiber` and `@react-three/drei`.
- Vitest for unit tests.
- ESLint flat config.
- SI units internally across physics, geometry, simulation, and validation modules.
- GitHub Actions pipeline is expected to run install, lint, test, and build.
- Primary repo remote is `https://github.com/dpl-cst7785/silversmith-physics-simulation.git`.

Core modules:

- `src/domain`: geometry, material, circuit, trace, port, via, and stackup types.
- `src/geometry`: generated extruded conductor/dielectric mesh solids.
- `src/physics`: analytical RF models, presets, Touchstone parsing, sweeps.
- `src/simulation`: solver interfaces, finite-difference solver, mock solver, worker.
- `src/fields`: field sampling, field volume helpers, Poynting/power-flow sampling.
- `src/validation`: analytical/simulation/imported comparison reports.
- `src/ui`: route-level React UI and Three.js viewer.
- `docs`: architecture and roadmap notes.

## Non-Negotiable Engineering Rules

1. Keep physics logic out of UI components.
2. Use SI units internally everywhere.
3. Do not hardcode geometry constants in the renderer when they exist in domain geometry.
4. Any physics calculation or solver-derived data path needs deterministic tests.
5. Do not hide approximations. Document them in code comments and README/docs when user-facing.
6. Prefer simple, correct, testable models over impressive-looking fake behavior.
7. Do not represent visual effects as physical results unless they are derived from model or solver data.
8. Preserve existing user work. Do not reset, checkout, or revert unrelated changes.

## Physics Expectations

Current supported physics:

- Microstrip analytical model.
- Stripline analytical model.
- Finite-thickness microstrip correction reported separately from baseline.
- Touchstone `.s1p` and `.s2p` parsing.
- Local finite-difference 2D microstrip cross-section solver solving `div(epsilon grad V)=0`.
- Solver-derived transverse E-field visualization data.
- Poynting/power-flow streamlines derived from transverse field energy density under quasi-TEM assumptions.
- Path-aware curved microstrip geometry validated as equivalent transmission-line centerline length.

Important limitations:

- Curves/bends are currently treated as equivalent-length transmission lines for validation.
- Bend discontinuity capacitance, radiation, mode conversion, via transitions, coupling, roughness, and full 3D EM effects are not solved yet.
- The local finite-difference solver is 2D quasi-static cross-section physics, not a full 3D FDTD/FEM/MoM solver.

When adding a new model:

- Define inputs/outputs in SI units.
- Add tests with documented expected values.
- Explain assumptions near the implementation.
- Add README/docs updates if the capability is user-visible.
- Make the validation engine expose pass/fail metrics rather than only displaying numbers.

## Renderer Expectations

The viewer must be an engineering viewport:

- Geometry comes from `RfGeometry` and `buildExtrudedGeometryMesh`.
- Field visuals must be tied to solver/model outputs.
- E-field and power flow are separate concepts:
  - E-field is mostly transverse for quasi-TEM microstrip.
  - Power flow follows the trace direction and is represented with Poynting-style streamlines.
- Red/blue phase coloring is allowed only as an instantaneous signed visualization aid.
- Opacity/density should represent field relevance, magnitude, or power density.

Avoid repeating past mistakes:

- Do not tune arbitrary fog until it “looks cool.”
- Do not draw random arrows and call them power flow.
- Do not duplicate constants in the UI when geometry already defines the structure.

Preferred renderer roadmap:

1. Formalize a `FieldVolume` / `FieldTensorGrid` data structure.
2. Move visualization generation toward reusable field-rendering modules.
3. Add selectable modes: `|E|`, `Ex/Ey/Ez`, potential, Poynting flow, leakage/coupling relevance.
4. Move from mesh-splat approximations toward GPU volume rendering or raymarching.
5. Verify viewer changes with tests where possible and build checks always.

## Geometry Expectations

Geometry is currently path-aware for traces through optional trace `centerline` points.

When changing geometry:

- Preserve rectangular straight-trace behavior.
- Ensure curved/path traces still report total centerline length.
- Keep ports, traces, vias, substrate, and ground plane in SI units.
- Update `src/geometry/extrudedMesh.test.ts` for mesh topology changes.
- Update presets/tests if user-visible geometry options change.

## Validation Expectations

Validation should connect:

```text
geometry + material + frequency sweep
-> analytical expected values
-> simulation or imported observed values
-> numerical comparison metrics
```

Validation outputs should include:

- expected value
- observed value
- absolute error
- percent error
- tolerance
- pass/fail
- source

Do not replace validation with only plots. Plots are supporting evidence; metrics are the regression anchor.

## Testing and Verification

Run these before finishing meaningful code changes:

```bash
npm run lint
npx tsc -b --pretty false
npm run test
npm run build
```

On Windows inside Codex, `npm run test` and `npm run build` may fail with `spawn EPERM` because Vitest/Vite needs to spawn esbuild. If that happens, rerun the same command with the appropriate escalation request rather than treating it as a code failure.

Current passing baseline after the curved microstrip work:

- `npm run lint`
- `npx tsc -b --pretty false`
- `npm run test` with 57 tests
- `npm run build`

If you cannot run a required command, say exactly why in the final response.

## Git and Delivery

- Work on the existing branch unless the user asks for a new one.
- Keep commits scoped to coherent checkpoints.
- Push only after tests/build pass, or explicitly state what could not be verified.
- Do not commit generated `dist` assets unless the repository has intentionally decided to track them.
- Use clear commit messages, for example:
  - `Add curved microstrip power-flow validation`
  - `Smooth finite-cell field rendering`
  - `Add finite-difference microstrip validation`

## Documentation Maintenance

Update `AGENTS.md` at major intervals:

- new solver family or solver architecture
- new field/renderer data model
- change to units or geometry representation
- new deployment/cloud compute assumptions
- new validation workflow
- significant testing or CI change
- major user-visible capability that changes how future Codex should work

Also update:

- `README.md` for user-facing capability changes.
- `docs/architecture.md` for architecture changes.
- `docs/plan.md` for roadmap and implementation-plan changes.

## Product Direction

The user wants an enterprise-level RF/EM modeling and simulation app. Keep moving toward:

- CAD-like geometry creation.
- Mesh generation from editable geometry.
- Real solver data structures.
- Local numerical solvers first.
- Cloud/autoscaling solver workers later.
- Visualizations that explain field behavior, leakage, coupling, and power flow.

The right posture is ambitious but honest: build real pieces, verify them, name the assumptions, then replace approximations with better solvers over time.
