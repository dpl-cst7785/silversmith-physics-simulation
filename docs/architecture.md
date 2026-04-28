# Architecture Notes

## Current shape

The MVP is split into small modules so UI work and physics work can evolve independently:

- `src/domain`: SI-unit circuit, geometry, stackup, port, trace, via, and material types.
- `src/physics`: closed-form textbook models and Touchstone parsing utilities.
- `src/simulation`: solver adapter contracts, job lifecycle types, metadata, and the mock local solver.
- `src/validation`: compares analytical results against simulated or imported data.
- `src/ui`: route-level React screens for circuit design, geometry, 3D inspection, and results.

## Solver integration path

The `SolverAdapter` interface is the boundary for future engines. FDTD, FEM, MoM, and circuit solvers should implement the same lifecycle and return complex S-parameters with solver metadata:

1. Normalize geometry/material inputs into the solver-specific mesh or circuit representation.
2. Create a job record with `queued`, `running`, `completed`, or `failed` state.
3. Store generated input decks, logs, S-parameters, and field data as artifacts.
4. Return compact S-parameter summaries and metadata to the validation engine.

The first real solver should keep the mock solver in place for deterministic UI tests and textbook regression tests.

## AWS compute scaling

The repository is prepared for an AWS-backed compute model, but cloud execution is intentionally not implemented yet.

Planned flow:

1. Browser submits a simulation request to an API route or service.
2. API validates the geometry and writes an input deck to S3.
3. API submits a job to AWS Batch or ECS with the S3 input URI.
4. Worker uploads Touchstone output, field snapshots, and logs to S3.
5. API exposes job status and signed artifact URLs.

Environment variables are documented in `.env.example` and the README. The placeholder config lives in `src/config/aws.ts`.

## Physics validation strategy

Textbook equations are treated as testable source code. Each analytical model should include:

- Units in the function contract.
- Input validation for non-physical values.
- Tests with known benchmark geometries.
- A result shape that can be compared against solver output.

TODO: add additional models for stripline impedance, coplanar waveguide impedance, lossy transmission line propagation, and parallel plate capacitance.
