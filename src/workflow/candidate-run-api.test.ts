// The route-side resume-or-start decision against a fake runtime API
// (ADR 0029, Ingress). Run with `pnpm test src/workflow`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { deliverToCandidateRun, DormantRunError, type CandidateRunApi } from "./candidate-run-api.ts";
import type { Delivery } from "./candidate-run-machine.ts";

const KEY = "candidate:" + "ef".repeat(32);
const DELIVERY: Delivery = {
  kind: "delivery",
  number: "+27820000001",
  messageIdHash: "h1",
  role: "Picker",
  acceptedBy: "dpl_here",
};

function named(name: string): Error {
  return Object.assign(new Error(name), { name });
}

test("a known key resumes the run that holds it", async () => {
  const calls: string[] = [];
  const api: CandidateRunApi = {
    resumeHook: async (key) => {
      calls.push(`resume ${key}`);
      return { runId: "wrun_owner" };
    },
    start: async () => {
      calls.push("start");
      return { runId: "wrun_new" };
    },
  };
  assert.deepEqual(await deliverToCandidateRun(KEY, DELIVERY, api), { action: "resumed", runId: "wrun_owner" });
  assert.deepEqual(calls, [`resume ${KEY}`]);
});

test("an unknown key starts a fresh run on the deployment that accepted the delivery", async () => {
  const started: unknown[] = [];
  const api: CandidateRunApi = {
    resumeHook: async () => {
      throw named("HookNotFoundError");
    },
    start: async (key, first, deploymentId) => {
      started.push({ key, first, deploymentId });
      return { runId: "wrun_new" };
    },
  };
  assert.deepEqual(await deliverToCandidateRun(KEY, DELIVERY, api), { action: "started", runId: "wrun_new" });
  assert.deepEqual(started, [{ key: KEY, first: DELIVERY, deploymentId: "dpl_here" }]);
});

test("a dormant eve dev generation is reported, not started over", async () => {
  const api: CandidateRunApi = {
    resumeHook: async () => {
      throw named("DevelopmentRunUnavailableError");
    },
    start: async () => {
      throw new Error("must not start");
    },
  };
  await assert.rejects(deliverToCandidateRun(KEY, DELIVERY, api), DormantRunError);
});

test("any other runtime failure propagates so the route answers 5xx", async () => {
  const api: CandidateRunApi = {
    resumeHook: async () => {
      throw named("WorkflowWorldError");
    },
    start: async () => ({ runId: "wrun_new" }),
  };
  await assert.rejects(deliverToCandidateRun(KEY, DELIVERY, api), { name: "WorkflowWorldError" });
});
