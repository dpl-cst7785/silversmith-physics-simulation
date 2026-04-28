import type { ValidationRunRecord } from "./runHistory";

export type RunComparisonMetric = {
  label: string;
  baselineValue: number;
  candidateValue: number;
  unit: string;
  delta: number;
  percentDelta: number;
};

export type RunComparison = {
  baselineId: string;
  candidateId: string;
  modelChanged: boolean;
  passChanged: boolean;
  metrics: RunComparisonMetric[];
};

export function compareValidationRunRecords(
  baseline: ValidationRunRecord,
  candidate: ValidationRunRecord
): RunComparison {
  return {
    baselineId: baseline.id,
    candidateId: candidate.id,
    modelChanged: baseline.modelId !== candidate.modelId,
    passChanged: baseline.pass !== candidate.pass,
    metrics: [
      compareMetric({
        label: "Characteristic impedance",
        baselineValue: baseline.artifact.analyticalAtCenter.characteristicImpedanceOhms,
        candidateValue: candidate.artifact.analyticalAtCenter.characteristicImpedanceOhms,
        unit: "ohms"
      }),
      compareMetric({
        label: "Effective er",
        baselineValue: baseline.artifact.analyticalAtCenter.effectiveRelativePermittivity,
        candidateValue: candidate.artifact.analyticalAtCenter.effectiveRelativePermittivity,
        unit: ""
      }),
      compareMetric({
        label: "Estimated loss",
        baselineValue: baseline.artifact.analyticalAtCenter.estimatedLossDb,
        candidateValue: candidate.artifact.analyticalAtCenter.estimatedLossDb,
        unit: "dB"
      }),
      compareMetric({
        label: "Propagation delay",
        baselineValue: baseline.artifact.analyticalAtCenter.propagationDelayS,
        candidateValue: candidate.artifact.analyticalAtCenter.propagationDelayS,
        unit: "s"
      }),
      compareMetric({
        label: "Electrical length",
        baselineValue: baseline.artifact.analyticalAtCenter.electricalLengthRad,
        candidateValue: candidate.artifact.analyticalAtCenter.electricalLengthRad,
        unit: "rad"
      })
    ]
  };
}

function compareMetric({
  label,
  baselineValue,
  candidateValue,
  unit
}: {
  label: string;
  baselineValue: number;
  candidateValue: number;
  unit: string;
}): RunComparisonMetric {
  const delta = candidateValue - baselineValue;
  const percentDelta = baselineValue === 0 ? 0 : (delta / baselineValue) * 100;

  return {
    label,
    baselineValue,
    candidateValue,
    unit,
    delta,
    percentDelta
  };
}
