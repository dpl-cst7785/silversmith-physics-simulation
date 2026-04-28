import type { AnalyticalModelId } from "../physics/analyticalModels";
import type { ValidationResult } from "./engine";
import type { ValidationReportArtifact } from "./report";

export const VALIDATION_RUN_HISTORY_STORAGE_KEY = "rf-em-sandbox.validationRunHistory.v1";

export type ValidationRunRecord = {
  id: string;
  createdAt: string;
  label: string;
  modelId: AnalyticalModelId;
  pass: boolean;
  centerFrequencyHz: number;
  characteristicImpedanceOhms: number;
  artifact: ValidationReportArtifact;
};

export type BrowserStorage = Pick<Storage, "getItem" | "setItem">;

export function createValidationRunRecord({
  artifact,
  id = makeRunId(artifact.generatedAt)
}: {
  artifact: ValidationReportArtifact;
  id?: string;
}): ValidationRunRecord {
  const centerFrequencyHz = (artifact.frequencySweep.startHz + artifact.frequencySweep.stopHz) / 2;
  const characteristicImpedanceOhms = artifact.analyticalAtCenter.characteristicImpedanceOhms;

  return {
    id,
    createdAt: artifact.generatedAt,
    label: `${artifact.model.label} ${characteristicImpedanceOhms.toFixed(2)} ohms @ ${(centerFrequencyHz / 1e9).toFixed(3)} GHz`,
    modelId: artifact.model.id,
    pass: artifact.validation.pass,
    centerFrequencyHz,
    characteristicImpedanceOhms,
    artifact
  };
}

export function upsertValidationRunRecord(
  records: ValidationRunRecord[],
  record: ValidationRunRecord,
  maxRecords = 20
): ValidationRunRecord[] {
  return [record, ...records.filter((candidate) => candidate.id !== record.id)].slice(0, maxRecords);
}

export function removeValidationRunRecord(records: ValidationRunRecord[], id: string): ValidationRunRecord[] {
  return records.filter((record) => record.id !== id);
}

export function loadValidationRunHistory(storage: BrowserStorage): ValidationRunRecord[] {
  const raw = storage.getItem(VALIDATION_RUN_HISTORY_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isValidationRunRecord) : [];
  } catch {
    return [];
  }
}

export function saveValidationRunHistory(storage: BrowserStorage, records: ValidationRunRecord[]) {
  storage.setItem(VALIDATION_RUN_HISTORY_STORAGE_KEY, JSON.stringify(records));
}

export function validationFromRunRecord(record: ValidationRunRecord): ValidationResult {
  return {
    modelId: record.artifact.model.id,
    frequencySweep: record.artifact.frequencySweep,
    analyticalAtCenter: record.artifact.analyticalAtCenter,
    simulation: record.artifact.simulation,
    metrics: record.artifact.validation.metrics
  };
}

function makeRunId(generatedAt: string) {
  const randomSegment = Math.random().toString(36).slice(2, 8);
  return `run-${generatedAt.replace(/[^0-9]/g, "")}-${randomSegment}`;
}

function isValidationRunRecord(value: unknown): value is ValidationRunRecord {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ValidationRunRecord>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.label === "string" &&
    typeof candidate.pass === "boolean" &&
    typeof candidate.centerFrequencyHz === "number" &&
    typeof candidate.characteristicImpedanceOhms === "number" &&
    Boolean(candidate.artifact)
  );
}
