# RF EM Sandbox

RF EM Sandbox is a local-first RF engineering sandbox for connecting geometry, material stackups, analytical textbook models, mock solver outputs, S-parameters, validation reports, and a simple CAD-style 3D view.

The app is intentionally not a full EM solver yet. The current goal is a correct, testable first workflow:

```text
transmission-line geometry + materials -> analytical model -> mock S-parameters -> validation report -> 3D representation
```

## Current Physics Capabilities

- SI-native microstrip transmission line model.
- SI-native symmetric stripline transmission line model.
- Effective relative permittivity calculation.
- Characteristic impedance calculation.
- Zero-thickness and finite-thickness microstrip impedance estimates, reported separately so approximation variance is visible.
- Phase velocity, wavelength, electrical length, and propagation delay.
- Estimated insertion loss from simple dielectric and conductor loss approximations.
- Deterministic mock microstrip solver that returns complex S11 and S21 values over a frequency sweep.
- Validation metrics with expected value, observed value, absolute error, percent error, tolerance, and pass/fail status.
- Exportable JSON validation reports containing geometry, material stackup, sweep settings, analytical results, mock S-parameters, solver metadata, validation metrics, and optional Touchstone summary.
- Local run history for selecting prior validation records and restoring their geometry, sweep, analytical results, mock simulation output, and validation metrics.
- Latest-run comparison for Z0, effective dielectric constant, estimated loss, propagation delay, and electrical length deltas.
- Trace-width sweep studies that use the analytical model to find the width closest to a target impedance.
- Touchstone `.s1p` and `.s2p` parser for frequency units, real/imaginary, magnitude/angle, and dB/angle formats.

## Microstrip Model Assumptions

The microstrip model uses closed-form quasi-static textbook approximations:

- Effective dielectric constant: Hammerstad-Jensen style approximation.
- Characteristic impedance: Wheeler/Hammerstad zero-thickness approximation.
- Finite-thickness variance: first-order Hammerstad-style correction that treats copper thickness as an increase in effective trace width.
- Phase velocity: `c / sqrt(effective_relative_permittivity)`.
- Wavelength: `phase_velocity / frequency`.
- Electrical length: `2*pi * physical_length / wavelength`.
- Delay: `physical_length / phase_velocity`.
- Estimated loss: first-order dielectric loss plus a simple surface-resistance conductor loss estimate.

Assumptions and limitations:

- Single uniform trace over a ground plane.
- Non-magnetic substrate.
- No meshing, radiation, roughness, launch discontinuities, dispersion, coupling, bends, or vias in the analytical result.
- The validation baseline remains the zero-thickness equation for continuity with textbook hand calculations.
- The finite-thickness correction is shown as a secondary estimate rather than silently replacing the baseline. TODO comments mark where the er-dependent Hammerstad branch and benchmark comparisons should be added.

## Stripline Model Assumptions

The stripline model is a second analytical path used to validate that the architecture is not microstrip-only.

- Symmetric stripline centered between two ground planes.
- Homogeneous dielectric, TEM propagation.
- Characteristic impedance uses `Z0 = 30*pi / (sqrt(er) * (w / b + 0.441))`, where `b` is ground-plane separation.
- Effective relative permittivity is equal to substrate relative permittivity.
- Estimated loss uses simple dielectric loss and conductor surface resistance terms.

TODO: add Wheeler narrow/wide stripline correction, finite conductor thickness correction, and explicit enclosure geometry.

## Units

Physics and domain modules use SI units internally:

| Quantity | Internal unit |
| --- | --- |
| Length | meters |
| Frequency | hertz |
| Conductivity | siemens per meter |
| Impedance | ohms |
| Delay | seconds |

The UI shows common engineering units such as millimeters and gigahertz, then converts at the boundary.

## Routes

- `/workflow`: explicit run workflow for analytical model selection, geometry, material, frequency sweep, optional imported Touchstone, analytical result, mock simulation, validation report, S-parameter plot, and 3D view.
- `/circuit`: block-based RF circuit canvas scaffold.
- `/geometry`: stackup and material editor.
- `/viewer`: CAD-style 3D view driven by the same geometry object used by the physics model.
- `/results`: S-parameter upload, simulation table, plot, and validation report.

## Tech Stack

- React + TypeScript
- Vite
- Three.js through `@react-three/fiber` and `@react-three/drei`
- Vitest
- ESLint flat config
- GitHub Actions CI for install, lint, test, and build

## Getting Started

```bash
npm install
npm run dev
```

The app runs locally with lightweight mock simulations. It is tuned for fast iteration on a Windows x64 workstation such as the target Intel Core i9-14900F / 32 GB RAM development machine.

## Scripts

```bash
npm run dev       # start the local Vite dev server
npm run lint      # run ESLint
npm run test      # run unit tests
npm run build     # type-check and build production assets
npm run preview   # preview the built app
```

## Environment

Copy `.env.example` to `.env.local` for local overrides.

| Variable | Purpose |
| --- | --- |
| `VITE_APP_ENV` | Local, preview, staging, or production environment label. |
| `VITE_AWS_REGION` | AWS region for future simulation compute resources. |
| `VITE_SIMULATION_ARTIFACT_BUCKET` | Placeholder S3 bucket for input decks, logs, Touchstone files, and field artifacts. |
| `VITE_SIMULATION_JOB_QUEUE` | Placeholder AWS Batch or ECS queue name. |
| `VITE_SIMULATION_API_BASE_URL` | Future API endpoint for job submission and status polling. |

## Architecture

- `src/domain`: SI-unit geometry, material, circuit, trace, port, via, and stackup types.
- `src/physics`: analytical RF models and Touchstone utilities.
- `src/simulation`: solver interfaces, job lifecycle types, metadata, and mock S-parameter generation.
- `src/validation`: comparison engine for analytical, simulated, and imported S-parameter results.
- `src/ui`: route-level React experience.

See `docs/architecture.md` for solver integration and AWS scaling notes.
See `docs/plan.md` for the current implementation and deployment plan.

## Validation Workflow

The validation engine compares analytical values against observed values from the mock solver and, when supplied, imported S-parameters.

For the current transmission-line workflow:

1. Calculate analytical Z0 at the sweep center frequency.
2. Run the mock solver over the requested frequency sweep.
3. Extract impedance from mock S11.
4. Optionally extract impedance from imported Touchstone S11.
5. Emit pass/fail metrics based on percent tolerance.
6. Export a validation report JSON artifact for review, regression comparison, or future cloud solver job records.
7. Save the run locally so previous geometry/simulation/validation records can be selected again.
8. Compare the two latest saved runs or run a local trace-width sweep against a target impedance.

Validation runs only when the user clicks `Run validation`, so edits can be staged before recomputing the report.

## Future Solver Roadmap

- FDTD: time-domain field solver for broadband structures.
- FEM: frequency-domain field solver for complex materials and ports.
- MoM: conductor/surface-current methods for planar and radiating structures.
- Circuit solver: network-level RF blocks and lumped/distributed components.
- AWS compute: S3 artifact storage, AWS Batch/ECS workers, Lambda/API job orchestration, and signed artifact retrieval.

Cloud compute is intentionally scaffolded but not implemented in this MVP.
