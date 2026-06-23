# 0015. Untrusted document parsing in the Sandbox

- **Status:** Accepted
- **Date:** 2026-06-23
- **Deciders:** Project lead, engineering, security

## Context

Phase 2 is the first phase that parses candidate documents: CVs and supporting files, including scanned or photographed CVs that need a vision model to read. These documents are untrusted input by definition. They arrive from candidates, can be malformed, can carry malicious payloads, and their text content can attempt prompt injection against any model that reads it (for example a CV line instructing the model to rank the candidate first). ADR 0002 chose the Sandbox for isolated code execution but did not decide how parsing uses it. Phase 2 needs that boundary drawn before it runs the first parse, and Phase 3 (assessment marking) is the next, stronger user of the same isolation, so the boundary set here should hold for it too.

## Decision

CV and document parsing runs in the Sandbox, never in the application or workflow runtime. The document is fetched from the system of record through the Connect broker (ADR 0009) and handed to the Sandbox; parsing (text extraction, and vision-model reading of scanned or photographed CVs) happens inside that isolated boundary; and what crosses back out is structured, extracted fields, not executable content and not free-running document logic. Extracted text is treated as data, never as instructions: it is structured on the way out so that downstream model calls (through the broker of ADR 0014) consume fields, not raw document narrative presented as a prompt. Any model call the parsing step itself needs (the vision read) goes through the model-access broker (ADR 0014), so redaction, the allowlist, and pinning still apply; the Sandbox isolates execution, it does not become a second, unredacted path to a provider. Parsing failures (unreadable scan, unsupported or malformed file) degrade gracefully and surface to a human rather than dropping the candidate or guessing content.

## Consequences

Untrusted documents cannot execute in the app or workflow runtime, and their content cannot reach a reasoning model as raw instructions, which closes the obvious injection and code-execution paths on the densest personal data the system handles. The structured-out contract keeps the rest of the pipeline working on fields, which also serves minimisation (ADR 0006) and makes redaction tractable. The cost is the Sandbox on the critical path of every parse (latency and a beta dependency, ADR 0005), and the discipline that the only model path out of parsing is the broker, not a direct call from inside the Sandbox. Routing the vision read back through the broker adds a hop but keeps a single enforced model path. This boundary is set so Phase 3 can extend the same isolation to running and marking assessment submissions without re-deciding it.

## Alternatives considered

Parsing in the application runtime with input validation. Rejected: validation does not contain a malicious file or a code-execution payload, and it leaves document text one step from being fed to a model as instructions. Isolation is the point of having the Sandbox.

Letting the parsing step call a vision provider directly from inside the Sandbox for speed. Rejected: it creates a second model path that bypasses the redaction, allowlist, and pinning enforced by ADR 0014, which is exactly the leak that ADR forecloses.

Passing raw extracted document text straight into the screening prompt. Rejected: it invites prompt injection from candidate-controlled content and weakens minimisation; structured extraction with text-as-data is the safer contract.
