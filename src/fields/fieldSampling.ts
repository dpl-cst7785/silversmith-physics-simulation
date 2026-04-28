import type { RfGeometry } from "../domain/geometry";
import { solveMicrostripFiniteDifference, type FieldSolverResult } from "../simulation/finiteDifferenceMicrostrip";

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
  solverProbe?: FieldSampleProbe;
};

export type FieldSampleProbe = {
  potentialV: number;
  exVm: number;
  eyVm: number;
  magnitudeVm: number;
};

export type ConnectorProbeFrame = {
  portId: string;
  label: string;
  voltageV: number;
  phaseDeg: number;
  normalizedField: number;
  estimatedElectricFieldVm: number;
};

export type FieldSurface = {
  positions: number[];
  colors: number[];
  indices: number[];
  maxMagnitudeVm: number;
};

export type FieldVolume = {
  positions: number[];
  colors: number[];
  directions: number[];
  amplitudes: number[];
  phases: number[];
  maxMagnitudeVm: number;
  traceStartM: number;
  traceLengthM: number;
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

export function buildSolverFieldSamples(
  geometry: RfGeometry,
  fieldSolve: FieldSolverResult = solveMicrostripFiniteDifference(geometry, {
    cellsX: 64,
    cellsY: 48,
    maxIterations: 7_000,
    tolerance: 8e-5
  }),
  options: {
    samplesAlongTrace?: number;
    samplesAcrossSection?: number;
    heightLevels?: number;
  } = {}
): FieldSample[] {
  const trace = geometry.traces[0];
  if (!trace) return [];

  const samplesAlongTrace = options.samplesAlongTrace ?? 19;
  const samplesAcrossSection = options.samplesAcrossSection ?? 12;
  const heightLevels = options.heightLevels ?? 5;
  const samples: FieldSample[] = [];
  const maxField = Math.max(fieldSolve.field.maxElectricFieldVm, 1);
  const yStartM = 0;
  const yStopM = Math.min(fieldSolve.grid.domainHeightM, geometry.stack.substrateHeightM * 2.4);

  for (let ix = 0; ix < samplesAlongTrace; ix += 1) {
    const xFraction = samplesAlongTrace === 1 ? 0.5 : ix / (samplesAlongTrace - 1);
    const traceXM = trace.xM + trace.lengthM * xFraction;
    for (let iz = 0; iz < samplesAcrossSection; iz += 1) {
      const zFraction = samplesAcrossSection === 1 ? 0.5 : iz / (samplesAcrossSection - 1);
      const crossSectionXM = zFraction * fieldSolve.grid.domainWidthM;
      for (let iy = 0; iy < heightLevels; iy += 1) {
        const yFraction = heightLevels === 1 ? 0.5 : iy / (heightLevels - 1);
        const yM = yStartM + (yStopM - yStartM) * yFraction;
        const field = sampleFieldGrid(fieldSolve, crossSectionXM, yM);
        const magnitude = Math.hypot(field.exVm, field.eyVm);
        if (magnitude <= maxField * 0.015) continue;

        samples.push({
          id: `solver-field-${ix}-${iz}-${iy}`,
          xM: traceXM,
          yM,
          zM: crossSectionXM,
          amplitude: Math.min(1, magnitude / maxField),
          phaseRad: xFraction * Math.PI * 2,
          direction: normalizeDirection({
            x: 0,
            y: field.eyVm,
            z: field.exVm
          }),
          solverProbe: {
            potentialV: field.potentialV,
            exVm: field.exVm,
            eyVm: field.eyVm,
            magnitudeVm: magnitude
          }
        });
      }
    }
  }

  return samples;
}

export function buildSolverFieldSurface(
  fieldSolve: FieldSolverResult,
  options: {
    xSamples?: number;
    ySamples?: number;
    lengthM?: number;
  } = {}
): FieldSurface {
  const xSamples = options.xSamples ?? 56;
  const ySamples = options.ySamples ?? 34;
  const lengthM = options.lengthM ?? fieldSolve.grid.domainWidthM;
  const maxMagnitudeVm = Math.max(fieldSolve.field.maxElectricFieldVm, 1);
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const yStopM = Math.min(fieldSolve.grid.domainHeightM, fieldSolve.grid.substrateHeightM * 2.4);

  for (let ix = 0; ix < xSamples; ix += 1) {
    const xFraction = xSamples === 1 ? 0.5 : ix / (xSamples - 1);
    const traceXM = lengthM * xFraction;
    for (let iy = 0; iy < ySamples; iy += 1) {
      const yFraction = ySamples === 1 ? 0.5 : iy / (ySamples - 1);
      const crossSectionXM = fieldSolve.grid.domainWidthM * yFraction;
      const fieldYM = yStopM * (1 - Math.abs(yFraction - 0.5) * 0.15);
      const field = sampleFieldGrid(fieldSolve, crossSectionXM, fieldYM);
      const normalized = Math.min(1, field.magnitudeVm / maxMagnitudeVm);
      const sign = field.eyVm >= 0 ? 1 : -1;
      positions.push(traceXM, fieldYM, crossSectionXM);
      colors.push(...fieldColor(normalized, sign));
    }
  }

  for (let ix = 0; ix < xSamples - 1; ix += 1) {
    for (let iy = 0; iy < ySamples - 1; iy += 1) {
      const a = ix * ySamples + iy;
      const b = (ix + 1) * ySamples + iy;
      const c = (ix + 1) * ySamples + iy + 1;
      const d = ix * ySamples + iy + 1;
      indices.push(a, b, c, a, c, d);
    }
  }

  return {
    positions,
    colors,
    indices,
    maxMagnitudeVm
  };
}

export function buildSolverFieldVolume(
  fieldSolve: FieldSolverResult,
  options: {
    samplesAlongTrace?: number;
    samplesAcrossSection?: number;
    heightLevels?: number;
    lengthM?: number;
    xOffsetM?: number;
    minNormalizedMagnitude?: number;
    volumeHeightMultiplier?: number;
    spacingMultiplier?: number;
  } = {}
): FieldVolume {
  const samplesAlongTrace = options.samplesAlongTrace ?? 52;
  const samplesAcrossSection = options.samplesAcrossSection ?? 26;
  const heightLevels = options.heightLevels ?? 18;
  const lengthM = options.lengthM ?? fieldSolve.grid.domainWidthM;
  const xOffsetM = options.xOffsetM ?? 0;
  const minNormalizedMagnitude = options.minNormalizedMagnitude ?? 0.035;
  const maxMagnitudeVm = Math.max(fieldSolve.field.maxElectricFieldVm, 1);
  const positions: number[] = [];
  const colors: number[] = [];
  const directions: number[] = [];
  const amplitudes: number[] = [];
  const phases: number[] = [];
  const yStopM = Math.min(
    fieldSolve.grid.domainHeightM,
    fieldSolve.grid.substrateHeightM * (options.volumeHeightMultiplier ?? 2.7)
  );
  const spacingMultiplier = options.spacingMultiplier ?? 1;

  for (let ix = 0; ix < samplesAlongTrace; ix += 1) {
    const xFraction = samplesAlongTrace === 1 ? 0.5 : ix / (samplesAlongTrace - 1);
    const phaseRad = xFraction * Math.PI * 2;
    const xM = xOffsetM + lengthM * xFraction;

    for (let iz = 0; iz < samplesAcrossSection; iz += 1) {
      const zFraction = samplesAcrossSection === 1 ? 0.5 : iz / (samplesAcrossSection - 1);
      const crossSectionXM = zFraction * fieldSolve.grid.domainWidthM;

      for (let iy = 0; iy < heightLevels; iy += 1) {
        const yFraction = heightLevels === 1 ? 0.5 : iy / (heightLevels - 1);
        const yM = yStopM * yFraction;
        const field = sampleFieldGrid(fieldSolve, crossSectionXM, yM);
        const normalized = Math.min(1, field.magnitudeVm / maxMagnitudeVm);
        if (normalized < minNormalizedMagnitude) continue;

        const softened = Math.sqrt(normalized);
        const sign = field.eyVm >= 0 ? 1 : -1;
        positions.push(
          xM + deterministicJitter(ix, iy, iz, 0) * lengthM * 0.003 * spacingMultiplier,
          yM + deterministicJitter(ix, iy, iz, 1) * yStopM * 0.02 * spacingMultiplier,
          crossSectionXM + deterministicJitter(ix, iy, iz, 2) * fieldSolve.grid.domainWidthM * 0.006 * spacingMultiplier
        );
        colors.push(...fieldColor(softened, sign));
        const direction = normalizeDirection({
          x: 0.55 + softened * 0.45,
          y: field.eyVm / maxMagnitudeVm,
          z: field.exVm / maxMagnitudeVm
        });
        directions.push(direction.x, direction.y, direction.z);
        amplitudes.push(softened);
        phases.push(phaseRad);
      }
    }
  }

  return {
    positions,
    colors,
    directions,
    amplitudes,
    phases,
    maxMagnitudeVm,
    traceStartM: xOffsetM,
    traceLengthM: lengthM
  };
}

export function sampleInstantaneousField(sample: FieldSample, animationPhaseRad: number): number {
  return sample.amplitude * Math.sin(animationPhaseRad - sample.phaseRad);
}

export function estimateFieldSolveMs(settings: { cellsX: number; cellsY: number; maxIterations: number }): number {
  return Math.max(150, Math.round((settings.cellsX * settings.cellsY * settings.maxIterations) / 52_000));
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

export function sampleFieldGrid(
  fieldSolve: FieldSolverResult,
  xM: number,
  yM: number
): FieldSampleProbe {
  const x = Math.max(0, Math.min(fieldSolve.grid.cellsX - 1, Math.round(xM / fieldSolve.grid.dxM)));
  const y = Math.max(0, Math.min(fieldSolve.grid.cellsY - 1, Math.round(yM / fieldSolve.grid.dyM)));
  const index = y * fieldSolve.grid.cellsX + x;
  const exVm = fieldSolve.field.electricFieldXVm[index] ?? 0;
  const eyVm = fieldSolve.field.electricFieldYVm[index] ?? 0;
  return {
    potentialV: fieldSolve.field.potentialV[index] ?? 0,
    exVm,
    eyVm,
    magnitudeVm: Math.hypot(exVm, eyVm)
  };
}

function fieldColor(normalized: number, sign: number): [number, number, number] {
  const base = 0.08 + normalized * 0.18;
  if (sign >= 0) return [Math.min(1, base + normalized * 0.82), base * 0.55, base * 0.62];
  return [base * 0.55, base * 0.75, Math.min(1, base + normalized * 0.82)];
}

function deterministicJitter(ix: number, iy: number, iz: number, salt: number): number {
  const value = Math.sin((ix + 1) * 12.9898 + (iy + 1) * 78.233 + (iz + 1) * 37.719 + salt * 19.19);
  return (value - Math.floor(value) - 0.5) * 2;
}
