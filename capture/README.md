# capture/: phone video of a space -> walkthrough scene bundle

Ported from the owner's Deja-View (`pipeline/anysplat_run.py`, `common/models.py`, `reality_split.py`, `splat_io.py`),
stripped of everything unrelated (Roblox, HPC jobs, avatars, TTS, HDR tone-mapping, people/plate pipeline).

```
video --> sharp frames --> Depth Anything V2 Metric-Indoor (metres per frame)
                      \--> AnySplat (splats + camera poses + intrinsics, one feed-forward pass)
      metric scale = median(DepthAnything / splat depth); floor = RANSAC plane -> y = 0
      reality split (seen vs imagined) -> scene bundle
```

## Run

```bash
# one-time (about 7 GB venv + 2.9 GB AnySplat weights + 0.1 GB depth weights = 9.9 GB, all under capture/.cache, gitignored)
uv venv --python 3.11 capture/.cache/venv
uv pip install -p capture/.cache/venv --index-url https://download.pytorch.org/whl/cu128 torch==2.8.0 torchvision==0.23.0
uv pip install -p capture/.cache/venv -r capture/requirements.txt
git clone https://github.com/InternRobotics/AnySplat capture/.cache/AnySplat
git -C capture/.cache/AnySplat checkout 5f5e208a7dd57d52e43ea0d553a95eab526e8775

capture/.cache/venv/bin/python -m capture.run my_walkthrough.mp4 capture/.cache/out/site --views 24
capture/.cache/venv/bin/python -m pytest capture/tests -q      # synthetic-data tests, no GPU
```

Needs: an NVIDIA GPU (Blackwell/RTX 50xx needs the cu128 torch wheel), no ffmpeg (OpenCV decodes), no COLMAP,
no `HF_TOKEN` (all three Hugging Face repos are public; the hub client reads `HF_TOKEN` from the environment if
you set one, e.g. to lift rate limits). Weights: `lhjiang/anysplat` (2.9 GB), `depth-anything/Depth-Anything-V2-Metric-Indoor-Small-hf`
(~100 MB; `--depth-model base|large` for ~390 MB / ~1.3 GB). AnySplat's upstream code also tries to download
`facebook/VGGT-1B` (4.7 GB) and then overwrites it; `anysplat.py` skips that, so it is not needed. Model load: 12 s warm.

## Output bundle (`OUT_DIR`)

| file | what |
|---|---|
| `scene.json` | `units: "meters"`, `up: "y"`, `floorY` (0, or null when no floor plane was found), `bounds` of seen splats, `spawn`, `scale` (method + factor + implied camera height), `world.file` (identity transform, the splats are already in the viewer frame) |
| `world.spz` | all splats (default budget 400k), metres, +Y up, floor at y = 0 |
| `world-seen.spz`, `world-imagined.spz` | the same splats split by `reality.json` |
| `reality.json` | counts, `seenFraction`, per-view counts, the rule, `pinRadius` |
| `cameras.json` | one OpenGL camera per input frame in the viewer frame (position, xyzw quaternion, pixel intrinsics of the 448x448 crop, source frame index, image path) |
| `frames/NNN.jpg` | the 448x448 crop each camera saw: evidence images for the inspector bot |
| `depth.npz` | per-frame metric depth, float16, metres, aligned with `frames/` |
| `capture-report.json` | timings, peak VRAM, file sizes |

### Seen vs imagined: what it does and does not mean

A splat is SEEN when at least one input frame covers it and it is not hidden behind that frame's own surface
(`reality.py`, adapted from Deja-View). AnySplat is pixel-aligned, so most splats are seen by construction
(94-96% on the test clip); the imagined 4-5% are splats outside every frame or hidden in every frame that covers them.
It does NOT prove the geometry is right. For defect pins use `reality.pin_is_supported(points, seen_means)`: a pin may only
sit within `pinRadius` (0.25 m) of a seen splat, and the bot should cite the `frames/` images that contain it.

## How to film a restaurant so this works

- Phone upright or sideways, but keep it the same way for the whole clip. 30 fps, 1080p is plenty; 20 to 60 seconds.
- Walk slowly, about one step per second, and pan slowly: blur kills reconstruction and the pipeline keeps the sharpest frame per slot.
- Hold the phone at chest height, level, and keep moving a little sideways while you look around (parallax). Do not stand still and spin.
- Cover every surface an inspector cares about: floor, ceiling and the wall-ceiling junction, kitchen hoods, drains and sinks, door frames, windows. Surfaces you never film are imagined and will not get findings.
- Overlap: every area should appear in several consecutive frames from slightly different positions. Walk the room as a loop and end where you started.
- Light: turn the lights on, avoid pointing at windows or mirrors, no flash. Mirrors, glass, stainless steel and glossy floors reconstruct badly.
- Keep people and moving carts out of frame. Open the doors you want assessed before you start.
- One room per clip. Several rooms: several clips (multi-room stitching is not implemented).

## Measured (RTX 5080 Laptop 16 GB, WSL2, CC0 clip 480x848, 7.4 s, a church nave)

| views | AnySplat infer | peak VRAM | total (warm) | splats |
|---|---|---|---|---|
| 16 | 2.4 s | 6.9 GiB | 257 s (incl. a 244 s cold load that also fetched VGGT-1B) | 2.19M raw -> 400k |
| 24 | 3.2 s | 8.8 GiB | 28.9 s (12 s model load, 3.7 s depth, 3 s reality) | 2.99M raw -> 400k |
| 32 | 6.2 s | 10.7 GiB | 47 s | 3.73M raw -> 400k |

Metric scale came out 11.1 (16 views), 11.3 (24) and 11.4 (32) metres per reconstruction unit, p25-p75 within 5% across
views; the floor fit then implies a camera height of 1.94 to 1.95 m (a little high for a handheld phone, so treat
metric sizes as +-15%; there is no ground-truth measurement yet).

## Not ported (and why)

- COLMAP / hloc pose estimation: AnySplat predicts poses itself; COLMAP is not installed here.
- gsplat CUDA rasteriser, per-scene 3DGS training (`recon/train_gs.py`): no value for a 16 GB hackathon path; the CPU point renderer is used for thumbnails.
- FlashWorld / world generation, avatars, genfill, objects, Roblox, Solana scores, TTS: unrelated, and generation would invent surfaces.
- HDR (HLG/PQ) tone mapping, rotation heuristics from `common/media.py`: OpenCV applies rotation metadata; iPhone HDR clips may look washed out.
- Third Wheel `tw/` (person removal, plate inpainting, depth stabilisation): needed only for a locked-off camera.
- Mesh export: the viewer loads splats; no mesh path was built.

## Limits

- AnySplat resizes and centre-crops each frame to 448x448: a portrait clip loses the top and bottom, a landscape clip the sides. Film the way you want it cropped.
- Up to about 32 views fit in 16 GB; more would need chunking (not implemented).
- Single-pass feed-forward quality is soft (see `thumb.jpg`); good enough to place pins and show an inspector where to look, not to measure.

## Test clip

`Interior Iglesia San Martin de Tours.webm`, Wikimedia Commons, CC0 (public domain dedication):
https://commons.wikimedia.org/wiki/File:Interior_Iglesia_San_Martin_de_Tours.webm
(download: https://upload.wikimedia.org/wikipedia/commons/7/7a/Interior_Iglesia_San_Martin_de_Tours.webm, 780 KB, kept in `capture/.cache/clips`, not committed).
