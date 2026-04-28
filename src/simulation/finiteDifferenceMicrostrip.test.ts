import { describe, expect, it } from "vitest";
import { defaultGeometry, mmToM } from "../domain/geometry";
import { copper, defaultSubstrate } from "../domain/materials";
import { calculateMicrostrip } from "../physics/microstrip";
import { solveMicrostripFiniteDifference } from "./finiteDifferenceMicrostrip";

describe("finite-difference microstrip field solver", () => {
  it("solves a quasi-static microstrip field and extracts impedance near the analytical model", () => {
    const geometry = defaultGeometry(defaultSubstrate, copper);
    const numerical = solveMicrostripFiniteDifference(geometry, {
      cellsX: 72,
      cellsY: 56,
      maxIterations: 8_000,
      tolerance: 5e-5
    });
    const trace = geometry.traces[0];
    const analytical = calculateMicrostrip({
      traceWidthM: trace.widthM,
      substrateHeightM: geometry.stack.substrateHeightM,
      traceLengthM: trace.lengthM,
      conductorThicknessM: geometry.stack.conductorThicknessM,
      relativePermittivity: geometry.stack.substrate.relativePermittivity,
      lossTangent: geometry.stack.substrate.lossTangent,
      conductorConductivitySPerM: geometry.stack.conductor.conductivitySiemensPerMeter,
      frequencyHz: 3e9
    });

    expect(numerical.converged).toBe(true);
    expect(numerical.characteristicImpedanceOhms).toBeGreaterThan(35);
    expect(numerical.characteristicImpedanceOhms).toBeLessThan(70);
    expect(
      Math.abs(numerical.characteristicImpedanceOhms - analytical.characteristicImpedanceOhms) /
        analytical.characteristicImpedanceOhms
    ).toBeLessThan(0.35);
    expect(numerical.effectiveRelativePermittivity).toBeGreaterThan(1);
    expect(numerical.effectiveRelativePermittivity).toBeLessThan(geometry.stack.substrate.relativePermittivity);
    expect(numerical.field.potentialV).toHaveLength(numerical.grid.cellsX * numerical.grid.cellsY);
    expect(numerical.field.electricFieldXVm).toHaveLength(numerical.field.potentialV.length);
    expect(numerical.field.maxElectricFieldVm).toBeGreaterThan(0);
    expect(numerical.grid.traceMinXM).toBe(geometry.traces[0].yM);
  });

  it("responds physically to trace-width changes", () => {
    const narrow = defaultGeometry(defaultSubstrate, copper);
    narrow.traces[0].widthM = mmToM(2);
    const wide = defaultGeometry(defaultSubstrate, copper);
    wide.traces[0].widthM = mmToM(5);

    const narrowResult = solveMicrostripFiniteDifference(narrow, {
      cellsX: 64,
      cellsY: 48,
      maxIterations: 6_000,
      tolerance: 8e-5
    });
    const wideResult = solveMicrostripFiniteDifference(wide, {
      cellsX: 64,
      cellsY: 48,
      maxIterations: 6_000,
      tolerance: 8e-5
    });

    expect(narrowResult.characteristicImpedanceOhms).toBeGreaterThan(wideResult.characteristicImpedanceOhms);
  });
});
