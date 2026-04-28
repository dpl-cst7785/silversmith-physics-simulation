import { describe, expect, it } from "vitest";
import { defaultGeometry } from "../domain/geometry";
import { copper, defaultSubstrate } from "../domain/materials";
import { buildFieldDiagnostics } from "./fieldDiagnostics";
import { solveMicrostripFiniteDifference } from "./finiteDifferenceMicrostrip";

describe("field diagnostics", () => {
  it("summarizes convergence and recommends refinement regions", () => {
    const fieldSolve = solveMicrostripFiniteDifference(defaultGeometry(defaultSubstrate, copper), {
      cellsX: 48,
      cellsY: 36,
      maxIterations: 5_000,
      tolerance: 1e-4
    });

    const diagnostics = buildFieldDiagnostics(fieldSolve);

    expect(diagnostics.convergenceRatio).toBeGreaterThanOrEqual(0);
    expect(diagnostics.hotspot.magnitudeVm).toBe(fieldSolve.field.maxElectricFieldVm);
    expect(diagnostics.refinementSuggestions.map((item) => item.id)).toContain("hotspot");
    expect(diagnostics.refinementSuggestions.map((item) => item.id)).toContain("trace-left-edge");
  });
});
