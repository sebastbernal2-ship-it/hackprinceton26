# Model card: Foreground fair-rent model

Version 1.0, trained 2026-11-13 on the CoStar hackathon kit (data date 2026-11-09).

## What it does

For a retail or restaurant-suitable space, it estimates the asking rent the market would put on it, in dollars
per square foot per year on an NNN basis, with an 80% range. The app can then say: "Asking $45/SF vs a fair
$20 to $41/SF" and size the rent ask in dollars per year.

Example (2600 Travis St, Houston, 2,946 SF): asking $45, model says about $30 (80% range $20 to $41), so the
ask is above the model's range: a gap of about $15/SF, or $43,000 a year.

## The short honest version

- It is useful but rough. On buildings it had never seen, a typical estimate is off by 20% (median), and
  by $8.27/SF on average. Always quote the range, never the point alone.
- It beats the simple alternatives clearly: a median of the same submarket is off by $10.42/SF on average
  (26% median), and a median of the 8 nearest comparable spaces by $11.30/SF. The model explains about half of
  the spread in rents (R-squared 0.50); the submarket median explains a quarter.
- The 80% range is honest about being wide: roughly plus or minus 40% around the estimate. It caught the true
  rent 83% of the time in cross-validation and 87% in the forward-in-time check. At that width it will call an
  ask "above" or "below" market only when the ask is far out, so most asks will read "in line".
- Location carries most of the signal (submarket, then latitude and longitude). Space size, floor, restaurant
  keywords in the listing notes and building vacancy add very little once location, building and era are known.
- This is asking rent, not what leases settle at. No concessions, free rent or build-out allowance are in the data.

## Data

- Source: `commercial-listing-summary` (active for-lease spaces), `location-occupancy` (lease deals) and
  `commercial-property` from the kit. Houston and Los Angeles.
- Rows: one lease space with a usable rate. 1,877 listing spaces plus 14,779 lease deals = 16,656 rows on 500
  buildings, dated 1989 to 2026 (most 2019 on).
  - Lease deals: contract rent (`rateActual`) on 1,742 rows; otherwise the deal's quoted asking rate (13,037).
    A feature records which one a row is, and the model always predicts as a listing ask.
- Retail-use rows (the target): 1,196 rows on 298 buildings (843 Los Angeles, 353 Houston; 216 listings,
  980 lease deals). Retail-use means space use Retail or OfficeRetail, or unknown use inside a GeneralRetail
  building. Restaurant suitability is only observable from listing-note keywords, so it is a feature, not a filter.
- Office spaces (15,460 rows) are also in the training data with a retail/office flag and a reduced weight (0.3).
  The configuration search found that they help a little (log-error 0.345 with office rows at weight 0.3 against
  0.353 retail-only; full weight was worse, 0.352). Flex and industrial are left out.
- Dropped: spaces with no rate (rate 0 means "call for rate": 1,089 listing spaces), off-market spaces,
  executive suites, coworking listings, spaces with no square footage, rents not per SF, and 1,021 rows whose
  service type is unknown, negotiable or to be determined (they cannot be put on the NNN basis).
- Normalisation: $/SF/yr = rate x 12 when the space's own rate basis is monthly, else the rate; mid-point of low
  and high when both are given.
- Outliers: after the NNN conversion, rows outside $3 to $250/SF/yr, then rows whose log rent is more than
  3.5 robust sigmas (1.4826 x MAD) from the median of their market and use group. 81 rows removed.

## NNN-equivalent adjustment

A gross rent (full service, modified gross and similar) includes taxes, insurance and running costs that an NNN
rent leaves to the tenant. To compare like with like, gross rents are converted to NNN.

- The gap is estimated from the data: a regression of log rent on gross-versus-NNN, controlling for submarket
  (fixed effects), use, log SF, property type, floor and date, on 16,737 rows.
- Result: a gross-quoted rent is 15.6% above the NNN rent for the same kind of space (95% interval 14.2% to
  17.0%). NNN-equivalent = gross rent x 0.865. Office alone gives 20.5%.
- Service groups: NNN = triple net, double net, net. Gross = full service, modified gross, industrial gross, plus
  electric, plus utilities, plus cleaning, full service gross-no-pass.
- Warning: for retail alone the data say the opposite: gross-quoted retail spaces are about 20% cheaper than
  NNN-quoted ones (ratio 0.80, interval 0.76 to 0.85), and the same sign holds inside buildings that have both
  (0.84). That is a mix effect (gross is quoted on small, low-end or office-like ground-floor retail), not a real
  service-type effect, so it is not applied. The model also gets the service group as a feature, so it learns
  what gross-quoted retail looks like; predictions are always made for NNN. Only 1 of the 12 demo sites (5757 W
  Century Blvd, quoted FSG) is affected, and its verdict is flagged unreliable (`basisUncertain`).

