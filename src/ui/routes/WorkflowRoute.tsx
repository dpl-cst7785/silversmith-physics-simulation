import { Download, History, Play, Trash2, Upload } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { mToMm, mmToM, type RfGeometry } from "../../domain/geometry";
import {
  analyticalModels,
  getAnalyticalModelDescriptor,
  type AnalyticalModelId
} from "../../physics/analyticalModels";
import { runTraceWidthSweep, type TraceWidthSweepResult } from "../../physics/traceWidthSweep";
import { parseTouchstone, type TouchstoneData } from "../../physics/sParameters";
import type { GeometryPreset } from "../../physics/geometryPresets";
import type { FrequencySweep, ValidationResult } from "../../validation/engine";
import { compareValidationRunRecords } from "../../validation/runComparison";
import type { ValidationRunRecord } from "../../validation/runHistory";
import { downloadValidationReport } from "../downloadValidationReport";
import { NumberField } from "./GeometryRoute";
import { ModelVariance, SParameterPlot, ValidationMetrics, ValidationReport } from "./ResultsRoute";

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
      <ModelVariance validation={validation} />
      <ValidationReport validation={validation} isValidationStale={isValidationStale} />
      <SParameterPlot validation={validation} isValidationStale={isValidationStale} />
      <TraceWidthSweepPanel
        geometry={geometry}
        onGeometryChange={onGeometryChange}
        modelId={modelId}
        sweep={sweep}
      />
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

function TraceWidthSweepPanel({
  geometry,
  onGeometryChange,
  modelId,
  sweep
}: {
  geometry: RfGeometry;
  onGeometryChange: (geometry: RfGeometry) => void;
  modelId: AnalyticalModelId;
  sweep: FrequencySweep;
}) {
  const trace = geometry.traces[0];
  const currentWidthMm = trace ? mToMm(trace.widthM) : 1;
  const [startWidthMm, setStartWidthMm] = useState(Math.max(0.05, currentWidthMm * 0.7));
  const [stopWidthMm, setStopWidthMm] = useState(currentWidthMm * 1.3);
  const [targetImpedanceOhms, setTargetImpedanceOhms] = useState(50);
  const [points, setPoints] = useState(21);
  const [result, setResult] = useState<TraceWidthSweepResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function runSweep() {
    try {
      setResult(
        runTraceWidthSweep({
          geometry,
          modelId,
          frequencyHz: (sweep.startHz + sweep.stopHz) / 2,
          targetImpedanceOhms,
          startWidthM: mmToM(startWidthMm),
          stopWidthM: mmToM(stopWidthMm),
          points
        })
      );
      setError(null);
    } catch (caught) {
      setResult(null);
      setError(caught instanceof Error ? caught.message : "Trace width sweep failed.");
    }
  }

  function applyBestWidth() {
    if (!result || !trace) return;
    onGeometryChange({
      ...geometry,
      traces: [{ ...trace, widthM: result.best.traceWidthM }, ...geometry.traces.slice(1)]
    });
  }

  return (
    <div className="table-section">
      <div className="section-heading-row">
        <h2>Trace width sweep</h2>
        <button className="secondary-button" onClick={runSweep}>
          <Play size={18} />
          <span>Run sweep</span>
        </button>
      </div>
      <div className="sweep-controls">
        <NumberField label="Min width (mm)" value={startWidthMm} step={0.05} onChange={setStartWidthMm} />
        <NumberField label="Max width (mm)" value={stopWidthMm} step={0.05} onChange={setStopWidthMm} />
        <NumberField label="Target Z0 (ohms)" value={targetImpedanceOhms} step={0.5} onChange={setTargetImpedanceOhms} />
        <NumberField label="Points" value={points} step={1} onChange={(value) => setPoints(Math.max(2, Math.round(value)))} />
      </div>
      {error && <p className="error-text">{error}</p>}
      {result && (
        <>
          <div className="run-summary">
            <span>Best width: {mToMm(result.best.traceWidthM).toFixed(3)} mm</span>
            <span>Z0: {result.best.characteristicImpedanceOhms.toFixed(2)} ohms</span>
            <span>Error: {result.best.errorOhms.toFixed(2)} ohms</span>
            <span>Frequency: {(result.frequencyHz / 1e9).toFixed(3)} GHz</span>
          </div>
          <button className="secondary-button sweep-apply-button" onClick={applyBestWidth}>
            Apply best width to geometry
          </button>
          <table>
            <thead>
              <tr>
                <th>Trace width</th>
                <th>Z0</th>
                <th>Error</th>
                <th>Effective er</th>
              </tr>
            </thead>
            <tbody>
              {result.points.map((point) => (
                <tr key={point.traceWidthM}>
                  <td>{mToMm(point.traceWidthM).toFixed(3)} mm</td>
                  <td>{point.characteristicImpedanceOhms.toFixed(2)} ohms</td>
                  <td>{point.errorOhms.toFixed(2)} ohms</td>
                  <td>{point.effectiveRelativePermittivity.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
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
  const comparison = records.length >= 2 ? compareValidationRunRecords(records[1], records[0]) : null;

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
      {comparison && (
        <div className="run-comparison">
          <h3>Latest run comparison</h3>
          <p className="field-note">
            Candidate is the newest saved run. Baseline is the previous saved run.
            {comparison.modelChanged ? " Analytical model changed." : ""}
            {comparison.passChanged ? " Pass/fail status changed." : ""}
          </p>
          <table>
            <thead>
              <tr>
                <th>Metric</th>
                <th>Baseline</th>
                <th>Candidate</th>
                <th>Delta</th>
              </tr>
            </thead>
            <tbody>
              {comparison.metrics.map((metric) => (
                <tr key={metric.label}>
                  <td>{metric.label}</td>
                  <td>{formatComparisonValue(metric.baselineValue, metric.unit)}</td>
                  <td>{formatComparisonValue(metric.candidateValue, metric.unit)}</td>
                  <td>
                    {formatComparisonValue(metric.delta, metric.unit)} ({metric.percentDelta.toFixed(2)}%)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatComparisonValue(value: number, unit: string) {
  if (unit === "s") return `${(value * 1e12).toFixed(2)} ps`;
  return `${value.toFixed(4)}${unit ? ` ${unit}` : ""}`;
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
