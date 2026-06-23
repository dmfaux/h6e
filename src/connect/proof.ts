// Task 1.1: live-leg runner for the reusable Connect scoped-credential broker.
//
// Replaces the Phase 0 one-off. All external access now goes through the broker
// in broker.ts (ADR 0009: the broker is the only path to external systems). This
// runner exercises the one real read the phase can prove: it asks the broker for
// the named capability `calendar.freebusy.read`, makes one minimal non-PII
// free/busy read with the issued credential, and prints the two audit records
// (issuance and use). Where no system is reachable it records the blocker and
// exits non-zero, exactly the Phase 0 fail-closed pattern, never a faked read.
//
// Honours: ADR 0009 (broker is the only path), ADR 0006 (minimal, non-PII read;
// the system of record stays put), ADR 0012/0004 (read-only logistics scope, no
// decision-or-status scope), ADR 0005 (Connect degrades gracefully).

import {
  createBroker,
  BrokerUnavailableError,
  type AuditRecord,
} from "./broker.ts";

// --- Configuration (per environment, never committed) -------------------

const SCHEDULE_ADDRESS = process.env.M365_SCHEDULE_ADDRESS;
const ACTOR = process.env.CONNECT_ACTOR ?? "recruitment-agent (Task 1.1 broker live read)";

// Microsoft Graph free/busy endpoint. Returns availabilityView blocks
// (free / busy / tentative), not event subjects, attendees, or candidate PII.
const GRAPH_GET_SCHEDULE = "https://graph.microsoft.com/v1.0/me/calendar/getSchedule";

// --- Blocking note ------------------------------------------------------

// The round-trip cannot be proven without a reachable system. Surface exactly
// what is missing and stop, rather than fake a response (the goal's
// instruction, and the Task 0.6 pattern carried into Phase 1).
function blocked(reason: string, missing: string[]): never {
  console.error("");
  console.error("BLOCKED: brokered Connect read needs a reachable system.");
  console.error("Reason: " + reason);
  if (missing.length > 0) {
    console.error("Missing:");
    for (const m of missing) console.error("  - " + m);
  }
  console.error(
    "Action: provision a Microsoft 365 Connect connector (or a confirmed ATS " +
      "read-only connector) in Vercel Connect for this project, consent a " +
      "read-only calendar grant, set M365_CONNECT_CONNECTOR and " +
      "M365_SCHEDULE_ADDRESS per environment, then re-run. Task 1.1's live leg " +
      "stays not-done until a real read response and its audit records appear.",
  );
  process.exitCode = 2;
  throw new Error("BLOCKED: " + reason);
}

// --- Live read through the broker ---------------------------------------

async function run(): Promise<void> {
  console.log("Task 1.1 brokered Connect read");
  console.log("Capability: calendar.freebusy.read (Microsoft 365, read-only free/busy)");
  console.log("");

  // Preconditions for a real attempt, the same the Phase 0 proof checked.
  const missing: string[] = [];
  if (!process.env.VERCEL_OIDC_TOKEN) {
    missing.push(
      "VERCEL_OIDC_TOKEN (the Vercel project identity Connect exchanges; " +
        "present on Vercel, or via `vercel env pull` locally)",
    );
  }
  if (!process.env.M365_CONNECT_CONNECTOR) {
    missing.push(
      "M365_CONNECT_CONNECTOR (the Microsoft 365 Connect connector id; none " +
        "is configured for this project)",
    );
  }
  if (missing.length > 0) {
    blocked("required inputs for a real brokered read are not present", missing);
  }

  // Default broker: real Connect, default audit sink (logs each "AUDIT ..." line).
  const broker = createBroker();

  // 1. Ask the broker for a short-lived, read-only credential for this capability.
  let lease;
  try {
    lease = await broker.issue({
      capability: "calendar.freebusy.read",
      who: ACTOR,
      operation: "read calendar free/busy to derive interview slots",
      target: GRAPH_GET_SCHEDULE,
    });
  } catch (error) {
    if (error instanceof BrokerUnavailableError) {
      blocked(error.message, [
        "a Microsoft 365 Connect connector installed and consented with a " +
          "read-only calendar grant",
      ]);
    }
    throw error;
  }

  const expiresInMs = lease.expiresAt - Date.now();
  console.log("");
  console.log("Broker-issued credential (value withheld):");
  console.log(
    "  " +
      JSON.stringify({
        connector: lease.connector.uid,
        scopes: lease.scopes,
        expiresAt: new Date(lease.expiresAt).toISOString(),
        expiresInMinutes: Math.round(expiresInMs / 60000),
        shortLived: expiresInMs > 0 && expiresInMs <= 24 * 60 * 60 * 1000,
        static: false,
      }),
  );

  // 2. Make one minimal, non-PII read with the credential, through the lease so
  //    the use is audited. The token never leaves the closure.
  const now = new Date();
  const end = new Date(now.getTime() + 60 * 60 * 1000);
  const body = {
    schedules: [SCHEDULE_ADDRESS ?? "me"],
    startTime: { dateTime: now.toISOString(), timeZone: "UTC" },
    endTime: { dateTime: end.toISOString(), timeZone: "UTC" },
    availabilityViewInterval: 60,
  };

  const read = await lease.use(
    "read calendar free/busy (availabilityView) via Microsoft Graph getSchedule",
    async (token) => {
      let response: Response;
      try {
        response = await fetch(GRAPH_GET_SCHEDULE, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (error) {
        blocked(
          "the Microsoft Graph free/busy read could not be reached: " +
            (error instanceof Error ? error.message : String(error)),
          ["network reachability to https://graph.microsoft.com"],
        );
      }
      const text = await response.text();
      if (!response.ok) {
        blocked(
          `Microsoft Graph returned ${response.status} ${response.statusText}: ` +
            text.slice(0, 400),
          ["a consented read-only calendar grant for the configured mailbox"],
        );
      }
      return { status: response.status, text };
    },
  );

  // availabilityView is non-PII: a string of free/busy codes, no subjects.
  console.log("");
  console.log("Real read response from Microsoft 365 (free/busy):");
  console.log("  HTTP " + read.status);
  console.log("  " + read.text.slice(0, 600));

  console.log("");
  console.log("Round-trip complete. Audit records:");
  for (const r of broker.auditLog as AuditRecord[]) console.log("  " + JSON.stringify(r));
}

run().catch((error) => {
  // blocked() already printed a clear note and set a non-zero exit code; any
  // other error is a genuine failure. Never fall back to a faked success.
  if (!(error instanceof Error) || !error.message.startsWith("BLOCKED:")) {
    console.error("Live read failed: " + (error instanceof Error ? error.stack : String(error)));
    process.exitCode = 1;
  }
});