## Features

Market, submarket (target-encoded with cross-fitting), property type and subtype, building SF, year built and
age at the time of the rent, stories, space SF and share of the building, ground versus upper floor and floor
number, relet / new / sublet, date (era), latitude and longitude, restaurant keywords in the space notes,
building vacancy proxies (other available SF and spaces in the building, current tenants and occupied share),
and rent-basis fields (office or retail use, source, service group).

Neighbour features: the median rent of the 8 nearest retail comps (and the nearest within half to double the
size), the average distance to them, the count within 1 km, and the median rent of the 8 nearest office
buildings. These are computed from training rows only, and a row's own building is never used for itself. Inside
cross-validation they are built from that fold's training rows, so nothing leaks from the test fold.

Not available: photos, frontage, visibility, co-tenancy, foot traffic, build-out condition, concessions.

## Training and evaluation

- Model: scikit-learn `HistGradientBoostingRegressor` on log rent (depth 6, 300 trees, learning rate 0.05,
  minimum 20 per leaf), chosen from five settings by cross-validated log error (a small selection bias in the
  headline numbers; the time check below uses the same settings).
- Check 1, 5-fold cross-validation grouped by building (no building is in both training and test), scored on the
  1,196 retail rows:

| | MAE $/SF | MAPE | Median APE | R-squared |
|---|---|---|---|---|
| **Model** | **8.27** | **27.5%** | **20.0%** | **0.50** |
| Submarket median | 10.42 | 35.6% | 25.9% | 0.25 |
| kNN comps median (k=8) | 11.30 | 39.0% | 25.9% | 0.14 |
| Market median | 11.67 | 41.4% | 29.4% | 0.17 |

  95% intervals (resampling buildings): MAE $7.4 to $9.2; median APE 17% to 22%; R-squared 0.40 to 0.58. The
  model's MAE is $1.2 to $3.0 below the submarket median's.
  Houston: MAE $5.11 (submarket median $6.57). Los Angeles: $9.59 (submarket median $12.03).
  On NNN-quoted retail rows only (no conversion needed): $8.78 against $10.43.
  On the 216 listing spaces only (the closest match to the use case): MAE $6.74, median APE 17%, R-squared 0.66,
  against $8.74 for the submarket median.
- Check 2, time: train on everything dated before 2024, test on the 260 retail rows from 2024 on.

| | MAE $/SF | MAPE | Median APE | R-squared |
|---|---|---|---|---|
| **Model** | **7.25** | **23.2%** | **14.8%** | **0.48** |
| Submarket median | 10.03 | 33.2% | 21.4% | 0.24 |
| kNN comps median | 11.51 | 39.5% | 25.3% | 0.19 |
| Market median | 12.16 | 41.4% | 30.7% | 0.13 |

- The estimate is slightly low on average in cross-validation (bias about -$1.2/SF), mostly in Los Angeles.

## Intervals

80% prediction interval by split-conformal calibration: out-of-fold errors on the log scale give the 10th and
90th percentile, one pair per market. Estimate x e^(low) to estimate x e^(high); in Houston about -34% to +34%,
in Los Angeles about -37% to +53%.

Calibration is nested: inside every cross-validation training set the offsets are calibrated on that set's own
out-of-fold errors, so the coverage below was measured on buildings that took no part in it.

| Test | Coverage (target 80%) | Typical width (range / estimate) |
|---|---|---|
| Grouped cross-validation, 1,196 retail rows | 82.7% (Houston 81.9%, LA 83.0%) | 98% |
| Time check, 260 rows from 2024 | 87.3% | 107% |

Quantile gradient boosting (10th and 90th percentile models) was tried as an alternative and covered only 58%
(63% in the time check): far too narrow, not shipped.

## What drives it

Permutation importance on held-out folds (increase in log-rent RMSE when a group is shuffled; higher = matters
more):

| Group | Increase |
|---|---|
| Location (lat/lng, market, submarket) | 0.138 |
| Building (type, size, age, stories) | 0.039 |
| Nearby comps (kNN rents) | 0.033 |
| Rent basis (use, source, service type) | 0.022 |
| Era | 0.020 |
| Space size | 0.007 |
| Building vacancy proxies | 0.004 |
| Space attributes (floor, new/relet/sublet, restaurant words) | 0.002 |

Single features: submarket 0.092, service group 0.025, building age 0.022, date 0.021. The kNN comps matter less
than the model's own location terms because both encode where the space is.

## The 12 demo sites

