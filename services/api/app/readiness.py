from .models import FactorCard


def evidence_readiness(factors: list[FactorCard]) -> int:
    """round(100 * observed / total). Only 'observed' counts; derived, estimated and
    unknown count as not-yet-verified. No factors -> 0. Not a fit or quality score."""
    if not factors:
        return 0
    observed = sum(1 for f in factors if f.status == "observed")
    return round(100 * observed / len(factors))
