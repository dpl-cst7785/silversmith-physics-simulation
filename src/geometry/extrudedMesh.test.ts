import { describe, expect, it } from "vitest";
import { defaultGeometry, mmToM } from "../domain/geometry";
import { copper, defaultSubstrate } from "../domain/materials";
import { buildExtrudedGeometryMesh } from "./extrudedMesh";

describe("extruded geometry mesh", () => {
  it("builds substrate, ground, trace, via, and port solids from RF geometry", () => {
    const mesh = buildExtrudedGeometryMesh(defaultGeometry(defaultSubstrate, copper));

    expect(mesh.unit).toBe("m");
    expect(mesh.solids.map((solid) => solid.kind)).toEqual([
      "substrate",
      "ground-plane",
      "trace",
      "via",
      "port",
      "port"
    ]);
    expect(mesh.summary.solids).toBe(6);
    expect(mesh.summary.dielectricSolids).toBe(1);
    expect(mesh.summary.conductorSolids).toBe(3);
    expect(mesh.summary.portSolids).toBe(2);
  });

  it("extrudes trace dimensions from editable geometry rather than hardcoded constants", () => {
    const geometry = defaultGeometry(defaultSubstrate, copper);
    geometry.traces[0].widthM = mmToM(2.8);
    geometry.traces[0].lengthM = mmToM(25);

    const mesh = buildExtrudedGeometryMesh(geometry);
    const trace = mesh.solids.find((solid) => solid.kind === "trace");

    expect(trace?.metadata.widthM).toBe(mmToM(2.8));
    expect(trace?.metadata.lengthM).toBe(mmToM(25));
    expect(trace?.vertices[1].xM).toBeCloseTo(geometry.traces[0].xM + mmToM(25));
    expect(trace?.vertices[4].zM).toBeCloseTo(geometry.traces[0].yM + mmToM(2.8));
  });
});
