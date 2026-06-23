# 0007. One stack, one repo, no low-code or BI tools

- **Status:** Accepted
- **Date:** 2026-06-23
- **Deciders:** Project lead, engineering

## Context

The system has several surfaces: the agent, the channels, the schedules, and a funnel reporting dashboard. There is a choice between building these in one codebase on one stack, or spreading them across separate tools (for example, generating UI with v0, or building the dashboard in Power BI).

## Decision

The agent, the channels, the schedules, and the reporting dashboard all live in one repository on one stack, built with Claude Code and deployed on Vercel, behind one auth layer. The dashboard is a web app (Next.js on Vercel) reading the warehouse through Connect, not a BI tool. We do not use v0 and we do not use Power BI. We do not add a second tool unless a hard requirement forces it, recorded as its own ADR.

## Consequences

One stack, one auth, one deploy, and the reporting surface inherits the same identity and access as everything else. The cost is that there is no non-engineer build path: every dashboard change is an engineering task, and we lose the drag-and-drop ad-hoc exploration a BI tool gives. For a fixed, reviewed reporting surface that is an acceptable trade. If genuine self-service ad-hoc analysis becomes a hard requirement, the answer is a deliberate decision to add a self-service tool (recorded as a new ADR), not a quiet workaround.

Note: the v0-plus-Snowflake build path is excluded partly because the target runs the Microsoft data stack (Synapse or Fabric), not Snowflake. If that turns out to be wrong and Snowflake is in use, reconsidering v0 for the dashboard would be a new ADR.

## Alternatives considered

Power BI for the dashboard. Rejected: adds a second tool and login, and cuts against the one-stack goal, for a reporting surface that is mostly fixed. A non-Power-BI self-service tool (such as Metabase) was noted as the fallback if ad-hoc exploration becomes essential.

v0 for building UI. Rejected: its value is a non-engineer build path we do not need here, and it ties front ends to v0's generation rather than plain code in the repo.