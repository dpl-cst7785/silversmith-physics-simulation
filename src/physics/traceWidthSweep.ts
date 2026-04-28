import type { RfGeometry } from "../domain/geometry";
import {
  calculateAnalyticalModelForGeometry,
  type AnalyticalModelId
} from "./analyticalModels";

export type TraceWidthSweepPoint = {
  traceWidthM: number;
  characteristicImpedanceOhms: number;
  errorOhms: number;
  absoluteErrorOhms: number;
  effectiveRelativePermittivity: number;
};

export type TraceWidthSweepResult = {
  targetImpedanceOhms: number;
  frequencyHz: number;
  points: TraceWidthSweepPoint[];
  best: TraceWidthSweepPoint;
};

export function runTraceWidthSweep({
  geometry,
  modelId,
  frequencyHz,
  targetImpedanceOhms,
  startWidthM,
  stopWidthM,
  points
}: {
  geometry: RfGeometry;
  modelId: AnalyticalModelId;
  frequencyHz: number;
  targetImpedanceOhms: number;
  startWidthM: number;
  stopWidthM: number;
  points: number;
}): TraceWidthSweepResult {
  if (points < 2) throw new Error("Trace width sweep requires at least two points.");
  if (startWidthM <= 0 || stopWidthM <= 0) throw new Error("Trace width sweep bounds must be positive.");
  if (stopWidthM <= startWidthM) throw new Error("Trace width sweep stop width must be greater than start width.");
  if (targetImpedanceOhms <= 0) throw new Error("Target impedance must be positive.");

  const step = (stopWidthM - startWidthM) / (points - 1);
  const sweepPoints = Array.from({ length: points }, (_, index): TraceWidthSweepPoint => {
    const traceWidthM = startWidthM + index * step;
    const nextGeometry = withTraceWidth(geometry, traceWidthM);
    const analytical = calculateAnalyticalModelForGeometry({ modelId, geometry: nextGeometry, frequencyHz });
    const errorOhms = analytical.characteristicImpedanceOhms - targetImpedanceOhms;

    return {
      traceWidthM,
      characteristicImpedanceOhms: analytical.characteristicImpedanceOhms,
      errorOhms,
      absoluteErrorOhms: Math.abs(errorOhms),
      effectiveRelativePermittivity: analytical.effectiveRelativePermittivity
    };
  });

  return {
    targetImpedanceOhms,
    frequencyHz,
    points: sweepPoints,
    best: sweepPoints.reduce((best, point) =>
      point.absoluteErrorOhms < best.absoluteErrorOhms ? point : best
    )
  };
}

function withTraceWidth(geometry: RfGeometry, traceWidthM: number): RfGeometry {
  const trace = geometry.traces[0];
  if (!trace) throw new Error("Trace width sweep requires at least one trace.");

  return {
    ...geometry,
    traces: [{ ...trace, widthM: traceWidthM }, ...geometry.traces.slice(1)]
  };
}
