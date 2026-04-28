import { Download, History, Play, Trash2, Upload } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { mToMm, mmToM, type RfGeometry } from "../../domain/geometry";
import {
  analyticalModels,
  getAnalyticalModelDescriptor,
  type AnalyticalModelId
} from "../../physics/analyticalModels";
import { parseTouchstone, type TouchstoneData } from "../../physics/sParameters";
import type { GeometryPreset } from "../../physics/geometryPresets";
import type { FrequencySweep, ValidationResult } from "../../validation/engine";
import type { ValidationRunRecord } from "../../validation/runHistory";
import { downloadValidationReport } from "../downloadValidationReport";
import { NumberField } from "./GeometryRoute";
import { SParameterPlot, ValidationMetrics, ValidationReport } from "./ResultsRoute";

const ViewerRoute = lazy(() => import("./ViewerRoute").then((module) => ({ default: module.ViewerRoute })));

type RunStatus = "idle" | "running" | "complete" | "failed";

type Props = {
  geometry: RfGeometry;
  onGeometryChange: (geometry: RfGeometry) => void;
  modelId: AnalyticalModelId;
  onModelChange: (modelId: AnalyticalModelId) => void;
  presets: GeometryPreset[];
  onApplyPreset: (preset: GeometryPreset) => void;
  sweep: FrequencySweep;
  onSweepChange: (sweep: FrequencySweep) => void;
  validation: ValidationResult | null;
  isValidationStale: boolean;
  touchstone: TouchstoneData | null;
  onTouchstoneChange: (touchstone: TouchstoneData | null) => void;
  runStatus: RunStatus;
  runError: string | null;
  onRun: () => void;
  runHistory: ValidationRunRecord[];
  onSelectRun: (record: ValidationRunRecord) => void;
  onDeleteRun: (recordId: string) => void;
};

