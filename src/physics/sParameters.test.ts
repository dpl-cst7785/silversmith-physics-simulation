import { describe, expect, it } from "vitest";
import {
  deriveSParameterMetrics,
  impedanceFromReflection,
  insertionLossDb,
  magnitudeDb,
  parseTouchstone,
  returnLossDb,
  vswrFromReflection
} from "./sParameters";

describe("parseTouchstone", () => {
  it("parses two port RI data", () => {
    const data = parseTouchstone(
      `
! example data
# GHZ S RI R 50
1.0 0.1 0 0.9 0 0.9 0 0.1 0
2.0 0.2 0 0.8 0 0.8 0 0.2 0
`,
      "line.s2p"
    );

    expect(data.ports).toBe(2);
    expect(data.format).toBe("ri");
    expect(data.rows).toHaveLength(2);
    expect(data.rows[0].frequencyHz).toBe(1e9);
    expect(data.rows[0].values[0]).toEqual({ real: 0.1, imaginary: 0 });
  });

  it("converts magnitude angle data into complex values", () => {
    const data = parseTouchstone("# MHZ S MA R 50\n1000 1 90", "input.s1p");

    expect(data.rows[0].frequencyHz).toBe(1e9);
    expect(data.rows[0].values[0].real).toBeCloseTo(0);
    expect(data.rows[0].values[0].imaginary).toBeCloseTo(1);
  });

  it("computes common RF display metrics", () => {
    expect(magnitudeDb({ real: 0.5, imaginary: 0 })).toBeCloseTo(-6.0206, 3);
    expect(returnLossDb({ real: 0.5, imaginary: 0 })).toBeCloseTo(6.0206, 3);
    expect(insertionLossDb({ real: 0.8, imaginary: 0 })).toBeCloseTo(1.9382, 3);
    expect(vswrFromReflection({ real: 0.5, imaginary: 0 })).toBeCloseTo(3);
  });

  it("derives RF metrics from S-parameters", () => {
    const metrics = deriveSParameterMetrics({
      s11: { real: 0.2, imaginary: 0 },
      s21: { real: 0.9, imaginary: 0 },
      referenceOhms: 50
    });

    expect(metrics.returnLossDb).toBeCloseTo(13.979, 3);
    expect(metrics.insertionLossDb).toBeCloseTo(0.915, 3);
    expect(metrics.vswr).toBeCloseTo(1.5);
    expect(metrics.inputImpedance.real).toBeCloseTo(75);
  });

  it("extracts impedance from a reflection coefficient", () => {
    const zin = impedanceFromReflection({ real: 0.2, imaginary: 0 }, 50);

    expect(zin.real).toBeCloseTo(75);
    expect(zin.imaginary).toBeCloseTo(0);
  });

  it("rejects unsupported port counts", () => {
    expect(() => parseTouchstone("# GHZ S MA R 50\n1 0 0", "bad.s3p")).toThrow(/Only .s1p and .s2p/);
  });
});
