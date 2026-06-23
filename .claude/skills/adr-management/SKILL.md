---
name: adr-management
description: >
  Respect and maintain the project's Architecture Decision Record register in docs/adr.
  Use this skill whenever an architectural decision is in play: choosing or swapping a
  library, framework, provider, or service; changing how authentication, data flow,
  storage, channels, or model routing work; restructuring the project; changing a
  deployment or infrastructure approach; introducing a new integration; or doing
  anything that contradicts or relates to an existing ADR. Use it even when the user
  does not mention ADRs, decisions, or architecture by name. Before making such a
  decision, consult the register. After making one, record it. If the user asks you
  to do something that conflicts with an accepted ADR, do not silently comply: follow
  the supersede process in this skill.
---

# ADR management

This project keeps an Architecture Decision Record register in `docs/adr/`. Your job is to respect it and keep it current. Accepted ADRs are binding. This skill is the single source of truth for the procedure.

## When this applies

An architectural decision is one that is costly to reverse or that shapes how the system is built. Treat all of these as architectural decisions requiring an ADR:

- Adding, choosing, removing, or swapping a library, framework, provider, or external service.
- Changing how authentication or authorisation works.
- Changing how personal or candidate data flows, is stored, is redacted, or is shared with third parties (model providers included).
- Changing model routing, the provider allowlist, or which model a step uses.
- Changing the channel setup (WhatsApp, Teams) or adding a channel.
- Restructuring the repo, the workflow boundaries, or the agent and tool layout.
- Changing deployment, environments, CI, or infrastructure approach.
- Anything that relaxes or contradicts a non-negotiable constraint in CLAUDE.md.

Routine work is not an architectural decision: fixing a bug, adding a field, writing a test, refactoring within an existing structure, adjusting copy. If you are unsure, lean towards checking the register, and if the choice is genuinely shaping, write the ADR.

## Before you decide: consult the register

1. Read `docs/adr/README.md`, including the index table.
2. Read any ADR that touches the area you are about to change.
3. If an accepted ADR already covers the decision, follow it. Do not reopen it just because a different approach occurred to you.
4. If nothing covers it, you are making a new decision: write an ADR (below).

## When the request conflicts with an accepted ADR

Do not silently comply, and do not silently deviate. Either direction erodes the register.

1. Name the conflict to the user: which ADR, and what it says.
2. If the new direction is genuinely better, propose a superseding ADR (below) in Proposed status, with the reasoning, and leave the decision to a human. Do not write the contradicting code until that ADR is Accepted.
3. If the user insists on proceeding anyway, the correct artefact is still a superseding ADR they accept, not undocumented code. The register must always reflect what the system actually does.

## Writing a new ADR

1. Find the next number: the highest existing `NNNN` in `docs/adr/` plus one, zero-padded to four digits. The helper at `scripts/new-adr.sh` does this for you if a POSIX shell is available; otherwise do it by hand.
2. Copy `docs/adr/template.md` to `docs/adr/NNNN-short-slug.md`. The slug is a few words, lower case, hyphenated.
3. Fill in every section: Status, Date (today, ISO format), Deciders, Context, Decision, Consequences, Alternatives considered. Do not leave placeholder text.
4. Write the Context as the problem, not the answer. Write the Decision in the active voice, one decision per ADR. Be honest in Consequences about costs and what this makes harder, not just benefits. Alternatives considered is the section future readers value most, so do not skip it.
5. If the decision is driven by a compliance constraint (POPIA, the Employment Equity Act), say so explicitly in Context. The register is part of the compliance evidence.
6. Set Status to Proposed unless a human has clearly already accepted it in the conversation, in which case Accepted is correct.
7. Add a row to the index table in `docs/adr/README.md`.

## Superseding an ADR

When a new decision replaces an old one:

1. Write the new ADR as above. In its Context, reference the ADR it replaces and why the situation changed.
2. Edit the old ADR's Status to `Superseded by NNNN` (the new number). Do not edit the old ADR's Decision or reasoning, the history is the point.
3. Update both rows in the index table.

## Status lifecycle

- **Proposed**: written, not yet agreed. Not safe to build against.
- **Accepted**: in force. Build against it.
- **Superseded by NNNN**: replaced. Kept for history.
- **Deprecated**: no longer relevant, not replaced.
- **Rejected**: considered and not adopted. Kept so it is not relitigated.

## Keep it honest

The register must always match what the system actually does. If you discover the code and an accepted ADR disagree, that is a problem to surface, not to paper over: either the code is wrong, or the ADR needs superseding. Raise it.

## Writing style

Markdown. No em dashes. British English. Plain, direct prose. Match the style of the existing ADRs in the register.