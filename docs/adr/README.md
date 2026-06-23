# Architecture Decision Records

This is the decision register for the project. An ADR captures one architectural decision: what we decided, why, and what it commits us to. It is a log, not a wiki. Once accepted, an ADR is not edited to change the decision. If the decision changes, we write a new ADR that supersedes the old one, and the old one stays in place with its status updated, so the history is intact.

## Why we keep this

So that anyone (a new engineer, a future you, an auditor, legal) can see why the system is the way it is without archaeology through commit history or Slack. For this project it also has a compliance edge: several decisions exist specifically to stay defensible under POPIA and the Employment Equity Act, and a written record of those decisions and their reasoning is part of that defence.

## How to use it

- Before making an architectural decision, read the register. If an accepted ADR already covers it, follow it.
- When you make a new architectural decision, record it as an ADR. Use the `adr-management` skill, which carries the full procedure.
- Do not silently contradict an accepted ADR. If one is wrong or outdated, supersede it with a new ADR and explain why.

What counts as an architectural decision, the numbering, the status lifecycle, and the supersede process all live in the `adr-management` skill so there is one source of truth for the procedure.

## Format

Each ADR is a single markdown file named `NNNN-short-slug.md`, copied from `template.md`. We use a lightweight Nygard-style format: status, context, decision, consequences, alternatives.

## Status values

- **Proposed**: written, not yet agreed. Not safe to build against.
- **Accepted**: agreed and in force. Build against this.
- **Superseded by NNNN**: replaced by a later decision. Kept for history.
- **Deprecated**: no longer relevant, not replaced.
- **Rejected**: considered and explicitly not adopted. Kept so we do not relitigate it.

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [0001](0001-record-architecture-decisions-with-adrs.md) | Record architecture decisions with ADRs | Accepted |
| [0002](0002-build-on-vercel-agent-stack-with-eve.md) | Build on the Vercel Agent Stack using eve | Accepted |
| [0003](0003-microsoft-first-identity-with-swappable-auth.md) | Microsoft-first identity behind a swappable auth interface | Accepted |
| [0004](0004-human-in-the-loop-on-candidate-decisions.md) | Human in the loop on every candidate-affecting decision | Accepted |
| [0005](0005-no-private-beta-in-critical-path.md) | No private beta components in the critical path | Accepted |
| [0006](0006-data-minimisation-over-data-residency.md) | Data minimisation over data residency | Accepted |
| [0007](0007-one-stack-one-repo.md) | One stack, one repo, no low-code or BI tools | Accepted |
| [0008](0008-stateless-signed-sessions-for-internal-auth.md) | Stateless signed sessions for internal auth | Accepted |
| [0009](0009-reusable-connect-scoped-credential-broker.md) | Reusable Connect scoped-credential broker | Accepted |
| [0010](0010-verified-channel-webhook-ingress.md) | Verified channel webhook ingress | Accepted |
| [0011](0011-channel-bound-internal-identity-before-entra.md) | Channel-bound internal identity resolution before Entra | Accepted |
| [0012](0012-agent-ats-write-boundary-logistics-phase.md) | The agent's write boundary in the logistics phase | Accepted |
| [0013](0013-screening-and-bias-evaluation-policy.md) | Screening and bias-evaluation policy | Accepted |
| [0014](0014-brokered-redacting-model-access.md) | Brokered, redacting model access through AI Gateway | Accepted |
| [0015](0015-untrusted-document-parsing-in-sandbox.md) | Untrusted document parsing in the Sandbox | Accepted |
| [0016](0016-screening-phase-decision-gate-and-write-boundary.md) | The screening-phase decision gate and agent write boundary | Accepted |
| [0017](0017-untrusted-assessment-execution-and-marking-in-sandbox.md) | Untrusted assessment execution and marking in the Sandbox | Accepted |
| [0018](0018-queue-based-absorption-of-application-and-submission-spikes.md) | Queue-based absorption of application and submission spikes | Accepted |
| [0019](0019-assessment-phase-decision-gate-and-write-boundary.md) | The assessment-phase decision gate and agent write boundary | Accepted |
| [0020](0020-bias-evaluation-for-assessment-marking.md) | Bias evaluation for assessment marking | Accepted |
| [0021](0021-funnel-dashboard-read-only-reporting-over-warehouse.md) | Funnel dashboard as a read-only reporting surface over the warehouse | Accepted |
| [0022](0022-warehouse-read-access-through-connect-broker.md) | Warehouse read access through the Connect broker | Accepted |
| [0023](0023-entra-app-roles-as-internal-role-source.md) | Entra app-role claims as the single source of internal roles | Accepted |
| [0024](0024-ci-cd-on-github-actions-with-vercel-integration.md) | CI/CD on GitHub Actions with the Vercel GitHub integration | Accepted |
| [0025](0025-tracing-via-opentelemetry-through-eve-instrumentation.md) | Tracing via OpenTelemetry through eve's instrumentation seam | Accepted |

Keep this table in sync when you add or change an ADR.