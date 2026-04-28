import { describe, expect, it } from "vitest";
import { defaultGeometry } from "../domain/geometry";
import { copper, defaultSubstrate } from "../domain/materials";
import {
  buildConnectorProbeFrames,
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
