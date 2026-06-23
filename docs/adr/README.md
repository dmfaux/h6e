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

Keep this table in sync when you add or change an ADR.