export function WorkflowRoute({
  geometry,
  onGeometryChange,
  modelId,
  onModelChange,
  presets,
  onApplyPreset,
  sweep,
  onSweepChange,
  validation,
  isValidationStale,
  touchstone,
  onTouchstoneChange,
  runStatus,
  runError,
  onRun,
  runHistory,
  onSelectRun,
  onDeleteRun
}: Props) {
  const trace = geometry.traces[0];
  const model = getAnalyticalModelDescriptor(modelId);
  const canExport = Boolean(validation && !isValidationStale);

  return (
    <section className="route">
      <header className="route-header">
        <div>
          <p className="eyebrow">Functional physics workflow</p>
          <h1>Geometry - physics - simulation - validation</h1>
        </div>
        <div className="header-actions">
          <button
            className="secondary-button"
            onClick={() => validation && downloadValidationReport({ geometry, validation, touchstone })}
            disabled={!canExport}
            title={canExport ? "Export validation report JSON" : "Run validation before exporting"}
          >
            <Download size={18} />
            <span>Export report</span>
          </button>
          <button className="primary-button" onClick={onRun} disabled={runStatus === "running"}>
            <Play size={18} />
            <span>{runStatus === "running" ? "Running..." : "Run validation"}</span>
          </button>
        </div>
      </header>
      <div className="workflow-grid">
        <fieldset>
          <legend>1. Analytical model</legend>
          <label className="field">
            <span>Textbook structure</span>
            <select value={modelId} onChange={(event) => onModelChange(event.target.value as AnalyticalModelId)}>
              {analyticalModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
          </label>
          <p className="field-note">
            {model.assumptions.join("; ")}
          </p>
          <div className="preset-list">
            {presets.map((preset) => (
              <button className="preset-button" key={preset.id} onClick={() => onApplyPreset(preset)}>
                <strong>{preset.label}</strong>
                <span>{preset.description}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>2. Transmission-line geometry</legend>
          <NumberField label={model.geometryLabels.traceWidth} value={mToMm(trace.widthM)} onChange={(value) => updateTrace("widthM", mmToM(value))} />
          <NumberField label={model.geometryLabels.transverseDimension} value={mToMm(geometry.stack.substrateHeightM)} onChange={(value) => updateStack("substrateHeightM", mmToM(value))} />
          <p className="field-note">{model.geometryLabels.transverseHelp}</p>
          <NumberField label={model.geometryLabels.traceLength} value={mToMm(trace.lengthM)} onChange={(value) => updateTrace("lengthM", mmToM(value))} />
          <NumberField label="Copper thickness (mm)" value={mToMm(geometry.stack.conductorThicknessM)} step={0.001} onChange={(value) => updateStack("conductorThicknessM", mmToM(value))} />
        </fieldset>
        <fieldset>
          <legend>3. Material and sweep</legend>
          <NumberField label="Relative permittivity" value={geometry.stack.substrate.relativePermittivity} onChange={(value) => updateSubstrate("relativePermittivity", value)} />
          <NumberField label="Loss tangent" value={geometry.stack.substrate.lossTangent} step={0.0001} onChange={(value) => updateSubstrate("lossTangent", value)} />
          <NumberField label="Start frequency (GHz)" value={sweep.startHz / 1e9} onChange={(value) => onSweepChange({ ...sweep, startHz: value * 1e9 })} />
          <NumberField label="Stop frequency (GHz)" value={sweep.stopHz / 1e9} onChange={(value) => onSweepChange({ ...sweep, stopHz: value * 1e9 })} />
          <NumberField label="Sweep points" value={sweep.points} step={1} onChange={(value) => onSweepChange({ ...sweep, points: Math.max(2, Math.round(value)) })} />
        </fieldset>
        <fieldset>
          <legend>4. Imported S-parameters</legend>
          <TouchstoneUpload touchstone={touchstone} onTouchstoneChange={onTouchstoneChange} />
          <p className="field-note">
            {touchstone
              ? `${touchstone.ports}-port Touchstone loaded, ${touchstone.rows.length} rows, ${touchstone.referenceOhms} ohm reference. Run validation to compare imported S11.`
              : "Optional .s1p or .s2p file. Imported S11 is converted to impedance and compared against analytical Z0."}
          </p>
        </fieldset>
      </div>
      {runError && <p className="error-text">{runError}</p>}
      <RunSummary validation={validation} runStatus={runStatus} touchstone={touchstone} isValidationStale={isValidationStale} />
      {isValidationStale && <p className="stale-text">Inputs changed after the last run. Re-run validation before using these results.</p>}
      <ValidationMetrics validation={validation} isValidationStale={isValidationStale} />
      <ValidationReport validation={validation} isValidationStale={isValidationStale} />
      <SParameterPlot validation={validation} isValidationStale={isValidationStale} />
      <RunHistoryPanel
        records={runHistory}
        onSelectRun={onSelectRun}
        onDeleteRun={onDeleteRun}
      />
      <Suspense fallback={<div className="loading-panel">Loading 3D viewer...</div>}>
        <ViewerRoute geometry={geometry} modelId={modelId} />
      </Suspense>
    </section>
  );

  function updateTrace(field: keyof typeof trace, value: number) {
    onGeometryChange({
      ...geometry,
      traces: [{ ...trace, [field]: value }, ...geometry.traces.slice(1)]
    });
  }

  function updateStack(field: "substrateHeightM" | "conductorThicknessM", value: number) {
    onGeometryChange({
      ...geometry,
      stack: { ...geometry.stack, [field]: value }
    });
  }

  function updateSubstrate(field: "relativePermittivity" | "lossTangent", value: number) {
    onGeometryChange({
      ...geometry,
      stack: {
        ...geometry.stack,
        substrate: { ...geometry.stack.substrate, [field]: value }
      }
    });
  }
}

function RunHistoryPanel({
  records,
  onSelectRun,
  onDeleteRun
}: {
  records: ValidationRunRecord[];
  onSelectRun: (record: ValidationRunRecord) => void;
  onDeleteRun: (recordId: string) => void;
}) {
  return (
    <div className="table-section">
      <div className="section-heading-row">
        <h2>Local run history</h2>
        <span className="run-history-count">{records.length} saved</span>
      </div>
      {records.length === 0 ? (
        <p className="field-note">Run validation to save a local engineering record.</p>
      ) : (
        <div className="run-history-list">
          {records.map((record) => (
            <article className="run-history-item" key={record.id}>
              <button className="run-history-main" onClick={() => onSelectRun(record)}>
                <History size={18} />
                <span>
                  <strong>{record.label}</strong>
                  <small>
                    {new Date(record.createdAt).toLocaleString()} - {record.pass ? "PASS" : "FAIL"}
                  </small>
                </span>
              </button>
              <button
                className="icon-button"
                onClick={() => onDeleteRun(record.id)}
                title="Delete run record"
                aria-label={`Delete ${record.label}`}
              >
                <Trash2 size={17} />
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function TouchstoneUpload({
  touchstone,
  onTouchstoneChange
}: {
  touchstone: TouchstoneData | null;
  onTouchstoneChange: (touchstone: TouchstoneData | null) => void;
}) {
  const [uploadError, setUploadError] = useState<string | null>(null);

  return (
    <>
      <label className="upload-button secondary-upload">
        <Upload size={18} />
        <span>{touchstone ? "Replace Touchstone" : "Upload Touchstone"}</span>
        <input
          type="file"
          accept=".s1p,.s2p"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            void file
              .text()
              .then((content) => {
                onTouchstoneChange(parseTouchstone(content, file.name));
                setUploadError(null);
              })
              .catch((error: unknown) => {
                onTouchstoneChange(null);
                setUploadError(error instanceof Error ? error.message : "Unable to parse Touchstone file.");
              });
          }}
        />
      </label>
      {uploadError && <p className="error-text">{uploadError}</p>}
    </>
  );
}

function RunSummary({
  validation,
  runStatus,
  touchstone,
  isValidationStale
}: {
  validation: ValidationResult | null;
  runStatus: RunStatus;
  touchstone: TouchstoneData | null;
  isValidationStale: boolean;
}) {
  return (
    <div className="run-summary">
      <span>Status: {isValidationStale ? "stale" : runStatus}</span>
      <span>{validation ? `Solver: ${validation.simulation.metadata.solverName}` : "Solver: not run"}</span>
      <span>{validation ? `Runtime: ${validation.simulation.metadata.runtimeMs.toFixed(2)} ms` : "Runtime: n/a"}</span>
      <span>{touchstone ? "Imported S-parameters: included on next run" : "Imported S-parameters: none"}</span>
    </div>
  );
}
