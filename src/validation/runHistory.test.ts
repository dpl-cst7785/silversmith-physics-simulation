import { describe, expect, it } from "vitest";
import { defaultGeometry } from "../domain/geometry";
import { copper, defaultSubstrate } from "../domain/materials";
import { validateMicrostrip } from "./engine";
import { buildValidationReportArtifact } from "./report";
import {
  createValidationRunRecord,
  loadValidationRunHistory,
  removeValidationRunRecord,
  saveValidationRunHistory,
  upsertValidationRunRecord,
  validationFromRunRecord,
  type BrowserStorage
} from "./runHistory";

describe("validation run history", () => {
  it("creates a selectable run record from a validation artifact", async () => {
    const geometry = defaultGeometry(defaultSubstrate, copper);
    const validation = await validateMicrostrip({
      geometry,
      sweep: { startHz: 1e9, stopHz: 3e9, points: 3 }
    });
    const artifact = buildValidationReportArtifact({
      geometry,
      validation,
      generatedAt: "2026-04-27T12:00:00.000Z"
    });

    const record = createValidationRunRecord({ artifact, id: "run-test" });

    expect(record.id).toBe("run-test");
    expect(record.modelId).toBe("microstrip");
    expect(record.centerFrequencyHz).toBe(2e9);
    expect(record.characteristicImpedanceOhms).toBeCloseTo(50.78, 2);
    expect(record.label).toContain("Microstrip");
  });

  it("keeps newest records first and respects the max record limit", async () => {
    const baseRecord = await makeRecord("run-a");
    const records = upsertValidationRunRecord(
      [
        baseRecord,
        { ...baseRecord, id: "run-b" }
      ],
      { ...baseRecord, id: "run-c" },
      2
    );

    expect(records.map((record) => record.id)).toEqual(["run-c", "run-a"]);
  });

  it("removes records by id", async () => {
    const baseRecord = await makeRecord("run-a");
    const records = removeValidationRunRecord([baseRecord, { ...baseRecord, id: "run-b" }], "run-a");

    expect(records.map((record) => record.id)).toEqual(["run-b"]);
  });

  it("loads and saves run history through a storage adapter", async () => {
    const storage = createMemoryStorage();
    const record = await makeRecord("run-a");

    saveValidationRunHistory(storage, [record]);

    expect(loadValidationRunHistory(storage)[0].id).toBe("run-a");
  });

  it("reconstructs a validation result from a selected history record", async () => {
    const record = await makeRecord("run-a");
    const validation = validationFromRunRecord(record);

    expect(validation.modelId).toBe(record.modelId);
    expect(validation.simulation.points).toHaveLength(record.artifact.simulation.points.length);
    expect(validation.metrics).toEqual(record.artifact.validation.metrics);
  });
});

async function makeRecord(id: string) {
  const geometry = defaultGeometry(defaultSubstrate, copper);
  const validation = await validateMicrostrip({ geometry });
  const artifact = buildValidationReportArtifact({
    geometry,
    validation,
    generatedAt: "2026-04-27T12:00:00.000Z"
  });
  return createValidationRunRecord({ artifact, id });
}

function createMemoryStorage(): BrowserStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
}
