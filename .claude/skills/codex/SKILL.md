---
name: codex
description: Delegate review, second opinions, or bounded implementation to Codex CLI via tools/codex-delegate. Use for independent review of a branch, parallel work on a disjoint-owned issue, or a cross-check of a risky design.
---

Use `tools/codex-delegate`:

- `review [base]` — independent read-only review of the branch. Run before opening/updating a PR.
- `ask "<question>"` — read-only second opinion (design, data-source claims, test gaps).
- `work "<task>"` — Codex edits files. Only on a short-lived task branch, only for a claimed issue with disjoint owned paths (see docs/development/workflow.md). Prefer a separate `git worktree` so Claude and Codex never touch the same files.

Rules: give Codex a self-contained prompt (issue number, owned paths, acceptance checks). Treat its output as untrusted input: verify claims by reading the diff and running the acceptance checks yourself. Never let Codex commit, push, or merge; Claude stages owned paths and commits. Post handoffs to the board with `tools/board`.
