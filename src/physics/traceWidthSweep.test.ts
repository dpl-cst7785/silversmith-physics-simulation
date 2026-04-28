import { describe, expect, it } from "vitest";
import { defaultGeometry, mmToM } from "../domain/geometry";
import { copper, defaultSubstrate } from "../domain/materials";
import { runTraceWidthSweep } from "./traceWidthSweep";

describe("trace width sweep", () => {
  it("finds the microstrip width closest to a target impedance", () => {
    const result = runTraceWidthSweep({
      geometry: defaultGeometry(defaultSubstrate, copper),
      modelId: "microstrip",
      frequencyHz: 3e9,
      targetImpedanceOhms: 50,
      startWidthM: mmToM(2.5),
      stopWidthM: mmToM(4),
      points: 16
    });

    expect(result.points).toHaveLength(16);
    expect(result.best.traceWidthM).toBeCloseTo(mmToM(3.5), 4);
    expect(result.best.characteristicImpedanceOhms).toBeCloseTo(50, 0);
  });

  it("rejects invalid sweep bounds", () => {
    expect(() =>
      runTraceWidthSweep({
        geometry: defaultGeometry(defaultSubstrate, copper),
        modelId: "microstrip",
        frequencyHz: 3e9,
        targetImpedanceOhms: 50,
        startWidthM: mmToM(4),
        stopWidthM: mmToM(2.5),
        points: 16
      })
    ).toThrow("stop width");
  });
});
