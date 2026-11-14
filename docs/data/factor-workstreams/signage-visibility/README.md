# Signage and visibility

**Decision question:** Can customers plausibly see and identify the storefront, and what signage rights/constraints apply?

**Candidate sources:** CoStar `propertyRetail.frontage` line segments/footage (available in local commercial-property records); Vexcel oblique/ortho imagery (blocked pending teammate access); city sign ordinances and permit records (Houston Code of Ordinances/permits; LADBS zoning/sign permits); authorized site photos or operator/broker verification.

**Preliminary:** Frontage fields are present for some retail properties; no completeness summary or candidate-facing sign analysis yet. No verified signage rights or obstruction/visibility observations.

**Prep:** extract frontage length/primary flag and missingness; distinguish recorded frontage from sightline; when Vexcel access arrives, test a small approved set of dated oblique views with human-verified sign/occlusion labels. Research local sign permits/rules only for chosen addresses.

**Do not claim:** legal sign rights, visibility from a road, or customer recognition from frontage alone or object detection.

## Verified build (2026-11-14)

Adapter: [`data/factors/signage_visibility/adapter.py`](../../../../data/factors/signage_visibility/adapter.py); rules with citations: [`rules.json`](../../../../data/factors/signage_visibility/rules.json); tests: `data/tests/factors/signage_visibility/` (11 pass, synthetic fixtures, no network).

`fetch(site)` reads the site's `propertyRetail.frontage` from the local CoStar kit and checks (timeouts, retries, 7-day cache in gitignored `data/derived/signage_visibility/cache`) that the cited ordinance sources are reachable. `observations(site, raw)` returns factor-card dicts: recorded frontage (observed), LA combined sign-area ceiling and projecting-sign eligibility (derived from frontage), and unknowns for Houston sign allowance, overlays, and sightline.

### Coverage over the 65 candidate sites (41 Houston, 24 LA), run 2026-11-14
- Frontage length usable for rules: 42 of 65 (Houston 27, LA 15). 55 sites have frontage records; 13 of those or empty ones stay unknown because the segments are ambiguous (several unflagged segments, none primary) or have no length. 10 sites have no frontage entries.
- LA derived rows: 15 sites got a combined sign-area ceiling and projecting eligibility; 9 unknown.
- Houston: 0 derived rows by design. Houston limits depend on right-of-way category and wall area, which are not in the data.
- Overlay and sightline: unknown for all 65 (no lookup performed, no imagery).
- CoStar records carry no per-record as-of date; asOf is "unknown".

### Sources and terms
- Houston Sign Code, Chapter 46 (current through Ord. 2020-669, eff. 2020-07-29), City Legal Department compilation on houstonpermittingcenter.org: fetched and read directly (HTTP 200). No licence text found; public city document. The official Municode host and 311.houstontx.gov draft PDFs returned 403/404 to automated clients and were not used.
- Houston Sign Administration FAQ (Oct 2025) and Informational Letter 0021-2025: read (HTTP 200).
- LAMC 14.4 (Article 4.4): the official American Legal Publishing host returned HTTP 403 to automated requests. Text was read from the third-party gocodebook mirror (HTTP 200), edition unknown. Treat LA rule values as unverified against the official code until re-read there. Mirror terms of use not reviewed.
- CoStar frontage fields are licensed sponsor data; kept local and ungitted. Only aggregate counts appear here.

### Limitations
- Houston Table 4611 column order was scrambled by PDF text extraction; values were matched to the category definitions and flagged `column order inferred` in rules.json.
- Hollywood Signage SUD, LA HPOZ and specific plans: existence noted only, text not read. Houston scenic/historical ROW list not queried.
- Recorded frontage is not the legal "street frontage" used by LAMC; the derived LA ceiling is a rule applied to a recorded number, not a permit result. Frontage still does not show visibility, obstruction or customer recognition.
