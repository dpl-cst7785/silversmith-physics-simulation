import type { RfGeometry } from "../domain/geometry";
import {
  calculateAnalyticalModelForGeometry,
  type AnalyticalModelId,
  type AnalyticalTransmissionLineResult
} from "../physics/analyticalModels";
import { reflectionCoefficientFromImpedance, type Complex } from "../physics/sParameters";

export type SimulationJobStatus = "queued" | "running" | "completed" | "failed";
export type ConvergenceStatus = "converged" | "not-converged" | "not-applicable";

export type SimulationJob = {
  id: string;
  status: SimulationJobStatus;
  createdAt: string;
  artifactUri?: string;
  error?: string;
};

export type SParameterPoint = {
  frequencyHz: number;
  s11: Complex;
  s21: Complex;
  extractedImpedanceOhms: number;
};

export type SimulationMetadata = {
  solverName: string;
  runtimeMs: number;
  convergenceStatus: ConvergenceStatus;
  assumptions: string[];
};

export type SimulationResult = {
  metadata: SimulationMetadata;
  points: SParameterPoint[];
};

export type SolverInput = {
  geometry: RfGeometry;
  frequenciesHz: number[];
  referenceImpedanceOhms?: number;
  modelId?: AnalyticalModelId;
};

export interface SolverAdapter {
  name: string;
  enqueue(input: SolverInput): Promise<SimulationJob>;
  run(input: SolverInput): Promise<SimulationResult>;
}

export class MockTransmissionLineSolver implements SolverAdapter {
  name = "mock-transmission-line-quasi-static";

  async enqueue(): Promise<SimulationJob> {
    return {
      id: `local-${Date.now()}`,
      status: "completed",
      createdAt: new Date().toISOString(),
      artifactUri: "local://mock-transmission-line-sparameters"
    };
  }

  async run(input: SolverInput): Promise<SimulationResult> {
    const started = performance.now();
    const trace = input.geometry.traces[0];
    if (!trace) throw new Error("MockTransmissionLineSolver requires one trace.");

    const modelId = input.modelId ?? "microstrip";
    const referenceImpedanceOhms = input.referenceImpedanceOhms ?? input.geometry.ports[0]?.impedanceOhms ?? 50;

    const points = input.frequenciesHz.map((frequencyHz): SParameterPoint => {
      const analytical = analyticalAtFrequency(input.geometry, frequencyHz, modelId);
      const ripple = 0.006 * Math.sin(analytical.electricalLengthRad * 1.7);
      const extractedImpedanceOhms = analytical.characteristicImpedanceOhms * (1 + ripple);
      const s11 = reflectionCoefficientFromImpedance(extractedImpedanceOhms, referenceImpedanceOhms);
      const lossLinear = 10 ** (-analytical.estimatedLossDb / 20);
      const phase = -analytical.electricalLengthRad;

      return {
        frequencyHz,
        s11,
        s21: {
          real: lossLinear * Math.cos(phase) * (1 - Math.abs(s11.real)),
          imaginary: lossLinear * Math.sin(phase) * (1 - Math.abs(s11.real))
        },
        extractedImpedanceOhms
      };
    });

    return {
      metadata: {
        solverName: this.name,
        runtimeMs: Math.max(0.01, performance.now() - started),
        convergenceStatus: "not-applicable",
        assumptions: [
          `S-parameters are generated from the analytical ${modelId} result.`,
          "Mismatch is derived from Z0 relative to the selected port reference impedance.",
          "Insertion loss uses the analytical estimated dielectric and conductor loss.",
          "No meshing, radiation, launch discontinuity, coupling, or enclosure effects are modeled."
        ]
      },
      points
    };
  }
}

export const MockMicrostripSolver = MockTransmissionLineSolver;
export const MockQuasiStaticSolver = MockTransmissionLineSolver;

function analyticalAtFrequency(
  geometry: RfGeometry,
  frequencyHz: number,
  modelId: AnalyticalModelId
): AnalyticalTransmissionLineResult {
  const trace = geometry.traces[0];
  if (!trace) throw new Error("Transmission-line analytical model requires one trace.");

  return calculateAnalyticalModelForGeometry({
    modelId,
    geometry,
    frequencyHz
  });
}
