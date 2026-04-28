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
  Quaternion,
  Uint16BufferAttribute,
  Vector3
} from "three";
import { mToMm, type RfGeometry } from "../../domain/geometry";
import {
  buildConnectorProbeFrames,
  buildSolverFieldSamples,
  buildTraceFieldSamples,
  sampleInstantaneousField,
  type ConnectorProbeFrame,
  type FieldSample
} from "../../fields/fieldSampling";
import { buildExtrudedGeometryMesh, type ExtrudedMeshSolid } from "../../geometry/extrudedMesh";
import { getAnalyticalModelDescriptor, type AnalyticalModelId } from "../../physics/analyticalModels";

type Props = {
  geometry: RfGeometry;
  modelId: AnalyticalModelId;
};

export function ViewerRoute({ geometry, modelId }: Props) {
  const model = getAnalyticalModelDescriptor(modelId);
  const mesh = buildExtrudedGeometryMesh(geometry);
  const [fieldMode, setFieldMode] = useState<"solver" | "excitation">("solver");
  const [probeFrames, setProbeFrames] = useState<ConnectorProbeFrame[]>(() =>
    buildConnectorProbeFrames({ geometry, animationPhaseRad: 0 })
  );

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
            ? "Rendering projected E-field samples from the finite-difference cross-section solve."
            : "Rendering a geometry-driven AC excitation preview."}
        </p>
        <div className="segmented-control" aria-label="Field visualization mode">
          <button className={fieldMode === "solver" ? "active" : ""} onClick={() => setFieldMode("solver")}>
            Solver field
          </button>
          <button className={fieldMode === "excitation" ? "active" : ""} onClick={() => setFieldMode("excitation")}>
            Excitation
          </button>
        </div>
      </div>
      <div className="viewer-shell">
        <Canvas camera={{ position: [34, 28, 46], fov: 38 }}>
          <color attach="background" args={["#eef4f1"]} />
          <ambientLight intensity={0.7} />
          <directionalLight position={[12, 20, 10]} intensity={1.2} />
          <ExtrudedMeshScene geometry={geometry} solids={mesh.solids} modelId={modelId} fieldMode={fieldMode} />
          <OrbitControls makeDefault enableDamping />
        </Canvas>
      </div>
      <ConnectorTerminal frames={probeFrames} />
    </section>
  );
}

function ExtrudedMeshScene({
  geometry,
  solids,
  modelId,
  fieldMode
}: {
  geometry: RfGeometry;
  solids: ExtrudedMeshSolid[];
  modelId: AnalyticalModelId;
  fieldMode: "solver" | "excitation";
}) {
  const boardLengthMm = mToMm(geometry.boardLengthM);
  const substrateHeightMm = mToMm(geometry.stack.substrateHeightM);
  const boardWidthMm = mToMm(geometry.boardWidthM);
  const trace = geometry.traces[0];
  const model = getAnalyticalModelDescriptor(modelId);
  const fieldSamples = useMemo(
    () => fieldMode === "solver" ? buildSolverFieldSamples(geometry) : buildTraceFieldSamples(geometry),
    [fieldMode, geometry]
  );

  return (
    <group position={[-boardLengthMm / 2, -substrateHeightMm / 2, -boardWidthMm / 2]}>
      {solids.map((solid) => (
        <MeshSolid key={solid.id} solid={solid} />
      ))}
      <AnimatedFieldHeatmap samples={fieldSamples} />
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

function AnimatedFieldHeatmap({ samples }: { samples: FieldSample[] }) {
  return (
    <group>
      {samples.map((sample) => (
        <AnimatedFieldSample key={sample.id} sample={sample} />
      ))}
    </group>
  );
}

function AnimatedFieldSample({ sample }: { sample: FieldSample }) {
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
        <mesh position={[0, 0.58, 0]}>
          <coneGeometry args={[0.16, 0.78, 12]} />
          <meshStandardMaterial transparent opacity={0.65} depthWrite={false} emissiveIntensity={1.4} />
        </mesh>
      </group>
    </group>
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

function solidToBufferGeometry(solid: ExtrudedMeshSolid): BufferGeometry {
  const positions = solid.vertices.flatMap((vertex) => [mToMm(vertex.xM), mToMm(vertex.yM), mToMm(vertex.zM)]);
  const indices = solid.faces.flatMap(([a, b, c, d]) => [a, b, c, a, c, d]);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(new Uint16BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}
