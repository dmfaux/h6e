#!/usr/bin/env node
// Boot proof for the candidate run (Task 1.3, ADR 0029). Boots the built agent
// (`pnpm build` first) against an empty local World, posts Meta-shaped signed
// webhooks with fake numbers (+2782000000x only), and checks the observable
// outcomes: a forged signature is refused, a first application starts a run,
// a redelivery and a second message resume the same run, two concurrent first
// messages for one number end with one run and one acknowledgement, another
// number gets its own run, exactly one Graph send happens per number, and no
// model span appears. Graph sends are intercepted by intercept-graph.mjs,
// preloaded into the server process; nothing in src/ or agent/ changes.
//
// Usage: pnpm build && node scripts/candidate-run-proof/prove.mjs
// PROOF_LOG=<path> also writes the full server log there.
// Exit code 0 when every check passes.

import { spawn } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const PORT = Number(process.env.PROOF_PORT ?? 3920);
const BASE = `http://127.0.0.1:${PORT}`;
const APP_SECRET = randomBytes(24).toString("hex");
const KEY_SECRET = randomBytes(24).toString("hex");
const CATALOG = { "REQ-1024": "Warehouse Picker" };
const NUMBERS = { one: "27820000001", two: "27820000002", three: "27820000003" };

const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${what}`);
  if (!ok) failures.push(what);
};

// --- Graph stub: counts one POST per recipient, never logs the body -------------

const sends = new Map();
const stub = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    let to = "?";
    try {
      to = JSON.parse(body).to;
    } catch {}
    sends.set(to, (sends.get(to) ?? 0) + 1);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ messaging_product: "whatsapp", messages: [{ id: "wamid.OUT" }] }));
  });
});
await new Promise((resolve) => stub.listen(0, "127.0.0.1", resolve));
const stubUrl = `http://127.0.0.1:${stub.address().port}`;

// --- Boot the built agent against an empty local World ------------------------------

if (await fetch(`${BASE}/eve/v1/health`).then(() => true, () => false)) {
  console.log(`FAIL something already listens on ${BASE}; stop it first (lsof -nP -iTCP:${PORT})`);
  process.exit(1);
}

// The local World keeps its data under .eve/.workflow-data (gitignored) and
// ignores WORKFLOW_LOCAL_DATA_DIR under `eve start`, so each proof run uses a
// fresh CANDIDATE_KEY_SECRET instead: every key is new, every run starts fresh.
const log = [];
// Detached, so the whole process group (pnpm, eve, the server) can be killed
// at the end; the server is a grandchild and would otherwise outlive the proof.
const server = spawn("pnpm", ["start"], {
  cwd: repo,
  detached: true,
  env: {
    ...process.env,
    PORT: String(PORT),
    NODE_OPTIONS: `--import ${join(here, "intercept-graph.mjs")}`,
    GRAPH_STUB_URL: stubUrl,
    WHATSAPP_APP_SECRET: APP_SECRET,
    WHATSAPP_VERIFY_TOKEN: "proof-verify-token",
    WHATSAPP_PHONE_NUMBER_ID: "PROOF_PNID",
    WHATSAPP_ACCESS_TOKEN: "proof-dummy-token",
    WHATSAPP_ROLE_CATALOG: JSON.stringify(CATALOG),
    CANDIDATE_KEY_SECRET: KEY_SECRET,
  },
  stdio: ["pipe", "pipe", "pipe"],
});
// `eve start` exits on stdin EOF in a non-TTY shell, so stdin stays open.
for (const stream of [server.stdout, server.stderr]) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    for (const line of chunk.split("\n")) if (line) log.push(line);
  });
}

async function waitFor(predicate, what, timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const value = await predicate();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`timed out waiting for ${what}`);
}

await waitFor(
  () => fetch(`${BASE}/eve/v1/health`).then((r) => r.ok).catch(() => false),
  "the agent to boot",
  120_000,
);
console.log(`agent up on ${BASE}; Graph stub at ${stubUrl}`);

