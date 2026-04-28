import type { RfGeometry } from "../domain/geometry";

const EPSILON_0_F_PER_M = 8.854_187_8128e-12;
const SPEED_OF_LIGHT_M_PER_S = 299_792_458;

export type FieldSolverOptions = {
  cellsX?: number;
  cellsY?: number;
  airHeightMultiplier?: number;
  maxIterations?: number;
  tolerance?: number;
  relaxationFactor?: number;
};

export type FieldSolverResult = {
  characteristicImpedanceOhms: number;
  effectiveRelativePermittivity: number;
  capacitancePerMeterFPerM: number;
  airCapacitancePerMeterFPerM: number;
  iterations: number;
  residual: number;
  converged: boolean;
  field: {
    potentialV: number[];
    electricFieldXVm: number[];
    electricFieldYVm: number[];
    maxElectricFieldVm: number;
  };
  grid: {
    cellsX: number;
    cellsY: number;
    dxM: number;
    dyM: number;
    domainWidthM: number;
    domainHeightM: number;
    traceMinXM: number;
    traceMaxXM: number;
    substrateHeightM: number;
  };
};

type SolveResult = {
  potential: Float64Array;
  capacitancePerMeterFPerM: number;
  iterations: number;
  residual: number;
  converged: boolean;
};

type SolverConfig = Required<FieldSolverOptions> & {
  boardWidthM: number;
  substrateHeightM: number;
  domainHeightM: number;
  traceMinXM: number;
  traceMaxXM: number;
  traceYM: number;
  relativePermittivity: number;
};

export function solveMicrostripFiniteDifference(
  geometry: RfGeometry,
  options: FieldSolverOptions = {}
): FieldSolverResult {
  const trace = geometry.traces[0];
  if (!trace) throw new Error("Finite-difference microstrip solver requires at least one trace.");
  if (!geometry.stack.hasGroundPlane) throw new Error("Finite-difference microstrip solver requires a ground plane.");

  const config: SolverConfig = {
    cellsX: options.cellsX ?? 96,
    cellsY: options.cellsY ?? 72,
    airHeightMultiplier: options.airHeightMultiplier ?? 3,
    maxIterations: options.maxIterations ?? 12_000,
    tolerance: options.tolerance ?? 1e-5,
    relaxationFactor: options.relaxationFactor ?? 1.85,
    boardWidthM: geometry.boardWidthM,
    substrateHeightM: geometry.stack.substrateHeightM,
    domainHeightM: geometry.stack.substrateHeightM * (options.airHeightMultiplier ?? 3),
    traceMinXM: trace.yM,
    traceMaxXM: trace.yM + trace.widthM,
    traceYM: geometry.stack.substrateHeightM,
    relativePermittivity: geometry.stack.substrate.relativePermittivity
  };

  validateConfig(config);

  const dielectricSolve = solvePotential(config, config.relativePermittivity);
  const airSolve = solvePotential(config, 1);
  const effectiveRelativePermittivity =
    dielectricSolve.capacitancePerMeterFPerM / airSolve.capacitancePerMeterFPerM;
  const characteristicImpedanceOhms =
    1 / (SPEED_OF_LIGHT_M_PER_S * Math.sqrt(dielectricSolve.capacitancePerMeterFPerM * airSolve.capacitancePerMeterFPerM));

  return {
    characteristicImpedanceOhms,
    effectiveRelativePermittivity,
    capacitancePerMeterFPerM: dielectricSolve.capacitancePerMeterFPerM,
    airCapacitancePerMeterFPerM: airSolve.capacitancePerMeterFPerM,
    iterations: Math.max(dielectricSolve.iterations, airSolve.iterations),
    residual: Math.max(dielectricSolve.residual, airSolve.residual),
    converged: dielectricSolve.converged && airSolve.converged,
    field: buildFieldGrid(config, dielectricSolve.potential),
    grid: {
      cellsX: config.cellsX,
      cellsY: config.cellsY,
      dxM: config.boardWidthM / (config.cellsX - 1),
      dyM: config.domainHeightM / (config.cellsY - 1),
      domainWidthM: config.boardWidthM,
      domainHeightM: config.domainHeightM,
      traceMinXM: config.traceMinXM,
      traceMaxXM: config.traceMaxXM,
      substrateHeightM: config.substrateHeightM
    }
  };
}

