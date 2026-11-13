# Hackathon MVP and demo plan

## Scope

Build a reliable, end-to-end demonstration for one independent food-business owner evaluating a small set of scanned commercial spaces. Prioritize scanned restaurant-suitable properties in Houston or Los Angeles only after confirming actual data coverage and access. Do not imply a comprehensive listing catalog. Do not ask the owner to predict target revenue.

## Target flow

1. **Intake:** “What are you looking for?” Gather concept, city, budget, seats/capacity, and must-haves.
2. **Shortlist:** return a small explainable set of matching sites, showing evidence and missing information rather than an opaque score alone.
3. **Inspect:** for one candidate, show available property/market context, Matterport interior, and Vexcel aerial context. Make each source identifiable.
4. **Project:** visualize the business-specific kitchen/equipment arrangement in the candidate-space dimensions; show fit, circulation conflicts, and a before/after plan or view.
5. **Quantify:** provide itemized low/high build-out costs based on explicit plan quantities, price sources, assumptions, contingency, and unknowns.
6. **Act:** produce a short verification checklist and possible landlord questions/negotiation asks.
7. **Re-plan:** show one meaningful finding change a site ranking or proposed plan—for example, a plausible upgrade range pushes the project beyond the owner's stated budget.

## Core demo proof

The demo should prove that the system can:

- use at least two sponsor data layers substantively, not decoratively;
- connect evidence to a business-specific spatial proposal;
- explain the cost and operational consequences of that proposal;
- visibly revise a recommendation when evidence or an assumption changes;
- provide a useful next action to the owner.

Prepare site research and source data ahead of time where possible. Keep live work bounded and provide a prepared fallback so a short judging demo never waits on an unbounded API or agent run.

## Out of initial scope / stretch

Treat three-year sales/profit forecasts, restaurant survival predictions, neighborhood trajectory ratings, restaurant-graveyard claims, patio permit eligibility, comprehensive crime/demographic aggregation, and broad new phone scanning as stretch goals. Add only when inputs, data rights, methodology, and accuracy are validated. A scan or image cannot prove that equipment is absent, infrastructure is functional, a site is code-compliant, or hidden defects exist.

Dead-rent/time-to-open scenarios may be useful, but require explicit lease-start and timeline assumptions with ranges. An occupancy percentage benchmark is not a break-even calculation. If an operating model is shown, expose assumptions for sales, food/labor/other expenses, average check, open days, capacity, and turns; label results scenario analysis, not predicted performance.

## Validation and completion criteria

Before building around a source, verify sponsor APIs/SDKs, terms, fields, sample formats, actual site coverage, rate limits, and cross-source property matching. Validate Matterport room dimensions/vectors and defurnishing access; CoStar availability/rent/prior-tenant fields; and Vexcel imagery capabilities for the target properties.

Interview a real local food-business owner. Confirm what they actually investigate before a lease, which surprises or negotiations matter, and whether the proposed spatial/cost/action flow would change a decision. Capture the Forward Deployed track's required business/person/role and supporting evidence with permission.

A successful prototype is not maximum feature count: it is a fast and dependable short flow from requirements to a multi-source site view, spatial projection, transparent cost range, and actionable next step—with limitations plainly shown.
