import { OrbitControls, Text } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  Points,
  Quaternion,
  ShaderMaterial,
  Uint16BufferAttribute,
  Vector3
} from "three";
import { mToMm, type RfGeometry } from "../../domain/geometry";
import {
  buildConnectorProbeFrames,
  buildSolverFieldVolume,
  buildTraceFieldSamples,
  estimateFieldSolveMs,
  sampleInstantaneousField,
  type ConnectorProbeFrame,
  type FieldSample,
  type FieldVolume
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
            ? "Solver field solves div(epsilon grad V)=0 on the cross-section, then projects the numerical E-field into the 3D geometry."
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
            onSelectSample={setSelectedSample}
          />
          <OrbitControls makeDefault enableDamping />
        </Canvas>
      </div>
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

function ExtrudedMeshScene({
  geometry,
  solids,
  modelId,
  fieldMode,
  fieldSolve,
  onSelectSample
}: {
  geometry: RfGeometry;
  solids: ExtrudedMeshSolid[];
  modelId: AnalyticalModelId;
  fieldMode: "solver" | "excitation";
  fieldSolve: FieldSolverResult;
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
  const fieldVolume = useMemo(
    () => buildSolverFieldVolume(fieldSolve, {
      lengthM: trace?.lengthM ?? geometry.boardLengthM,
      xOffsetM: trace?.xM ?? 0
    }),
    [fieldSolve, geometry.boardLengthM, trace?.lengthM, trace?.xM]
  );

  return (
    <group position={[-boardLengthMm / 2, -substrateHeightMm / 2, -boardWidthMm / 2]}>
      {solids.map((solid) => (
        <MeshSolid key={solid.id} solid={solid} />
      ))}
      {fieldMode === "solver" && <FieldVolumeCloud volume={fieldVolume} />}
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

function FieldVolumeCloud({ volume }: { volume: FieldVolume }) {
  const pointsRef = useRef<Points>(null);
  const materialRef = useRef<ShaderMaterial>(null);
  const geometry = useMemo(() => {
    const bufferGeometry = new BufferGeometry();
    const positionsMm = volume.positions.map((value) => mToMm(value));
    bufferGeometry.setAttribute("position", new Float32BufferAttribute(positionsMm, 3));
    bufferGeometry.setAttribute("color", new Float32BufferAttribute(volume.colors, 3));
    bufferGeometry.setAttribute("fieldAmplitude", new Float32BufferAttribute(volume.amplitudes, 1));
    bufferGeometry.setAttribute("fieldPhase", new Float32BufferAttribute(volume.phases, 1));
    return bufferGeometry;
  }, [volume]);

  useFrame(({ clock }) => {
    if (materialRef.current) materialRef.current.uniforms.time.value = clock.elapsedTime;
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <shaderMaterial
        ref={materialRef}
        transparent
        depthWrite={false}
        uniforms={{ time: { value: 0 }, pointSize: { value: 5.2 } }}
        vertexShader={fieldVolumeVertexShader}
        fragmentShader={fieldVolumeFragmentShader}
      />
    </points>
  );
}

const fieldVolumeVertexShader = `
  attribute vec3 color;
  attribute float fieldAmplitude;
  attribute float fieldPhase;
  varying float vAmplitude;
  varying float vPhase;
  varying vec3 vColor;
  uniform float pointSize;

  void main() {
    vAmplitude = fieldAmplitude;
    vPhase = fieldPhase;
    vColor = clamp(color, 0.0, 1.0);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = pointSize * (0.6 + fieldAmplitude * 1.4) * (300.0 / max(80.0, -mvPosition.z));
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fieldVolumeFragmentShader = `
  varying float vAmplitude;
  varying float vPhase;
  varying vec3 vColor;
  uniform float time;

  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float radius = length(uv);
    float softDisc = smoothstep(0.5, 0.0, radius);
    float core = smoothstep(0.22, 0.0, radius);
    float wave = 0.5 + 0.5 * sin(time * 3.2 - vPhase);
    vec3 red = vec3(1.0, 0.12, 0.08);
    vec3 blue = vec3(0.08, 0.46, 1.0);
    vec3 fluidColor = mix(blue, red, wave);
    vec3 color = mix(vColor, fluidColor, 0.72);
    float alpha = softDisc * (0.018 + vAmplitude * 0.095) + core * vAmplitude * 0.035;
    gl_FragColor = vec4(color, alpha);
  }
`;

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
