import { calculatePolylineLength, mmToM, type RfGeometry, type TracePathPoint } from "../domain/geometry";
import type { Material } from "../domain/materials";
import type { AnalyticalModelId } from "./analyticalModels";

export type GeometryPreset = {
  id: string;
  label: string;
  modelId: AnalyticalModelId;
  description: string;
  geometry: RfGeometry;
};

export function buildGeometryPresets(substrate: Material, conductor: Material): GeometryPreset[] {
  const curvedCenterline: TracePathPoint[] = [
    { xM: mmToM(4), yM: mmToM(7.8) },
    { xM: mmToM(17), yM: mmToM(7.8) },
    { xM: mmToM(21), yM: mmToM(13.2) },
    { xM: mmToM(30), yM: mmToM(13.2) },
    { xM: mmToM(34), yM: mmToM(9.1) },
    { xM: mmToM(44), yM: mmToM(9.1) }
  ];

  return [
    {
      id: "microstrip-50-ro4350b",
      label: "50 ohm microstrip",
      modelId: "microstrip",
      description: "RO4350B-like 1.524 mm substrate with a 3.4 mm top trace.",
      geometry: {
        unit: "m",
        boardWidthM: mmToM(22),
        boardLengthM: mmToM(48),
        traces: [
          {
            id: "trace-1",
            name: "50 ohm microstrip",
            xM: mmToM(4),
            yM: mmToM(10),
            widthM: mmToM(3.4),
            lengthM: mmToM(40),
            thicknessM: mmToM(0.035)
          }
        ],
        ports: [
          { id: "port-1", label: "P1", xM: mmToM(4), yM: mmToM(11.7), impedanceOhms: 50 },
          { id: "port-2", label: "P2", xM: mmToM(44), yM: mmToM(11.7), impedanceOhms: 50 }
        ],
        vias: [{ id: "via-1", xM: mmToM(26), yM: mmToM(6), diameterM: mmToM(0.6) }],
        stack: {
          substrateHeightM: mmToM(1.524),
          conductorThicknessM: mmToM(0.035),
          substrate,
          conductor,
          hasGroundPlane: true
        }
      }
    },
    {
      id: "curved-microstrip-50-ro4350b",
      label: "Curved 50 ohm microstrip",
      modelId: "microstrip",
      description: "Path-aware microstrip with two bends; validation uses total centerline length.",
      geometry: {
        unit: "m",
        boardWidthM: mmToM(22),
        boardLengthM: mmToM(48),
        traces: [
          {
            id: "trace-curve-1",
            name: "curved 50 ohm microstrip",
            xM: curvedCenterline[0].xM,
            yM: curvedCenterline[0].yM - mmToM(3.4) / 2,
            widthM: mmToM(3.4),
            lengthM: calculatePolylineLength(curvedCenterline),
            thicknessM: mmToM(0.035),
            centerline: curvedCenterline
          }
        ],
        ports: [
          { id: "port-1", label: "P1", xM: curvedCenterline[0].xM, yM: curvedCenterline[0].yM, impedanceOhms: 50 },
          { id: "port-2", label: "P2", xM: curvedCenterline[curvedCenterline.length - 1].xM, yM: curvedCenterline[curvedCenterline.length - 1].yM, impedanceOhms: 50 }
        ],
        vias: [{ id: "via-1", xM: mmToM(26), yM: mmToM(6), diameterM: mmToM(0.6) }],
        stack: {
          substrateHeightM: mmToM(1.524),
          conductorThicknessM: mmToM(0.035),
          substrate,
          conductor,
          hasGroundPlane: true
        }
      }
    },
    {
      id: "stripline-50-ro4350b",
      label: "50 ohm stripline",
      modelId: "stripline",
      description: "Symmetric stripline with 3.0 mm ground-plane spacing and a 1.71 mm centered strip.",
      geometry: {
        unit: "m",
        boardWidthM: mmToM(22),
        boardLengthM: mmToM(48),
        traces: [
          {
            id: "trace-1",
            name: "50 ohm stripline",
            xM: mmToM(4),
            yM: mmToM(10.145),
            widthM: mmToM(1.71),
            lengthM: mmToM(40),
            thicknessM: mmToM(0.035)
          }
        ],
        ports: [
          { id: "port-1", label: "P1", xM: mmToM(4), yM: mmToM(11), impedanceOhms: 50 },
          { id: "port-2", label: "P2", xM: mmToM(44), yM: mmToM(11), impedanceOhms: 50 }
        ],
        vias: [],
        stack: {
          substrateHeightM: mmToM(3),
          conductorThicknessM: mmToM(0.035),
          substrate,
          conductor,
          hasGroundPlane: true
        }
      }
    }
  ];
}

export function clonePresetGeometry(preset: GeometryPreset): RfGeometry {
  return {
    ...preset.geometry,
    traces: preset.geometry.traces.map((trace) => ({
      ...trace,
      centerline: trace.centerline?.map((point) => ({ ...point }))
    })),
    ports: preset.geometry.ports.map((port) => ({ ...port })),
    vias: preset.geometry.vias.map((via) => ({ ...via })),
    stack: {
      ...preset.geometry.stack,
      substrate: { ...preset.geometry.stack.substrate },
      conductor: { ...preset.geometry.stack.conductor }
    }
  };
}
