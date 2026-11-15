# CoStar toolkit expansion (investigated 2026-11-14)

## Finding: nothing beyond the local kit is reachable

Verified by reading and running, not from docs:

- `schemas/openapi.yaml` in the kit has `paths: {}`: it defines record shapes only. No server URL, endpoint, MCP
  server definition, SDK or auth scheme for CoStar appears in the kit, `docs/`, `README.md` or CI secret names. The kit
  index says only that Matterport connection details come in a separate zip.
- Key names configured for this project (names only): `MATTERPORT_API_KEY`, `MATTERPORT_API_TOKEN`,
  `MATTERPORT_SDK_KEY`, `VEXCEL_API_KEY`. There is no CoStar key, so no CoStar call was possible and none was made.
  Calling guessed hosts would be probing without sponsor guidance, so none was tried.
- Therefore: no extra per-property fields, no tenants/comps/listing history beyond the kit, no market statistics, and
  no rent/vacancy/absorption/sales series by submarket are available from a service. Submarket names are not even in
  the kit (ids only). Ask the CoStar sponsor for the toolkit/MCP/OpenAPI endpoint and key name. `RemoteClient` in
  `data/costar/client.py` activates when `COSTAR_API_BASE_URL` and `COSTAR_API_KEY` are set, but its auth header and
  paths are UNVERIFIED guesses.
- Rate limits and terms: none documented anywhere for CoStar. Vexcel/Matterport status is in `source-research.md`.

## What was built instead (all from the local kit, read-only)

`data/costar/client.py` (`KitClient`) joins everything the kit holds per PropertyId: property, tenancies with lease
deals, tenant company, sale comps, commercial listings, apartment asking rents. Routes in
`services/api/app/costar_routes.py`:

- `GET /api/costar/{listingId}/extended` (`listingId` is the PropertyId, same as the app's match `listingId`). Returns
  tenancies (tenant `null` = unknown tenant, not vacant), sale comps (portfolio prices flagged, never shown as this
  property's price), listings, apartment rents and `fill` flags. Contract rent is converted to $/SF/yr only when
  `rateAmountType` is per-SF and `rateBasis` is stated; otherwise unknown.
- `GET /api/costar/market?metro=houston|los-angeles`: kit-sample aggregates, status `derived`.

Fill rates for the 65 candidates (all 65 are in the kit): tenancies 62, sale comps 50, listings 45, named tenant 61,
a stated contract rate 23, apartment record 0, area 65. Kit-wide (3,339 properties): tenancies 2,921, sale comps
2,434, commercial listings 629, apartment listing 1,747 of 2,765 communities.

Market aggregates (kit sample, mixed property types, over 80% multifamily; NOT market rent): Houston 1,758 properties,
197 submarkets, 3,363 distinct sale comps, 1,249 stated contract rates (median $17/SF/yr), 654 apartment minimum asking
rents (median $948). Los Angeles 1,581 properties, 114 submarkets, 2,767 sale comps, 753 contract rates (median $33),
519 asking rents (median $1,850).

## Series for forecasting (derived, kit sample; report only)

Run from the repo root: `PYTHONPATH=. python -m data.costar.series_fetch`. It writes
`data/derived/costar/kit_quarterly_series.csv` (gitignored; columns metro, quarter, series, n, value, unit, status).
Per metro and quarter: `lease_commencements` (count), `leased_sqft`, `contract_rate_median` ($/SF/yr), `sale_comps`
(a portfolio sale counts once), `sale_price_median` (single-property sales with a price only). Houston spans 1966 to
2027 for leases and 1999 to 2026 for sales; Los Angeles 1961 to 2029 and 1983 to 2026 (future quarters are scheduled
commencements). Sparse quarters are absent, not zero. `n` is the observation count, and many quarters have n of 1 to
3, so use only quarters with adequate `n`. These are activity counts of a biased sample (buildings on the Matterport
list), not vacancy, absorption or market rent, and must not be labelled as such. Suggested wiring (not done;
`forecasting/**` is not owned here): register `lease_commencements` and `sale_comps` as count-series candidates keyed
by metro, filtered to `n >= 5`, status `derived`.
