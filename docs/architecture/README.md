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

## Suggested development sequence

1. Verify sponsor APIs, SDKs, sample formats, terms, and actual coverage for the selected property.
2. Build and validate one small standalone workflow per available data layer.
3. Define shared property identity and spatial alignment using real sample records; document mismatches and uncertainty.
4. Implement the business-specific kitchen projection as a focused spatial workflow, validating dimensions against a known floor plan or measured space.
5. Add one cross-layer scenario that yields a measurable business consequence, such as layout feasibility plus a transparent cost range.
6. Expand toward site-to-operations simulation, Pareto-style alternatives, and agentic diligence based on operator feedback.

For the hackathon, folders are organizational boundaries, not a mandate to implement all six areas. Prioritize a coherent, demonstrable slice and preserve the seams needed to add other layers later.
