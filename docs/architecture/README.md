# Project structure and integration approach

The product vision is cross-layer; the initial implementation should keep source domains independently understandable and testable. This structure is a starting proposal, not a commitment to a particular framework or API implementation.

## Capability areas

- `market-property/` — CoStar property and market data ingestion, normalization, provenance, and standalone analysis.
- `interior-spatial/` — Matterport tours/scans, geometry and measurements, spatial fit/projection, and standalone validation.
- `aerial-site/` — Vexcel imagery and derived site observations, with observed facts separated from model inferences.
- `business-profile/` — operator requirements, business-specific equipment/layout templates, workflows, and user preferences.
- `planning/` — scenario comparison, Pareto-style trade-off analysis, cost-and-impact feedback, and diligence outputs.
- `integration/` — shared property identity, spatial alignment, cross-layer evidence references, and composed workflows.

These names describe logical ownership boundaries. They may initially live in one application/repository; do not create unnecessary services or infrastructure before the prototype needs them.

## Integration contract

Each source capability should expose a standalone result with:

- stable property/site reference where available, plus matching confidence;
- source, timestamp, geographic/spatial scope, and access/provenance metadata;
- measurements or claims with units and an explicit observed / derived / estimated / unknown status;
- confidence, limitations, and links to supporting evidence;
- a clear representation of missing, stale, or conflicting data.

The integration layer composes these results; it must not erase source distinctions. Cross-layer conclusions should cite the contributing inputs and explain the inference. Never imply that aerial imagery or a virtual scan proves hidden structural, environmental, or regulatory conditions.

## Demo-oriented agent architecture

A possible interaction pattern has two roles, which may be implemented as modules rather than separate autonomous agents:

- **Source-specific research workers:** independently retrieve/normalize CoStar, Matterport, Vexcel, or relevant public-data evidence and return structured, provenance-bearing results. Keep each worker scoped to a data layer; do not make every per-property worker an opaque all-sources pipeline.
- **Planner:** receives the operator's structured requirements and composed evidence; proposes a bounded layout/scenario and returns a typed plan (geometry/quantities, furniture/equipment, assumptions, unresolved constraints).
- **User-facing guide:** gathers preferences, explains the selected property and proposed plan, and presents evidence and trade-offs in the interface.

Cost estimation should be a separate deterministic calculation over planner outputs and a transparent price/quantity catalog—not free-form LLM-generated arithmetic. A benchmark such as occupancy cost as a share of sales is not break-even analysis. Any operating model needs explicit revenue and expense assumptions and must be presented as a scenario, not a forecast. Use conventional geometry and data processing wherever possible; use language models for interpreting user intent, planning bounded actions, and explaining results.

If parallel research workers are used, give each a narrowly scoped data task and structured output. Run them with timeouts and caching; surface partial results and fall back to prepared data so the demo remains responsive. A short judged demo cannot depend on an unbounded live research chain. Cache candidate-site evidence ahead of time and reserve live execution for one visible, bounded re-plan.

## Suggested development sequence

1. Verify sponsor APIs, SDKs, sample formats, terms, and actual coverage for the selected property.
2. Build and validate one small standalone workflow per available data layer.
3. Define shared property identity and spatial alignment using real sample records; document mismatches and uncertainty.
4. Implement the business-specific kitchen projection as a focused spatial workflow, validating dimensions against a known floor plan or measured space.
5. Add one cross-layer scenario that yields a measurable business consequence, such as layout feasibility plus a transparent cost range.
6. Expand toward site-to-operations simulation, Pareto-style alternatives, and agentic diligence based on operator feedback.

For the hackathon, folders are organizational boundaries, not a mandate to implement all six areas. Prioritize a coherent, demonstrable slice and preserve the seams needed to add other layers later.
