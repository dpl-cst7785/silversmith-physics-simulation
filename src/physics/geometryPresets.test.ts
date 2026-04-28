import { describe, expect, it } from "vitest";
import { copper, defaultSubstrate } from "../domain/materials";
import { calculateAnalyticalModelForGeometry } from "./analyticalModels";
import { buildGeometryPresets } from "./geometryPresets";

describe("geometry presets", () => {
  it("provides model-specific starting points", () => {
    const presets = buildGeometryPresets(defaultSubstrate, copper);

    expect(presets.map((preset) => preset.modelId)).toEqual(["microstrip", "microstrip", "stripline"]);
  });

  it("provides a curved microstrip preset with centerline length for validation", () => {
    const preset = buildGeometryPresets(defaultSubstrate, copper).find((item) => item.id === "curved-microstrip-50-ro4350b");

    expect(preset).toBeDefined();
    expect(preset?.geometry.traces[0].centerline?.length).toBeGreaterThan(2);
    expect(preset?.geometry.traces[0].lengthM).toBeGreaterThan(preset?.geometry.boardLengthM ? preset.geometry.boardLengthM * 0.7 : 0);
    expect(preset?.geometry.ports[0].yM).toBe(preset?.geometry.traces[0].centerline?.[0].yM);
  });

  it("microstrip preset calculates near 50 ohms", () => {
    const preset = buildGeometryPresets(defaultSubstrate, copper).find((item) => item.modelId === "microstrip");
    if (!preset) throw new Error("missing microstrip preset");

    const result = calculateAnalyticalModelForGeometry({
      modelId: preset.modelId,
      geometry: preset.geometry,
      frequencyHz: 2.4e9
    });

    expect(result.characteristicImpedanceOhms).toBeCloseTo(50.78, 2);
  });

  it("stripline preset calculates near 50 ohms", () => {
    const preset = buildGeometryPresets(defaultSubstrate, copper).find((item) => item.modelId === "stripline");
    if (!preset) throw new Error("missing stripline preset");

    const result = calculateAnalyticalModelForGeometry({
      modelId: preset.modelId,
      geometry: preset.geometry,
      frequencyHz: 2.4e9
    });

    expect(result.characteristicImpedanceOhms).toBeCloseTo(49.97, 2);
  });
});
