import { describe, expect, it } from "vitest";
import { getAnalyticalModelDescriptor } from "./analyticalModels";

describe("analytical model descriptors", () => {
  it("describes microstrip geometry using substrate height", () => {
    const descriptor = getAnalyticalModelDescriptor("microstrip");

    expect(descriptor.geometryLabels.transverseDimension).toContain("Substrate height");
    expect(descriptor.assumptions.join(" ")).toContain("ground plane");
  });

  it("describes stripline geometry using ground-plane spacing", () => {
    const descriptor = getAnalyticalModelDescriptor("stripline");

    expect(descriptor.geometryLabels.transverseDimension).toContain("Ground-plane spacing");
    expect(descriptor.geometryLabels.transverseHelp).toContain("centered");
  });
});
