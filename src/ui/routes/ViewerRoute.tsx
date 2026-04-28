import { OrbitControls, Text } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  ShaderMaterial,
  Uint16BufferAttribute,
  Uint32BufferAttribute,
  Vector3
} from "three";
import { mToMm, type RfGeometry } from "../../domain/geometry";
import {
  buildConnectorProbeFrames,
  buildPowerFlowSamples,
  buildTraceFieldSamples,
  estimateFieldSolveMs,
  sampleInstantaneousField,
  type ConnectorProbeFrame,
  type FieldSample,
  type PowerFlowSample
} from "../../fields/fieldSampling";
import { buildExtrudedGeometryMesh, type ExtrudedMeshSolid } from "../../geometry/extrudedMesh";
import { getAnalyticalModelDescriptor, type AnalyticalModelId } from "../../physics/analyticalModels";
import { buildFieldDiagnostics } from "../../simulation/fieldDiagnostics";
import type { FieldSolverWorkerResponse } from "../../simulation/fieldSolverWorkerMessages";
import { solveMicrostripFiniteDifference, type FieldSolverOptions, type FieldSolverResult } from "../../simulation/finiteDifferenceMicrostrip";

type Props = {
  geometry: RfGeometry;
  modelId: AnalyticalModelId;
};

type FieldVisualSettings = {
  opacity: number;
  pointScale: number;
  spacing: number;
  volumeHeight: number;
  powerFlow: boolean;
};

type FieldCellGrid = {
  positions: number[];
  relevance: number[];
  phases: number[];
  local: number[];
  indices: number[];
};

export function ViewerRoute({ geometry, modelId }: Props) {
  const model = getAnalyticalModelDescriptor(modelId);
  const mesh = buildExtrudedGeometryMesh(geometry);
  const [fieldMode, setFieldMode] = useState<"solver" | "excitation">("solver");
  const [fieldSettings, setFieldSettings] = useState<Required<Pick<FieldSolverOptions, "cellsX" | "cellsY" | "maxIterations" | "tolerance">>>({
    cellsX: 64,
    cellsY: 48,
    maxIterations: 7_000,
    tolerance: 8e-5
  });
  const [fieldVisualSettings, setFieldVisualSettings] = useState<FieldVisualSettings>({
    opacity: 0.95,
    pointScale: 1.35,
    spacing: 0.75,
    volumeHeight: 1.35,
    powerFlow: false
  });
  const [selectedSample, setSelectedSample] = useState<FieldSample | null>(null);
  const [probeFrames, setProbeFrames] = useState<ConnectorProbeFrame[]>(() =>
    buildConnectorProbeFrames({ geometry, animationPhaseRad: 0 })
  );
  const [fieldSolve, setFieldSolve] = useState<FieldSolverResult>(() =>
    solveMicrostripFiniteDifference(geometry, fieldSettings)
  );
  const [isSolving, setIsSolving] = useState(false);
  const [elapsedSolveMs, setElapsedSolveMs] = useState(0);
  const [solveError, setSolveError] = useState<string | null>(null);
  const solveStartedAtRef = useRef<number | null>(null);
  const solveRequestIdRef = useRef(0);
  const projectedSolveMs = useMemo(() => estimateFieldSolveMs(fieldSettings), [fieldSettings]);

  useEffect(() => {
    let cancelled = false;
    let worker: Worker | null = null;
    const started = performance.now();
    const requestId = solveRequestIdRef.current + 1;
    solveRequestIdRef.current = requestId;
    solveStartedAtRef.current = started;
    setIsSolving(true);
    setElapsedSolveMs(0);
    setSolveError(null);

    const finishSolve = (nextSolve: FieldSolverResult, runtimeMs: number) => {
      if (cancelled || solveRequestIdRef.current !== requestId) return;
      setFieldSolve(nextSolve);
      setSelectedSample(null);
      setElapsedSolveMs(runtimeMs);
      setIsSolving(false);
      solveStartedAtRef.current = null;
    };

    const runOnMainThread = () => {
      const nextSolve = solveMicrostripFiniteDifference(geometry, fieldSettings);
      finishSolve(nextSolve, performance.now() - started);
    };

    const timer = window.setTimeout(() => {
      if (typeof Worker === "undefined") {
        runOnMainThread();
        return;
      }

      worker = new Worker(new URL("../../simulation/fieldSolver.worker.ts", import.meta.url), {
        type: "module"
      });
      worker.onmessage = (event: MessageEvent<FieldSolverWorkerResponse>) => {
        if (cancelled || event.data.requestId !== requestId) return;

        if (event.data.ok) {
          finishSolve(event.data.result, event.data.runtimeMs);
        } else {
          setSolveError(event.data.error);
          setIsSolving(false);
          solveStartedAtRef.current = null;
        }
        worker?.terminate();
      };
      worker.onerror = () => {
        if (cancelled) return;
        setSolveError("Worker solve failed; rerunning on the main thread.");
        runOnMainThread();
        worker?.terminate();
      };
      worker.postMessage({ requestId, geometry, options: fieldSettings });
    }, 20);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      worker?.terminate();
      solveStartedAtRef.current = null;
    };
  }, [fieldSettings, geometry]);

  useEffect(() => {
    if (!isSolving) return undefined;

    const interval = window.setInterval(() => {
      const started = solveStartedAtRef.current;
      if (started) setElapsedSolveMs(performance.now() - started);
    }, 120);

    return () => window.clearInterval(interval);
  }, [isSolving]);

  useEffect(() => {
    const started = performance.now();
    const interval = window.setInterval(() => {
      const elapsedS = (performance.now() - started) / 1000;
      setProbeFrames(
        buildConnectorProbeFrames({
          geometry,
          animationPhaseRad: elapsedS * Math.PI * 1.6
        })
      );
    }, 160);

    return () => window.clearInterval(interval);
  }, [geometry]);

  return (
    <section className="route viewer-route">
      <header className="route-header">
        <div>
          <p className="eyebrow">3D extruded mesh</p>
          <h1>{model.label}</h1>
        </div>
        <div className="mesh-summary">
          <span>{mesh.summary.solids} solids</span>
          <span>{mesh.summary.vertices} vertices</span>
          <span>{mesh.summary.faces} faces</span>
        </div>
      </header>
      <div className="section-heading-row">
        <p className="field-note">
          {fieldMode === "solver"
            ? "Solver field shows transverse quasi-TEM E-field from trace to ground/fringing edges; amber markers show power flow along the line."
            : "Excitation preview animates the driven signal direction and phase before solving; it is useful for source inspection, not a numerical field result."}
        </p>
        <div className="segmented-control" aria-label="Field visualization mode">
          <button className={fieldMode === "solver" ? "active" : ""} onClick={() => setFieldMode("solver")}>
            Solver-derived
          </button>
          <button className={fieldMode === "excitation" ? "active" : ""} onClick={() => setFieldMode("excitation")}>
            Excitation preview
          </button>
        </div>
      </div>
      <FieldSolverControls settings={fieldSettings} onSettingsChange={setFieldSettings} />
      <FieldVisualControls settings={fieldVisualSettings} onSettingsChange={setFieldVisualSettings} />
      {solveError && <p className="stale-text">{solveError}</p>}
      <div className="viewer-shell">
        {isSolving && (projectedSolveMs > 1_000 || elapsedSolveMs > 1_000) && (
          <SolveOverlay elapsedMs={elapsedSolveMs} projectedMs={projectedSolveMs} />
        )}
        <Canvas camera={{ position: [34, 28, 46], fov: 38 }}>
          <color attach="background" args={["#eef4f1"]} />
          <ambientLight intensity={0.7} />
          <directionalLight position={[12, 20, 10]} intensity={1.2} />
          <ExtrudedMeshScene
            geometry={geometry}
            solids={mesh.solids}
            modelId={modelId}
            fieldMode={fieldMode}
            fieldSolve={fieldSolve}
            visualSettings={fieldVisualSettings}
            onSelectSample={setSelectedSample}
          />
          <OrbitControls makeDefault enableDamping />
        </Canvas>
      </div>
      <CrossSectionFieldPanel geometry={geometry} fieldSolve={fieldSolve} />
      <FieldDiagnosticsPanel
        fieldSolve={fieldSolve}
        selectedSample={selectedSample}
        onExport={() => exportFieldSnapshot({ geometry, fieldSolve })}
      />
      <RefinementSuggestionsPanel fieldSolve={fieldSolve} />
      <ConnectorTerminal frames={probeFrames} />
    </section>
  );
}

