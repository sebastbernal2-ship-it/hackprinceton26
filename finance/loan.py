"""Loan amortization (level-payment, monthly). Parameters are ASSUMPTIONS, not offers or quotes."""
from __future__ import annotations

SBA_LIKE = {
    "name": "SBA-7(a)-style term loan (ASSUMED parameters, not an offer)",
    "annualRate": 0.105, "termMonths": 120, "upfrontFeePct": 0.03, "equityInjectionPct": 0.10,
    "status": "estimated",
    "rationale": "Illustrative: variable-rate SBA-style loans are priced off prime plus a spread and carry a "
                 "guarantee/packaging fee; the numbers here are placeholders to be replaced by a lender quote.",
}
CONVENTIONAL = {
    "name": "Conventional equipment/term loan (ASSUMED parameters, not an offer)",
    "annualRate": 0.095, "termMonths": 60, "upfrontFeePct": 0.01, "equityInjectionPct": 0.25,
    "status": "estimated",
    "rationale": "Illustrative shorter-term, higher-equity option; placeholder values.",
}


def payment(principal: float, annual_rate: float, months: int) -> float:
    if months <= 0:
        raise ValueError("months must be positive")
    r = annual_rate / 12
    if r == 0:
        return principal / months
    return principal * r / (1 - (1 + r) ** -months)


def schedule(principal: float, annual_rate: float, months: int) -> list[dict]:
    """Rows: month, payment, interest, principal, balance. Final balance is ~0."""
    pmt, r, bal, rows = payment(principal, annual_rate, months), annual_rate / 12, principal, []
    for m in range(1, months + 1):
        interest = bal * r
        princ = pmt - interest
        bal -= princ
        rows.append({"month": m, "payment": pmt, "interest": interest, "principal": princ, "balance": max(bal, 0.0) if m == months else bal})
    return rows
