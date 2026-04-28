import type { RfGeometry } from "../domain/geometry";
import type { FieldSolverOptions, FieldSolverResult } from "./finiteDifferenceMicrostrip";

export type FieldSolverWorkerRequest = {
  requestId: number;
  geometry: RfGeometry;
  options: FieldSolverOptions;
};

export type FieldSolverWorkerResponse =
  | {
      requestId: number;
      ok: true;
      result: FieldSolverResult;
      runtimeMs: number;
    }
  | {
      requestId: number;
      ok: false;
      error: string;
      runtimeMs: number;
    };
