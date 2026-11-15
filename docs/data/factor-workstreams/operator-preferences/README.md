# Operator requirements and preference learning

**Decision question:** What does this operator actually need and how should the system compare trade-offs for them?

**Known:** User specified an independent cafe. Working cities Houston/Los Angeles.

**Unknown:** coffee and food menu; bought finished versus prepared or baked on site; service style, seats, hours, takeout mix, target suite size, budget, parking/delivery needs, preferred neighborhood, non-negotiables, acceptable renovation/time/cost risk.

## Operator intake (not yet answered)

Use this concise intake before applying fit filters or comparison weights. Record the answer, respondent, date, and whether it is a hard constraint or preference. `Unknown / not sure` is valid for every item; do not infer or silently convert preferences into exclusions.

| Topic | Ask | Classification |
|---|---|---|
| Menu and preparation | Which drinks and foods? Buy finished goods or prepare/bake on site? | Operational requirement |
| Equipment | Which coffee, refrigeration, food prep, dishwashing, or cooking equipment is required? | Operational requirement |
| Service | Counter, table service, takeout/delivery mix? | Preference / operations |
| Capacity | Seats and target suite size, if known? | Hard constraint only if stated |
| Hours | Planned operating days and hours? | Operational requirement |
| Budget | Rent/build-out budget and acceptable range? | Hard constraint only if stated |
| Access | Parking, transit, delivery/loading needs? | Constraint or preference, specify |
| Geography | Neighborhoods/trade areas to include or exclude? | Constraint or preference, specify |
| Non-negotiables | Which conditions must be met? | Hard constraints |
| Tradeoffs | Acceptable cost, renovation, and opening-time uncertainty? | Preference / diligence |

Capture each response as `observed`, `derived`, `estimated`, or `unknown`; unknown values are null, never zero. Save a versioned profile and show sensitivity before any candidate ordering. Ask permission before using layouts, costs, or history as learning data.

**Do not infer:** preferences or willingness to accept risk from demographic or protected characteristics. Never silently convert a preference into an exclusion.
