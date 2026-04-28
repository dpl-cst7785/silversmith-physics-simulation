import type { Material } from "./materials";

export type LengthUnit = "m";

export type Port = {
  id: string;
  label: string;
  xM: number;
  yM: number;
  impedanceOhms: number;
};

export type Trace = {
  id: string;
  name: string;
  xM: number;
  yM: number;
  widthM: number;
  lengthM: number;
  thicknessM: number;
};

export type Via = {
  id: string;
  xM: number;
  yM: number;
  diameterM: number;
};

export type LayerStack = {
  substrateHeightM: number;
  conductorThicknessM: number;
  substrate: Material;
  conductor: Material;
  hasGroundPlane: boolean;
};

export type RfGeometry = {
  unit: LengthUnit;
  boardWidthM: number;
  boardLengthM: number;
  traces: Trace[];
  ports: Port[];
  vias: Via[];
  stack: LayerStack;
};

export const mmToM = (valueMm: number) => valueMm / 1000;
export const mToMm = (valueM: number) => valueM * 1000;

export const defaultGeometry = (substrate: Material, conductor: Material): RfGeometry => ({
  unit: "m",
  boardWidthM: mmToM(22),
  boardLengthM: mmToM(48),
  traces: [
    {
      id: "trace-1",
      name: "50 ohm microstrip",
      xM: mmToM(4),
      yM: mmToM(10),
      widthM: mmToM(3.4),
      lengthM: mmToM(40),
      thicknessM: mmToM(0.035)
    }
  ],
  ports: [
    { id: "port-1", label: "P1", xM: mmToM(4), yM: mmToM(11.7), impedanceOhms: 50 },
    { id: "port-2", label: "P2", xM: mmToM(44), yM: mmToM(11.7), impedanceOhms: 50 }
  ],
  vias: [{ id: "via-1", xM: mmToM(26), yM: mmToM(6), diameterM: mmToM(0.6) }],
  stack: {
    substrateHeightM: mmToM(1.524),
    conductorThicknessM: mmToM(0.035),
    substrate,
    conductor,
    hasGroundPlane: true
  }
});
