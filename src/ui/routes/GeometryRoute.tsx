import { mToMm, mmToM, type RfGeometry } from "../../domain/geometry";

type Props = {
  geometry: RfGeometry;
  onGeometryChange: (geometry: RfGeometry) => void;
};

export function GeometryRoute({ geometry, onGeometryChange }: Props) {
  const trace = geometry.traces[0];

  function updateTrace(field: keyof typeof trace, valueM: number) {
    onGeometryChange({
      ...geometry,
      traces: [{ ...trace, [field]: valueM }, ...geometry.traces.slice(1)]
    });
  }

  function updateStack(field: "substrateHeightM" | "conductorThicknessM", valueM: number) {
    onGeometryChange({
      ...geometry,
      stack: { ...geometry.stack, [field]: valueM }
    });
  }

  function updateMaterial(field: "relativePermittivity" | "lossTangent", value: number) {
    onGeometryChange({
      ...geometry,
      stack: {
        ...geometry.stack,
        substrate: { ...geometry.stack.substrate, [field]: value }
      }
    });
  }

  function updateConductorConductivity(value: number) {
    onGeometryChange({
      ...geometry,
      stack: {
        ...geometry.stack,
        conductor: { ...geometry.stack.conductor, conductivitySiemensPerMeter: value }
      }
    });
  }

  return (
    <section className="route">
      <header className="route-header">
        <div>
          <p className="eyebrow">Geometry and materials</p>
          <h1>Microstrip stackup</h1>
        </div>
      </header>
      <MicrostripInputs
        geometry={geometry}
        onBoardWidthMm={(value) => onGeometryChange({ ...geometry, boardWidthM: mmToM(value) })}
        onBoardLengthMm={(value) => onGeometryChange({ ...geometry, boardLengthM: mmToM(value) })}
        onSubstrateHeightMm={(value) => updateStack("substrateHeightM", mmToM(value))}
        onTraceWidthMm={(value) => updateTrace("widthM", mmToM(value))}
        onTraceLengthMm={(value) => updateTrace("lengthM", mmToM(value))}
        onTraceXMm={(value) => updateTrace("xM", mmToM(value))}
        onTraceYMm={(value) => updateTrace("yM", mmToM(value))}
        onCopperThicknessMm={(value) => updateStack("conductorThicknessM", mmToM(value))}
        onMaterialChange={updateMaterial}
        onConductorConductivityChange={updateConductorConductivity}
      />
    </section>
  );
}

export function MicrostripInputs({
  geometry,
  onBoardWidthMm,
  onBoardLengthMm,
  onSubstrateHeightMm,
  onTraceWidthMm,
  onTraceLengthMm,
  onTraceXMm,
  onTraceYMm,
  onCopperThicknessMm,
  onMaterialChange,
  onConductorConductivityChange
}: {
  geometry: RfGeometry;
  onBoardWidthMm: (value: number) => void;
  onBoardLengthMm: (value: number) => void;
  onSubstrateHeightMm: (value: number) => void;
  onTraceWidthMm: (value: number) => void;
  onTraceLengthMm: (value: number) => void;
  onTraceXMm: (value: number) => void;
  onTraceYMm: (value: number) => void;
  onCopperThicknessMm: (value: number) => void;
  onMaterialChange: (field: "relativePermittivity" | "lossTangent", value: number) => void;
  onConductorConductivityChange: (value: number) => void;
}) {
  const trace = geometry.traces[0];

  return (
    <div className="editor-grid">
      <fieldset>
        <legend>Substrate</legend>
        <NumberField label="Board width (mm)" value={mToMm(geometry.boardWidthM)} onChange={onBoardWidthMm} />
        <NumberField label="Board length (mm)" value={mToMm(geometry.boardLengthM)} onChange={onBoardLengthMm} />
        <NumberField label="Substrate height (mm)" value={mToMm(geometry.stack.substrateHeightM)} onChange={onSubstrateHeightMm} />
        <NumberField
          label="Relative permittivity"
          value={geometry.stack.substrate.relativePermittivity}
          onChange={(value) => onMaterialChange("relativePermittivity", value)}
        />
        <NumberField
          label="Loss tangent"
          value={geometry.stack.substrate.lossTangent}
          step={0.0001}
          onChange={(value) => onMaterialChange("lossTangent", value)}
        />
      </fieldset>
      <fieldset>
        <legend>Conductor</legend>
        <NumberField label="Trace width (mm)" value={mToMm(trace.widthM)} onChange={onTraceWidthMm} />
        <NumberField label="Trace length (mm)" value={mToMm(trace.lengthM)} onChange={onTraceLengthMm} />
        <NumberField label="Trace X (mm)" value={mToMm(trace.xM)} onChange={onTraceXMm} />
        <NumberField label="Trace Y (mm)" value={mToMm(trace.yM)} onChange={onTraceYMm} />
        <NumberField label="Copper thickness (mm)" value={mToMm(geometry.stack.conductorThicknessM)} step={0.001} onChange={onCopperThicknessMm} />
        <NumberField
          label="Conductivity (S/m)"
          value={geometry.stack.conductor.conductivitySiemensPerMeter}
          step={100000}
          onChange={onConductorConductivityChange}
        />
      </fieldset>
    </div>
  );
}

export function NumberField({
  label,
  value,
  step = 0.01,
  onChange
}: {
  label: string;
  value: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" value={Number(value.toPrecision(8))} step={step} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}
