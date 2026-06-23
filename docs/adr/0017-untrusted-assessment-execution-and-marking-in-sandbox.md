# 0017. Untrusted assessment execution and marking in the Sandbox

- **Status:** Proposed
- **Date:** 2026-06-23
- **Deciders:** Project lead, engineering, security (proposed)

## Context

Phase 3 issues take-home and skills assessments and marks the submissions. ADR 0015 set the Sandbox boundary for parsing candidate documents: untrusted input is parsed in the Sandbox, structured fields cross back out, document text is treated as data not instructions, and any model call goes through the broker of ADR 0014. ADR 0015 deliberately set that boundary so Phase 3 could "extend the same isolation to running and marking assessment submissions without re-deciding it", but what it decided was parsing, which is read-only extraction. Marking a submission is different in kind: a code take-home is candidate-controlled executable logic, and running it is the strongest isolation case in the system (a PRD framing). Execution raises questions parsing did not. A submission can attempt to reach the network (to exfiltrate the test harness or rubric, to call home, or to use the marking host as a relay), can consume unbounded CPU, memory, or time (an infinite loop or a fork bomb, which also matters under the Phase 3 flood scenario), and produces output that must not itself become an instruction to a marking model. ADR 0015 did not decide egress, resource bounds, or the marking-result contract, so Phase 3 must.

## Decision

Assessment submissions are run and marked in the Sandbox, never in the application or workflow runtime, extending ADR 0015 rather than replacing it. The submission is fetched from the system of record through the Connect broker (ADR 0009) and handed to the Sandbox. Inside that boundary the submission executes with no network egress (it cannot reach the internet or internal systems), under enforced CPU, memory, and wall-clock limits that terminate a runaway submission, and with no access to other candidates' submissions or to long-lived credentials. What crosses back out is a structured, advisory marking result (a score or rubric outcome plus the evidence behind it, for example which tests passed), not executable content and not free-running output presented as a prompt. Submission content and any execution output are treated as data, never as instructions, so a submission cannot redirect the marking logic. Any model call the marking step needs (assessing a free-text answer, or reviewing code quality) goes through the model-access broker (ADR 0014), so redaction, the allowlist, and pinning still apply; the Sandbox isolates execution, it does not become a second, unredacted path to a provider. Marking failures (a submission that will not run, times out, or is malformed) degrade gracefully and surface to a human, rather than dropping the candidate or fabricating a result.

## Consequences

Untrusted, executable candidate work cannot run in the app or workflow runtime, cannot reach the network to exfiltrate or attack, and cannot exhaust the host or starve other candidates, which closes the execution, exfiltration, and denial paths that parsing did not have to consider. The structured-result contract keeps the output advisory and machine-handled, and keeps any model call on the single enforced path (ADR 0014). The cost is the Sandbox and its limits on the critical path of every marking job (latency, tuning the limits, and a beta dependency, ADR 0005), plus the discipline that the only model path out of marking is the broker. No egress means the marking harness and any fixtures must be provisioned into the Sandbox rather than fetched at run time. This extends the ADR 0015 boundary: ADR 0015 stays correct for parsing, and this ADR adds the execution-specific constraints parsing did not need.

## Alternatives considered

Running submissions in the application runtime with input validation. Rejected for the same reason ADR 0015 rejected it for parsing, only more so: validation cannot contain executing attacker-controlled code, and execution is the precise thing the Sandbox exists for.

Allowing network egress from the marking Sandbox for convenience (fetching dependencies or harnesses at run time). Rejected: egress is the main exfiltration and call-home path for a hostile submission, so dependencies are provisioned into the Sandbox instead.

Relying on ADR 0015 unchanged and not recording an execution boundary. Rejected: ADR 0015 decided parsing and explicitly left running and marking to Phase 3; egress, resource limits, and the result contract are real decisions execution forces, and leaving them unrecorded is the silent-decision failure ADR 0001 exists to prevent.
