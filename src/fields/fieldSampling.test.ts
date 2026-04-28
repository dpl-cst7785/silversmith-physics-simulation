import { describe, expect, it } from "vitest";
import { defaultGeometry } from "../domain/geometry";
import { copper, defaultSubstrate } from "../domain/materials";
import { solveMicrostripFiniteDifference } from "../simulation/finiteDifferenceMicrostrip";
import {
  buildConnectorProbeFrames,
  buildSolverFieldSamples,
  buildSolverFieldSurface,
  buildSolverFieldVolume,
  estimateFieldSolveMs,
  buildTraceFieldSamples,
  sampleInstantaneousField
} from "./fieldSampling";

describe("field sampling", () => {
  it("creates deterministic 3D samples around the trace geometry", () => {
    const geometry = defaultGeometry(defaultSubstrate, copper);
    const samples = buildTraceFieldSamples(geometry, {
      samplesAlongTrace: 3,
      samplesAcrossTrace: 3,
      heightLevels: 2
    });

    expect(samples).toHaveLength(18);
    expect(samples[0].xM).toBe(geometry.traces[0].xM);
    expect(samples[0].yM).toBeGreaterThan(geometry.stack.substrateHeightM);
    expect(samples[0].amplitude).toBeGreaterThan(0);
    expect(samples[0].amplitude).toBeLessThanOrEqual(1);
    expect(Math.hypot(samples[0].direction.x, samples[0].direction.y, samples[0].direction.z)).toBeCloseTo(1);
  });

  it("uses a denser default field sample grid", () => {
    expect(buildTraceFieldSamples(defaultGeometry(defaultSubstrate, copper))).toHaveLength(23 * 9 * 4);
  });

  it("projects finite-difference solver fields into 3D samples", () => {
    const samples = buildSolverFieldSamples(defaultGeometry(defaultSubstrate, copper), undefined, {
      samplesAlongTrace: 3,
      samplesAcrossSection: 4,
      heightLevels: 3
    });

    expect(samples.length).toBeGreaterThan(0);
    expect(samples[0].amplitude).toBeGreaterThan(0);
    expect(samples[0].solverProbe?.magnitudeVm).toBeGreaterThan(0);
    expect(Math.hypot(samples[0].direction.x, samples[0].direction.y, samples[0].direction.z)).toBeCloseTo(1);
  });

  it("builds a near-continuous field surface from solver data", () => {
    const geometry = defaultGeometry(defaultSubstrate, copper);
    const solve = solveMicrostripFiniteDifference(geometry, {
      cellsX: 32,
      cellsY: 24,
      maxIterations: 4_000,
      tolerance: 1e-4
    });
    const surface = buildSolverFieldSurface(solve, {
      xSamples: 6,
      ySamples: 5,
      lengthM: geometry.traces[0].lengthM
    });

    expect(surface.positions).toHaveLength(6 * 5 * 3);
    expect(surface.colors).toHaveLength(6 * 5 * 3);
    expect(surface.indices.length).toBeGreaterThan(0);
    expect(surface.maxMagnitudeVm).toBeGreaterThan(0);
    expect(estimateFieldSolveMs({ cellsX: 64, cellsY: 48, maxIterations: 7_000 })).toBeGreaterThan(0);
  });

  it("builds a volumetric field cloud from solver data", () => {
    const geometry = defaultGeometry(defaultSubstrate, copper);
    const solve = solveMicrostripFiniteDifference(geometry, {
      cellsX: 32,
      cellsY: 24,
      maxIterations: 4_000,
      tolerance: 1e-4
    });
    const volume = buildSolverFieldVolume(solve, {
      samplesAlongTrace: 4,
      samplesAcrossSection: 5,
      heightLevels: 4,
      lengthM: geometry.traces[0].lengthM,
      xOffsetM: geometry.traces[0].xM
    });

    expect(volume.positions.length).toBeGreaterThan(0);
    expect(volume.positions.length % 3).toBe(0);
    expect(volume.colors).toHaveLength(volume.positions.length);
    expect(volume.directions).toHaveLength(volume.positions.length);
    expect(volume.amplitudes).toHaveLength(volume.positions.length / 3);
    expect(volume.phases).toHaveLength(volume.positions.length / 3);
    expect(volume.traceLengthM).toBe(geometry.traces[0].lengthM);
  });

  it("samples signed instantaneous field values from phase", () => {
    const value = sampleInstantaneousField(
      {
        id: "sample",
        xM: 0,
        yM: 0,
        zM: 0,
        amplitude: 0.5,
        phaseRad: Math.PI / 2,
        direction: { x: 0, y: 1, z: 0 }
      },
      Math.PI
    );

    expect(value).toBeCloseTo(0.5);
  });

  it("builds connector probe frames for port terminal readout", () => {
    const frames = buildConnectorProbeFrames({
      geometry: defaultGeometry(defaultSubstrate, copper),
      animationPhaseRad: Math.PI / 2,
      driveVoltageV: 1
    });

    expect(frames).toHaveLength(2);
    expect(frames[0].label).toBe("P1");
    expect(frames[0].voltageV).toBeCloseTo(1);
    expect(frames[0].estimatedElectricFieldVm).toBeGreaterThan(0);
  });
});