The featured space's own building is left out of both the training rows and the comps pool for its prediction.
The estimate is for a lease made at the data date (November 2026). Asking is on the NNN basis ("NNN-equiv").

| Site | Address | SF | Asking | Fair (80% range) | Gap $/SF | Gap $/yr | Band |
|---|---|---|---|---|---|---|---|
| 1018657 | 2600 Travis St, Houston | 2,946 | $45.00 | $30.3 ($20.0 to $40.5) | +14.7 | +43,300 | above market |
| 862130 | 13331 Kuykendahl Rd, Houston | 1,625 | $18.00 | $12.6 ($8.3 to $16.8) | +5.4 | +8,800 | above market |
| 431465 | 6922 Hollywood Blvd, LA | 3,185 | $51.00 | $39.6 ($25.1 to $60.5) | +11.4 | +36,400 | in line |
| 4205077 | 1870-1890 S Western Ave, LA | 1,500 | $30.60 | $27.3 ($17.3 to $41.6) | +3.4 | +5,000 | in line |
| 6038733 | 3150 Wilshire Blvd, LA | 1,879 | $48.00 | $46.6 ($29.6 to $71.2) | +1.4 | +2,600 | in line |
| 5697296 | 14800 Westheimer Rd, Houston | 2,894 | $20.22 | $20.1 ($13.3 to $26.8) | +0.1 | +400 | in line |
| 680379 | 2323 Clear Lake City Blvd, Houston | 1,750 | $24.00 | $24.4 ($16.1 to $32.6) | -0.4 | -600 | in line |
| 838391 | 14829 Bellaire Blvd, Houston | 3,700 | $18.00 | $19.6 ($13.0 to $26.2) | -1.6 | -5,900 | in line |
| 6819921 | 655 S Hope St, LA | 4,265 | $36.00 | $38.5 ($24.4 to $58.8) | -2.5 | -10,600 | in line |
| 800827 | 15015 Westheimer Rd, Houston | 1,569 | $13.66 | $20.2 ($13.4 to $27.1) | -6.6 | -10,300 | in line |
| 20219730 | 630 W 6th St, LA | 3,174 | $30.00 | $49.1 ($31.2 to $75.1) | -19.1 | -60,700 | below market |
| 256760 | 5757 W Century Blvd, LA | 1,200 | $17.40 FSG ($15.05 NNN-equiv) | $33.7 ($21.4 to $51.5) | -18.7 | -22,400 | below market, unreliable |

Each site also lists 5 comparable spaces from other buildings (retail use, dated 2019 or later, between 0.4x and
2.5x the size, nearest first, one per building) with address, SF, rent as quoted, NNN-equivalent rent and
distance, plus the submarket median and kNN comps median for reference.

Reading them:
- Only two asks fall outside their 80% range. Both are Houston, and both are well above the comps nearby.
- Treat the "below market" cases with care. The Century Blvd ask is gross-quoted; see the NNN warning above.
  630 W 6th St is a ground-floor retail space in an apartment building whose asking rent ($30) is far under the
  model's estimate, but the estimate itself is wide.
- Rounded display: "$20 to $41" for the 2600 Travis range.

## Limits

1. Asking, not achieved, rent. No concessions, free rent or tenant-improvement allowances.
2. Mostly lease-deal records. 89% of rows are lease deals, mostly with the quoted asking rate, dated at signing.
   Older rows describe an older market; the model has a date feature, but 2026 is the edge of its data.
3. Retail is a minority (7%) of the training rows and of the label supply: 298 buildings. Los Angeles retail has
   more rows but larger errors.
4. Wide intervals. About plus or minus 40%; a small gap is not evidence of anything.
5. The gross-to-NNN factor is estimated mainly from office rents; for retail the data conflict (see above).
6. The kit is 3,339 properties; neighbours are only kit properties.
7. Twelve demo sites cannot validate a model; the validation is the cross-validation and time check above.
8. No restaurant-specific rent information: a restaurant-ready second-generation space gets no premium unless
   its location and building say so.

## Intended use

A rough, explained range shown beside a listing's ask, to size a rent negotiation. Not an appraisal, not for
lending or underwriting, not a forecast of the lease that will be signed.

## Reproduce

```
python -X utf8 scripts/ml/build_rent_dataset.py "<kit dir>"   # data/ml/rent-dataset.csv, rent-site-rows.csv, rent-dataset-meta.json
python -X utf8 scripts/ml/train_rent.py                       # data/ml/rent-model.json, rent-sites.json  (about 5 minutes)
```

TypeScript access: `lib/ml/rent.ts` (`rentFor(siteId)`, `getRentModel()`, `rentModelSkill()`, formatting helpers).
Tests: `tests/ml/rent.test.ts`.
