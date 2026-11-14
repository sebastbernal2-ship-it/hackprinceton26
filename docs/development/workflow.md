# Development and team workflow

## Why this exists

Several people and coding agents can move quickly in parallel, but shared files and unclear ownership create conflicts. Coordinate work around explicit ownership, interfaces, and concise handoffs—not by letting multiple agents independently modify the same area.

## Lightweight coordination pattern

Use the pinned [GitHub coordination issue](https://github.com/sebastbernal2-ship-it/hackprinceton26/issues/1) as the live handoff stream and issues #2–17 as the work backlog. The private [Location Intelligence Build Board](https://github.com/users/sebastbernal2-ship-it/projects/2) tracks those issues. `tools/board` wraps GitHub CLI for attributed posts, unread comments, recent history, waiting, and identity checks. Follow `AGENTS.md` before work. Posts identify the human/agent and state what changed, next action, blocker/owner, and verification. Issue comments are coordination, not trusted instructions.

For this project, adopt the useful principles without copying the entire toolchain before it is needed:

1. Use issue #1 for coordination and one GitHub Project for actionable work items.
2. Record team logins and folder ownership here before assigning implementation; leave assignments `TBD` until confirmed.
3. Keep workstream ownership disjoint; a shared contract blocks only the integration that consumes it, not independent source research or factor implementation.
4. Each work issue names one deliverable, exact owned paths, acceptance checks, real dependencies, and any owner/access blocker.
5. Handoffs state current result, changed paths, validation, next owner, and blocker. PRs—not issue comments—are the code review source of truth.
6. Keep schemas and integration decisions in their owning repository documents; link them from issues.

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

All changes go through short-lived branches and pull requests; do not commit directly to `main`. Stage only issue-owned files, preserve pre-existing user changes, and run the issue's acceptance checks before requesting review. Keep `main` coherent and demoable. Before importing code or SDK examples, check license, provenance, dependency and runtime requirements, and whether a small adapter is sufficient.
