# Credits

Who built what. Teammate identities below are inferred from git authors (Afnan Ahmed is probably GitHub `aa3533-art`, Davd probably `DMSchell`); correct this file if that is wrong.

| Area | Built by | Where it lives |
|---|---|---|
| Frontend app, intake, discovery, property view, layout and tour code, Gemini room tracing | Afnan Ahmed | `foreground/` (ported from the `frontend_dev` branch); the separate `foreground_final` app is saved as tag `archive/final_frontend-20261114` and is not merged |
| Matterport 3D pipeline: tiles, meshes, furniture detection and segmentation, walk-through editor (`walk.html`), scene agent, studio and editor3d | Davd | `modeling/` (ported from `Model-testing` and `expansion-model-testing`) |
| Data pipeline, evidence/factor cards, API, planning and cost engine, forecasting, triage, aerial, lineage, agent, reskin, finance, structure, walkthrough viewer, capture pipeline, CI and repo hygiene | Sebastian Bernal-Orta and agents | `data/`, `services/api/`, `planning/`, `forecasting/`, `triage/`, `agent/`, `assets/`, `finance/`, `structure/`, `walkthrough/`, `capture/` |
| Walkthrough viewer and capture pipeline are adapted from Sebastian's earlier project Deja-View | Sebastian Bernal-Orta | `walkthrough/`, `capture/` |

## Why the git history shows "history record" commits
The teammates' branches contained sponsor data and large files that must not be in this repository's history, so their work was ported into `main` file by file instead of merged. To keep authorship visible, each of their original commits has a matching empty "history record" commit on `main` carrying their name, email, date and message plus the original SHA. The full original branch tips are preserved as tags `archive/<branch>-20261114` on the remote.
