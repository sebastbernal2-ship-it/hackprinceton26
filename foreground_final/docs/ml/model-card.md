# Model card: Foreground restaurant survival model

Version 1.0, trained 2026-11-13 on the CoStar hackathon kit (data date 2026-11-09).

## What it does

For a food tenant moving into a given space, it estimates the chance that the tenant is still in that space
3 years later, and names the three facts that moved the estimate most, in percentage points.

Example: "2600 Travis St, Suite 104: 90%. Space of 2,946 SF, 8% of the building: +9 pts."

## The short honest version

- The signal is weak. On tenancies it had never seen (move-ins 2019 to 2023), the model ranks a survivor above
  a non-survivor 63.5% of the time (ROC-AUC 0.635, 95% interval 0.57 to 0.70). A coin flip is 50%.
- It is slightly better than always quoting the base rate (Brier score 0.211 against 0.222), and slightly
  better than a logistic regression (0.219).
- It is overconfident at the top: tenancies it scored above 80% survived 74% of the time on the test set.
- Nearly all of its skill comes from two things: the size of the space, and how busy and how long-recorded
  the building is. Suite history, nearby food density, chain versus independent, and submarket added nothing
  measurable on the test set.
- Use it as a small, explained nudge on the base rate (about two in three food tenants last 3 years in this
  data). Do not use it as a forecast for a particular business.

## Data

- Source: `location-occupancy`, `company-detail` and `commercial-property` from the kit. Houston and Los Angeles.
- Unit: one food tenancy. Renewals and suite moves by the same tenant in the same property are merged into one
  (gap of 120 days or less). Tenancies of a day or two are dropped as data artifacts (54).
- Food tenants: the kit has no SIC or NAICS code. A tenant counts as food when its company profile has industry
  code 17 (Accommodation and Food Services, hotels removed) or its name matches strong food words (restaurant,
  cafe, pizza, chain names). Weak words alone (bar, market, tea) do not count. The match basis is stored on
  every row of `data/ml/survival-dataset.csv`.
- Size: 895 tenancies on 333 properties (474 Houston, 421 Los Angeles), move-ins from 1992 to October 2023.
- Move-in date: `moveInDate` when present (412 rows), otherwise `fromDate` (483 rows).

## Label

`survived3y = 1` when the tenant was still in place 3 years after move-in (610 rows, 68%), otherwise 0
(285 rows, 32%).

Right-censoring: a tenancy that began after 2023-11-09 has not had its 3 years yet. All 160 of these are left
out, both the 144 still open and the 16 already closed. Keeping only the closed ones would have taught the model
that recent tenancies always fail.

A move-out date in the future (a scheduled move-out) counts as still open.

"Left" is not always "failed". Of the 285 early exits, 52 are recorded as closed or bankrupt, 203 as moved out
with no new address (the usual record for a restaurant that vanished), and 14 as moved to another property.

## Features (all known at move-in)

| Group | Features |
|---|---|
| Space | SF occupied, share of the building, position (inline, end cap, corner) |
| Building | property type and subtype, building SF, age at move-in, years since renovation, stories, parking ratio |
| Location | market, submarket (target-encoded with cross-fitting) |
| This suite | suite known, earlier food tenants that left the suite (ever, last 5 years), any tenant that left in 5 years, how long the previous tenant lasted, how long the suite sat empty, previous tenant was food |
| This property | earlier food tenants, earlier food closures (ever, last 5 years, inside 3 years), food tenants open at move-in |
| Building roster | tenants in place at move-in, move-outs in the previous 3 years, years of tenant records before move-in |
| Within 500 m | food tenants open, food closures in 3 years, tenants in place, number of kit properties (from lat/lng) |
| Operator | chain or independent (number of company locations with the same name in the kit), earlier sites of the same operator |
| Era | move-in year |

Every count uses only records dated before the move-in day and excludes the tenancy itself.

### Left out on purpose

Rent, lease term, lease type, service type and "has a lease deal" are built into the dataset but not used by
the model. They sound like move-in facts, but in the kit they measure how thoroughly a tenancy was researched,
and research piles up while a tenant stays: 78% of tenancies with a lease deal survived against 49% without.
That is the outcome leaking in through record completeness. Rent is also filled on only 12% of rows, mostly
asking rent. With these fields the test score got worse (ROC-AUC 0.58), so nothing was lost.

Also not used: the company's business status (it is the outcome), employee count (measured today, not at
move-in), and the food match basis.

### Could not be derived

Cuisine, price point, operator capital or experience, sales, foot traffic, visibility, signage, reviews,
competition outside the kit's 3,339 properties, kitchen fit-out at move-in, and contract rent for most rows.
Suite number is present on only 29% of rows, so suite history is thin.

## Training and evaluation

- Model: scikit-learn `HistGradientBoostingClassifier` (depth 3, 100 trees, learning rate 0.05), chosen from
  a grid of four settings using the training period only.
- Calibration: sigmoid (Platt) scaling fitted on out-of-fold scores, folds grouped by property.
- Baselines: the training base rate, and a regularised logistic regression on the same features.

