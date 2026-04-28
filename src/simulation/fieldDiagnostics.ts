import type { FieldSolverResult } from "./finiteDifferenceMicrostrip";

export type FieldRefinementSuggestion = {
  id: string;
  label: string;
  reason: string;
  xM: number;
  yM: number;
  priority: "high" | "medium";
};

export type FieldDiagnostics = {
  convergenceRatio: number;
  residualSlope: number;
  hotspot: FieldSolverResult["field"]["hotspot"];
  refinementSuggestions: FieldRefinementSuggestion[];
};

export function buildFieldDiagnostics(fieldSolve: FieldSolverResult): FieldDiagnostics {
  const firstResidual = fieldSolve.residualHistory[0] ?? fieldSolve.residual;
  const lastResidual = fieldSolve.residualHistory.at(-1) ?? fieldSolve.residual;
  const convergenceRatio = firstResidual === 0 ? 0 : lastResidual / firstResidual;

  return {
    convergenceRatio,
    residualSlope: calculateResidualSlope(fieldSolve.residualHistory),
    hotspot: fieldSolve.field.hotspot,
    refinementSuggestions: buildRefinementSuggestions(fieldSolve)
  };
}

function buildRefinementSuggestions(fieldSolve: FieldSolverResult): FieldRefinementSuggestion[] {
  const suggestions: FieldRefinementSuggestion[] = [
    {
      id: "hotspot",
      label: "Refine hotspot",
      reason: "Highest E-field magnitude in the current finite-difference solution.",
      xM: fieldSolve.field.hotspot.xM,
      yM: fieldSolve.field.hotspot.yM,
      priority: "high"
    },
    {
      id: "trace-left-edge",
      label: "Refine trace left edge",
      reason: "Conductor edges create strong field gradients and capacitance error.",
      xM: fieldSolve.grid.traceMinXM,
      yM: fieldSolve.grid.substrateHeightM,
      priority: "high"
    },
    {
      id: "trace-right-edge",
      label: "Refine trace right edge",
      reason: "Conductor edges create strong field gradients and capacitance error.",
      xM: fieldSolve.grid.traceMaxXM,
      yM: fieldSolve.grid.substrateHeightM,
      priority: "high"
    }
  ];

  if (!fieldSolve.converged) {
    suggestions.push({
      id: "global-grid",
      label: "Increase global iterations",
      reason: "Solver did not converge at the requested residual tolerance.",
      xM: fieldSolve.grid.domainWidthM / 2,
      yM: fieldSolve.grid.domainHeightM / 2,
      priority: "medium"
    });
  }

  return suggestions;
}

function calculateResidualSlope(history: number[]): number {
  if (history.length < 2) return 0;
  return (history.at(-1) ?? 0) - history[0];
}
