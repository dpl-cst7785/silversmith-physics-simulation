import { solveMicrostripFiniteDifference } from "./finiteDifferenceMicrostrip";
import type { FieldSolverWorkerRequest, FieldSolverWorkerResponse } from "./fieldSolverWorkerMessages";

self.onmessage = (event: MessageEvent<FieldSolverWorkerRequest>) => {
  const started = performance.now();
  const { requestId, geometry, options } = event.data;

  try {
    const result = solveMicrostripFiniteDifference(geometry, options);
    const response: FieldSolverWorkerResponse = {
      requestId,
      ok: true,
      result,
      runtimeMs: performance.now() - started
    };
    self.postMessage(response);
  } catch (error) {
    const response: FieldSolverWorkerResponse = {
      requestId,
      ok: false,
      error: error instanceof Error ? error.message : "Unknown finite-difference solver failure.",
      runtimeMs: performance.now() - started
    };
    self.postMessage(response);
  }
};
