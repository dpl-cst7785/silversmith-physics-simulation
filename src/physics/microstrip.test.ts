import { describe, expect, it } from "vitest";
import {
  calculateEffectiveRelativePermittivity,
  calculateFiniteThicknessEffectiveWidth,
  calculateMicrostrip
} from "./microstrip";

const input = {
  traceWidthM: 0.0034,
  substrateHeightM: 0.001524,
  traceLengthM: 0.04,
  conductorThicknessM: 0.000035,
  relativePermittivity: 3.48,
  lossTangent: 0.0037,
  conductorConductivitySPerM: 5.8e7,
  frequencyHz: 2.4e9
};

describe("microstrip analytical model", () => {
  it("calculates effective dielectric constant", () => {
    expect(calculateEffectiveRelativePermittivity(input)).toBeCloseTo(2.731, 3);
  });

  it("calculates characteristic impedance for a practical 50 ohm geometry", () => {
    const result = calculateMicrostrip(input);

    expect(result.characteristicImpedanceOhms).toBeCloseTo(50.78, 2);
    expect(result.zeroThicknessCharacteristicImpedanceOhms).toBeCloseTo(50.78, 2);
    expect(result.effectiveRelativePermittivity).toBeCloseTo(2.731, 3);
  });

  it("calculates a finite-thickness corrected impedance estimate", () => {
    const result = calculateMicrostrip(input);

    expect(result.finiteThickness.effectiveTraceWidthM).toBeGreaterThan(input.traceWidthM);
    expect(result.finiteThickness.deltaWidthM).toBeCloseTo(0.0000903, 7);
    expect(result.finiteThickness.characteristicImpedanceOhms).toBeLessThan(result.characteristicImpedanceOhms);
    expect(result.finiteThickness.percentDeltaFromZeroThickness).toBeLessThan(0);
  });

  it("calculates finite-thickness effective width directly", () => {
    const correction = calculateFiniteThicknessEffectiveWidth(input);

    expect(correction.deltaWidthM).toBeGreaterThan(0);
    expect(correction.effectiveTraceWidthM).toBe(input.traceWidthM + correction.deltaWidthM);
  });

  it("calculates phase velocity, wavelength, and electrical length", () => {
    const result = calculateMicrostrip(input);

    expect(result.phaseVelocityMPerS).toBeCloseTo(181_410_558, -5);
    expect(result.wavelengthM).toBeCloseTo(0.07559, 4);
    expect(result.electricalLengthRad).toBeCloseTo(3.325, 3);
    expect(result.propagationDelayS).toBeCloseTo(2.205e-10, 13);
  });

  it("estimates positive RF loss", () => {
    expect(calculateMicrostrip(input).estimatedLossDb).toBeGreaterThan(0);
  });

  it("rejects invalid geometry", () => {
    expect(() =>
      calculateMicrostrip({
        ...input,
        traceWidthM: 0
      })
    ).toThrow(/traceWidthM/);
  });
});
