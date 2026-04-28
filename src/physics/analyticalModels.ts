import type { RfGeometry } from "../domain/geometry";
import { calculateMicrostrip, type MicrostripResult } from "./microstrip";
import { calculateStripline, type StriplineResult } from "./stripline";

export type AnalyticalModelId = "microstrip" | "stripline";
export type AnalyticalTransmissionLineResult = MicrostripResult | StriplineResult;

export type AnalyticalModelDescriptor = {
  id: AnalyticalModelId;
  label: string;
  geometryLabels: {
    transverseDimension: string;
    transverseHelp: string;
    traceWidth: string;
    traceLength: string;
  };
  assumptions: string[];
};

export const analyticalModels: AnalyticalModelDescriptor[] = [
  {
    id: "microstrip",
    label: "Microstrip",
    geometryLabels: {
      transverseDimension: "Substrate height (mm)",
      transverseHelp: "Distance from signal trace to the ground plane. Used as h in the microstrip equations.",
      traceWidth: "Trace width (mm)",
      traceLength: "Trace length (mm)"
    },
    assumptions: [
      "single trace over ground plane",
      "quasi-static effective dielectric approximation",
      "zero-thickness impedance approximation used as validation baseline",
      "finite-thickness estimate reported separately as model variance"
    ]
  },
  {
    id: "stripline",
    label: "Symmetric stripline",
    geometryLabels: {
      transverseDimension: "Ground-plane spacing b (mm)",
      transverseHelp: "Distance between the two stripline ground planes. The trace is assumed centered in this dielectric region.",
      traceWidth: "Strip width (mm)",
      traceLength: "Strip length (mm)"
    },
    assumptions: [
      "trace centered between two ground planes",
      "homogeneous dielectric TEM mode",
      "moderate-width closed-form approximation"
    ]
  }
];

export function getAnalyticalModelDescriptor(modelId: AnalyticalModelId): AnalyticalModelDescriptor {
  const descriptor = analyticalModels.find((model) => model.id === modelId);
  if (!descriptor) {
    throw new Error(`Unknown analytical model: ${modelId}`);
  }
  return descriptor;
}

export function calculateAnalyticalModelForGeometry({
  modelId,
  geometry,
  frequencyHz
}: {
  modelId: AnalyticalModelId;
  geometry: RfGeometry;
  frequencyHz: number;
}): AnalyticalTransmissionLineResult {
  const trace = geometry.traces[0];
  if (!trace) {
    throw new Error("Analytical transmission-line validation requires at least one trace.");
  }

  if (modelId === "stripline") {
    return calculateStripline({
      traceWidthM: trace.widthM,
      dielectricHeightM: geometry.stack.substrateHeightM,
      traceLengthM: trace.lengthM,
      conductorThicknessM: geometry.stack.conductorThicknessM,
      relativePermittivity: geometry.stack.substrate.relativePermittivity,
      lossTangent: geometry.stack.substrate.lossTangent,
      conductorConductivitySPerM: geometry.stack.conductor.conductivitySiemensPerMeter,
      frequencyHz
    });
  }

  return calculateMicrostrip({
    traceWidthM: trace.widthM,
    substrateHeightM: geometry.stack.substrateHeightM,
    traceLengthM: trace.lengthM,
    conductorThicknessM: geometry.stack.conductorThicknessM,
    relativePermittivity: geometry.stack.substrate.relativePermittivity,
    lossTangent: geometry.stack.substrate.lossTangent,
    conductorConductivitySPerM: geometry.stack.conductor.conductivitySiemensPerMeter,
    frequencyHz
  });
}
