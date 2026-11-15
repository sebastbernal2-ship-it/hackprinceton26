# Mission Control agent

Server-side port of the foreground_final deepagents idea (planner + parallel site-inspector subagents + replay) onto our typed API,
in plain Python (`agent/`). Routes: `POST /api/agent/run` (SSE), `GET /api/agent/replay` (SSE; `?delay=0.2` paces events).

## Loop
1. Planner (claude-sonnet-5-5 | local OpenAI-compatible | SCRIPTED policy) emits `plan`, then batches `write_plan` + `shortlist` (+ catalog) in parallel.
2. `inspect_sites` spawns one subagent per shortlisted listing (max 4, claude-haiku-5-5) in parallel threads. Each calls
   `property_facts`, `inspection_findings`, `costs`, `assess` in parallel and submits a structured verdict. A subagent is pinned to its own listingId.
3. Actions: `rerun_plan` (re-run the shortlist/assess with changed assumptions; scenario analysis, not a forecast), `make_checklist`
   (deterministic templates over findings, unknown factor cards, unpriced cost lines, missing constraint facts, unknown assess inputs),
   `save_brief` (writes `data/derived/agent/briefs/<runId>.json`, gitignored).
4. `final` carries the brief: verified claims, rejected claims, verdicts, unknowns.

Events: `plan, tool_call, tool_result, subagent_start, subagent_finish, finding, action, final, error` (+ `replay_info` on replay).
Every event carries `mode`: `LIVE` (anthropic/local), `SCRIPTED` (deterministic policy, no LLM), `REPLAY` (with `recordedMode`).

## Tools
`shortlist`, `property_facts` (facts + factor cards), `inspection_findings`, `costs`, `assess`, `constraint_filter`, `asset_catalog`,
`derived_layer` (triage, review_queue, aerial, lineage, presence: reads `data/derived/<layer>/<listingId>.json`; reports `unavailable`
= unknown when a layer has not been produced), plus meta/actions above. Triage/aerial/lineage producers are other slices; this agent
does not assume their schema, it passes their JSON through as data.

## Guardrails (tested in `services/api/tests/test_agent.py`)
- Tool output reaches the model only inside `{"resultId","tool","untrusted_data"}`; instruction-like strings are redacted (`guard.REDACTION`)
  and a `finding` of kind `prompt_injection_flagged` is emitted. This is a heuristic backstop; the primary defence is that tools are
  an allowlist, arguments are validated, subagents are pinned, and nothing a tool returns can trigger an action.
- Every brief/verdict claim is `{text, cites:[resultId]}`. A claim is accepted only if every number in its text appears in a cited result
  (rounded to the stated decimals, or k/m shorthand within 0.5%). Failed claims go to `rejectedClaims`; a failed verdict becomes `unknown`.
  Limit: this checks numbers, not the prose around them.
- Unknown stays unknown: no value is defaulted to 0; missing layers return `unavailable`.
- Verdict rules in the SCRIPTED inspector are screening heuristics (P(over budget) vs 0.5, high-severity findings), not engineering assessments.

## Modes and data
- `provider=auto`: Anthropic if `ANTHROPIC_API_KEY` is set, else `LOCAL_LLM_BASE_URL` (+ `LOCAL_LLM_MODEL`), else SCRIPTED over the live tools.
  Needs CoStar data (`COSTAR_NORMALIZED_DIR`); otherwise the stream is a single `error` event pointing to the replay.
- `record: true` stores the run at `data/derived/agent/replay.json` (local, never committed; contains sponsor data).
  `GET /api/agent/replay` prefers that file, else the committed `agent/fixtures/replay.synthetic.json` (SYNTHETIC values, regenerate with
  `python -m agent.record_fixture`).
- Model confidence in any model-written text is the model's own, not a probability.
