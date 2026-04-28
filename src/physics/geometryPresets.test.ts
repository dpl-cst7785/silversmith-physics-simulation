import { describe, expect, it } from "vitest";
import { copper, defaultSubstrate } from "../domain/materials";
import { calculateAnalyticalModelForGeometry } from "./analyticalModels";
import { buildGeometryPresets } from "./geometryPresets";

describe("geometry presets", () => {
  it("provides model-specific starting points", () => {
    const presets = buildGeometryPresets(defaultSubstrate, copper);

    expect(presets.map((preset) => preset.modelId)).toEqual(["microstrip", "stripline"]);
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
