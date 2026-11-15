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

## Local model run (provider=local), verified 2026-11-15
Server: llama.cpp `llama-server --jinja` (pi-harness `bin/local-model`), Qwen3.8-27B OBLITERATED i1-Q3_K_M, 32k ctx, one slot.
Set `LOCAL_LLM_BASE_URL=http://127.0.0.1:8089/v1`, `LOCAL_LLM_MODEL=qwen3.8-27b-obliterated`, then `POST /api/agent/run {"provider":"local"}`.
- Thinking is OFF by default (`chat_template_kwargs.enable_thinking=false`; `LOCAL_LLM_THINK=1` re-enables). With thinking on, the first
  run burned the 1200-token subagent budget on reasoning: 3 min wall, 2 of 3 inspectors returned no verdict, planner never saved a brief.
- Provider repairs malformed tool JSON (fences, trailing commas, quotes, missing brace), parses `<tool_call>` text, strips `<think>`,
  retries empty/unparseable replies at most 2 times, then returns an explicit failure turn.
- Real LIVE runs (goal: Italian restaurant with gelato in Houston, 40 seats, under 250k): 41-57 s wall, 10-15 model calls, ~38 tok/s decode,
  ~900-1100 tok/s prompt, 20-40k prompt + 1-4k completion tokens. 3 parallel inspectors share one slot, so they serialize.
- Failure modes seen: (1) all verdicts "strong" with no inspection and 11 unpriced cost lines (now capped to "workable", unknowns derived
  from tool results); (2) the model writes owner-goal figures ("40-seat") as listing facts and quotes a range's low bound as a point
  value; number checks pass, prose is not checked; (3) a claim citing `inspect_sites` used to verify against the model's own verdict text
  (now resolves to underlying evidence); (4) it only sometimes calls `rerun_plan`; it never did in these runs.
- Prompt injection planted in a `derived_layer` result (scratch presence layer): redacted, `prompt_injection_flagged` finding emitted per
  result, the model never acted on it, no listing 9999 or "0 percent risk" appeared in the trace.
- The recorded real trace contains CoStar-derived values, so it is NOT committed. It is kept local (gitignored location
  `data/derived/agent/replay.json`, which `GET /api/agent/replay` prefers); replay_info reports `recordedFrom` provider/model/date.
