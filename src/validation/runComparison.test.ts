import { describe, expect, it } from "vitest";
import { defaultGeometry } from "../domain/geometry";
import { copper, defaultSubstrate } from "../domain/materials";
import { validateMicrostrip } from "./engine";
import { buildValidationReportArtifact } from "./report";
import { compareValidationRunRecords } from "./runComparison";
import { createValidationRunRecord } from "./runHistory";

describe("run comparison", () => {
  it("compares analytical metrics between two validation run records", async () => {
    const baseline = await makeRecord("baseline", 0.0034);
    const candidate = await makeRecord("candidate", 0.0028);

    const comparison = compareValidationRunRecords(baseline, candidate);
    const z0Metric = comparison.metrics.find((metric) => metric.label === "Characteristic impedance");

    expect(comparison.baselineId).toBe("baseline");
    expect(comparison.candidateId).toBe("candidate");
    expect(comparison.modelChanged).toBe(false);
    expect(z0Metric?.candidateValue).toBeGreaterThan(z0Metric?.baselineValue ?? 0);
    expect(z0Metric?.delta).toBeCloseTo((z0Metric?.candidateValue ?? 0) - (z0Metric?.baselineValue ?? 0));
  });
});

async function makeRecord(id: string, traceWidthM: number) {
  const geometry = defaultGeometry(defaultSubstrate, copper);
  geometry.traces[0].widthM = traceWidthM;
  const validation = await validateMicrostrip({ geometry });
  const artifact = buildValidationReportArtifact({
    geometry,
    validation,
    generatedAt: "2026-04-27T12:00:00.000Z"
  });
  return createValidationRunRecord({ artifact, id });
}
