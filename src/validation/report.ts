import type { RfGeometry } from "../domain/geometry";
import { getAnalyticalModelDescriptor } from "../physics/analyticalModels";
import type { TouchstoneData } from "../physics/sParameters";
import type { FrequencySweep, ValidationMetric, ValidationResult } from "./engine";

export type ValidationReportArtifact = {
  schemaVersion: "validation-report.v1";
  generatedAt: string;
  model: {
    id: ValidationResult["modelId"];
    label: string;
    assumptions: string[];
  };
  geometry: RfGeometry;
  frequencySweep: FrequencySweep;
  analyticalAtCenter: ValidationResult["analyticalAtCenter"];
  simulation: {
    metadata: ValidationResult["simulation"]["metadata"];
    points: ValidationResult["simulation"]["points"];
  };
  validation: {
    pass: boolean;
    metrics: ValidationMetric[];
  };
  importedTouchstone: TouchstoneSummary | null;
};

export type TouchstoneSummary = {
  ports: number;
  rows: number;
  referenceOhms: number;
  startFrequencyHz: number | null;
  stopFrequencyHz: number | null;
};

export function buildValidationReportArtifact({
  geometry,
  validation,
  touchstone,
  generatedAt = new Date().toISOString()
}: {
  geometry: RfGeometry;
  validation: ValidationResult;
  touchstone?: TouchstoneData | null;
  generatedAt?: string;
}): ValidationReportArtifact {
  const model = getAnalyticalModelDescriptor(validation.modelId);

  return {
    schemaVersion: "validation-report.v1",
    generatedAt,
    model: {
      id: model.id,
      label: model.label,
      assumptions: model.assumptions
    },
    geometry,
    frequencySweep: validation.frequencySweep,
    analyticalAtCenter: validation.analyticalAtCenter,
    simulation: {
      metadata: validation.simulation.metadata,
      points: validation.simulation.points
    },
    validation: {
      pass: validation.metrics.every((metric) => metric.pass),
      metrics: validation.metrics
    },
    importedTouchstone: summarizeTouchstone(touchstone ?? null)
  };
}

function summarizeTouchstone(touchstone: TouchstoneData | null): TouchstoneSummary | null {
  if (!touchstone) return null;

  return {
    ports: touchstone.ports,
    rows: touchstone.rows.length,
    referenceOhms: touchstone.referenceOhms,
    startFrequencyHz: touchstone.rows[0]?.frequencyHz ?? null,
    stopFrequencyHz: touchstone.rows.at(-1)?.frequencyHz ?? null
  };
}
