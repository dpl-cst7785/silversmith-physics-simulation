import { Activity, BarChart3, Box, CircuitBoard, Layers3 } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { defaultCircuit, type CircuitDesign } from "../domain/circuit";
import { defaultGeometry, type RfGeometry } from "../domain/geometry";
import { copper, defaultSubstrate } from "../domain/materials";
import type { AnalyticalModelId } from "../physics/analyticalModels";
import { buildGeometryPresets, clonePresetGeometry, type GeometryPreset } from "../physics/geometryPresets";
import type { TouchstoneData } from "../physics/sParameters";
import { validateMicrostrip, type FrequencySweep, type ValidationResult } from "../validation/engine";
import { CircuitRoute } from "./routes/CircuitRoute";
import { GeometryRoute } from "./routes/GeometryRoute";
import { ResultsRoute } from "./routes/ResultsRoute";
import { WorkflowRoute } from "./routes/WorkflowRoute";

const ViewerRoute = lazy(() => import("./routes/ViewerRoute").then((module) => ({ default: module.ViewerRoute })));

const routes = [
  { path: "/workflow", label: "Workflow", icon: Activity },
  { path: "/circuit", label: "Circuit", icon: CircuitBoard },
  { path: "/geometry", label: "Geometry", icon: Layers3 },
  { path: "/viewer", label: "Viewer", icon: Box },
  { path: "/results", label: "Results", icon: BarChart3 }
];

export function App() {
  const [path, setPath] = useState(() => window.location.pathname === "/" ? "/workflow" : window.location.pathname);
  const [circuit] = useState<CircuitDesign>(defaultCircuit);
  const [geometry, setGeometry] = useState<RfGeometry>(() => defaultGeometry(defaultSubstrate, copper));
  const [modelId, setModelId] = useState<AnalyticalModelId>("microstrip");
  const [sweep, setSweep] = useState<FrequencySweep>({ startHz: 1e9, stopHz: 5e9, points: 9 });
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [touchstone, setTouchstone] = useState<TouchstoneData | null>(null);
  const [runStatus, setRunStatus] = useState<"idle" | "running" | "complete" | "failed">("idle");
  const [runError, setRunError] = useState<string | null>(null);
  const [lastRunSignature, setLastRunSignature] = useState<string | null>(null);

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname === "/" ? "/workflow" : window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const activeRoute = useMemo(() => routes.find((route) => route.path === path) ?? routes[0], [path]);

  function navigate(nextPath: string) {
    window.history.pushState(null, "", nextPath);
    setPath(nextPath);
  }

  async function runValidation() {
    try {
      setRunStatus("running");
      setRunError(null);
      setValidation(await validateMicrostrip({ modelId, geometry, sweep, touchstone }));
      setLastRunSignature(buildRunSignature({ modelId, geometry, sweep, touchstone }));
      setRunStatus("complete");
    } catch (error) {
      setRunStatus("failed");
      setRunError(error instanceof Error ? error.message : "Validation failed.");
    }
  }

  function applyPreset(preset: GeometryPreset) {
    setModelId(preset.modelId);
    setGeometry(clonePresetGeometry(preset));
    setValidation(null);
    setLastRunSignature(null);
    setRunStatus("idle");
    setRunError(null);
  }

  function updateGeometry(nextGeometry: RfGeometry) {
    setGeometry(nextGeometry);
  }

  function updateModel(nextModelId: AnalyticalModelId) {
    setModelId(nextModelId);
  }

  function updateSweep(nextSweep: FrequencySweep) {
    setSweep(nextSweep);
  }

  function updateTouchstone(nextTouchstone: TouchstoneData | null) {
    setTouchstone(nextTouchstone);
  }

  const isValidationStale =
    Boolean(validation && lastRunSignature) &&
    lastRunSignature !== buildRunSignature({ modelId, geometry, sweep, touchstone });

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <CircuitBoard size={28} />
          <div>
            <strong>RF EM Sandbox</strong>
            <span>Textbook validation lab</span>
          </div>
        </div>
        <nav className="nav-list" aria-label="Primary">
          {routes.map((route) => {
            const Icon = route.icon;
            return (
              <button
                className={route.path === activeRoute.path ? "nav-item active" : "nav-item"}
                key={route.path}
                onClick={() => navigate(route.path)}
                title={route.label}
              >
                <Icon size={18} />
                <span>{route.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>
      <main className="workspace">
        {activeRoute.path === "/workflow" && (
          <WorkflowRoute
            geometry={geometry}
            onGeometryChange={updateGeometry}
            modelId={modelId}
            onModelChange={updateModel}
            presets={buildGeometryPresets(defaultSubstrate, copper)}
            onApplyPreset={applyPreset}
            sweep={sweep}
            onSweepChange={updateSweep}
            validation={validation}
            isValidationStale={isValidationStale}
            touchstone={touchstone}
            onTouchstoneChange={updateTouchstone}
            runStatus={runStatus}
            runError={runError}
            onRun={() => void runValidation()}
          />
        )}
        {activeRoute.path === "/circuit" && <CircuitRoute circuit={circuit} />}
        {activeRoute.path === "/geometry" && <GeometryRoute geometry={geometry} onGeometryChange={updateGeometry} />}
        {activeRoute.path === "/viewer" && (
          <Suspense fallback={<div className="loading-panel">Loading 3D viewer...</div>}>
            <ViewerRoute geometry={geometry} modelId={modelId} />
          </Suspense>
        )}
        {activeRoute.path === "/results" && (
          <ResultsRoute
            geometry={geometry}
            validation={validation}
            isValidationStale={isValidationStale}
            touchstone={touchstone}
            onTouchstoneChange={updateTouchstone}
          />
        )}
      </main>
    </div>
  );
}

function buildRunSignature({
  modelId,
  geometry,
  sweep,
  touchstone
}: {
  modelId: AnalyticalModelId;
  geometry: RfGeometry;
  sweep: FrequencySweep;
  touchstone: TouchstoneData | null;
}) {
  return JSON.stringify({
    modelId,
    geometry,
    sweep,
    touchstoneSummary: touchstone
      ? {
          ports: touchstone.ports,
          referenceOhms: touchstone.referenceOhms,
          rows: touchstone.rows
        }
      : null
  });
}
