import { Cable, CircleDot, Cpu, Minus, Waves, Zap } from "lucide-react";
import type { CircuitComponent, CircuitDesign } from "../../domain/circuit";

const iconMap = {
  port: CircleDot,
  "transmission-line": Waves,
  capacitor: Zap,
  inductor: Cpu,
  resistor: Minus,
  "via-ground": Cable
};

type Props = {
  circuit: CircuitDesign;
};

export function CircuitRoute({ circuit }: Props) {
  return (
    <section className="route">
      <header className="route-header">
        <div>
          <p className="eyebrow">2D circuit design</p>
          <h1>Block canvas</h1>
        </div>
      </header>
      <div className="canvas-wrap">
        <svg className="connection-layer" viewBox="0 0 760 380" role="img" aria-label="Circuit connections">
          {circuit.connections.map((connection) => {
            const from = circuit.components.find((component) => component.id === connection.from);
            const to = circuit.components.find((component) => component.id === connection.to);
            if (!from || !to) return null;
            return (
              <line
                key={connection.id}
                x1={from.x + 66}
                y1={from.y + 38}
                x2={to.x + 66}
                y2={to.y + 38}
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            );
          })}
        </svg>
        {circuit.components.map((component) => (
          <ComponentNode key={component.id} component={component} />
        ))}
      </div>
    </section>
  );
}

function ComponentNode({ component }: { component: CircuitComponent }) {
  const Icon = iconMap[component.type];
  return (
    <article className="component-node" style={{ left: component.x, top: component.y }}>
      <div className="component-title">
        <Icon size={18} />
        <strong>{component.label}</strong>
      </div>
      <dl>
        {Object.entries(component.params).map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
