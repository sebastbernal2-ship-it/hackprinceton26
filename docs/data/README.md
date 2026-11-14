# Data preparation

This directory defines a safe, reproducible workflow for sponsor data. Credentials are configured in GitHub repository secrets (`MATTERPORT_API_KEY`, `MATTERPORT_API_TOKEN`, `MATTERPORT_SDK_KEY`, `VEXCEL_API_KEY`). Secret names are known; values are never committed, printed, or copied into documentation. `.env.example` lists expected local variables; copy it to `.env` only for authorized local use. `.env` and downloaded/raw data paths are gitignored. Configure CI access through GitHub Actions secret injection, never by echoing values into logs. Do not assume the secrets alone establish API access: confirm the sponsor's endpoint, authentication scheme, permissions, terms, rate limits, and supported fields before making requests.

## Layout

- `data/registry/sources.csv`: source access and capability status.
- `data/registry/sites.csv`: candidate sites and cross-source matching status.
- `data/raw/<source>/<site-id>/`: immutable source responses, only where terms permit.
- `data/normalized/<source>/`: normalized, provenance-preserving observations.
- `data/derived/`: validated analysis, with links to inputs and methodology.

Never commit credentials, personal data, restricted data, or raw sponsor payloads unless explicitly approved. Keep raw files out of Git by default; maintain only templates and synthetic examples in the repository. Record source terms and retention constraints before downloading. Use stable site IDs, not addresses, in directory names.

## Intake sequence

1. Ask sponsors for API/SDK docs, sample response, sandbox/production distinction, allowed use, and a shortlist of candidate property IDs or addresses.
2. Validate each credential locally without logging its value; use only documented endpoints and a small bounded request.
3. Save permitted raw responses with retrieval timestamp and source identifier; preserve original bytes and do not overwrite prior snapshots.
4. Normalize separately. Distinguish observed, derived, estimated, and unknown values; retain source record IDs, units, timestamps, confidence, and limitations.
5. Match records to sites explicitly, recording method and confidence. Never join solely on a fuzzy address without marking uncertainty.
6. Validate real coverage and measurements before product claims. Missing records mean unknown, not “no”.

The Matterport Model API endpoint and Basic authentication flow have now been confirmed from its public docs; see [source research](source-research.md). Do not make a live request with credentials found in the downloaded `env` file: those values were exposed during inspection and must be rotated first. Vexcel still requires official sponsor docs. Do not treat configured secrets as proof of access.
