export type Material = {
  id: string;
  name: string;
  relativePermittivity: number;
  lossTangent: number;
  conductivitySiemensPerMeter: number;
  relativePermeability: number;
};

export const defaultSubstrate: Material = {
  id: "rogers-4350b",
  name: "Rogers RO4350B",
  relativePermittivity: 3.48,
  lossTangent: 0.0037,
  conductivitySiemensPerMeter: 0,
  relativePermeability: 1
};

export const copper: Material = {
  id: "copper",
  name: "Copper",
  relativePermittivity: 1,
  lossTangent: 0,
  conductivitySiemensPerMeter: 5.8e7,
  relativePermeability: 1
};
