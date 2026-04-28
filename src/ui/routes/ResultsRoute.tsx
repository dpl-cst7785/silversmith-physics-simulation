import { Upload } from "lucide-react";
import { useState } from "react";
import {
  deriveSParameterMetrics,
  insertionLossDb,
  magnitudeDb,
  parseTouchstone,
  returnLossDb,
  type TouchstoneData
} from "../../physics/sParameters";
import type { ValidationResult } from "../../validation/engine";

type Props = {
  validation: ValidationResult | null;
  isValidationStale: boolean;
  touchstone: TouchstoneData | null;
  onTouchstoneChange: (touchstone: TouchstoneData | null) => void;
};

export function ResultsRoute({ validation, isValidationStale, touchstone, onTouchstoneChange }: Props) {
  const [parseError, setParseError] = useState<string | null>(null);

  async function handleUpload(file: File | undefined) {
    if (!file) return;
    try {
      onTouchstoneChange(parseTouchstone(await file.text(), file.name));
      setParseError(null);
    } catch (error) {
      onTouchstoneChange(null);
      setParseError(error instanceof Error ? error.message : "Unable to parse Touchstone file.");
    }
  }

  return (
    <section className="route">
      <header className="route-header">
        <div>
          <p className="eyebrow">S-parameters and validation</p>
          <h1>Analytical vs simulated</h1>
        </div>
        <label className="upload-button">
          <Upload size={18} />
          <span>Upload Touchstone</span>
          <input type="file" accept=".s1p,.s2p" onChange={(event) => void handleUpload(event.target.files?.[0])} />
        </label>
      </header>
      {parseError && <p className="error-text">{parseError}</p>}
      {isValidationStale && <p className="stale-text">Inputs changed after the last run. Re-run validation before using these results.</p>}
      <ValidationMetrics validation={validation} isValidationStale={isValidationStale} />
      <ValidationReport validation={validation} isValidationStale={isValidationStale} />
      <SParameterPlot validation={validation} isValidationStale={isValidationStale} />
      <SimulationTable validation={validation} />
      {touchstone && <TouchstoneSummary touchstone={touchstone} />}
    </section>
  );
}

export function ValidationMetrics({
  validation,
  isValidationStale = false
}: {
  validation: ValidationResult | null;
  isValidationStale?: boolean;
}) {
  return (
    <div className="results-grid">
      <Metric
        label="Model"
        value={validation ? `${validation.modelId}${isValidationStale ? " (stale)" : ""}` : "..."}
      />
      <Metric
        label="Analytical Z0"
        value={validation ? `${validation.analyticalAtCenter.characteristicImpedanceOhms.toFixed(2)} ohms` : "..."}
      />
      <Metric
        label="Effective er"
        value={validation ? validation.analyticalAtCenter.effectiveRelativePermittivity.toFixed(3) : "..."}
      />
      <Metric
        label="Electrical length"
        value={validation ? `${validation.analyticalAtCenter.electricalLengthRad.toFixed(3)} rad` : "..."}
      />
      <Metric
        label="Delay"
        value={validation ? `${(validation.analyticalAtCenter.propagationDelayS * 1e12).toFixed(2)} ps` : "..."}
      />
    </div>
  );
}

