# Public source documentation research (2025-11-14)

## Matterport

The official developer portal is publicly reachable at <https://developers.matterport.com/>. The Model API is GraphQL at `https://api.matterport.com/api/models/graph`; docs specify HTTP Basic authentication using Token ID as username and Token Secret as password. See <https://developers.matterport.com/api/> and <https://developers.matterport.com/api/model/overview/>. Matterport warns generated API keys are admin/all-access; share carefully. The downloaded `env` has key/token variables but their intended mapping to Token ID/Secret is unverified. Critically, the downloaded values were exposed during inspection; do not use them. Rotate/revoke them, update repo secrets with replacement credentials, confirm sponsor-approved model IDs, then test a documented read-only query.

## Vexcel

Found Vexcel's official API 2.0 OpenAPI description at <https://api.vexcelgroup.com/v2/api-docs>. It documents REST endpoints for imagery/elements/metadata, an OGC collections discovery endpoint (`GET /v2/ogc-api/collections`), and API-key authentication via `X-API-KEY` (also documents Bearer token and other methods). A bounded read-only GET to the documented collections endpoint using the configured key returned HTTP 403; the same GET without a key also returned 403. No imagery or property data was retrieved. This establishes the public API contract but not that our key is authorized. Next: ask the Vexcel sponsor to activate/confirm API v2 access, permitted product/collection IDs, coverage around our candidate coordinates, quotas, and use/retention rights. Do not probe alternate endpoints/auth modes without their guidance.

## Current finding / next action

Matterport's documented model lookup has succeeded for a bounded subset of CoStar-linked model IDs; the resumable checker writes local ignored results. Vexcel's documented collections GET returned 403. No Vexcel imagery was retrieved. Confirm sponsor authorization and retention/sharing terms before broader or product-facing use. Keep requests read-only, bounded, and never log headers or credentials.
