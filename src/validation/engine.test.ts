import { describe, expect, it } from "vitest";
import { defaultGeometry } from "../domain/geometry";
import { copper, defaultSubstrate } from "../domain/materials";
import { parseTouchstone } from "../physics/sParameters";
import { buildFrequencySweep, compareValues, validateMicrostrip } from "./engine";

describe("validation engine", () => {
  it("builds a deterministic linear frequency sweep", () => {
    expect(buildFrequencySweep({ startHz: 1e9, stopHz: 3e9, points: 3 })).toEqual([1e9, 2e9, 3e9]);
  });

  it("calculates validation error and pass status", () => {
    const metric = compareValues({
      label: "Z0",
      expectedValue: 50,
      observedValue: 51,
      unit: "ohms",
      tolerancePercent: 3,
      source: "simulation"
    });

    expect(metric.absoluteError).toBe(1);
    expect(metric.percentError).toBe(2);
    expect(metric.pass).toBe(true);
  });

  it("runs an end-to-end microstrip validation report", async () => {
    const result = await validateMicrostrip({
      geometry: defaultGeometry(defaultSubstrate, copper),
      sweep: { startHz: 1e9, stopHz: 3e9, points: 3 }
    });

    expect(result.analyticalAtCenter.characteristicImpedanceOhms).toBeCloseTo(50.78, 2);
    expect(result.simulation.points).toHaveLength(3);
    expect(result.metrics[0].pass).toBe(true);
  });

  it("runs an end-to-end stripline validation report", async () => {
    const result = await validateMicrostrip({
      modelId: "stripline",
      geometry: defaultGeometry(defaultSubstrate, copper),
      sweep: { startHz: 1e9, stopHz: 3e9, points: 3 }
    });

    expect(result.modelId).toBe("stripline");
    expect(result.analyticalAtCenter.characteristicImpedanceOhms).toBeCloseTo(18.91, 2);
    expect(result.simulation.metadata.assumptions[0]).toContain("stripline");
  });

  it("includes imported Touchstone impedance comparison when supplied", async () => {
    const touchstone = parseTouchstone("# GHZ S MA R 50\n2.0 0.00775 0", "fixture.s1p");
    const result = await validateMicrostrip({
      geometry: defaultGeometry(defaultSubstrate, copper),
      sweep: { startHz: 1e9, stopHz: 3e9, points: 3 },
      touchstone
    });

    const importedMetric = result.metrics.find((metric) => metric.source === "touchstone");

    expect(importedMetric).toBeDefined();
    expect(importedMetric?.observedValue).toBeCloseTo(50.78, 1);
    expect(importedMetric?.pass).toBe(true);
  });
});
