# Finance and Nessie ledger (restaurant life simulation)

Scenario analysis, not a forecast. Code: `finance/` (model, loan, nessie), router `services/api/app/finance_routes.py`.

## Model
Per draw (seeded numpy, default 10k): presence index ~ clipped normal; avg check, COGS%, ramp months, build-out cost
~ triangular(low, expected, high); wage triangular; monthly lognormal noise. 36 months of sales, COGS, labor
(fixed hours + hours per cover, burden), other opex, rent, utilities, debt service. Outputs: P(cash shortfall),
runway (first month cash < 0), break-even month (first month cash flow after debt service >= 0), year-2 DSCR,
min/end cash, one-at-a-time sensitivity and bisection flip values (presence, avg check).
Presence mapping (demand 0.6x to 1.4x) is an assumption; the presence input is a stub until a presence index is merged.
Rent comes from listing rent x size only when both exist; otherwise the caller must supply a labelled assumption, else the
result is `blocked` (unknown is never 0). Build-out covers equipment + install allowance only; repairs/TI are unknown.
Not modelled: taxes, depreciation, owner draws. Loans: SBA-style and conventional parameters are ASSUMPTIONS.
Wages: BLS series not wired in (data not present in this checkout); default hourly wage is a labelled assumption.

## Nessie: what it is, what it can and cannot add
Nessie is Capital One's hackathon mock-bank API (api.nessieisreal.com, key as `?key=`, resources customers, accounts,
deposits, purchases, merchants, loans, bills, transfers; fictional data). Official docs returned HTTP 403 to this
session and signup/rate limits/HackPrinceton-2026 sponsorship could NOT be verified (search found a Capital One
"Best Financial Hack" prize at earlier HackPrinceton events only). No key was available, so none was used or invented.
`finance/nessie.py` implements the same calls in a LOCAL SANDBOX (default) and an unverified, never-run HTTP client.
Adds: a browsable transaction trail (deposits = daily sales, purchases = suppliers/rent/payroll/debt service, bills,
loan) in a familiar banking shape. Cannot add: any real data, credit decisions, real loan pricing, or validation of
the numbers; the trail is just the simulation re-expressed. Every record is tagged SIMULATED.

## API
`POST /api/finance/simulate` (see `SimRequest`), `GET /api/finance/ledger/{runId}?table=deposits|purchases|bills|loans|...`.
Ledgers are in memory per process.
