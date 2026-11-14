# Integration architecture

The product is cross-layer, but source capabilities should be built and validated independently before composition. This is a logical modularity plan, not a mandate to create microservices. Start in one application/repository unless implementation evidence justifies more infrastructure.

## Capability boundaries

The code is one repository with module folders, not microservices. Each folder owns one capability behind a narrow interface:

- `data/` (with `data/factors/*`) - CoStar property/market normalization, per-factor adapters, factor cards, provenance. Sponsor data stays local.
- `modeling/`, `capture/`, `walkthrough/` - interior spatial evidence: Matterport pipeline, phone-video scene capture, and the viewer. Not wired to the API.
- Aerial/Vexcel - no code; access returned 403, so aerial evidence is unknown for all sites.
- `assets/` - the equipment/furniture catalog; `config/published_sources.json` - the list of published sources.
- `planning/` - deterministic cost, timeline, Monte Carlo and sensitivity; `forecasting/` - gated time-series cards and an exploratory survival model.
- `inspection/` - vision and geometry defect findings, anchored in 3D, linked to costs.
- `integration/` - brief parsing and the three-valued constraint filter that composes evidence.
- `services/api/` and `contracts/` - the HTTP surface and generated JSON Schemas; `foreground/` is the only UI client.

Do not pull unrelated repositories, frameworks, or services into the project without a concrete need. Keep external SDKs and source adapters behind narrow interfaces so sponsor tooling can be changed without rewriting product logic.

## Source result contract

Each source adapter should return a standalone, typed result that preserves:

- source/provider and source record identifiers;
- matched property/site identity and match confidence (never assume address match is certain);
- retrieval time, source timestamp, geographic/spatial scope, and applicable data-use constraints;
- each observation with value, unit, and status: `observed`, `derived`, `estimated`, or `unknown`;
- supporting evidence/reference, confidence, limitations, and error/missing/stale state.

Do not silently merge conflicting values or turn missing data into a negative finding. Keep raw/source evidence distinct from normalized facts and derived claims. Cross-layer conclusions must cite their input observations and explain the inference.

## Planning and cost boundaries

The planner accepts structured business requirements plus source results and returns a typed proposal: layout/equipment items, spatial quantities, fit constraints, assumptions, and unresolved questions. Use conventional geometry and deterministic rules where possible. The UI/guide gathers preferences and explains outputs; it should not invent evidence.

Cost calculation is a separate deterministic module over the typed proposal and a transparent price catalog. Record quantities, units, source/date, low/high range, contingency, and unknowns. Model occupancy, one-time build-out, and delay-related costs separately. Never use free-form LLM arithmetic as the authoritative estimate. A benchmark occupancy ratio is not break-even analysis; any operating scenario needs explicit assumptions and must not be presented as a forecast.

## Agent orchestration

If agents are used, keep research workers source-specific and give them narrow tasks with structured outputs. A planner composes their results; avoid opaque per-property agents that independently fetch and blend every source. Use bounded timeouts, caching, partial-result handling, and prepared demo fallbacks. Reserve live execution for a small, visible re-plan.

## Suggested implementation sequence

1. Verify sponsor API/SDK access, terms, sample schemas, and candidate-site coverage.
2. Build a minimal adapter and standalone evidence view for each source actually used.
3. Define property matching and provenance using real records; document ambiguity and missingness.
4. Validate scan-derived dimensions against a published plan or measured space.
5. Implement a focused business-specific kitchen projection and typed plan output.
6. Add deterministic itemized cost ranges and one actionable verification/negotiation output.
7. Compose at least two data layers into one explainable scenario and demonstrate one evidence-triggered re-plan.
8. Expand to Pareto alternatives and wider site-to-operations workflows only after the narrow end-to-end slice works.

## Repository integration rules

- Keep feature work within its owned module/folder and expose stable interfaces.
- Agree on shared types/contracts before parallel changes depend on them.
- Avoid multiple contributors editing the same files concurrently; coordinate cross-boundary changes explicitly.
- Integrate through short-lived branches and pull requests; keep `main` buildable and CI green (see [development workflow](../development/workflow.md)).
- Prefer project-owned code and documentation; vendor or copy external code only when licensed, necessary, and reviewed.
