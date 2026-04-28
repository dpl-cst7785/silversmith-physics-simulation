import { getTraceCenterline, samplePolylineAtFraction, type RfGeometry } from "../domain/geometry";
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

export type PowerFlowSample = {
  xM: number;
  yM: number;
  zM: number;
  amplitude: number;
  phaseRad: number;
};

export type PowerFlowStreamline = {
  id: string;
  points: Array<{ xM: number; yM: number; zM: number }>;
  normalizedPowerDensity: number;
  electricFieldVm: number;
  poyntingWPerM2: number;
  etaEffectiveOhms: number;
  phaseRad: number;
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
  const fieldHalfWidthM = Math.max(trace.widthM * 2.5, geometry.stack.substrateHeightM);
  const maxHeightM = geometry.stack.substrateHeightM * 1.8;
  const centerline = getTraceCenterline(trace);

  for (let ix = 0; ix < samplesAlongTrace; ix += 1) {
    const xFraction = samplesAlongTrace === 1 ? 0.5 : ix / (samplesAlongTrace - 1);
    const pathPoint = samplePolylineAtFraction(centerline, xFraction);
    for (let iz = 0; iz < samplesAcrossTrace; iz += 1) {
      const zFraction = samplesAcrossTrace === 1 ? 0.5 : iz / (samplesAcrossTrace - 1);
      const zOffsetM = (zFraction - 0.5) * fieldHalfWidthM * 2;
      const zM = pathPoint.yM + zOffsetM;
      for (let iy = 0; iy < heightLevels; iy += 1) {
        const yFraction = (iy + 1) / heightLevels;
        const yM = geometry.stack.substrateHeightM + yFraction * maxHeightM;
        const lateralDecay = Math.exp(-Math.abs(zOffsetM) / fieldHalfWidthM);
        const verticalDecay = Math.exp(-(yM - geometry.stack.substrateHeightM) / maxHeightM);
        const amplitude = lateralDecay * verticalDecay;

        samples.push({
          id: `field-${ix}-${iz}-${iy}`,
          xM: pathPoint.xM,
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
    const tracePoint = samplePolylineAtFraction(getTraceCenterline(trace), xFraction);
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
          xM: tracePoint.xM,
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
  const minNormalizedMagnitude = options.minNormalizedMagnitude ?? 0.045;
  const maxMagnitudeVm = Math.max(fieldSolve.field.maxElectricFieldVm, 1);
  const displayMagnitudeVm = Math.max(percentileMagnitude(fieldSolve, 0.96), maxMagnitudeVm * 0.18, 1);
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
        const normalized = Math.min(1, field.magnitudeVm / displayMagnitudeVm);
        const physicalWeight = microstripFieldRegionWeight(fieldSolve, crossSectionXM, yM);
        const weighted = normalized * physicalWeight;
        if (weighted < minNormalizedMagnitude) continue;

        const densityGate = deterministicUnit(ix, iy, iz, 3);
        if (densityGate > Math.pow(weighted, 0.58)) continue;

        const softened = Math.sqrt(weighted);
        const sign = field.eyVm >= 0 ? 1 : -1;
        positions.push(
          xM + deterministicJitter(ix, iy, iz, 0) * lengthM * 0.003 * spacingMultiplier,
          yM + deterministicJitter(ix, iy, iz, 1) * yStopM * 0.02 * spacingMultiplier,
          crossSectionXM + deterministicJitter(ix, iy, iz, 2) * fieldSolve.grid.domainWidthM * 0.006 * spacingMultiplier
        );
        colors.push(...fieldColor(softened, sign));
        const direction = normalizeDirection({
          x: 0,
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

export function buildPowerFlowSamples(
  geometry: RfGeometry,
  options: {
    samplesAlongTrace?: number;
    lanes?: number;
  } = {}
): PowerFlowSample[] {
  const trace = geometry.traces[0];
  if (!trace) return [];

  const samplesAlongTrace = options.samplesAlongTrace ?? 20;
  const lanes = options.lanes ?? 2;
  const laneSpacingM = trace.widthM * 0.36;
  const yM = geometry.stack.substrateHeightM + geometry.stack.substrateHeightM * 0.2;
  const samples: PowerFlowSample[] = [];

  for (let lane = 0; lane < lanes; lane += 1) {
    const laneFraction = lanes === 1 ? 0.5 : lane / (lanes - 1);
    const laneOffsetM = (laneFraction - 0.5) * laneSpacingM * (lanes - 1);
    for (let ix = 0; ix < samplesAlongTrace; ix += 1) {
      const xFraction = samplesAlongTrace === 1 ? 0.5 : ix / (samplesAlongTrace - 1);
      const pathPoint = samplePolylineAtFraction(getTraceCenterline(trace), xFraction);
      samples.push({
        xM: pathPoint.xM,
        yM,
        zM: pathPoint.yM + laneOffsetM,
        amplitude: 1 - Math.abs(laneFraction - 0.5) * 0.22,
        phaseRad: xFraction * Math.PI * 2 + lane * 0.24
      });
    }
  }

  return samples;
}

export function buildPoyntingFlowStreamlines(
  geometry: RfGeometry,
  fieldSolve: FieldSolverResult,
  options: {
    streamlineCount?: number;
    pointsAlongTrace?: number;
    crossSectionSamplesX?: number;
    crossSectionSamplesY?: number;
    minNormalizedPower?: number;
  } = {}
): PowerFlowStreamline[] {
  const trace = geometry.traces[0];
  if (!trace) return [];

  const streamlineCount = options.streamlineCount ?? 18;
  const pointsAlongTrace = options.pointsAlongTrace ?? 44;
  const crossSectionSamplesX = options.crossSectionSamplesX ?? 30;
  const crossSectionSamplesY = options.crossSectionSamplesY ?? 14;
  const minNormalizedPower = options.minNormalizedPower ?? 0.04;
  const effectiveRelativePermittivity = estimateEffectiveRelativePermittivity(geometry);
  const etaEffectiveOhms = 376.730313668 / Math.sqrt(effectiveRelativePermittivity);
  const displayMagnitudeVm = Math.max(percentileMagnitude(fieldSolve, 0.96), fieldSolve.field.maxElectricFieldVm * 0.18, 1);
  const yStopM = Math.min(fieldSolve.grid.domainHeightM, fieldSolve.grid.substrateHeightM * 1.35);

  const candidates: Array<{
    zM: number;
    yM: number;
    normalizedPowerDensity: number;
    electricFieldVm: number;
    poyntingWPerM2: number;
  }> = [];

  for (let iy = 0; iy < crossSectionSamplesY; iy += 1) {
    const yFraction = crossSectionSamplesY === 1 ? 0.5 : iy / (crossSectionSamplesY - 1);
    const yM = yStopM * yFraction;

    for (let iz = 0; iz < crossSectionSamplesX; iz += 1) {
      const zFraction = crossSectionSamplesX === 1 ? 0.5 : iz / (crossSectionSamplesX - 1);
      const zM = fieldSolve.grid.domainWidthM * zFraction;
      const field = sampleFieldGrid(fieldSolve, zM, yM);
      const regionWeight = microstripFieldRegionWeight(fieldSolve, zM, yM);
      const normalizedField = Math.min(1, field.magnitudeVm / displayMagnitudeVm);
      // For a forward quasi-TEM wave, time-average Poynting density is proportional to |E_t|^2 / eta_eff.
      const normalizedPowerDensity = normalizedField * normalizedField * regionWeight;
      if (normalizedPowerDensity < minNormalizedPower) continue;

      candidates.push({
        zM,
        yM,
        normalizedPowerDensity,
        electricFieldVm: field.magnitudeVm,
        poyntingWPerM2: (field.magnitudeVm * field.magnitudeVm) / Math.max(etaEffectiveOhms, 1e-9)
      });
    }
  }

  candidates.sort((a, b) => b.normalizedPowerDensity - a.normalizedPowerDensity);

  const selected: typeof candidates = [];
  const minDistanceM = Math.max(trace.widthM * 0.18, fieldSolve.grid.dxM * 1.6);
  for (const candidate of candidates) {
    const hasNearby = selected.some((existing) =>
      Math.hypot(existing.zM - candidate.zM, existing.yM - candidate.yM) < minDistanceM
    );
    if (hasNearby) continue;
    selected.push(candidate);
    if (selected.length >= streamlineCount) break;
  }

  return selected.map((candidate, index) => ({
    id: `poynting-${index}`,
    points: buildTracePathPoints(trace, candidate.zM, candidate.yM, pointsAlongTrace),
    normalizedPowerDensity: Math.min(1, candidate.normalizedPowerDensity),
    electricFieldVm: candidate.electricFieldVm,
    poyntingWPerM2: candidate.poyntingWPerM2,
    etaEffectiveOhms,
    phaseRad: index * 0.37
  }));
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

function buildTracePathPoints(
  trace: NonNullable<RfGeometry["traces"][number]>,
  zM: number,
  yM: number,
  pointsAlongTrace: number
): Array<{ xM: number; yM: number; zM: number }> {
  const points: Array<{ xM: number; yM: number; zM: number }> = [];
  const centerline = getTraceCenterline(trace);
  const traceCenterYM = trace.yM + trace.widthM / 2;
  const lateralOffsetM = zM - traceCenterYM;
  for (let index = 0; index < pointsAlongTrace; index += 1) {
    const fraction = pointsAlongTrace === 1 ? 0.5 : index / (pointsAlongTrace - 1);
    const pathPoint = samplePolylineAtFraction(centerline, fraction);
    points.push({
      xM: pathPoint.xM,
      yM,
      zM: pathPoint.yM + lateralOffsetM
    });
  }
  return points;
}

function estimateEffectiveRelativePermittivity(geometry: RfGeometry): number {
  const trace = geometry.traces[0];
  if (!trace) return geometry.stack.substrate.relativePermittivity;
  const wh = trace.widthM / geometry.stack.substrateHeightM;
  const er = geometry.stack.substrate.relativePermittivity;
  return (
    (er + 1) / 2 +
    ((er - 1) / 2) * (1 / Math.sqrt(1 + 12 / wh) + (wh < 1 ? 0.04 * (1 - wh) ** 2 : 0))
  );
}

function deterministicJitter(ix: number, iy: number, iz: number, salt: number): number {
  return (deterministicUnit(ix, iy, iz, salt) - 0.5) * 2;
}

function deterministicUnit(ix: number, iy: number, iz: number, salt: number): number {
  const value = Math.sin((ix + 1) * 12.9898 + (iy + 1) * 78.233 + (iz + 1) * 37.719 + salt * 19.19);
  return value - Math.floor(value);
}

function microstripFieldRegionWeight(fieldSolve: FieldSolverResult, crossSectionXM: number, yM: number): number {
  const traceMin = fieldSolve.grid.traceMinXM;
  const traceMax = fieldSolve.grid.traceMaxXM;
  const traceWidth = Math.max(traceMax - traceMin, fieldSolve.grid.dxM);
  const substrateHeight = fieldSolve.grid.substrateHeightM;
  const insideTraceProjection = crossSectionXM >= traceMin && crossSectionXM <= traceMax;
  const distanceToTrace = insideTraceProjection
    ? 0
    : Math.min(Math.abs(crossSectionXM - traceMin), Math.abs(crossSectionXM - traceMax));
  const distanceToEdge = Math.min(Math.abs(crossSectionXM - traceMin), Math.abs(crossSectionXM - traceMax));
  const belowOrNearTrace = yM <= substrateHeight * 1.12;
  const underTraceWeight = insideTraceProjection && belowOrNearTrace ? 1 : 0;
  const edgeFringeWeight = Math.exp(-distanceToEdge / (traceWidth * 0.42));
  const lateralDecay = Math.exp(-distanceToTrace / (traceWidth * 1.25));
  const airDecay = yM <= substrateHeight ? 1 : Math.exp(-(yM - substrateHeight) / (substrateHeight * 0.32));
  const substrateBias = yM <= substrateHeight ? 1 : 0.38;
  return Math.min(1, Math.max(underTraceWeight, edgeFringeWeight * 0.95, lateralDecay * 0.35) * airDecay * substrateBias);
}

function percentileMagnitude(fieldSolve: FieldSolverResult, percentile: number): number {
  const magnitudes = fieldSolve.field.electricFieldXVm.map((exVm, index) =>
    Math.hypot(exVm, fieldSolve.field.electricFieldYVm[index] ?? 0)
  );
  magnitudes.sort((a, b) => a - b);
  const index = Math.max(0, Math.min(magnitudes.length - 1, Math.floor((magnitudes.length - 1) * percentile)));
  return magnitudes[index] ?? 1;
}
