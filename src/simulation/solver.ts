import type { RfGeometry } from "../domain/geometry";
import { buildExtrudedGeometryMesh, type ExtrudedGeometryMesh } from "../geometry/extrudedMesh";
import {
  calculateAnalyticalModelForGeometry,
  type AnalyticalModelId,
  type AnalyticalTransmissionLineResult
} from "../physics/analyticalModels";
import { reflectionCoefficientFromImpedance, type Complex } from "../physics/sParameters";
import { solveMicrostripFiniteDifference, type FieldSolverResult } from "./finiteDifferenceMicrostrip";

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
  matchedLineLossDb: number;
};

export type SimulationMetadata = {
  solverName: string;
  runtimeMs: number;
  convergenceStatus: ConvergenceStatus;
  assumptions: string[];
  meshSummary: ExtrudedGeometryMesh["summary"];
  fieldSolve?: {
    method: string;
    grid: FieldSolverResult["grid"];
    iterations: number;
    residual: number;
    effectiveRelativePermittivity: number;
    capacitancePerMeterFPerM: number;
    airCapacitancePerMeterFPerM: number;
  };
};

export type SimulationResult = {
  metadata: SimulationMetadata;
  points: SParameterPoint[];
};

export type SolverInput = {
  geometry: RfGeometry;
  mesh?: ExtrudedGeometryMesh;
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
    const mesh = input.mesh ?? buildExtrudedGeometryMesh(input.geometry);
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
        extractedImpedanceOhms,
        matchedLineLossDb: analytical.estimatedLossDb
      };
    });

    return {
      metadata: {
        solverName: this.name,
        runtimeMs: Math.max(0.01, performance.now() - started),
        convergenceStatus: "not-applicable",
        meshSummary: mesh.summary,
        assumptions: [
          `S-parameters are generated from the analytical ${modelId} result.`,
          `Geometry mesh contains ${mesh.summary.solids} extruded solids and ${mesh.summary.faces} faces.`,
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

export class FiniteDifferenceMicrostripSolver implements SolverAdapter {
  name = "finite-difference-microstrip-quasi-static";

  async enqueue(): Promise<SimulationJob> {
    return {
      id: `local-fd-${Date.now()}`,
      status: "completed",
      createdAt: new Date().toISOString(),
      artifactUri: "local://finite-difference-microstrip-sparameters"
    };
  }

  async run(input: SolverInput): Promise<SimulationResult> {
    const started = performance.now();
    const trace = input.geometry.traces[0];
    if (!trace) throw new Error("FiniteDifferenceMicrostripSolver requires one trace.");
    if (input.modelId && input.modelId !== "microstrip") {
      throw new Error("FiniteDifferenceMicrostripSolver currently supports microstrip geometry only.");
    }

    const mesh = input.mesh ?? buildExtrudedGeometryMesh(input.geometry);
    const fieldSolve = solveMicrostripFiniteDifference(input.geometry);
    const referenceImpedanceOhms = input.referenceImpedanceOhms ?? input.geometry.ports[0]?.impedanceOhms ?? 50;

    const points = input.frequenciesHz.map((frequencyHz): SParameterPoint => {
      const analytical = analyticalAtFrequency(input.geometry, frequencyHz, "microstrip");
      const extractedImpedanceOhms = fieldSolve.characteristicImpedanceOhms;
      const s11 = reflectionCoefficientFromImpedance(extractedImpedanceOhms, referenceImpedanceOhms);
      const phaseVelocity = 299_792_458 / Math.sqrt(fieldSolve.effectiveRelativePermittivity);
      const electricalLengthRad = (2 * Math.PI * trace.lengthM * frequencyHz) / phaseVelocity;
      const lossLinear = 10 ** (-analytical.estimatedLossDb / 20);

      return {
        frequencyHz,
        s11,
        s21: {
          real: lossLinear * Math.cos(-electricalLengthRad) * (1 - Math.abs(s11.real)),
          imaginary: lossLinear * Math.sin(-electricalLengthRad) * (1 - Math.abs(s11.real))
        },
        extractedImpedanceOhms,
        matchedLineLossDb: analytical.estimatedLossDb
      };
    });

    return {
      metadata: {
        solverName: this.name,
        runtimeMs: Math.max(0.01, performance.now() - started),
        convergenceStatus: fieldSolve.converged ? "converged" : "not-converged",
        meshSummary: mesh.summary,
        fieldSolve: {
          method: "2D finite-difference SOR solve of div(epsilon grad V)=0 with charge-based capacitance extraction",
          grid: fieldSolve.grid,
          iterations: fieldSolve.iterations,
          residual: fieldSolve.residual,
          effectiveRelativePermittivity: fieldSolve.effectiveRelativePermittivity,
          capacitancePerMeterFPerM: fieldSolve.capacitancePerMeterFPerM,
          airCapacitancePerMeterFPerM: fieldSolve.airCapacitancePerMeterFPerM
        },
        assumptions: [
          "S-parameters use impedance extracted from a 2D finite-difference electrostatic field solve.",
          `Geometry mesh contains ${mesh.summary.solids} extruded solids and ${mesh.summary.faces} faces.`,
          "The numerical solve is quasi-static and extracts capacitance per unit length from trace charge.",
          "Loss is still estimated with the analytical dielectric/conductor loss model.",
          "No radiation, launch discontinuity, surface roughness, dispersion, or full-wave modal effects are modeled yet."
        ]
      },
      points
    };
  }
}

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
