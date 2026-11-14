# Aerial/site imagery

**Decision question:** What visible site/roof/context observations can guide diligence, with image date and limits?

**Source:** Vexcel API v2 docs at <https://api.vexcelgroup.com/v2/api-docs>. Teammate is obtaining access.

**Preliminary:** Vexcel `GET /v2/ogc-api/collections` returned HTTP 403 with and without configured X-API-KEY. No imagery retrieved. Do not run further queries until teammate confirms access/product.

**Prep after access:** confirm licensed collections/layers, imagery dates and resolutions; test one authorized candidate; retain source metadata; human-verify roof/site observations; distinguish visible object detection from absence/functionality inference. Explore signage, loading/parking, access, shade, and context only where imagery permits.

**Do not claim:** operating conditions, parcel boundaries, code status, hidden defects, or object absence from aerial images/model detections.
