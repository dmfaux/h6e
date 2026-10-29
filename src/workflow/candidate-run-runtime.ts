// The live binding of the route-side API to eve's vendored Workflow runtime.
// Host code, never bundled into a workflow body, so it may import
// `workflow/api`. Every candidate run starts at retention 0 and on the exact
// deployment that accepted its first delivery (ADR 0029).

import { resumeHook, start } from "workflow/api";
import { candidateRun } from "./candidate-run.ts";
import type { CandidateRunApi } from "./candidate-run-api.ts";

export const liveCandidateRunApi: CandidateRunApi = {
  resumeHook: (key, delivery) => resumeHook(key, delivery),
  start: (key, first, deploymentId) =>
    start(candidateRun, [{ start: "fresh", key, first }], { deploymentId, experimental_retention: 0 }),
};

export { currentDeploymentId } from "./deployment.ts";
