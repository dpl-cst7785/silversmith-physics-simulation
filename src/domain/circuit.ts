export type CircuitComponentType = "port" | "transmission-line" | "capacitor" | "inductor" | "resistor" | "via-ground";

export type CircuitComponent = {
  id: string;
  type: CircuitComponentType;
  label: string;
  x: number;
  y: number;
  params: Record<string, number | string>;
};

export type CircuitConnection = {
  id: string;
  from: string;
  to: string;
};

export type CircuitDesign = {
  components: CircuitComponent[];
  connections: CircuitConnection[];
};

export const defaultCircuit: CircuitDesign = {
  components: [
    { id: "p1", type: "port", label: "Port 1", x: 60, y: 120, params: { impedanceOhms: 50 } },
    {
      id: "tl1",
      type: "transmission-line",
      label: "Microstrip",
      x: 235,
      y: 120,
      params: { impedanceOhms: 50, lengthMm: 40, frequencyGhz: 2.4 }
    },
    { id: "c1", type: "capacitor", label: "Shunt C", x: 420, y: 120, params: { capacitancePf: 1.2 } },
    { id: "g1", type: "via-ground", label: "GND via", x: 420, y: 245, params: { diameterMm: 0.6 } },
    { id: "p2", type: "port", label: "Port 2", x: 610, y: 120, params: { impedanceOhms: 50 } }
  ],
  connections: [
    { id: "e1", from: "p1", to: "tl1" },
    { id: "e2", from: "tl1", to: "c1" },
    { id: "e3", from: "c1", to: "p2" },
    { id: "e4", from: "c1", to: "g1" }
  ]
};