function buildFieldGrid(config: SolverConfig, potential: Float64Array): FieldSolverResult["field"] {
  const electricFieldXVm = new Array<number>(potential.length).fill(0);
  const electricFieldYVm = new Array<number>(potential.length).fill(0);
  const dx = config.boardWidthM / (config.cellsX - 1);
  const dy = config.domainHeightM / (config.cellsY - 1);
  let maxElectricFieldVm = 0;

  for (let y = 0; y < config.cellsY; y += 1) {
    for (let x = 0; x < config.cellsX; x += 1) {
      const left = potential[gridIndex(Math.max(0, x - 1), y, config.cellsX)];
      const right = potential[gridIndex(Math.min(config.cellsX - 1, x + 1), y, config.cellsX)];
      const down = potential[gridIndex(x, Math.max(0, y - 1), config.cellsX)];
      const up = potential[gridIndex(x, Math.min(config.cellsY - 1, y + 1), config.cellsX)];
      const ex = -(right - left) / (x === 0 || x === config.cellsX - 1 ? dx : 2 * dx);
      const ey = -(up - down) / (y === 0 || y === config.cellsY - 1 ? dy : 2 * dy);
      const index = gridIndex(x, y, config.cellsX);
      electricFieldXVm[index] = ex;
      electricFieldYVm[index] = ey;
      maxElectricFieldVm = Math.max(maxElectricFieldVm, Math.hypot(ex, ey));
    }
  }

  return {
    potentialV: Array.from(potential),
    electricFieldXVm,
    electricFieldYVm,
    maxElectricFieldVm
  };
}

function solvePotential(config: SolverConfig, substrateRelativePermittivity: number): SolveResult {
  const { cellsX, cellsY, maxIterations, tolerance, relaxationFactor } = config;
  const potential = new Float64Array(cellsX * cellsY);
  const fixed = new Uint8Array(cellsX * cellsY);
  initializeBoundaryConditions({ config, potential, fixed });

  let residual = Number.POSITIVE_INFINITY;
  let iterations = 0;

  for (iterations = 0; iterations < maxIterations; iterations += 1) {
    residual = 0;

    for (let y = 1; y < cellsY - 1; y += 1) {
      for (let x = 1; x < cellsX - 1; x += 1) {
        const index = gridIndex(x, y, cellsX);
        if (fixed[index]) continue;

        const epsEast = facePermittivity(config, x, y, x + 1, y, substrateRelativePermittivity);
        const epsWest = facePermittivity(config, x, y, x - 1, y, substrateRelativePermittivity);
        const epsNorth = facePermittivity(config, x, y, x, y + 1, substrateRelativePermittivity);
        const epsSouth = facePermittivity(config, x, y, x, y - 1, substrateRelativePermittivity);
        const weighted =
          epsEast * potential[gridIndex(x + 1, y, cellsX)] +
          epsWest * potential[gridIndex(x - 1, y, cellsX)] +
          epsNorth * potential[gridIndex(x, y + 1, cellsX)] +
          epsSouth * potential[gridIndex(x, y - 1, cellsX)];
        const next = weighted / (epsEast + epsWest + epsNorth + epsSouth);
        const relaxed = potential[index] + relaxationFactor * (next - potential[index]);
        const delta = Math.abs(relaxed - potential[index]);
        potential[index] = relaxed;
        residual = Math.max(residual, delta);
      }
    }

    applyNeumannEdges(config, potential, fixed);
    if (residual < tolerance) break;
  }

  return {
    potential,
    capacitancePerMeterFPerM: calculateTraceChargeCapacitancePerMeter(config, potential, fixed, substrateRelativePermittivity),
    iterations: iterations + 1,
    residual,
    converged: residual < tolerance
  };
}

function initializeBoundaryConditions({
  config,
  potential,
  fixed
}: {
  config: SolverConfig;
  potential: Float64Array;
  fixed: Uint8Array;
}) {
  for (let x = 0; x < config.cellsX; x += 1) {
    const groundIndex = gridIndex(x, 0, config.cellsX);
    potential[groundIndex] = 0;
    fixed[groundIndex] = 1;
  }

  for (let y = 0; y < config.cellsY; y += 1) {
    const yM = yCoordinate(config, y);
    for (let x = 0; x < config.cellsX; x += 1) {
      const xM = xCoordinate(config, x);
      if (isTraceNode(config, xM, yM)) {
        const index = gridIndex(x, y, config.cellsX);
        potential[index] = 1;
        fixed[index] = 1;
      }
    }
  }
}

