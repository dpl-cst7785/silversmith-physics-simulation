import type { RfGeometry } from "../domain/geometry";
import type { TouchstoneData } from "../physics/sParameters";
import type { ValidationResult } from "../validation/engine";
import { buildValidationReportArtifact } from "../validation/report";

export function downloadValidationReport({
  geometry,
  validation,
  touchstone
}: {
  geometry: RfGeometry;
  validation: ValidationResult;
  touchstone: TouchstoneData | null;
}) {
  const artifact = buildValidationReportArtifact({ geometry, validation, touchstone });
  const blob = new Blob([JSON.stringify(artifact, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `rf-validation-${validation.modelId}-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