function CrossSectionFieldPanel({
  geometry,
  fieldSolve
}: {
  geometry: RfGeometry;
  fieldSolve: FieldSolverResult;
}) {
  const trace = geometry.traces[0];
  const width = 720;
  const height = 280;
  const padding = 28;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;
  const domainWidthM = fieldSolve.grid.domainWidthM;
  const domainHeightM = Math.min(fieldSolve.grid.domainHeightM, fieldSolve.grid.substrateHeightM * 2.2);
  const maxMagnitude = Math.max(fieldMagnitudePercentile(fieldSolve, 0.96), 1);
  const cells = buildCrossSectionCells(fieldSolve, domainHeightM, maxMagnitude);
  const arrows = buildCrossSectionArrows(fieldSolve, domainHeightM, maxMagnitude);
  const xScale = (xM: number) => padding + (xM / domainWidthM) * plotWidth;
  const yScale = (yM: number) => padding + plotHeight - (yM / domainHeightM) * plotHeight;
  const substrateY = yScale(fieldSolve.grid.substrateHeightM);
  const groundY = yScale(0);

  return (
    <div className="field-reference-panel">
      <div>
        <p className="eyebrow">Cross-section reference</p>
        <h2>Solver E-field slice</h2>
        <p className="field-note">
          Heatmap opacity follows |E|. Arrows show local transverse E direction from the finite-difference solve.
        </p>
      </div>
      <svg className="field-cross-section" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Microstrip E-field cross-section">
        <defs>
          <marker id="field-arrowhead" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <path d="M0,0 L7,3.5 L0,7 Z" fill="#1d2934" opacity="0.72" />
          </marker>
        </defs>
        <rect x={padding} y={padding} width={plotWidth} height={plotHeight} fill="#eef4f1" rx="4" />
        <rect
          x={padding}
          y={substrateY}
          width={plotWidth}
          height={groundY - substrateY}
          fill="#7db7a0"
          opacity="0.36"
        />
        {cells.map((cell) => (
          <rect
            key={cell.id}
            x={xScale(cell.x0M)}
            y={yScale(cell.y1M)}
            width={Math.max(1, xScale(cell.x1M) - xScale(cell.x0M))}
            height={Math.max(1, yScale(cell.y0M) - yScale(cell.y1M))}
            fill={cell.color}
            opacity={cell.opacity}
          />
        ))}
        {arrows.map((arrow) => (
          <line
            key={arrow.id}
            x1={xScale(arrow.xM)}
            y1={yScale(arrow.yM)}
            x2={xScale(arrow.xM + arrow.dxM)}
            y2={yScale(arrow.yM + arrow.dyM)}
            stroke="#1d2934"
            strokeWidth={1.2 + arrow.strength * 1.6}
            opacity={0.32 + arrow.strength * 0.58}
            markerEnd="url(#field-arrowhead)"
          />
        ))}
        <line x1={padding} y1={groundY} x2={padding + plotWidth} y2={groundY} stroke="#9a5a22" strokeWidth="4" />
        {trace && (
          <rect
            x={xScale(trace.yM)}
            y={substrateY - 6}
            width={xScale(trace.yM + trace.widthM) - xScale(trace.yM)}
            height={8}
            fill="#8f3c11"
            rx="2"
          />
        )}
        <text x={padding} y={padding - 8} fill="#50656e" fontSize="12">air</text>
        <text x={padding} y={substrateY + 16} fill="#50656e" fontSize="12">substrate</text>
        <text x={padding} y={groundY - 8} fill="#765800" fontSize="12">ground plane</text>
        {trace && <text x={xScale(trace.yM + trace.widthM / 2)} y={substrateY - 12} fill="#5b250b" fontSize="12" textAnchor="middle">trace</text>}
      </svg>
    </div>
  );
}

