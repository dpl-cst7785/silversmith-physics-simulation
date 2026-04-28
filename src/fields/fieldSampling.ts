import type { RfGeometry } from "../domain/geometry";

export type FieldSample = {
  id: string;
  xM: number;
  yM: number;
  zM: number;
  amplitude: number;
  phaseRad: number;
  direction: {
    x: number;
    y: number;
    z: number;
  };
};

export type ConnectorProbeFrame = {
  portId: string;
  label: string;
  voltageV: number;
  phaseDeg: number;
  normalizedField: number;
  estimatedElectricFieldVm: number;
};

export function buildTraceFieldSamples(
  geometry: RfGeometry,
  options: {
    samplesAlongTrace?: number;
    samplesAcrossTrace?: number;
    heightLevels?: number;
  } = {}
): FieldSample[] {
  const trace = geometry.traces[0];
  if (!trace) return [];

  const samplesAlongTrace = options.samplesAlongTrace ?? 23;
  const samplesAcrossTrace = options.samplesAcrossTrace ?? 9;
  const heightLevels = options.heightLevels ?? 4;
  const samples: FieldSample[] = [];
  const traceCenterZM = trace.yM + trace.widthM / 2;
  const fieldHalfWidthM = Math.max(trace.widthM * 2.5, geometry.stack.substrateHeightM);
  const maxHeightM = geometry.stack.substrateHeightM * 1.8;

  for (let ix = 0; ix < samplesAlongTrace; ix += 1) {
    const xFraction = samplesAlongTrace === 1 ? 0.5 : ix / (samplesAlongTrace - 1);
    const xM = trace.xM + trace.lengthM * xFraction;
    for (let iz = 0; iz < samplesAcrossTrace; iz += 1) {
      const zFraction = samplesAcrossTrace === 1 ? 0.5 : iz / (samplesAcrossTrace - 1);
      const zOffsetM = (zFraction - 0.5) * fieldHalfWidthM * 2;
      const zM = traceCenterZM + zOffsetM;
      for (let iy = 0; iy < heightLevels; iy += 1) {
        const yFraction = (iy + 1) / heightLevels;
        const yM = geometry.stack.substrateHeightM + yFraction * maxHeightM;
        const lateralDecay = Math.exp(-Math.abs(zOffsetM) / fieldHalfWidthM);
        const verticalDecay = Math.exp(-(yM - geometry.stack.substrateHeightM) / maxHeightM);
        const amplitude = lateralDecay * verticalDecay;

        samples.push({
          id: `field-${ix}-${iz}-${iy}`,
          xM,
          yM,
          zM,
          amplitude,
          phaseRad: xFraction * Math.PI * 2,
          direction: normalizeDirection({
            x: 0,
            y: Math.max(yM - geometry.stack.substrateHeightM, geometry.stack.substrateHeightM * 0.2),
            z: zOffsetM
          })
        });
      }
    }
  }

  return samples;
}

export function sampleInstantaneousField(sample: FieldSample, animationPhaseRad: number): number {
  return sample.amplitude * Math.sin(animationPhaseRad - sample.phaseRad);
}

export function buildConnectorProbeFrames({
  geometry,
  animationPhaseRad,
  driveVoltageV = 1
}: {
  geometry: RfGeometry;
  animationPhaseRad: number;
  driveVoltageV?: number;
}): ConnectorProbeFrame[] {
  const trace = geometry.traces[0];
  const traceLengthM = trace?.lengthM ?? 1;
  const traceStartXM = trace?.xM ?? 0;
  const substrateHeightM = geometry.stack.substrateHeightM;

  return geometry.ports.map((port) => {
    const distanceAlongTraceM = Math.max(0, Math.min(traceLengthM, port.xM - traceStartXM));
    const phaseRad = (distanceAlongTraceM / traceLengthM) * Math.PI * 2;
    const normalizedField = Math.sin(animationPhaseRad - phaseRad);

    return {
      portId: port.id,
      label: port.label,
      voltageV: driveVoltageV * normalizedField,
      phaseDeg: radiansToDegrees(phaseRad),
      normalizedField,
      estimatedElectricFieldVm: substrateHeightM > 0 ? (driveVoltageV * normalizedField) / substrateHeightM : 0
    };
  });
}

function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function normalizeDirection(vector: { x: number; y: number; z: number }): FieldSample["direction"] {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length
  };
}