// --- Meta-shaped signed webhooks ----------------------------------------------------

function payload(number, messageId) {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_ID",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "27115550000", phone_number_id: "PROOF_PNID" },
              contacts: [{ wa_id: number, profile: { name: "Applicant" } }],
              messages: [
                {
                  from: number,
                  id: messageId,
                  timestamp: "1700000000",
                  type: "text",
                  text: { body: "Hi, I saw the advert" },
                  referral: { source_type: "ad", source_id: "REQ-1024", headline: "We are hiring" },
                },
              ],
            },
          },
        ],
      },
    ],
  });
}

function post(number, messageId, secret = APP_SECRET) {
  const body = payload(number, messageId);
  const signature = "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");
  return fetch(`${BASE}/intake`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": signature },
    body,
  });
}

const intakeLines = () => log.filter((l) => l.includes("[intake]"));
const runIdsIn = (line, action) => [...line.matchAll(new RegExp(`${action} (wrun_[A-Z0-9]+)`, "g"))].map((m) => m[1]);
const sendsTo = (number) => sends.get(number) ?? 0;

try {
  // Forged signature.
  const forged = await post(NUMBERS.one, "wamid.proof.forged", "attacker-secret");
  check(forged.status === 403, `forged signature answered 403 (got ${forged.status})`);

  // First application for number one starts a run and sends one acknowledgement.
  const first = await post(NUMBERS.one, "wamid.proof.one.A");
  check(first.status === 200, `first application answered 200 (got ${first.status})`);
  const startedLine = intakeLines().at(-1) ?? "";
  const [runOne] = runIdsIn(startedLine, "started");
  check(Boolean(runOne), `first application started a run (${startedLine})`);
  await waitFor(() => sendsTo(NUMBERS.one) >= 1, "the first acknowledgement");
  check(sendsTo(NUMBERS.one) === 1, `one Graph send for number one after the first application`);

  // Redelivery of the same message id resumes the same run, no second send.
  const redelivery = await post(NUMBERS.one, "wamid.proof.one.A");
  check(redelivery.status === 200, `redelivery answered 200 (got ${redelivery.status})`);
  const redeliveryLine = intakeLines().at(-1) ?? "";
  check(runIdsIn(redeliveryLine, "resumed")[0] === runOne, `redelivery resumed the same run (${redeliveryLine})`);

  // A second message from number one resumes the same run, no second send.
  const second = await post(NUMBERS.one, "wamid.proof.one.B");
  check(second.status === 200, `second message answered 200 (got ${second.status})`);
  const secondLine = intakeLines().at(-1) ?? "";
  check(runIdsIn(secondLine, "resumed")[0] === runOne, `second message resumed the same run (${secondLine})`);
  await waitFor(() => log.some((l) => l.includes("processedEvents=2")), "the second delivery to be processed");
  check(sendsTo(NUMBERS.one) === 1, `still one Graph send for number one after a redelivery and a second message`);

  // Two concurrent first messages for a new number: one run serves, one acknowledgement.
  const before = intakeLines().length;
  const [c1, c2] = await Promise.all([post(NUMBERS.two, "wamid.proof.two.A"), post(NUMBERS.two, "wamid.proof.two.B")]);
  check(c1.status === 200 && c2.status === 200, `two concurrent first messages both answered 200 (${c1.status}, ${c2.status})`);
  const concurrentLines = intakeLines().slice(before);
  const startedRuns = new Set(concurrentLines.flatMap((l) => runIdsIn(l, "started")));
  const resumedRuns = new Set(concurrentLines.flatMap((l) => runIdsIn(l, "resumed")));
  await waitFor(() => sendsTo(NUMBERS.two) >= 1, "number two's acknowledgement");
  if (startedRuns.size === 2) {
    const forwarded = await waitFor(() => log.find((l) => l.includes("duplicate start forwarded")), "the duplicate start to forward");
    check(Boolean(forwarded), `two runs raced for number two; the loser forwarded its delivery and ended (${forwarded})`);
    await waitFor(() => log.some((l) => l.includes("processedEvents=2") && !l.includes(startedLine)), "the forwarded delivery to be processed", 30_000).catch(() => {});
  } else {
    check(
      startedRuns.size === 1 && [...resumedRuns].every((id) => startedRuns.has(id)),
      `number two's concurrent messages hit one run (started ${[...startedRuns]}, resumed ${[...resumedRuns]})`,
    );
  }
  await new Promise((r) => setTimeout(r, 3000));
  check(sendsTo(NUMBERS.two) === 1, `exactly one Graph send for number two after two concurrent first messages (got ${sendsTo(NUMBERS.two)})`);

  // A different number gets its own run.
  const third = await post(NUMBERS.three, "wamid.proof.three.A");
  check(third.status === 200, `third number answered 200 (got ${third.status})`);
  const thirdLine = intakeLines().at(-1) ?? "";
  const [runThree] = runIdsIn(thirdLine, "started");
  check(Boolean(runThree) && runThree !== runOne && !startedRuns.has(runThree), `a different number started its own run (${thirdLine})`);
  await waitFor(() => sendsTo(NUMBERS.three) >= 1, "number three's acknowledgement");

  // Exactly one Graph send per number, and nothing to anyone else.
  await new Promise((r) => setTimeout(r, 2000));
  const counts = Object.fromEntries([...sends.entries()].sort());
  check(
    JSON.stringify(counts) === JSON.stringify({ [NUMBERS.one]: 1, [NUMBERS.two]: 1, [NUMBERS.three]: 1 }),
    `exactly one Graph send per number: ${JSON.stringify(counts)}`,
  );

  // No model turn anywhere: no invoke_agent or chat span, while workflow spans do print.
  const spanLines = log.filter((l) => /^\s*name: /.test(l) || l.includes("invoke_agent") || l.includes("chat anthropic"));
  const modelSpans = log.filter((l) => l.includes("invoke_agent") || l.includes("chat anthropic") || /name: ['"]chat /.test(l));
  const workflowSpans = log.filter((l) => /name: ['"](workflow\.run|step\.execute|hook\.resume|workflow\.start)/.test(l));
  check(modelSpans.length === 0, `no invoke_agent or chat span in the server log (${modelSpans.length} found)`);
  check(workflowSpans.length > 0, `workflow spans were exported, so the absence above is meaningful (${workflowSpans.length} seen)`);
  void spanLines;

  // Logs name no number and no raw message id.
  const leaks = log.filter((l) => /\+?2782000000[123]/.test(l) || l.includes("wamid.proof")).filter((l) => !/name: /.test(l));
  check(leaks.length === 0, `no candidate number or raw message id in any log line (${leaks.length} found)`);
  for (const leak of leaks.slice(0, 5)) console.log("  leak:", leak);

  console.log("\n--- intake and run log lines ---");
  for (const line of log.filter((l) => l.includes("[intake]") || l.includes("[candidate-run]") || l.startsWith("AUDIT "))) console.log(line);
  const bootLine = log.find((l) => l.includes("[candidate-run] boot"));
  console.log("\n--- example span names ---");
  for (const name of new Set(workflowSpans.map((l) => l.trim()))) console.log(name);
  void bootLine;
} catch (error) {
  check(false, `proof aborted: ${error instanceof Error ? error.message : String(error)}`);
  console.log("\n--- last 40 server log lines ---");
  for (const line of log.slice(-40)) console.log(line);
} finally {
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    server.kill("SIGTERM");
  }
  stub.close();
  if (process.env.PROOF_LOG) {
    writeFileSync(process.env.PROOF_LOG, log.join("\n") + "\n");
    console.log(`full server log written to ${process.env.PROOF_LOG}`);
  }
}

console.log(`\n${failures.length === 0 ? "ALL CHECKS PASSED" : `${failures.length} CHECK(S) FAILED`}`);
process.exit(failures.length === 0 ? 0 : 1);