function ExtrudedMeshScene({
  geometry,
  solids,
  modelId,
  fieldMode,
  fieldSolve,
  visualSettings,
  onSelectSample
}: {
  geometry: RfGeometry;
  solids: ExtrudedMeshSolid[];
  modelId: AnalyticalModelId;
  fieldMode: "solver" | "excitation";
  fieldSolve: FieldSolverResult;
  visualSettings: FieldVisualSettings;
  onSelectSample: (sample: FieldSample) => void;
}) {
  const boardLengthMm = mToMm(geometry.boardLengthM);
  const substrateHeightMm = mToMm(geometry.stack.substrateHeightM);
  const boardWidthMm = mToMm(geometry.boardWidthM);
  const trace = geometry.traces[0];
  const model = getAnalyticalModelDescriptor(modelId);
  const fieldSamples = useMemo(
    () => fieldMode === "solver" ? [] : buildTraceFieldSamples(geometry),
    [fieldMode, geometry]
  );
  const fieldCellGrid = useMemo(
    () => buildFieldCellGrid(geometry, fieldSolve, visualSettings),
    [fieldSolve, geometry, visualSettings]
  );
  const powerFlowSamples = useMemo(() => buildPowerFlowSamples(geometry), [geometry]);

  return (
    <group position={[-boardLengthMm / 2, -substrateHeightMm / 2, -boardWidthMm / 2]}>
      {solids.map((solid) => (
        <MeshSolid key={solid.id} solid={solid} />
      ))}
      {fieldMode === "solver" && (
        <>
          <FieldCellGridMesh grid={fieldCellGrid} visualSettings={visualSettings} />
          {visualSettings.powerFlow && <PowerFlowLayer samples={powerFlowSamples} />}
        </>
      )}
      <AnimatedFieldHeatmap samples={fieldSamples} onSelectSample={onSelectSample} />
      {trace && (
        <>
          <DimensionLabel
            text={`${mToMm(trace.lengthM).toFixed(1)} mm`}
            position={[
              mToMm(trace.xM + trace.lengthM / 2),
              substrateHeightMm + 2.2,
              mToMm(trace.yM) - 2.5
            ]}
          />
          <DimensionLabel
            text={`${mToMm(trace.widthM).toFixed(2)} mm`}
            position={[
              mToMm(trace.xM + trace.lengthM) + 3,
              substrateHeightMm + 1.4,
              mToMm(trace.yM + trace.widthM / 2)
            ]}
          />
        </>
      )}
      {modelId === "stripline" && (
        <DimensionLabel
          text={`b ${substrateHeightMm.toFixed(2)} mm`}
          position={[boardLengthMm / 2, substrateHeightMm / 2 + 2.4, boardWidthMm / 2]}
        />
      )}
      <DimensionLabel text={model.label} position={[boardLengthMm / 2, substrateHeightMm + 4, boardWidthMm / 2]} />
    </group>
  );
}

function scaledSampleCount(base: number, pointScale: number, spacing: number): number {
  return Math.max(4, Math.round((base * pointScale) / spacing));
}

function FieldCellGridMesh({
  grid,
  visualSettings
}: {
  grid: FieldCellGrid;
  visualSettings: FieldVisualSettings;
}) {
  const materialRef = useRef<ShaderMaterial>(null);
  const geometry = useMemo(() => {
    const bufferGeometry = new BufferGeometry();
    bufferGeometry.setAttribute("position", new Float32BufferAttribute(grid.positions, 3));
    bufferGeometry.setAttribute("cellRelevance", new Float32BufferAttribute(grid.relevance, 1));
    bufferGeometry.setAttribute("cellPhase", new Float32BufferAttribute(grid.phases, 1));
    bufferGeometry.setAttribute("cellLocal", new Float32BufferAttribute(grid.local, 2));
    bufferGeometry.setIndex(new Uint32BufferAttribute(grid.indices, 1));
    bufferGeometry.computeVertexNormals();
    return bufferGeometry;
  }, [grid]);

  useFrame(({ clock }) => {
    if (materialRef.current) materialRef.current.uniforms.time.value = clock.elapsedTime;
  });

  return (
    <mesh geometry={geometry}>
      <shaderMaterial
        ref={materialRef}
        transparent
        depthWrite={false}
        side={DoubleSide}
        uniforms={{
          time: { value: 0 },
          opacityScale: { value: visualSettings.opacity }
        }}
        vertexShader={fieldCellVertexShader}
        fragmentShader={fieldCellFragmentShader}
      />
    </mesh>
  );
}