| Test | Model | ROC-AUC | PR-AUC | Brier (lower is better) |
|---|---|---|---|---|
| Time split: train 583 move-ins before 2019, test 312 from 2019 to 2023 | Base rate | 0.500 | 0.670 | 0.2215 |
| | Logistic regression | 0.592 | 0.757 | 0.2193 |
| | **Gradient boosting (shipped)** | **0.635** | **0.768** | **0.2109** |
| | Gradient boosting without move-in year | 0.627 | 0.759 | 0.2110 |
| | Gradient boosting with lease-record fields | 0.582 | 0.723 | 0.2251 |
| 5-fold CV grouped by property, all 895 rows | Base rate | 0.500 | 0.682 | 0.2171 |
| | Logistic regression | 0.620 | 0.769 | 0.2137 |
| | Gradient boosting | 0.704 | 0.813 | 0.1933 |

The time split is the number to trust. Grouped CV mixes eras, so it also rewards the model for learning how
CoStar's record-keeping changed over the years.

Calibration on the time-split test set:

| Predicted | Rows | Mean predicted | Survived |
|---|---|---|---|
| under 50% | 43 | 41% | 44% |
| 50 to 60% | 50 | 55% | 58% |
| 60 to 70% | 61 | 66% | 66% |
| 70 to 80% | 85 | 75% | 79% |
| over 80% | 73 | 86% | 74% |

## What drives it

Permutation importance on the time-split test set (drop in ROC-AUC when a group is shuffled):

| Group | AUC drop |
|---|---|
| Space size and position | 0.077 |
| Building roster and turnover | 0.039 |
| Building type, size and age | 0.008 |
| Food tenants at this property | 0.001 |
| Market and submarket, operator, 500 m density, suite history | 0 or below |

The space effect is easy to read in the raw data: food tenants in under 600 SF (kiosks, office-lobby delis)
survived 41% of the time (196 rows); those in 1,000 to 4,000 SF survived 81% (389 rows).

## Explanations

- Global: permutation importance, above.
- Per prediction: scikit-learn has no SHAP, so the script computes Monte-Carlo Shapley values on the calibrated
  probability. For each site it takes a real tenancy from 2015 or later (with its move-in year set to the
  site's), switches features to the site's values one at a time in random order, and records how much the
  probability moves. This is repeated 400 times and averaged. Effects are summed into the groups above, so one
  line reads as one fact. All of a site's effects add up to its probability minus the baseline (69%).
- A factor is a statement about the model, not a cause. A group with no measured skill (suite history, 500 m
  density) can still show a few points on a site; treat those as noise.

## The 12 demo sites

Scenario: a new independent food tenant moves into the featured space in November 2026.

| Site | Address | 3-year survival | Band |
|---|---|---|---|
| 1018657 | 2600 Travis St, Houston | 90% | Better odds than most |
| 6038733 | 3150 Wilshire Blvd, Los Angeles | 89% | Better odds than most |
| 20219730 | 630 W 6th St, Los Angeles | 88% | Better odds than most |
| 6819921 | 655 S Hope St, Los Angeles | 87% | Better odds than most |
| 4205077 | 1870-1890 S Western Ave, Los Angeles | 86% | Better odds than most |
| 5697296 | 14800 Westheimer Rd, Houston | 83% | Better odds than most |
| 862130 | 13331 Kuykendahl Rd, Houston | 79% | Better odds than most |
| 680379 | 2323 Clear Lake City Blvd, Houston | 76% | Better odds than most |
| 838391 | 14829 Bellaire Blvd, Houston | 74% | About average odds |
| 431465 | 6922 Hollywood Blvd, Los Angeles | 73% | About average odds |
| 800827 | 15015 Westheimer Rd, Houston | 72% | About average odds |
| 256760 | 5757 W Century Blvd, Los Angeles | 52% | Below-average odds |

Bands: 75% and over "Better odds than most"; 62 to 75% "About average odds"; 50 to 62% "Below-average odds";
under 50% "More likely to close than last".

Most sites score above the 69% baseline for one reason: their spaces are restaurant-sized (1,200 to 4,265 SF).
Given the overconfidence above 80%, read the top six as "about three in four".

## Limits

1. Small sample: 895 tenancies, 312 in the test set. Every number has wide error bars.
2. Recording bias: CoStar back-fills tenant history. Short-lived tenants from long ago are under-recorded, and
   about half the move-in dates are record start dates. Several features partly measure record quality.
3. The label counts a relocation or buy-out as not surviving.
4. Food detection is heuristic; some rows are not restaurants (an office-tower tenant coded as food service).
5. The kit is 3,339 properties, mostly apartments and offices. "Within 500 m" sees only kit properties.
6. The test period includes 2020. Predictions for 2026 move-ins extrapolate past the last labelled move-in.
7. Site predictions assume the tenant takes the whole advertised space; asking rent is not an input.

## Intended use

A rough, explained prior shown beside the site evidence in Foreground. Not for lending, underwriting, or any
decision about a named business.

## Reproduce

```
python -X utf8 -I scripts/ml/build_dataset.py "<kit dir>"   # data/ml/survival-dataset.csv, survival-site-features.csv
python -X utf8 scripts/ml/train_survival.py                 # data/ml/survival-model.json, survival-sites.json
```

TypeScript access: `lib/ml/survival.ts` (`getSiteSurvival(siteId)`, `getSurvivalModel()`, `modelSkill()`).
Tests: `tests/ml/survival.test.ts`.
