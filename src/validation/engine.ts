import type { RfGeometry } from "../domain/geometry";
import {
  calculateAnalyticalModelForGeometry,
  type AnalyticalModelId,
  type AnalyticalTransmissionLineResult
} from "../physics/analyticalModels";
import {
  impedanceFromReflection,
  sParameterAtFrequency,
  type TouchstoneData
} from "../physics/sParameters";
import {
  FiniteDifferenceMicrostripSolver,
  MockTransmissionLineSolver,
  type SimulationResult,
  type SolverAdapter,
  type SParameterPoint
} from "../simulation/solver";

export type FrequencySweep = {
  startHz: number;
  stopHz: number;
  points: number;
};

export type ValidationMetric = {
  label: string;
  expectedValue: number;
  observedValue: number;
  unit: string;
  absoluteError: number;
  percentError: number;
  tolerancePercent: number;
  pass: boolean;
  source: "simulation" | "touchstone";
};

export type ValidationResult = {
  modelId: AnalyticalModelId;
  frequencySweep: FrequencySweep;
  analyticalAtCenter: AnalyticalTransmissionLineResult;
  simulation: SimulationResult;
  metrics: ValidationMetric[];
};

export function buildFrequencySweep(sweep: FrequencySweep): number[] {
  if (sweep.points < 2) throw new Error("Frequency sweep requires at least two points.");
  if (sweep.startHz <= 0 || sweep.stopHz <= 0) throw new Error("Frequency sweep bounds must be positive.");
  if (sweep.stopHz <= sweep.startHz) throw new Error("Frequency sweep stop must be greater than start.");

  const step = (sweep.stopHz - sweep.startHz) / (sweep.points - 1);
  return Array.from({ length: sweep.points }, (_, index) => sweep.startHz + index * step);
}

export function centerFrequency(sweep: FrequencySweep): number {
  return (sweep.startHz + sweep.stopHz) / 2;
}

export async function validateMicrostrip(options: {
  modelId?: AnalyticalModelId;
  geometry: RfGeometry;
  sweep?: FrequencySweep;
  solver?: SolverAdapter;
  touchstone?: TouchstoneData | null;
  impedanceTolerancePercent?: number;
}): Promise<ValidationResult> {
  return validateTransmissionLine(options);
}

export async function validateTransmissionLine({
  modelId = "microstrip",
  geometry,
  sweep = { startHz: 1e9, stopHz: 5e9, points: 9 },
  solver = modelId === "microstrip" ? new FiniteDifferenceMicrostripSolver() : new MockTransmissionLineSolver(),
  touchstone,
  impedanceTolerancePercent = modelId === "microstrip" ? 35 : 2
}: {
  modelId?: AnalyticalModelId;
  geometry: RfGeometry;
  sweep?: FrequencySweep;
  solver?: SolverAdapter;
  touchstone?: TouchstoneData | null;
  impedanceTolerancePercent?: number;
}): Promise<ValidationResult> {
  const analyticalAtCenter = calculateTransmissionLineForGeometry({ modelId, geometry, frequencyHz: centerFrequency(sweep) });
  const simulation = await solver.run({
    geometry,
    frequenciesHz: buildFrequencySweep(sweep),
    referenceImpedanceOhms: geometry.ports[0]?.impedanceOhms ?? 50,
    modelId
  });

  const centerPoint = nearestSimulationPoint(simulation.points, centerFrequency(sweep));
  const metrics: ValidationMetric[] = [
    compareValues({
      label: "Characteristic impedance",
      expectedValue: analyticalAtCenter.characteristicImpedanceOhms,
      observedValue: centerPoint.extractedImpedanceOhms,
      unit: "ohms",
      tolerancePercent: impedanceTolerancePercent,
      source: "simulation"
    })
  ];

  const importedS11 = touchstone ? sParameterAtFrequency(touchstone, centerFrequency(sweep), 0) : null;
  if (importedS11) {
    const importedImpedance = impedanceFromReflection(importedS11, touchstone?.referenceOhms ?? 50);
    metrics.push(
      compareValues({
        label: "Imported S11 extracted impedance",
        expectedValue: analyticalAtCenter.characteristicImpedanceOhms,
        observedValue: importedImpedance.real,
        unit: "ohms",
        tolerancePercent: impedanceTolerancePercent,
        source: "touchstone"
      })
    );
  }

  metrics.push(
    compareValues({
      label: "Matched line loss at center",
      expectedValue: -analyticalAtCenter.estimatedLossDb,
      observedValue: -centerPoint.matchedLineLossDb,
      unit: "dB",
      tolerancePercent: 10,
      source: "simulation"
    })
  );

  return {
    modelId,
    frequencySweep: sweep,
    analyticalAtCenter,
    simulation,
    metrics
  };
}

export function compareValues({
  label,
  expectedValue,
  observedValue,
  unit,
  tolerancePercent,
  source
}: {
  label: string;
  expectedValue: number;
  observedValue: number;
  unit: string;
  tolerancePercent: number;
  source: ValidationMetric["source"];
}): ValidationMetric {
  const absoluteError = observedValue - expectedValue;
  const percentError = expectedValue === 0 ? 0 : (absoluteError / expectedValue) * 100;

  return {
    label,
    expectedValue,
    observedValue,
    unit,
    absoluteError,
    percentError,
    tolerancePercent,
    pass: Math.abs(percentError) <= tolerancePercent,
    source
  };
}

export function calculateMicrostripForGeometry(
  geometry: RfGeometry,
  frequencyHz: number
): AnalyticalTransmissionLineResult {
  return calculateTransmissionLineForGeometry({ modelId: "microstrip", geometry, frequencyHz });
}

export function calculateTransmissionLineForGeometry({
  modelId,
  geometry,
  frequencyHz
}: {
  modelId: AnalyticalModelId;
  geometry: RfGeometry;
  frequencyHz: number;
}): AnalyticalTransmissionLineResult {
  return calculateAnalyticalModelForGeometry({ modelId, geometry, frequencyHz });
}

function nearestSimulationPoint(points: SParameterPoint[], frequencyHz: number): SParameterPoint {
  if (points.length === 0) throw new Error("Simulation returned no S-parameter points.");
  return points.reduce((best, point) =>
    Math.abs(point.frequencyHz - frequencyHz) < Math.abs(best.frequencyHz - frequencyHz) ? point : best
  );
}