function applyNeumannEdges(config: SolverConfig, potential: Float64Array, fixed: Uint8Array) {
  for (let y = 1; y < config.cellsY - 1; y += 1) {
    const left = gridIndex(0, y, config.cellsX);
    const right = gridIndex(config.cellsX - 1, y, config.cellsX);
    if (!fixed[left]) potential[left] = potential[gridIndex(1, y, config.cellsX)];
    if (!fixed[right]) potential[right] = potential[gridIndex(config.cellsX - 2, y, config.cellsX)];
  }

  for (let x = 0; x < config.cellsX; x += 1) {
    const top = gridIndex(x, config.cellsY - 1, config.cellsX);
    if (!fixed[top]) potential[top] = potential[gridIndex(x, config.cellsY - 2, config.cellsX)];
  }
}

function calculateTraceChargeCapacitancePerMeter(
  config: SolverConfig,
  potential: Float64Array,
  fixed: Uint8Array,
  substrateRelativePermittivity: number
): number {
  const dx = config.boardWidthM / (config.cellsX - 1);
  const dy = config.domainHeightM / (config.cellsY - 1);
  let chargeIntegral = 0;

  for (let y = 1; y < config.cellsY - 1; y += 1) {
    for (let x = 1; x < config.cellsX - 1; x += 1) {
      const index = gridIndex(x, y, config.cellsX);
      if (!fixed[index] || potential[index] < 0.5) continue;

      chargeIntegral += traceFaceCharge(config, potential, fixed, x, y, x + 1, y, dy, dx, substrateRelativePermittivity);
      chargeIntegral += traceFaceCharge(config, potential, fixed, x, y, x - 1, y, dy, dx, substrateRelativePermittivity);
      chargeIntegral += traceFaceCharge(config, potential, fixed, x, y, x, y + 1, dx, dy, substrateRelativePermittivity);
      chargeIntegral += traceFaceCharge(config, potential, fixed, x, y, x, y - 1, dx, dy, substrateRelativePermittivity);
    }
  }

  return EPSILON_0_F_PER_M * chargeIntegral;
}

function traceFaceCharge(
  config: SolverConfig,
  potential: Float64Array,
  fixed: Uint8Array,
  traceX: number,
  traceY: number,
  neighborX: number,
  neighborY: number,
  faceLengthM: number,
  spacingM: number,
  substrateRelativePermittivity: number
): number {
  const neighborIndex = gridIndex(neighborX, neighborY, config.cellsX);
  if (fixed[neighborIndex] && potential[neighborIndex] > 0.5) return 0;

  const epsFace = facePermittivity(
    config,
    traceX,
    traceY,
    neighborX,
    neighborY,
    substrateRelativePermittivity
  );
  return epsFace * Math.max(0, potential[gridIndex(traceX, traceY, config.cellsX)] - potential[neighborIndex]) * faceLengthM / spacingM;
}

function facePermittivity(
  config: SolverConfig,
  xA: number,
  yA: number,
  xB: number,
  yB: number,
  substrateRelativePermittivity: number
): number {
  const epsA = relativePermittivityAt(config, xCoordinate(config, xA), yCoordinate(config, yA), substrateRelativePermittivity);
  const epsB = relativePermittivityAt(config, xCoordinate(config, xB), yCoordinate(config, yB), substrateRelativePermittivity);
  return 2 / (1 / epsA + 1 / epsB);
}

function relativePermittivityAt(
  config: SolverConfig,
  _xM: number,
  yM: number,
  substrateRelativePermittivity: number
): number {
  return yM <= config.substrateHeightM ? substrateRelativePermittivity : 1;
}

function isTraceNode(config: SolverConfig, xM: number, yM: number): boolean {
  const dy = config.domainHeightM / (config.cellsY - 1);
  return (
    Math.abs(yM - config.traceYM) <= dy * 0.75 &&
    xM >= config.traceMinXM &&
    xM <= config.traceMaxXM
  );
}

function xCoordinate(config: SolverConfig, x: number): number {
  return (x / (config.cellsX - 1)) * config.boardWidthM;
}

function yCoordinate(config: SolverConfig, y: number): number {
  return (y / (config.cellsY - 1)) * config.domainHeightM;
}

function gridIndex(x: number, y: number, cellsX: number): number {
  return y * cellsX + x;
}

function validateConfig(config: SolverConfig) {
  if (config.cellsX < 16 || config.cellsY < 16) throw new Error("Field solver grid must be at least 16 x 16 cells.");
  if (config.traceMinXM < 0 || config.traceMaxXM > config.boardWidthM) {
    throw new Error("Trace must fit inside the cross-section domain.");
  }
  if (config.domainHeightM <= config.substrateHeightM) {
    throw new Error("Field solver domain must include air above the substrate.");
  }
}
