# Location intelligence factor workstreams

This is the factor backlog for the **pre-inspection shortlist**: gather relevant non-Vexcel evidence, compare candidate locations, and expose uncertainty before an owner opens a Matterport/XR inspection. Each factor is separated into its own folder with scope, candidate sources, preliminary status, limitations, and next prep task. Machine-readable inventory and owners/status live in [`data/registry/factors.csv`](../../../data/registry/factors.csv).

## How to use the backlog

- Begin with a user/operator goal and decision. Data availability alone does not make a factor useful.
- Keep each layer independent and provenance-preserving: source, geography, time window, license/use, method, coverage, and unknowns.
- Separate observations, derived indices, and predictions. Raw crime incidents are not crime rates; school boundaries are not school quality; mapped hazard is not business outcome.
- Compare candidates with user-adjustable preferences, visible per-factor components, coverage, and sensitivity. Keep safety and protected-class proxies out of recommendations absent reviewed legitimate methodology.
- ML is a method option per target, not a blanket yes/no: define target/horizon/labels, leakage risks, representative data, validation, uncertainty, and monitoring.
- Raw/restricted data stays in ignored local or approved storage. Never commit sponsor payloads, secrets, or incident-level records.

## Workstreams

- [Property, market, listings, and competition](property-market/README.md)
- [Schools and education](schools-education/README.md)
- [Traffic, access, and parking](traffic-access/README.md)
- [Crime and safety context](crime-safety/README.md)
- [Income, demographics, and trade area](income-demographics/README.md)
- [Signage and visibility](signage-visibility/README.md)
- [Climate and recurring weather](climate-weather/README.md)
- [Natural hazards and resilience](natural-hazards/README.md)
- [Mobility, tourism, and temporal activity](mobility-tourism/README.md)
- [Interior spatial evidence](spatial-interior/README.md)
- [Aerial/site imagery](aerial-site/README.md)
- [Use, zoning, infrastructure, permits, accessibility](infrastructure-permits/README.md)
- [Build-out cost, occupancy, and time-to-open](costs-timeline/README.md)
- [Labor, supplier, logistics context](labor-supply/README.md)
- [Operator preferences and preference learning](operator-preferences/README.md)

“Preliminary” means a bounded source/data availability check and an explicit next step—not a validated factor, model, or recommendation. See the [phase plan](phase-plan.md) for parallel work packets, shared contracts, sequencing, and acceptance criteria.