function buildFieldCellGrid(
  geometry: RfGeometry,
  fieldSolve: FieldSolverResult,
  visualSettings: FieldVisualSettings
): FieldCellGrid {
  const trace = geometry.traces[0];
  if (!trace) return { positions: [], relevance: [], phases: [], local: [], indices: [] };

  const lengthSlices = scaledSampleCount(22, visualSettings.pointScale, visualSettings.spacing);
  const cellStride = Math.max(1, Math.round((visualSettings.spacing * 1.6) / Math.max(0.55, visualSettings.pointScale)));
  const yLimitM = Math.min(fieldSolve.grid.domainHeightM, fieldSolve.grid.substrateHeightM * visualSettings.volumeHeight);
  const maxDisplayMagnitudeVm = Math.max(fieldMagnitudePercentile(fieldSolve, 0.96), fieldSolve.field.maxElectricFieldVm * 0.18, 1);
  const positions: number[] = [];
  const relevance: number[] = [];
  const phases: number[] = [];
  const local: number[] = [];
  const indices: number[] = [];

  for (let slice = 0; slice < lengthSlices; slice += 1) {
    const sliceStartFraction = slice / lengthSlices;
    const sliceStopFraction = (slice + 1) / lengthSlices;
    const x0M = trace.xM + trace.lengthM * sliceStartFraction;
    const x1M = trace.xM + trace.lengthM * sliceStopFraction;
    const xFraction = (sliceStartFraction + sliceStopFraction) / 2;
    const phase = xFraction * Math.PI * 2;

    for (let gy = 0; gy < fieldSolve.grid.cellsY - 1; gy += cellStride) {
      const y0M = gy * fieldSolve.grid.dyM;
      const y1M = Math.min(yLimitM, (gy + cellStride) * fieldSolve.grid.dyM);
      if (y0M >= yLimitM) continue;

      for (let gx = 0; gx < fieldSolve.grid.cellsX - 1; gx += cellStride) {
        const z0M = gx * fieldSolve.grid.dxM;
        const z1M = Math.min(fieldSolve.grid.domainWidthM, (gx + cellStride) * fieldSolve.grid.dxM);
        const centerZM = (z0M + z1M) / 2;
        const centerYM = (y0M + y1M) / 2;
        const field = sampleFieldCell(fieldSolve, centerZM, centerYM);
        const normalized = Math.min(1, field / maxDisplayMagnitudeVm);
        const weight = normalized * microstripCellRegionWeight(fieldSolve, centerZM, centerYM);
        if (weight < 0.035) continue;

        const cellRelevance = Math.min(1, Math.pow(weight, 0.62));
        pushFieldVolumeSplat({
          positions,
          relevance,
          phases,
          local,
          indices,
          x0M,
          x1M,
          y0M,
          y1M,
          z0M,
          z1M,
          cellRelevance,
          phase
        });
      }
    }
  }

  return { positions, relevance, phases, local, indices };
}

function pushFieldVolumeSplat({
  positions,
  relevance,
  phases,
  local,
  indices,
  x0M,
  x1M,
  y0M,
  y1M,
  z0M,
  z1M,
  cellRelevance,
  phase
}: {
  positions: number[];
  relevance: number[];
  phases: number[];
  local: number[];
  indices: number[];
  x0M: number;
  x1M: number;
  y0M: number;
  y1M: number;
  z0M: number;
  z1M: number;
  cellRelevance: number;
  phase: number;
}) {
  const x0 = mToMm(x0M);
  const x1 = mToMm(x1M);
  const y0 = mToMm(y0M);
  const y1 = mToMm(y1M);
  const z0 = mToMm(z0M);
  const z1 = mToMm(z1M);
  const xc = (x0 + x1) / 2;
  const yc = (y0 + y1) / 2;
  const zc = (z0 + z1) / 2;

  pushSoftQuad(positions, relevance, phases, local, indices, cellRelevance, phase, [
    [x0, y0, zc],
    [x1, y0, zc],
    [x1, y1, zc],
    [x0, y1, zc]
  ]);
  pushSoftQuad(positions, relevance, phases, local, indices, cellRelevance * 0.82, phase, [
    [xc, y0, z0],
    [xc, y0, z1],
    [xc, y1, z1],
    [xc, y1, z0]
  ]);
  pushSoftQuad(positions, relevance, phases, local, indices, cellRelevance * 0.54, phase, [
    [x0, yc, z0],
    [x1, yc, z0],
    [x1, yc, z1],
    [x0, yc, z1]
  ]);
}

