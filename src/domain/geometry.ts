import type { Material } from "./materials";

export type LengthUnit = "m";

export type Port = {
  id: string;
  label: string;
  xM: number;
  yM: number;
  impedanceOhms: number;
};

export type Trace = {
  id: string;
  name: string;
  xM: number;
  yM: number;
  widthM: number;
  lengthM: number;
  thicknessM: number;
  centerline?: TracePathPoint[];
};

export type TracePathPoint = {
  xM: number;
  yM: number;
};

export type Via = {
  id: string;
  xM: number;
  yM: number;
  diameterM: number;
};

export type LayerStack = {
  substrateHeightM: number;
  conductorThicknessM: number;
  substrate: Material;
  conductor: Material;
  hasGroundPlane: boolean;
};

export type RfGeometry = {
  unit: LengthUnit;
  boardWidthM: number;
  boardLengthM: number;
  traces: Trace[];
  ports: Port[];
  vias: Via[];
  stack: LayerStack;
};

export const mmToM = (valueMm: number) => valueMm / 1000;
export const mToMm = (valueM: number) => valueM * 1000;

export function getTraceCenterline(trace: Trace): TracePathPoint[] {
  if (trace.centerline && trace.centerline.length >= 2) {
    return trace.centerline.map((point) => ({ ...point }));
  }

  const centerYM = trace.yM + trace.widthM / 2;
  return [
    { xM: trace.xM, yM: centerYM },
    { xM: trace.xM + trace.lengthM, yM: centerYM }
  ];
}

export function calculatePolylineLength(points: TracePathPoint[]): number {
  return points.slice(1).reduce((length, point, index) => {
    const previous = points[index];
    return length + Math.hypot(point.xM - previous.xM, point.yM - previous.yM);
  }, 0);
}

export function samplePolylineAtFraction(points: TracePathPoint[], fraction: number): TracePathPoint {
  if (points.length === 0) return { xM: 0, yM: 0 };
  if (points.length === 1) return { ...points[0] };

  const clamped = Math.max(0, Math.min(1, fraction));
  const totalLength = calculatePolylineLength(points);
  if (totalLength <= 0) return { ...points[0] };

  let targetLength = totalLength * clamped;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const segmentLength = Math.hypot(current.xM - previous.xM, current.yM - previous.yM);
    if (targetLength <= segmentLength || index === points.length - 1) {
      const segmentFraction = segmentLength > 0 ? targetLength / segmentLength : 0;
      return {
        xM: previous.xM + (current.xM - previous.xM) * segmentFraction,
        yM: previous.yM + (current.yM - previous.yM) * segmentFraction
      };
    }
    targetLength -= segmentLength;
  }

  return { ...points[points.length - 1] };
}

export const defaultGeometry = (substrate: Material, conductor: Material): RfGeometry => ({
  unit: "m",
  boardWidthM: mmToM(22),
  boardLengthM: mmToM(48),
  traces: [
    {
      id: "trace-1",
      name: "50 ohm microstrip",
      xM: mmToM(4),
      yM: mmToM(10),
      widthM: mmToM(3.4),
      lengthM: mmToM(40),
      thicknessM: mmToM(0.035)
    }
  ],
  ports: [
    { id: "port-1", label: "P1", xM: mmToM(4), yM: mmToM(11.7), impedanceOhms: 50 },
    { id: "port-2", label: "P2", xM: mmToM(44), yM: mmToM(11.7), impedanceOhms: 50 }
  ],
  vias: [{ id: "via-1", xM: mmToM(26), yM: mmToM(6), diameterM: mmToM(0.6) }],
  stack: {
    substrateHeightM: mmToM(1.524),
    conductorThicknessM: mmToM(0.035),
    substrate,
    conductor,
    hasGroundPlane: true
  }
});
