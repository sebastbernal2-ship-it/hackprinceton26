# Neighbourhood context index: successful businesses nearby, competitors apart

Status: a transparent, hand-specified scoring rule over observed CoStar tenancy records. The thresholds are the team's assumptions; none was fitted. It is a labelled context index with named drivers, not a fit score, not a forecast, not a ranking.

## The idea
The business-side judgement the team described to the judges has three parts, and the index encodes exactly these and nothing else:
1. Generally successful businesses NEARBY are good (they draw people, and they have survived).
2. A direct competitor RIGHT NEXT to the site is bad (it splits the same customers).
3. Direct competitors SOMEWHERE IN THE REGION are good information (they show the concept sells here and give a benchmark), not a penalty.

## Definitions (`forecasting/peers/neighbourhood.py`, `CONFIG`)
- Concept: cafe (default), bakery, restaurant, bar or quick service. Each nearby food business is classified by its name-derived kind against the concept (`kinds.py`): direct competitor (similarity 0.75 or more, "same kind"), partial substitute (0.4 to 0.75), or complement (below). Non-food tenants (retail, health, offices, ...) are general-draw businesses. Kind accuracy is unmeasured.
- Distances are great-circle from the site to the kit building's point; same-building tenants are at distance 0.
- Agglomeration A (0 to 1): successful non-competing businesses within 1 mile. Successful = open at least 2 years, or ended without a closure label after at least 3 years. Each counts with a band weight (within 0.25 mi 1.0, 0.5 mi 0.6, 1 mi 0.3) times a draw factor (industry weight x employees, unknown staffing counts 0.5). Parts: count (log scale, full at 100 weighted units), median tenure of those within 0.5 mi (full at 5 years), and 2-year survival among tenancies that have had 2 years to show it (needs at least 5 of them). Weights 0.5 / 0.25 / 0.25; a part with no data is dropped.
- Competition pressure C (0 to 1): open direct competitors, each with penalty p(d) by distance, piecewise linear: 1.0 up to 150 m ("next to us"), 0.4 at 400 m, 0.1 at 0.5 mi, 0 at 1 mile and beyond. Partial substitutes count half. C = 1 - exp(-sum of penalties). A competitor in the 0.5 to 3 mile region is not penalised.
- Market validation V (0 to 1): direct competitors that are open at least 2 years, weighted by information value (0 at 150 m or less, rising to 1 at 0.5 mi, 1 out to 3 miles, 0 at 4 miles). V = 1 - exp(-weighted count / 2). Validation can only add.
- Index = 50 + 100 x [0.45 (A - 0.5) - 0.30 C + 0.25 V], clipped to 0 to 100. 50 is neutral. Competition is a one-sided penalty and validation a one-sided bonus, so finding no competitor in a sparse kit is not rewarded and finding a distant one is not punished. A component with no data contributes 0 points (unknown is not negative). The index is `null` when the kit holds no tenancy within 1 mile. The drivers list is exactly those terms in points, so they sum to the index minus 50.
- Adjacent-competitor warning: any open direct competitor within 150 m. A separate notice flags 3 or more within 0.5 mi, and thin coverage (fewer than 3 kit buildings within 1 mile).
- Documented optimum band (policy, not an estimate): no open direct competitor within about 400 m, at least one long-surviving direct competitor at 0.5 to 3 miles, successful non-competing businesses within 0.5 mile.

## Sources of the thresholds
Assumptions, stated as such in every API response. The only grounding is the cumulative-attraction idea in retail location theory (compatible businesses close together raise trade; Nelson, "The Selection of Retail Locations", 1958, cited from memory as the concept, not a fitted result) and the intuition that a same-kind competitor at the door splits demand. The 150 m adjacency, the decay knots, the 0.25/0.5/1 mi bands, the 3 mi region, the 2/3 year success thresholds and the weights are team-chosen. The 150 m value is also coarse in practice: kit coordinates are building points, so the flag mostly means "same building or the next building".

## Sensitivity
Every result carries a sensitivity block: the index re-scored with the adjacency at 75 m and 300 m, penalty reaching 0 at 0.5 mi or 1.5 mi, double weight on competition or on agglomeration, no validation weight, and a 3-year success threshold. Across the 67 sites with an index the median spread between the lowest and highest variant is about 28 points (on a scale where the sites themselves run from 27 to 87), and the adjacency warning is unchanged under all variants for 63 of them. In other words, a large part of the index is a modelling choice; read it as a band, not a point.

## What the data says about the rule (descriptive, sparse)
On the kit itself, food tenancies that opened with an open same-kind peer within 150 m (same building included) closed within 2 years 4.1% of the time (3 of 74; 95% interval 1% to 11%), against 5.9% (14 of 237; 4% to 10%) without one; ended within 2 years 17.6% vs 18.1%. The data neither support nor contradict a penalty for adjacency: the samples are tiny, building types differ, and no threshold was chosen from this. The adjacency rule is a design assumption.

## Results on the candidates
For the 65 restaurant candidates and 3 cafe scans (run `tools/run_business_models.py`): of 67 sites with kit data within 1 mile, the index runs from 27 to 87 (median 69, quartiles 57 and 79), and the spread is wide because the kit is dense around some sites and nearly empty around others; the index measures kit-visible surroundings, so a low value can mean "few kit buildings", which the thin-coverage notice reports. Four candidates (814216, 9670795, 861863, 760385) carry the adjacent-competitor warning. The Bayou Café demo site gets the index from the real tenants within 1 mile of its observed coordinates plus the nine invented competitors of the demo fixture, all tagged DEMO; no warning there.

## Limits
- Kit-listed buildings only (3,339, mostly apartment complexes): every count is a lower bound; a missing competitor is unknown, not absent. Houston and Los Angeles only.
- No foot traffic, rent, visibility, parking, sales or demographics; residents are covered separately by the presence model (`docs/models/lineage.md`).
- Name-derived kinds; building-point coordinates; closure labels are CoStar research labels.
- Thresholds are assumptions with the sensitivity shown above.

## What it must not be used for
Not as a fit score, a go/no-go, a ranking of candidates, or evidence of expected sales or survival. Do not present index differences of a few points as meaningful (the sensitivity spread is about 28 points).

## How to describe this accurately
"A rule-based context index from CoStar tenancy records: it rewards successful businesses nearby, penalises an open direct competitor right next door, and treats competitors elsewhere in the region as market validation rather than a penalty. The thresholds are our assumptions, shown with a sensitivity range, and the data are too sparse to test them." Do not say it was learned from data, validated, or that it predicts performance. The earlier statement that the team "used kNN on the business side" refers to the separate peer model (`docs/models/business-knn.md`), which is a context tool whose held-out accuracy was not better than a market average for closures.

## API and UI
`GET /api/property/{listingId}/business-peers[?concept=...]` returns the index, drivers, bands, warnings, sensitivity, config and nearby food businesses (anonymised) alongside the kNN block. UI: "Nearby businesses: peers and competition" in the Business & financial tab, with a ring diagram (rings at 0.25/0.5/1 mi, a 3 mi region ring, the too-close zone shaded).
