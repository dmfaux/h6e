# CLAUDE.md

Standing context and rules for Claude Code working in this repository. Read this fully before making changes. These rules are not optional and not overridden by a single request to skip them. If a task seems to require breaking one, stop and raise it rather than working around it.

## What this is

A recruitment pipeline agent for a high-volume South African employer, built on the Vercel Agent Stack using the eve framework. It runs hiring logistics (CV parsing, interview scheduling, candidate and stakeholder chasing, drafting, assessment marking) and keeps a named human on every accept-or-reject decision. Candidates are reached on WhatsApp; recruiters and hiring managers work in Microsoft Teams. The full scope and phasing are in the PRD under `docs/prd/`. The project does not have a name yet.

## Architecture decisions: respect and maintain the ADR register

This is the most important rule in this file.

The decision register is in `docs/adr/`. Accepted ADRs are binding.

- Before making any architectural decision, read `docs/adr/`. If an accepted ADR covers it, follow it.
- Do not contradict an accepted ADR. If you believe one is wrong or out of date, do not silently deviate. Propose a new ADR that supersedes it, explain why, and leave it in Proposed status for a human to accept. Do not write the contradicting code until the superseding ADR is accepted.
- When you make a new architectural decision, record it as an ADR. Code that introduces a new architectural decision without a corresponding ADR is incomplete, treat the ADR as part of the change.
- Keep the register current: set statuses correctly, mark superseded ADRs, and update the index table in `docs/adr/README.md`.

The full procedure (what counts as an architectural decision, numbering, status lifecycle, how to supersede) is in the `adr-management` skill at `.claude/skills/adr-management/`. Use it whenever an architectural decision is in play.

## Non-negotiable constraints

These are the standing rules of the system. Each is backed by an ADR; the ADR has the reasoning.

- Human decides, agent prepares. The agent never changes a candidate's status on its own. Any decision that significantly affects a candidate (rejection, shortlisting that drives rejection, an offer) pauses for a named human who can override, and the override is logged. Screening and ranking are advisory only and only after bias evaluation and tracing exist. No automated rejection. (ADR 0004)
- Data minimisation. The system of record stays in the corporate's Azure tenant or the ATS. Redact direct identifiers before any model call. Route only to the approved provider allowlist with pinned model choice. If a data class is not cleared by legal, it does not flow through the agent. (ADR 0006)
- Microsoft-first identity behind a swappable interface. Internal surfaces depend on our own auth interface, never on a provider directly. Dev credential provider during build, Entra via Passport later, selected by env var. The dev provider must refuse to start in production. Roles are part of the interface. Candidate identity is the WhatsApp number, not a login. (ADR 0003)
- No private beta in the critical path. GA, open, or public beta only. (ADR 0005)
- One stack, one repo. Agent, channels, schedules, and dashboard in this repo on Vercel, behind one auth layer. No v0, no Power BI. Dashboard is a Next.js app, not a BI tool. (ADR 0007)
- Always use PNPM. DO NOT USE NPM!
- Always use the most up to date Production version of any package you install. Research this before just installing. The ONLY reason to use an older version is if it is not compatible with what is already installed.

## Stack

Vercel Agent Stack via the eve framework. Workflow SDK for durable execution, Chat SDK for WhatsApp and Teams, AI Gateway for model routing, Sandbox for untrusted code, Connect for scoped credentials to the ATS, Microsoft 365 calendars, and the warehouse, Cron for schedules. TypeScript throughout. The dashboard is Next.js on Vercel.

## Phasing

Work proceeds in phases defined in the PRD. Phase 0 is project setup (the walking skeleton). Do not pull work forward from a later phase into the current one without a reason and, if it is an architectural decision, an ADR. Each phase has a defined "done when" in the PRD; respect the include and exclude boundaries.

## Writing style for docs and comments

- Markdown for documentation. Prefer markdown over Word unless asked otherwise.
- No em dashes anywhere. Use commas, colons, parentheses, or short sentences.
- British English. South African context where relevant.
- Plain, direct prose. Light structure. Headings only when they help. Bullets sparingly. No marketing tone.

## Where things live

- `docs/prd/` PRD and per-phase specs
- `docs/phase-x` Phase specs
- `docs/adr/` the decision register (start at `README.md`)
- `.claude/skills/adr-management/` the ADR procedure skill
- `src/` application code (agent, tools, channels, schedules)
- the dashboard app (location set in Phase 4)

When in doubt about why the system is shaped a certain way, the answer is probably an ADR. Read it before changing the shape.