function pushSoftQuad(
  positions: number[],
  relevance: number[],
  phases: number[],
  local: number[],
  indices: number[],
  cellRelevance: number,
  phase: number,
  vertices: Array<[number, number, number]>
) {
  const base = positions.length / 3;
  for (const [x, y, z] of vertices) {
    positions.push(x, y, z);
    relevance.push(cellRelevance);
    phases.push(phase);
  }
  local.push(0, 0, 1, 0, 1, 1, 0, 1);
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function sampleFieldCell(fieldSolve: FieldSolverResult, xM: number, yM: number): number {
  const x = Math.max(0, Math.min(fieldSolve.grid.cellsX - 1, Math.round(xM / fieldSolve.grid.dxM)));
  const y = Math.max(0, Math.min(fieldSolve.grid.cellsY - 1, Math.round(yM / fieldSolve.grid.dyM)));
  const index = y * fieldSolve.grid.cellsX + x;
  return Math.hypot(
    fieldSolve.field.electricFieldXVm[index] ?? 0,
    fieldSolve.field.electricFieldYVm[index] ?? 0
  );
}

function microstripCellRegionWeight(fieldSolve: FieldSolverResult, crossSectionXM: number, yM: number): number {
  const traceMin = fieldSolve.grid.traceMinXM;
  const traceMax = fieldSolve.grid.traceMaxXM;
  const traceWidth = Math.max(traceMax - traceMin, fieldSolve.grid.dxM);
  const substrateHeight = fieldSolve.grid.substrateHeightM;
  const insideTraceProjection = crossSectionXM >= traceMin && crossSectionXM <= traceMax;
  const distanceToTrace = insideTraceProjection
    ? 0
    : Math.min(Math.abs(crossSectionXM - traceMin), Math.abs(crossSectionXM - traceMax));
  const distanceToEdge = Math.min(Math.abs(crossSectionXM - traceMin), Math.abs(crossSectionXM - traceMax));
  const underTrace = insideTraceProjection && yM <= substrateHeight ? 1 : 0;
  const edgeFringe = Math.exp(-distanceToEdge / (traceWidth * 0.42));
  const lateralDecay = Math.exp(-distanceToTrace / (traceWidth * 1.1));
  const airDecay = yM <= substrateHeight ? 1 : Math.exp(-(yM - substrateHeight) / (substrateHeight * 0.28));
  const substrateBias = yM <= substrateHeight ? 1 : 0.3;
  return Math.min(1, Math.max(underTrace, edgeFringe * 0.92, lateralDecay * 0.3) * airDecay * substrateBias);
}

function fieldMagnitudePercentile(fieldSolve: FieldSolverResult, percentile: number): number {
  const values = fieldSolve.field.electricFieldXVm.map((exVm, index) =>
    Math.hypot(exVm, fieldSolve.field.electricFieldYVm[index] ?? 0)
  );
  values.sort((a, b) => a - b);
  const index = Math.max(0, Math.min(values.length - 1, Math.floor((values.length - 1) * percentile)));
  return values[index] ?? 1;
}

function buildCrossSectionCells(
  fieldSolve: FieldSolverResult,
  domainHeightM: number,
  maxMagnitude: number
) {
  const cells: Array<{
    id: string;
    x0M: number;
    x1M: number;
    y0M: number;
    y1M: number;
    opacity: number;
    color: string;
  }> = [];
  const strideX = Math.max(1, Math.round(fieldSolve.grid.cellsX / 48));
  const strideY = Math.max(1, Math.round(fieldSolve.grid.cellsY / 32));

  for (let y = 0; y < fieldSolve.grid.cellsY - 1; y += strideY) {
    const y0M = y * fieldSolve.grid.dyM;
    const y1M = Math.min(domainHeightM, (y + strideY) * fieldSolve.grid.dyM);
    if (y0M >= domainHeightM) continue;

    for (let x = 0; x < fieldSolve.grid.cellsX - 1; x += strideX) {
      const x0M = x * fieldSolve.grid.dxM;
      const x1M = Math.min(fieldSolve.grid.domainWidthM, (x + strideX) * fieldSolve.grid.dxM);
      const field = sampleFieldCell(fieldSolve, (x0M + x1M) / 2, (y0M + y1M) / 2);
      const relevance = Math.min(1, field / maxMagnitude) * microstripCellRegionWeight(fieldSolve, (x0M + x1M) / 2, (y0M + y1M) / 2);
      if (relevance < 0.025) continue;
      const warm = Math.min(255, Math.round(40 + relevance * 215));
      const cool = Math.min(255, Math.round(120 + relevance * 105));
      cells.push({
        id: `${x}-${y}`,
        x0M,
        x1M,
        y0M,
        y1M,
        opacity: 0.12 + Math.pow(relevance, 0.72) * 0.76,
        color: relevance > 0.42 ? `rgb(${warm}, 80, 42)` : `rgb(42, ${cool}, 210)`
      });
    }
  }

  return cells;
}

function buildCrossSectionArrows(
  fieldSolve: FieldSolverResult,
  domainHeightM: number,
  maxMagnitude: number
) {
  const arrows: Array<{
    id: string;
    xM: number;
    yM: number;
    dxM: number;
    dyM: number;
    strength: number;
  }> = [];
  const strideX = Math.max(3, Math.round(fieldSolve.grid.cellsX / 18));
  const strideY = Math.max(3, Math.round(fieldSolve.grid.cellsY / 12));
  const arrowLengthM = Math.min(fieldSolve.grid.domainWidthM, domainHeightM) * 0.045;

  for (let y = 1; y < fieldSolve.grid.cellsY - 1; y += strideY) {
    const yM = y * fieldSolve.grid.dyM;
    if (yM >= domainHeightM) continue;

    for (let x = 1; x < fieldSolve.grid.cellsX - 1; x += strideX) {
      const xM = x * fieldSolve.grid.dxM;
      const index = y * fieldSolve.grid.cellsX + x;
      const ex = fieldSolve.field.electricFieldXVm[index] ?? 0;
      const ey = fieldSolve.field.electricFieldYVm[index] ?? 0;
      const magnitude = Math.hypot(ex, ey);
      const relevance = Math.min(1, magnitude / maxMagnitude) * microstripCellRegionWeight(fieldSolve, xM, yM);
      if (relevance < 0.1 || magnitude === 0) continue;

      arrows.push({
        id: `${x}-${y}`,
        xM,
        yM,
        dxM: (ex / magnitude) * arrowLengthM * (0.55 + relevance),
        dyM: (ey / magnitude) * arrowLengthM * (0.55 + relevance),
        strength: Math.min(1, relevance)
      });
    }
  }

  return arrows;
}

const fieldCellVertexShader = `
  attribute float cellRelevance;
  attribute float cellPhase;
  attribute vec2 cellLocal;
  varying float vRelevance;
  varying float vPhase;
  varying vec2 vLocal;

  void main() {
    vRelevance = cellRelevance;
    vPhase = cellPhase;
    vLocal = cellLocal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fieldCellFragmentShader = `
  varying float vRelevance;
  varying float vPhase;
  varying vec2 vLocal;
  uniform float time;
  uniform float opacityScale;

  void main() {
    float signedWave = sin(time * 3.2 - vPhase);
    float wave = 0.5 + 0.5 * signedWave;
    vec3 red = vec3(1.0, 0.18, 0.1);
    vec3 blue = vec3(0.05, 0.42, 1.0);
    vec3 color = mix(blue, red, wave) * (0.72 + vRelevance * 0.42);
    vec2 centered = abs(vLocal - vec2(0.5));
    float radial = length(centered) * 2.0;
    float softCell = smoothstep(1.25, 0.05, radial);
    float alpha = opacityScale * vRelevance * softCell * (0.16 + 0.26 * abs(signedWave));
    if (alpha < 0.012) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

function PowerFlowLayer({ samples }: { samples: PowerFlowSample[] }) {
  return (
    <group>
      {samples.map((sample, index) => (
        <PowerFlowParticle key={`${sample.xM}-${sample.zM}-${index}`} sample={sample} />
      ))}
    </group>
  );
}

function PowerFlowParticle({ sample }: { sample: PowerFlowSample }) {
  const meshRef = useRef<Mesh>(null);
  const color = useMemo(() => new Color("#ffd45a"), []);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * Math.PI * 2.2 - sample.phaseRad);
    const material = meshRef.current.material as MeshStandardMaterial;
    meshRef.current.position.x = mToMm(sample.xM) + ((clock.elapsedTime * 8 + sample.phaseRad * 1.6) % mToMm(0.004));
    meshRef.current.scale.set(0.52 + pulse * 0.48, 0.52 + pulse * 0.18, 0.52 + pulse * 0.18);
    material.opacity = 0.08 + pulse * 0.34 * sample.amplitude;
    material.emissive.copy(color).multiplyScalar(0.32 + pulse * 0.62);
  });

  return (
    <mesh ref={meshRef} position={[mToMm(sample.xM), mToMm(sample.yM), mToMm(sample.zM)]} rotation={[0, 0, -Math.PI / 2]}>
      <coneGeometry args={[0.1, 0.44, 12]} />
      <meshStandardMaterial color="#ffd45a" emissive="#ffd45a" transparent opacity={0.22} depthWrite={false} />
    </mesh>
  );
}

