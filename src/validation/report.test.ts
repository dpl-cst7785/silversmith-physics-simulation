import { describe, expect, it } from "vitest";
import { defaultGeometry } from "../domain/geometry";
import { copper, defaultSubstrate } from "../domain/materials";
import { parseTouchstone } from "../physics/sParameters";
import { validateMicrostrip } from "./engine";
import { buildValidationReportArtifact } from "./report";

describe("validation report artifact", () => {
  it("captures geometry, model, sweep, analytical results, simulation points, and metrics", async () => {
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

    expect(artifact.schemaVersion).toBe("validation-report.v1");
    expect(artifact.generatedAt).toBe("2026-04-27T12:00:00.000Z");
    expect(artifact.model.id).toBe("microstrip");
    expect(artifact.geometry.traces[0].widthM).toBe(geometry.traces[0].widthM);
    expect(artifact.frequencySweep.points).toBe(3);
    expect(artifact.analyticalAtCenter.characteristicImpedanceOhms).toBeCloseTo(50.78, 2);
    expect(artifact.simulation.points).toHaveLength(3);
    expect(artifact.validation.metrics.length).toBeGreaterThan(0);
    expect(artifact.validation.pass).toBe(validation.metrics.every((metric) => metric.pass));
  });

  it("marks the artifact failed when any validation metric fails", async () => {
    const geometry = defaultGeometry(defaultSubstrate, copper);
    const validation = await validateMicrostrip({ geometry });
    validation.metrics = [{ ...validation.metrics[0], pass: false }];

    const artifact = buildValidationReportArtifact({ geometry, validation });

    expect(artifact.validation.pass).toBe(false);
  });

  it("summarizes imported Touchstone data when present", async () => {
    const geometry = defaultGeometry(defaultSubstrate, copper);
    const touchstone = parseTouchstone("# GHZ S MA R 50\n1.0 0.01 0\n2.0 0.02 0", "fixture.s1p");
    const validation = await validateMicrostrip({ geometry, touchstone });

    const artifact = buildValidationReportArtifact({ geometry, validation, touchstone });

    expect(artifact.importedTouchstone).toEqual({
      ports: 1,
      rows: 2,
      referenceOhms: 50,
      startFrequencyHz: 1e9,
      stopFrequencyHz: 2e9
    });
  });
});
