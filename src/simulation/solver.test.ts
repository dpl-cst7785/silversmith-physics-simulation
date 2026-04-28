import { describe, expect, it } from "vitest";
import { defaultGeometry } from "../domain/geometry";
import { copper, defaultSubstrate } from "../domain/materials";
import { magnitudeDb } from "../physics/sParameters";
import { MockMicrostripSolver } from "./solver";

describe("MockMicrostripSolver", () => {
  it("returns deterministic S-parameter shaped output with metadata", async () => {
    const solver = new MockMicrostripSolver();
    const result = await solver.run({
      geometry: defaultGeometry(defaultSubstrate, copper),
      frequenciesHz: [1e9, 2e9, 3e9],
      referenceImpedanceOhms: 50
    });

    expect(result.metadata.solverName).toBe("mock-transmission-line-quasi-static");
    expect(result.metadata.convergenceStatus).toBe("not-applicable");
    expect(result.points).toHaveLength(3);
    expect(result.points[0].s11).toHaveProperty("real");
    expect(result.points[0].s21).toHaveProperty("imaginary");
    expect(result.points[0].extractedImpedanceOhms).toBeGreaterThan(40);
    expect(magnitudeDb(result.points[0].s21)).toBeLessThan(0);
  });

  it("supports stripline model selection", async () => {
    const solver = new MockMicrostripSolver();
    const result = await solver.run({
      geometry: defaultGeometry(defaultSubstrate, copper),
      frequenciesHz: [2e9],
      referenceImpedanceOhms: 50,
      modelId: "stripline"
    });

    expect(result.points[0].extractedImpedanceOhms).toBeGreaterThan(15);
    expect(result.metadata.assumptions[0]).toContain("stripline");
  });
});
