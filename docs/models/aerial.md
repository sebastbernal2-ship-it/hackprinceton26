# Aerial (Vexcel) analysis

Slice `rt/aerial`. Code in `triage/aerial/`, route `GET /api/aerial/{listingId}`.

## Pipeline
1. `fetch.py`: Vexcel `ortho/extract` crop (100 m x 100 m, 2000 px, so a requested 5 cm/px) centred on the CoStar lat/long for each candidate site. Images stay in gitignored `data/derived/triage/aerial/images/`.
2. `detect.py`: OWLv2 (`google/owlv2-base-patch16-ensemble`, fp16, about 2 GB VRAM) on 800 px tiles with text queries; raw detections kept.
3. `labels.json` + `evaluate.py`: 15 crops hand-labelled by the model (counts only, single annotator). Count-level MAE, bias, count precision/recall (min(pred,true) matching, an upper bound since labels have no boxes); the threshold is chosen by 2-fold cross-validation.
4. `build.py`: per-property JSON. A field is exposed only if validated relative error <= 30%.

## Validated results (n=15 vehicles, n=9 rooftop units)
| field | CV MAE | mean true | relative | decision |
|---|---|---|---|---|
| vehicles in crop | 5.96 | 22.1 | 27% | exposed as estimated, low/expected/high = count -/+ MAE; threshold-sensitive (MAE 13 at 0.25, 12 at 0.40) |
| rooftop units | 6.08 | 14.8 | 41% | withheld (unknown) |
| parking stalls | n/a | | | unknown, never validated |
| loading docks | n/a | | | unknown, facade feature not visible from above |
| roof area/shape | n/a | | | unknown, no footprint in kit |

Vehicles are not stalls (they include street and neighbour lots) and are a snapshot. Capture date is unknown (API gives none). Screening estimate, not an engineering assessment; OWLv2 score is not a probability.

## Caveats
Labels are my own reading, +/-10% on dense scenes; tuning and scoring share 15 crops (hence the 2-fold CV figure).