function AnimatedFieldHeatmap({
  samples,
  onSelectSample
}: {
  samples: FieldSample[];
  onSelectSample: (sample: FieldSample) => void;
}) {
  return (
    <group>
      {samples.map((sample) => (
        <AnimatedFieldSample key={sample.id} sample={sample} onSelectSample={onSelectSample} />
      ))}
    </group>
  );
}

function AnimatedFieldSample({
  sample,
  onSelectSample
}: {
  sample: FieldSample;
  onSelectSample: (sample: FieldSample) => void;
}) {
  const meshRef = useRef<Mesh>(null);
  const arrowRef = useRef<Group>(null);
  const red = useMemo(() => new Color("#ff1f1f"), []);
  const blue = useMemo(() => new Color("#1677ff"), []);
  const neutral = useMemo(() => new Color("#edf3f5"), []);
  const direction = useMemo(() => new Vector3(sample.direction.x, sample.direction.y, sample.direction.z).normalize(), [sample]);
  const reverseDirection = useMemo(() => direction.clone().multiplyScalar(-1), [direction]);
  const up = useMemo(() => new Vector3(0, 1, 0), []);

  useFrame(({ clock }) => {
    if (!meshRef.current || !arrowRef.current) return;
    const value = sampleInstantaneousField(sample, clock.elapsedTime * Math.PI * 1.6);
    const magnitude = Math.min(1, Math.abs(value));
    const sphereMaterial = meshRef.current.material as MeshStandardMaterial;
    const arrowMesh = arrowRef.current.children[0] as Mesh;
    const arrowMaterial = arrowMesh.material as MeshStandardMaterial;
    const color = value >= 0 ? red : blue;
    const signedDirection = value >= 0 ? direction : reverseDirection;
    const orientation = new Quaternion().setFromUnitVectors(up, signedDirection);
    meshRef.current.scale.setScalar(0.65 + magnitude * 1.05);
    arrowRef.current.quaternion.copy(orientation);
    arrowRef.current.scale.set(0.9, 0.65 + magnitude * 1.6, 0.9);
    sphereMaterial.color.copy(neutral).lerp(color, magnitude);
    sphereMaterial.emissive.copy(color).multiplyScalar(0.45 + magnitude * 1.35);
    sphereMaterial.opacity = 0.28 + magnitude * 0.72;
    arrowMaterial.color.copy(color);
    arrowMaterial.emissive.copy(color).multiplyScalar(0.65 + magnitude * 1.55);
    arrowMaterial.opacity = 0.35 + magnitude * 0.65;
  });

  return (
    <group position={[mToMm(sample.xM), mToMm(sample.yM), mToMm(sample.zM)]}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.32, 14, 14]} />
        <meshStandardMaterial transparent opacity={0.55} depthWrite={false} emissiveIntensity={1.2} />
      </mesh>
      <group ref={arrowRef}>
        <mesh
          position={[0, 0.58, 0]}
          onPointerDown={(event) => {
            event.stopPropagation();
            onSelectSample(sample);
          }}
        >
          <coneGeometry args={[0.16, 0.78, 12]} />
          <meshStandardMaterial transparent opacity={0.65} depthWrite={false} emissiveIntensity={1.4} />
        </mesh>
      </group>
    </group>
  );
}

