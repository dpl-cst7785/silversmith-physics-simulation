# RF EM Sandbox Plan

## Current MVP

- React/Vite/TypeScript local-first app.
- SI-unit geometry and material domain model.
- Analytical microstrip and symmetric stripline models.
- Model-specific geometry labels, assumptions, presets, and 3D viewer modes.
- Mock transmission-line solver returning deterministic complex S-parameters.
- Touchstone `.s1p` and `.s2p` parser with RI, MA, and dB/angle support.
- Validation engine comparing analytical, simulated, and imported S-parameter-derived impedance.
- GitHub Actions CI for lint, test, and build.
- GitHub Pages workflow for static deployment from `main`.

## Near-Term Engineering Tasks

1. Export validation reports as JSON.
2. Add fixture-based textbook examples for microstrip and stripline.
3. Add finite conductor thickness correction for microstrip impedance.
4. Add a coplanar waveguide analytical model.
5. Improve plot axes, ticks, and point inspection.
6. Add saved design files for geometry, material, sweep, and validation settings.

## Solver Roadmap

1. Keep mock solver deterministic for UI and regression tests.
2. Add a circuit-solver adapter for ideal transmission-line networks.
3. Add cloud job lifecycle stubs with queued, running, completed, and failed states.
4. Define an input deck format for future FDTD/FEM/MoM solvers.
5. Store solver artifacts in S3-compatible storage once backend APIs exist.

## Deployment Plan

- Use CI workflow on every pull request and push to `main`.
- Use GitHub Pages workflow for static preview deployments.
- Keep AWS variables documented but unused until compute APIs are introduced.
- Do not introduce real cloud execution until the solver adapter contract stabilizes.

## Repository Setup Checklist

- [ ] Create or choose GitHub repository under `dpl-cst7785`.
- [ ] Push local project contents.
- [ ] Enable GitHub Pages with source set to GitHub Actions.
- [ ] Confirm CI passes on the first push.
- [ ] Add branch protection requiring CI before merging to `main`.
- [ ] Add repository secrets only when backend/cloud integrations are implemented.
