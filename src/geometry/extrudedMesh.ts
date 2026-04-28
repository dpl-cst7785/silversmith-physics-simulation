import type { RfGeometry } from "../domain/geometry";

export type MeshMaterialRole = "dielectric" | "conductor" | "port";
export type MeshSolidKind = "substrate" | "ground-plane" | "trace" | "via" | "port";

export type MeshVertex = {
  xM: number;
  yM: number;
  zM: number;
};

export type MeshFace = [number, number, number, number];

export type ExtrudedMeshSolid = {
  id: string;
  kind: MeshSolidKind;
  materialRole: MeshMaterialRole;
  materialName: string;
  vertices: MeshVertex[];
  faces: MeshFace[];
  metadata: Record<string, string | number | boolean>;
};

export type ExtrudedGeometryMesh = {
  unit: "m";
  solids: ExtrudedMeshSolid[];
  summary: {
    solids: number;
    vertices: number;
    faces: number;
    conductorSolids: number;
    dielectricSolids: number;
    portSolids: number;
  };
};

export function buildExtrudedGeometryMesh(geometry: RfGeometry): ExtrudedGeometryMesh {
  const solids: ExtrudedMeshSolid[] = [
    buildBoxSolid({
      id: "substrate",
      kind: "substrate",
      materialRole: "dielectric",
      materialName: geometry.stack.substrate.name,
      minXM: 0,
      maxXM: geometry.boardLengthM,
      minYM: 0,
      maxYM: geometry.stack.substrateHeightM,
      minZM: 0,
      maxZM: geometry.boardWidthM,
      metadata: {
        relativePermittivity: geometry.stack.substrate.relativePermittivity,
        lossTangent: geometry.stack.substrate.lossTangent
      }
    })
  ];

  if (geometry.stack.hasGroundPlane) {
    solids.push(
      buildBoxSolid({
        id: "ground-plane",
        kind: "ground-plane",
        materialRole: "conductor",
        materialName: geometry.stack.conductor.name,
        minXM: 0,
        maxXM: geometry.boardLengthM,
        minYM: -geometry.stack.conductorThicknessM,
        maxYM: 0,
        minZM: 0,
        maxZM: geometry.boardWidthM,
        metadata: {
          conductivitySPerM: geometry.stack.conductor.conductivitySiemensPerMeter
        }
      })
    );
  }

  geometry.traces.forEach((trace) => {
    solids.push(
      buildBoxSolid({
        id: trace.id,
        kind: "trace",
        materialRole: "conductor",
        materialName: geometry.stack.conductor.name,
        minXM: trace.xM,
        maxXM: trace.xM + trace.lengthM,
        minYM: geometry.stack.substrateHeightM,
        maxYM: geometry.stack.substrateHeightM + trace.thicknessM,
        minZM: trace.yM,
        maxZM: trace.yM + trace.widthM,
        metadata: {
          name: trace.name,
          widthM: trace.widthM,
          lengthM: trace.lengthM,
          conductivitySPerM: geometry.stack.conductor.conductivitySiemensPerMeter
        }
      })
    );
  });

  geometry.vias.forEach((via) => {
    solids.push(buildCylindricalViaSolid(geometry, via));
  });

  geometry.ports.forEach((port) => {
    const radiusM = Math.min(geometry.boardWidthM, geometry.boardLengthM) * 0.015;
    solids.push(
      buildBoxSolid({
        id: port.id,
        kind: "port",
        materialRole: "port",
        materialName: "port",
        minXM: port.xM - radiusM,
        maxXM: port.xM + radiusM,
        minYM: geometry.stack.substrateHeightM,
        maxYM: geometry.stack.substrateHeightM + radiusM * 2,
        minZM: port.yM - radiusM,
        maxZM: port.yM + radiusM,
        metadata: {
          label: port.label,
          impedanceOhms: port.impedanceOhms
        }
      })
    );
  });

  return {
    unit: "m",
    solids,
    summary: summarizeSolids(solids)
  };
}

function buildCylindricalViaSolid(geometry: RfGeometry, via: RfGeometry["vias"][number]): ExtrudedMeshSolid {
  const segments = 16;
  const radiusM = via.diameterM / 2;
  const bottomY = 0;
  const topY = geometry.stack.substrateHeightM + geometry.stack.conductorThicknessM;
  const vertices: MeshVertex[] = [];

  for (let index = 0; index < segments; index += 1) {
    const angle = (2 * Math.PI * index) / segments;
    const xM = via.xM + radiusM * Math.cos(angle);
    const zM = via.yM + radiusM * Math.sin(angle);
    vertices.push({ xM, yM: bottomY, zM }, { xM, yM: topY, zM });
  }

  const faces: MeshFace[] = [];
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    faces.push([index * 2, next * 2, next * 2 + 1, index * 2 + 1]);
  }

  return {
    id: via.id,
    kind: "via",
    materialRole: "conductor",
    materialName: geometry.stack.conductor.name,
    vertices,
    faces,
    metadata: {
      diameterM: via.diameterM,
      conductivitySPerM: geometry.stack.conductor.conductivitySiemensPerMeter
    }
  };
}

function buildBoxSolid({
  id,
  kind,
  materialRole,
  materialName,
  minXM,
  maxXM,
  minYM,
  maxYM,
  minZM,
  maxZM,
  metadata
}: {
  id: string;
  kind: MeshSolidKind;
  materialRole: MeshMaterialRole;
  materialName: string;
  minXM: number;
  maxXM: number;
  minYM: number;
  maxYM: number;
  minZM: number;
  maxZM: number;
  metadata: ExtrudedMeshSolid["metadata"];
}): ExtrudedMeshSolid {
  const vertices = [
    { xM: minXM, yM: minYM, zM: minZM },
    { xM: maxXM, yM: minYM, zM: minZM },
    { xM: maxXM, yM: maxYM, zM: minZM },
    { xM: minXM, yM: maxYM, zM: minZM },
    { xM: minXM, yM: minYM, zM: maxZM },
    { xM: maxXM, yM: minYM, zM: maxZM },
    { xM: maxXM, yM: maxYM, zM: maxZM },
    { xM: minXM, yM: maxYM, zM: maxZM }
  ];

  return {
    id,
    kind,
    materialRole,
    materialName,
    vertices,
    faces: [
      [0, 1, 2, 3],
      [4, 7, 6, 5],
      [0, 4, 5, 1],
      [3, 2, 6, 7],
      [1, 5, 6, 2],
      [0, 3, 7, 4]
    ],
    metadata
  };
}

function summarizeSolids(solids: ExtrudedMeshSolid[]): ExtrudedGeometryMesh["summary"] {
  return {
    solids: solids.length,
    vertices: solids.reduce((sum, solid) => sum + solid.vertices.length, 0),
    faces: solids.reduce((sum, solid) => sum + solid.faces.length, 0),
    conductorSolids: solids.filter((solid) => solid.materialRole === "conductor").length,
    dielectricSolids: solids.filter((solid) => solid.materialRole === "dielectric").length,
    portSolids: solids.filter((solid) => solid.materialRole === "port").length
  };
}