function FieldSolverControls({
  settings,
  onSettingsChange
}: {
  settings: Required<Pick<FieldSolverOptions, "cellsX" | "cellsY" | "maxIterations" | "tolerance">>;
  onSettingsChange: (settings: Required<Pick<FieldSolverOptions, "cellsX" | "cellsY" | "maxIterations" | "tolerance">>) => void;
}) {
  return (
    <div className="field-controls">
      <label>
        <span>Cells X</span>
        <input
          type="number"
          min={24}
          max={128}
          step={4}
          value={settings.cellsX}
          onChange={(event) => onSettingsChange({ ...settings, cellsX: Number(event.target.value) })}
        />
      </label>
      <label>
        <span>Cells Y</span>
        <input
          type="number"
          min={24}
          max={96}
          step={4}
          value={settings.cellsY}
          onChange={(event) => onSettingsChange({ ...settings, cellsY: Number(event.target.value) })}
        />
      </label>
      <label>
        <span>Max iterations</span>
        <input
          type="number"
          min={500}
          max={20000}
          step={500}
          value={settings.maxIterations}
          onChange={(event) => onSettingsChange({ ...settings, maxIterations: Number(event.target.value) })}
        />
      </label>
      <label>
        <span>Tolerance</span>
        <input
          type="number"
          min={0.00001}
          max={0.001}
          step={0.00001}
          value={settings.tolerance}
          onChange={(event) => onSettingsChange({ ...settings, tolerance: Number(event.target.value) })}
        />
      </label>
    </div>
  );
}

function FieldVisualControls({
  settings,
  onSettingsChange
}: {
  settings: FieldVisualSettings;
  onSettingsChange: (settings: FieldVisualSettings) => void;
}) {
  return (
    <div className="field-visual-controls">
      <div className="section-heading-row">
        <div>
          <h2>Field fluid visual tuning</h2>
          <p className="field-note">Visual-only controls for solver grid cells; opacity follows field relevance.</p>
        </div>
        <button
          className="secondary-button"
          onClick={() => onSettingsChange({ opacity: 0.95, pointScale: 1.35, spacing: 0.75, volumeHeight: 1.35, powerFlow: false })}
        >
          Reset visual defaults
        </button>
      </div>
      <VisualSlider
        label="Opacity"
        value={settings.opacity}
        min={0.1}
        max={2}
        step={0.05}
        suffix="x"
        onChange={(opacity) => onSettingsChange({ ...settings, opacity })}
      />
      <VisualSlider
        label="Grid slices"
        value={settings.pointScale}
        min={0.25}
        max={2.5}
        step={0.05}
        suffix="x"
        onChange={(pointScale) => onSettingsChange({ ...settings, pointScale })}
      />
      <VisualSlider
        label="Cell spacing"
        value={settings.spacing}
        min={0.45}
        max={2.5}
        step={0.05}
        suffix="x"
        onChange={(spacing) => onSettingsChange({ ...settings, spacing })}
      />
      <VisualSlider
        label="Volume height"
        value={settings.volumeHeight}
        min={1.1}
        max={3}
        step={0.05}
        suffix="h"
        onChange={(volumeHeight) => onSettingsChange({ ...settings, volumeHeight })}
      />
      <label className="visual-toggle">
        <input
          type="checkbox"
          checked={settings.powerFlow}
          onChange={(event) => onSettingsChange({ ...settings, powerFlow: event.target.checked })}
        />
        <span>
          Show power flow
          <strong>Poynting direction along trace</strong>
        </span>
      </label>
    </div>
  );
}

