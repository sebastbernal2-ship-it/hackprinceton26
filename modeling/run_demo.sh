#!/usr/bin/env bash
# run_demo.sh <MODEL_ID> - minimal chain for ONE Matterport model: floor-plan plan.json + furniture objects.json.
#
#   modeling/run_demo.sh <model_id>              # run from the working folder that should hold pano_<id>/
#   MAX_PANOS=5 modeling/run_demo.sh <model_id>  # quick test on 5 panoramas (default: all)
#   WITH_MESH=1 modeling/run_demo.sh <model_id>  # also download the Matterport meshes and fuse mesh evidence (better objects)
#   FORCE=1 ...                                  # redo steps whose output already exists
#
# Required env names (set in the shell or a local, uncommitted .env in the working folder; values are never printed):
#   MATTERPORT_API_KEY, MATTERPORT_API_TOKEN     Matterport Model API (read-only GraphQL queries; nothing is purchased or unlocked)
# Optional: ANTHROPIC_API_KEY with LABEL=1 (vision-model labels; otherwise labels stay null/unknown).
#
# Outputs (all ESTIMATES from panorama/mesh differencing; labels unknown unless LABEL=1):
#   demo_<id>/plan.json         walls + rooms, metres, model frame (x east, y north, z up)
#   demo_<id>/objects.json      furniture boxes (+ calibration info)
#   demo_<id>/tour_scene.json   objects reshaped by export_scene_for_ui.py (schema tour_scene/1) for the frontend
# Intermediates (panorama cache, debug images, crops) stay in pano_<id>/ and assets_<id>/; do not commit them.
set -euo pipefail

ID="${1:-}"
[ -n "$ID" ] || { echo "usage: $0 <model_id>" >&2; exit 2; }
[[ "$ID" =~ ^[A-Za-z0-9]+$ ]] || { echo "model id must be alphanumeric" >&2; exit 2; }
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PY="${PYTHON:-python3}"
PANO="pano_$ID"
OUT="demo_$ID"

have_name() {  # env var set, or defined in ./.env (checked without printing it)
  [ -n "${!1:-}" ] || { [ -f .env ] && grep -q "^[[:space:]]*\(export \)\?$1=." .env; }
}

if [ ! -f "$PANO/objects.json" ] || [ -n "${FORCE:-}" ]; then
  for n in MATTERPORT_API_KEY MATTERPORT_API_TOKEN; do
    have_name "$n" || { echo "missing required env name: $n" >&2; exit 3; }
  done
  [ -z "${LABEL:-}" ] || have_name ANTHROPIC_API_KEY || { echo "LABEL=1 needs ANTHROPIC_API_KEY" >&2; exit 3; }
  echo "[1] pano_pipeline: plan + panoramas -> $PANO/plan.json, objects.json"
  args=(--model "$ID" --max-panos "${MAX_PANOS:-0}")
  [ -z "${LABEL:-}" ] || args+=(--label)
  "$PY" "$HERE/pano_pipeline.py" "${args[@]}"
else
  echo "[1] pano_pipeline: $PANO/objects.json exists (FORCE=1 to redo)"
fi

OBJ="$PANO/objects.json"
if [ -n "${WITH_MESH:-}" ]; then
  if [ ! -f "$PANO/mesh_diff/objects_fused.json" ] || [ -n "${FORCE:-}" ]; then
    echo "[2] download_assets (meshes, 2k panos; no splat, no MatterPak) + mesh_furniture"
    "$PY" "$HERE/download_assets.py" --model "$ID" --drone none
    "$PY" "$HERE/mesh_furniture.py" --pano-dir "$PANO" --no-plot
  fi
  OBJ="$PANO/mesh_diff/objects_fused.json"
fi

mkdir -p "$OUT"
cp "$PANO/plan.json" "$OUT/plan.json"
cp "$OBJ" "$OUT/objects.json"
echo "[3] export_scene_for_ui -> $OUT/tour_scene.json"
"$PY" "$HERE/export_scene_for_ui.py" "$OUT/objects.json" -o "$OUT/tour_scene.json"
echo "done: $OUT/plan.json $OUT/objects.json $OUT/tour_scene.json"
