# Integration architecture

The product is cross-layer, but source capabilities should be built and validated independently before composition. This is a logical modularity plan, not a mandate to create microservices. Start in one application/repository unless implementation evidence justifies more infrastructure.

## Capability boundaries

- `market-property/` — CoStar property/market data retrieval, normalization, provenance, and standalone analysis.
- `interior-spatial/` — Matterport tour/scan access, geometry, measurements, spatial observations, and layout projection.
- `aerial-site/` — Vexcel imagery and derived site observations; distinguish visible evidence from inference.
- `business-profile/` — operator requirements, prior business layout/equipment templates, workflows, and preferences.
- `planning/` — proposal generation, scenario comparison, Pareto-style trade-offs, costing inputs, and diligence actions.
- `integration/` — cross-source property matching, spatial alignment, evidence composition, and cross-layer workflows.

These are ownership boundaries and can begin as folders/modules. Do not pull unrelated repositories, frameworks, or services into the project without a concrete need. Keep external SDKs and source adapters behind narrow interfaces so sponsor tooling can be changed without rewriting product logic.

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
- Integrate small, reviewable changes on `main` in this pre-development phase, as the team requested. When concurrent implementation begins, use the team's agreed GitHub workflow and keep `main` buildable.
- Prefer project-owned code and documentation; vendor or copy external code only when licensed, necessary, and reviewed.
