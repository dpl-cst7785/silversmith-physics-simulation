import { describe, expect, it } from "vitest";
import { calculateStripline } from "./stripline";

const input = {
  traceWidthM: 0.001,
  dielectricHeightM: 0.003,
  traceLengthM: 0.04,
  conductorThicknessM: 0.000035,
  relativePermittivity: 3.48,
  lossTangent: 0.0037,
  conductorConductivitySPerM: 5.8e7,
  frequencyHz: 2.4e9
};

describe("stripline analytical model", () => {
  it("calculates a symmetric stripline characteristic impedance", () => {
    const result = calculateStripline(input);

    expect(result.effectiveRelativePermittivity).toBe(3.48);
    expect(result.characteristicImpedanceOhms).toBeCloseTo(65.25, 2);
  });

  it("calculates TEM phase quantities", () => {
    const result = calculateStripline(input);

    expect(result.phaseVelocityMPerS).toBeCloseTo(160_700_000, -5);
    expect(result.wavelengthM).toBeCloseTo(0.06695, 4);
    expect(result.electricalLengthRad).toBeCloseTo(3.753, 3);
    expect(result.propagationDelayS).toBeCloseTo(2.489e-10, 13);
  });

  it("rejects invalid stripline geometry", () => {
    expect(() => calculateStripline({ ...input, dielectricHeightM: 0 })).toThrow(/dielectricHeightM/);
  });
});