function VisualSlider({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="visual-slider">
      <span>
        {label}
        <strong>{value.toFixed(2)}{suffix}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function SolveOverlay({ elapsedMs, projectedMs }: { elapsedMs: number; projectedMs: number }) {
  return (
    <div className="solve-overlay" role="status" aria-live="polite">
      <div className="solve-spinner" />
      <div>
        <strong>Solving finite-difference field</strong>
        <span>
          Projected {formatDuration(projectedMs)} / elapsed {formatDuration(elapsedMs)}
        </span>
      </div>
    </div>
  );
}

function FieldDiagnosticsPanel({
  fieldSolve,
  selectedSample,
  onExport
}: {
  fieldSolve: FieldSolverResult;
  selectedSample: FieldSample | null;
  onExport: () => void;
}) {
  const residualStart = fieldSolve.residualHistory[0] ?? fieldSolve.residual;
  return (
    <div className="table-section">
      <div className="section-heading-row">
        <h2>Solver field diagnostics</h2>
        <button className="secondary-button" onClick={onExport}>Export field snapshot</button>
      </div>
      <div className="run-summary">
        <span>Status: {fieldSolve.converged ? "converged" : "not converged"}</span>
        <span>Iterations: {fieldSolve.iterations}</span>
        <span>Residual: {fieldSolve.residual.toExponential(2)}</span>
        <span>Max |E|: {fieldSolve.field.maxElectricFieldVm.toFixed(1)} V/m</span>
        <span>Hotspot: {mToMm(fieldSolve.field.hotspot.xM).toFixed(2)} mm, {mToMm(fieldSolve.field.hotspot.yM).toFixed(2)} mm</span>
        <span>Residual drop: {residualStart === 0 ? "n/a" : `${(fieldSolve.residual / residualStart).toExponential(2)}x`}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Probe</th>
            <th>V</th>
            <th>Ex</th>
            <th>Ey</th>
            <th>|E|</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Hotspot</td>
            <td>{fieldSolve.field.hotspot.potentialV.toFixed(4)} V</td>
            <td>{fieldSolve.field.hotspot.exVm.toFixed(1)} V/m</td>
            <td>{fieldSolve.field.hotspot.eyVm.toFixed(1)} V/m</td>
            <td>{fieldSolve.field.hotspot.magnitudeVm.toFixed(1)} V/m</td>
          </tr>
          {selectedSample?.solverProbe && (
            <tr>
              <td>Selected sample</td>
              <td>{selectedSample.solverProbe.potentialV.toFixed(4)} V</td>
              <td>{selectedSample.solverProbe.exVm.toFixed(1)} V/m</td>
              <td>{selectedSample.solverProbe.eyVm.toFixed(1)} V/m</td>
              <td>{selectedSample.solverProbe.magnitudeVm.toFixed(1)} V/m</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function RefinementSuggestionsPanel({ fieldSolve }: { fieldSolve: FieldSolverResult }) {
  const diagnostics = buildFieldDiagnostics(fieldSolve);
  return (
    <div className="table-section">
      <h2>Refinement suggestions</h2>
      <table>
        <thead>
          <tr>
            <th>Region</th>
            <th>Priority</th>
            <th>Location</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {diagnostics.refinementSuggestions.map((suggestion) => (
            <tr key={suggestion.id}>
              <td>{suggestion.label}</td>
              <td>{suggestion.priority}</td>
              <td>{mToMm(suggestion.xM).toFixed(2)} mm, {mToMm(suggestion.yM).toFixed(2)} mm</td>
              <td>{suggestion.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MeshSolid({ solid }: { solid: ExtrudedMeshSolid }) {
  const geometry = solidToBufferGeometry(solid);
  const color = solid.kind === "substrate" ? "#7db7a0" : solid.kind === "port" ? "#243746" : "#b56730";
  const opacity = solid.kind === "substrate" ? 0.72 : 1;

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={color}
        metalness={solid.materialRole === "conductor" ? 0.6 : 0.05}
        roughness={solid.materialRole === "conductor" ? 0.3 : 0.85}
        transparent={opacity < 1}
        opacity={opacity}
      />
    </mesh>
  );
}

function DimensionLabel({ text, position }: { text: string; position: [number, number, number] }) {
  return (
    <Text position={position} fontSize={1.1} color="#1d2934" anchorX="center">
      {text}
    </Text>
  );
}

function ConnectorTerminal({ frames }: { frames: ConnectorProbeFrame[] }) {
  return (
    <div className="connector-terminal">
      <div>
        <p className="eyebrow">Connector terminal</p>
        <h2>Port probe readout</h2>
      </div>
      <table>
        <thead>
          <tr>
            <th>Port</th>
            <th>Voltage</th>
            <th>Phase</th>
            <th>Field</th>
            <th>Normalized</th>
          </tr>
        </thead>
        <tbody>
          {frames.map((frame) => (
            <tr key={frame.portId}>
              <td>{frame.label}</td>
              <td>{frame.voltageV.toFixed(3)} V</td>
              <td>{frame.phaseDeg.toFixed(1)} deg</td>
              <td>{frame.estimatedElectricFieldVm.toFixed(1)} V/m</td>
              <td>{frame.normalizedField.toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="assumptions">
        Red and blue samples show instantaneous AC field polarity around the trace. The terminal readout is the same
        visual excitation sampled at each connector; solver-derived field arrays can replace this visual sampler as the
        numerical field pipeline expands.
      </p>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1_000) return `${Math.max(0, Math.round(ms))} ms`;
  return `${(ms / 1_000).toFixed(1)} s`;
}

function exportFieldSnapshot({
  geometry,
  fieldSolve
}: {
  geometry: RfGeometry;
  fieldSolve: FieldSolverResult;
}) {
  const snapshot = {
    schemaVersion: "field-snapshot.v1",
    generatedAt: new Date().toISOString(),
    geometry,
    fieldSolve
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" })
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `field-snapshot-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function solidToBufferGeometry(solid: ExtrudedMeshSolid): BufferGeometry {
  const positions = solid.vertices.flatMap((vertex) => [mToMm(vertex.xM), mToMm(vertex.yM), mToMm(vertex.zM)]);
  const indices = solid.faces.flatMap(([a, b, c, d]) => [a, b, c, a, c, d]);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(new Uint16BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}
