import { OrbitControls, Text } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { BufferGeometry, Float32BufferAttribute, Uint16BufferAttribute } from "three";
import { mToMm, type RfGeometry } from "../../domain/geometry";
import { buildExtrudedGeometryMesh, type ExtrudedMeshSolid } from "../../geometry/extrudedMesh";
import { getAnalyticalModelDescriptor, type AnalyticalModelId } from "../../physics/analyticalModels";

type Props = {
  geometry: RfGeometry;
  modelId: AnalyticalModelId;
};

export function ViewerRoute({ geometry, modelId }: Props) {
  const model = getAnalyticalModelDescriptor(modelId);
  const mesh = buildExtrudedGeometryMesh(geometry);

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
      <div className="viewer-shell">
        <Canvas camera={{ position: [34, 28, 46], fov: 38 }}>
          <color attach="background" args={["#eef4f1"]} />
          <ambientLight intensity={0.7} />
          <directionalLight position={[12, 20, 10]} intensity={1.2} />
          <ExtrudedMeshScene geometry={geometry} solids={mesh.solids} modelId={modelId} />
          <OrbitControls makeDefault enableDamping />
        </Canvas>
      </div>
    </section>
  );
}

function ExtrudedMeshScene({
  geometry,
  solids,
  modelId
}: {
  geometry: RfGeometry;
  solids: ExtrudedMeshSolid[];
  modelId: AnalyticalModelId;
}) {
  const boardLengthMm = mToMm(geometry.boardLengthM);
  const substrateHeightMm = mToMm(geometry.stack.substrateHeightM);
  const boardWidthMm = mToMm(geometry.boardWidthM);
  const trace = geometry.traces[0];
  const model = getAnalyticalModelDescriptor(modelId);

  return (
    <group position={[-boardLengthMm / 2, -substrateHeightMm / 2, -boardWidthMm / 2]}>
      {solids.map((solid) => (
        <MeshSolid key={solid.id} solid={solid} />
      ))}
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

function solidToBufferGeometry(solid: ExtrudedMeshSolid): BufferGeometry {
  const positions = solid.vertices.flatMap((vertex) => [mToMm(vertex.xM), mToMm(vertex.yM), mToMm(vertex.zM)]);
  const indices = solid.faces.flatMap(([a, b, c, d]) => [a, b, c, a, c, d]);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(new Uint16BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}
