# Development and team workflow

## Why this exists

Several people and coding agents can move quickly in parallel, but shared files and unclear ownership create conflicts. Coordinate work around explicit ownership, interfaces, and concise handoffs—not by letting multiple agents independently modify the same area.

## Lightweight coordination pattern

The team coordination guide at [The Hackathon Agent Board](https://marvelous-relative-5de.notion.site/hack) describes using one pinned GitHub issue as a shared message board for teammates and coding agents. Posts identify the human/agent, summarize what changed or is needed, and tag the teammate responsible for the next action. A small CLI wrapper around GitHub CLI can support posting, reading, and waiting for tagged handoffs.

For this project, adopt the useful principles without copying the entire toolchain before it is needed:

1. Agree on one coordination issue and record its number in the team setup notes.
2. Record human and agent GitHub identities and folder ownership in the repository's contributor/agent instructions before parallel implementation.
3. Keep ownership disjoint by capability area; ask the owner before changing another area or shared contracts.
4. Make handoffs explicit: current state, files/interfaces changed, validation performed, blocker, and the person needed next.
5. Keep posts short and actionable. The board coordinates work; GitHub commits and review remain the source of truth for code.
6. Use one shared source of truth for API contracts, schemas, and integration decisions.

## Ownership map to fill in before parallel development

| Area | Owner | Interface/outputs | Notes |
|---|---|---|---|
| CoStar market/property | TBD | TBD | Verify sponsor fields and terms |
| Matterport interior/spatial | TBD | TBD | Verify SDK/API and scan access |
| Vexcel aerial/site | TBD | TBD | Verify imagery capabilities |
| Business profile/planning/costing | TBD | TBD | Agree on typed plan and cost schema |
| Frontend/demo integration | TBD | TBD | Consume stable contracts |
| Cross-layer integration/release | TBD | TBD | Coordinate shared interfaces |

Avoid assigning two people/agents to the same files. If a shared contract must change, announce it, coordinate dependent owners, and update the contract and consumers together.

## Git and repository hygiene

The current phase is docs and preparation on `main`, per team preference. Do not create speculative branches or copy unrelated repository contents into this project. Before importing code or SDK examples, check license, provenance, dependency and runtime requirements, and whether a small adapter is sufficient. Once parallel implementation starts, agree on a minimal contribution/review policy while keeping `main` coherent and demoable.
