from .models import FactorCard


def evidence_readiness(factors: list[FactorCard]) -> int:
    """round(100 * (observed + derived) / total). Observed and derived streams hold data; estimated (demo)
    and unknown do not. No factors -> 0. Not a fit or quality score."""
    if not factors:
        return 0
    observed = sum(1 for f in factors if f.status in ("observed", "derived"))
    return round(100 * observed / len(factors))
