import { OrbitControls, Text } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { mToMm, type RfGeometry } from "../../domain/geometry";
import { getAnalyticalModelDescriptor, type AnalyticalModelId } from "../../physics/analyticalModels";

type Props = {
  geometry: RfGeometry;
  modelId: AnalyticalModelId;
};

export function ViewerRoute({ geometry, modelId }: Props) {
  const model = getAnalyticalModelDescriptor(modelId);

  return (
    <section className="route viewer-route">
      <header className="route-header">
        <div>
          <p className="eyebrow">3D CAD visualization</p>
          <h1>{model.label}</h1>
        </div>
      </header>
      <div className="viewer-shell">
        <Canvas camera={{ position: [34, 28, 46], fov: 38 }}>
          <color attach="background" args={["#eef4f1"]} />
          <ambientLight intensity={0.7} />
          <directionalLight position={[12, 20, 10]} intensity={1.2} />
          <TransmissionLineScene geometry={geometry} modelId={modelId} />
          <OrbitControls makeDefault enableDamping />
        </Canvas>
      </div>
    </section>
  );
}

function TransmissionLineScene({ geometry, modelId }: Props) {
  return modelId === "stripline" ? <StriplineScene geometry={geometry} modelId={modelId} /> : <MicrostripScene geometry={geometry} modelId={modelId} />;
}

function MicrostripScene({ geometry }: Props) {
  const dims = sceneDimensions(geometry);

  return (
    <group position={[-dims.boardLength / 2, -dims.substrateHeight / 2, -dims.boardWidth / 2]}>
      <SubstrateBlock dims={dims} y={0} />
      {geometry.stack.hasGroundPlane && <GroundPlane dims={dims} y={-dims.substrateHeight / 2 - 0.08} />}
      <TraceBlock dims={dims} y={dims.substrateHeight / 2 + dims.conductorHeight / 2} />
      <Ports geometry={geometry} y={dims.substrateHeight / 2 + 1.2} />
      <Vias geometry={geometry} height={dims.substrateHeight + 0.4} y={0} />
      <DimensionLabel text={`${dims.traceLength.toFixed(1)} mm`} position={[dims.traceX + dims.traceLength / 2, dims.substrateHeight + 2.2, dims.traceY - 2.5]} />
      <DimensionLabel text={`${dims.traceWidth.toFixed(2)} mm`} position={[dims.traceX + dims.traceLength + 3, dims.substrateHeight + 1.4, dims.traceY + dims.traceWidth / 2]} />
    </group>
  );
}

function StriplineScene({ geometry }: Props) {
  const dims = sceneDimensions(geometry);

  return (
    <group position={[-dims.boardLength / 2, -dims.substrateHeight / 2, -dims.boardWidth / 2]}>
      <SubstrateBlock dims={dims} y={0} />
      <GroundPlane dims={dims} y={-dims.substrateHeight / 2 - 0.08} />
      <GroundPlane dims={dims} y={dims.substrateHeight / 2 + 0.08} />
      <TraceBlock dims={dims} y={0} />
      <Ports geometry={geometry} y={0.9} />
      <DimensionLabel text={`b ${dims.substrateHeight.toFixed(2)} mm`} position={[dims.boardLength / 2, dims.substrateHeight / 2 + 2.4, dims.boardWidth / 2]} />
      <DimensionLabel text={`${dims.traceWidth.toFixed(2)} mm`} position={[dims.traceX + dims.traceLength + 3, 1.8, dims.traceY + dims.traceWidth / 2]} />
    </group>
  );
}

function SubstrateBlock({ dims, y }: { dims: SceneDimensions; y: number }) {
  return (
    <mesh position={[dims.boardLength / 2, y, dims.boardWidth / 2]}>
      <boxGeometry args={[dims.boardLength, dims.substrateHeight, dims.boardWidth]} />
      <meshStandardMaterial color="#7db7a0" roughness={0.85} transparent opacity={0.72} />
    </mesh>
  );
}

function GroundPlane({ dims, y }: { dims: SceneDimensions; y: number }) {
  return (
    <mesh position={[dims.boardLength / 2, y, dims.boardWidth / 2]}>
      <boxGeometry args={[dims.boardLength, 0.16, dims.boardWidth]} />
      <meshStandardMaterial color="#b56730" metalness={0.6} roughness={0.3} />
    </mesh>
  );
}

function TraceBlock({ dims, y }: { dims: SceneDimensions; y: number }) {
  return (
    <mesh position={[dims.traceX + dims.traceLength / 2, y, dims.traceY + dims.traceWidth / 2]}>
      <boxGeometry args={[dims.traceLength, dims.conductorHeight, dims.traceWidth]} />
      <meshStandardMaterial color="#c47b3d" metalness={0.45} roughness={0.32} />
    </mesh>
  );
}

function Ports({ geometry, y }: { geometry: RfGeometry; y: number }) {
  return (
    <>
      {geometry.ports.map((port) => (
        <group key={port.id} position={[mToMm(port.xM), y, mToMm(port.yM)]}>
          <mesh>
            <cylinderGeometry args={[0.9, 0.9, 1.8, 28]} />
            <meshStandardMaterial color="#243746" />
          </mesh>
          <Text position={[0, 2.1, 0]} fontSize={1.4} color="#1d2934" anchorX="center">
            {port.label}
          </Text>
        </group>
      ))}
    </>
  );
}

function Vias({ geometry, height, y }: { geometry: RfGeometry; height: number; y: number }) {
  return (
    <>
      {geometry.vias.map((via) => (
        <mesh key={via.id} position={[mToMm(via.xM), y, mToMm(via.yM)]}>
          <cylinderGeometry args={[mToMm(via.diameterM) / 2, mToMm(via.diameterM) / 2, height, 32]} />
          <meshStandardMaterial color="#b56730" metalness={0.6} roughness={0.3} />
        </mesh>
      ))}
    </>
  );
}

function DimensionLabel({ text, position }: { text: string; position: [number, number, number] }) {
  return (
    <Text position={position} fontSize={1.1} color="#1d2934" anchorX="center">
      {text}
    </Text>
  );
}

type SceneDimensions = ReturnType<typeof sceneDimensions>;

function sceneDimensions(geometry: RfGeometry) {
  const trace = geometry.traces[0];
  return {
    boardLength: mToMm(geometry.boardLengthM),
    boardWidth: mToMm(geometry.boardWidthM),
    substrateHeight: mToMm(geometry.stack.substrateHeightM),
    conductorHeight: Math.max(mToMm(geometry.stack.conductorThicknessM) * 8, 0.2),
    traceLength: mToMm(trace.lengthM),
    traceWidth: mToMm(trace.widthM),
    traceX: mToMm(trace.xM),
    traceY: mToMm(trace.yM)
  };
}