export function ValidationReport({
  validation,
  isValidationStale = false
}: {
  validation: ValidationResult | null;
  isValidationStale?: boolean;
}) {
  return (
    <div className="table-section">
      <h2>Validation report{isValidationStale ? " (stale)" : ""}</h2>
      <table>
        <thead>
          <tr>
            <th>Check</th>
            <th>Expected</th>
            <th>Observed</th>
            <th>Error</th>
            <th>Tolerance</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {validation?.metrics.map((metric) => (
            <tr key={`${metric.source}-${metric.label}`}>
              <td>{metric.label}</td>
              <td>{metric.expectedValue.toFixed(4)} {metric.unit}</td>
              <td>{metric.observedValue.toFixed(4)} {metric.unit}</td>
              <td>{metric.absoluteError.toFixed(4)} {metric.unit} ({metric.percentError.toFixed(2)}%)</td>
              <td>{metric.tolerancePercent.toFixed(1)}%</td>
              <td>{metric.pass ? "PASS" : "FAIL"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SParameterPlot({
  validation,
  isValidationStale = false
}: {
  validation: ValidationResult | null;
  isValidationStale?: boolean;
}) {
  const [mode, setMode] = useState<"raw" | "loss" | "vswr">("raw");
  const points = validation?.simulation.points ?? [];
  const width = 720;
  const height = 240;
  const pad = 34;
  const series = buildPlotSeries(points, mode);
  const values = series.flatMap((item) => item.values.map((point) => point.value));
  const minValue = mode === "raw" ? Math.min(-60, ...values) : Math.min(0, ...values);
  const maxValue = Math.max(mode === "vswr" ? 2 : 1, ...values);
  const minF = points[0]?.frequencyHz ?? 1;
  const maxF = points.at(-1)?.frequencyHz ?? 1;

  function x(frequencyHz: number) {
    return pad + ((frequencyHz - minF) / (maxF - minF || 1)) * (width - pad * 2);
  }

  function y(value: number) {
    return pad + ((maxValue - value) / (maxValue - minValue || 1)) * (height - pad * 2);
  }

  function pathFor(valuesForSeries: Array<{ frequencyHz: number; value: number }>) {
    return valuesForSeries
      .map((point, index) => `${index === 0 ? "M" : "L"} ${x(point.frequencyHz).toFixed(2)} ${y(point.value).toFixed(2)}`)
      .join(" ");
  }

  return (
    <div className="table-section">
      <div className="section-heading-row">
        <h2>S-parameter plot{isValidationStale ? " (stale)" : ""}</h2>
        <div className="segmented-control" aria-label="Plot mode">
          <button className={mode === "raw" ? "active" : ""} onClick={() => setMode("raw")}>S dB</button>
          <button className={mode === "loss" ? "active" : ""} onClick={() => setMode("loss")}>Loss</button>
          <button className={mode === "vswr" ? "active" : ""} onClick={() => setMode("vswr")}>VSWR</button>
        </div>
      </div>
      <svg className="sparameter-plot" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="S-parameter plot">
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} />
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} />
        {series.map((item) => (
          <path key={item.label} d={pathFor(item.values)} className={item.className} />
        ))}
        <text x={pad} y={20}>{mode === "vswr" ? "VSWR" : "dB"}</text>
        <text x={width - 120} y={height - 10}>Frequency</text>
      </svg>
      <div className="plot-legend">
        {series.map((item) => (
          <span key={item.label} className={item.legendClassName}>{item.label}</span>
        ))}
      </div>
    </div>
  );
}

function SimulationTable({ validation }: { validation: ValidationResult | null }) {
  return (
    <div className="table-section">
      <h2>Mock simulation sweep</h2>
      <table>
        <thead>
          <tr>
            <th>Frequency</th>
            <th>S11</th>
            <th>S21</th>
            <th>Return loss</th>
            <th>Insertion loss</th>
            <th>VSWR</th>
            <th>Extracted Z0</th>
          </tr>
        </thead>
        <tbody>
          {validation?.simulation.points.map((point) => {
            const metrics = deriveSParameterMetrics({
              s11: point.s11,
              s21: point.s21,
              referenceOhms: 50
            });
            return (
              <tr key={point.frequencyHz}>
                <td>{(point.frequencyHz / 1e9).toFixed(2)} GHz</td>
                <td>{metrics.s11Db.toFixed(2)} dB</td>
                <td>{metrics.s21Db?.toFixed(2)} dB</td>
                <td>{metrics.returnLossDb.toFixed(2)} dB</td>
                <td>{metrics.insertionLossDb?.toFixed(2)} dB</td>
                <td>{metrics.vswr.toFixed(2)}</td>
                <td>{point.extractedImpedanceOhms.toFixed(2)} ohms</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {validation && <p className="assumptions">{validation.simulation.metadata.solverName}: {validation.simulation.metadata.assumptions.join(" ")}</p>}
    </div>
  );
}

function TouchstoneSummary({ touchstone }: { touchstone: TouchstoneData }) {
  return (
    <div className="table-section">
      <h2>Uploaded Touchstone summary</h2>
      <table>
        <thead>
          <tr>
            <th>Frequency</th>
            <th>S11</th>
            <th>S21</th>
            <th>VSWR</th>
            <th>Zin from S11</th>
          </tr>
        </thead>
        <tbody>
          {touchstone.rows.slice(0, 8).map((row) => {
            const metrics = deriveSParameterMetrics({
              s11: row.values[0],
              s21: touchstone.ports > 1 ? row.values[1] : null,
              referenceOhms: touchstone.referenceOhms
            });
            return (
              <tr key={row.frequencyHz}>
                <td>{(row.frequencyHz / 1e9).toFixed(3)} GHz</td>
                <td>{metrics.s11Db.toFixed(2)} dB</td>
                <td>{metrics.s21Db === null ? "n/a" : `${metrics.s21Db.toFixed(2)} dB`}</td>
                <td>{metrics.vswr.toFixed(2)}</td>
                <td>{metrics.inputImpedance.real.toFixed(2)} + j{metrics.inputImpedance.imaginary.toFixed(2)} ohms</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function buildPlotSeries(
  points: ValidationResult["simulation"]["points"],
  mode: "raw" | "loss" | "vswr"
): Array<{
  label: string;
  className: string;
  legendClassName: string;
  values: Array<{ frequencyHz: number; value: number }>;
}> {
  if (mode === "loss") {
    return [
      {
        label: "Return loss",
        className: "plot-s11",
        legendClassName: "legend-s11",
        values: points.map((point) => ({ frequencyHz: point.frequencyHz, value: returnLossDb(point.s11) }))
      },
      {
        label: "Insertion loss",
        className: "plot-s21",
        legendClassName: "legend-s21",
        values: points.map((point) => ({ frequencyHz: point.frequencyHz, value: insertionLossDb(point.s21) }))
      }
    ];
  }

  if (mode === "vswr") {
    return [
      {
        label: "VSWR",
        className: "plot-s11",
        legendClassName: "legend-s11",
        values: points.map((point) => ({
          frequencyHz: point.frequencyHz,
          value: deriveSParameterMetrics({ s11: point.s11, s21: point.s21, referenceOhms: 50 }).vswr
        }))
      }
    ];
  }

  return [
    {
      label: "S11",
      className: "plot-s11",
      legendClassName: "legend-s11",
      values: points.map((point) => ({ frequencyHz: point.frequencyHz, value: magnitudeDb(point.s11) }))
    },
    {
      label: "S21",
      className: "plot-s21",
      legendClassName: "legend-s21",
      values: points.map((point) => ({ frequencyHz: point.frequencyHz, value: magnitudeDb(point.s21) }))
    }
  ];
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
