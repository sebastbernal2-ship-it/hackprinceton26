from typing import Literal, Optional, Union

from pydantic import BaseModel, Field, model_validator

Status = Literal["observed", "derived", "estimated", "unknown"]


class Fact(BaseModel):
    label: str
    value: str


class SpaceFacts(BaseModel):
    photos: list[str]
    property: list[Fact]
    location: list[Fact]


class FactorCard(BaseModel):
    factorId: str
    status: Status
    value: str
    unit: str
    source: str
    recordId: str
    asOf: str
    geography: str
    limitations: str


class Match(BaseModel):
    listingId: int
    address: str
    detail: str
    city: str
    blurb: str
    photo: str
    squareFeet: Optional[int] = None
    # None means the source has no asking rent. Missing is not zero.
    rentPerSquareFootYear: Optional[float] = None
    tourId: str
    # 0-100 evidence completeness (share of factors observed). Not a fit or quality score.
    evidenceReadiness: int
    facts: SpaceFacts
    factors: list[FactorCard]


class Exchange(BaseModel):
    question: str
    answer: str


class MatchesRequest(BaseModel):
    brief: list[Exchange] = []


class ConstraintVerdict(BaseModel):
    constraint: str
    status: Literal["PASS", "FAIL", "UNKNOWN"]
    reason: str
    missingFields: list[str] = []
    evidence: dict = {}


class ShortlistMatch(Match):
    """A Match plus its hard-constraint verdicts. FAIL sites are never returned. Not a fit score."""
    constraintStatus: Literal["PASS", "UNKNOWN"]
    constraints: list[ConstraintVerdict]
    missingFields: list[str]


class ParsedProfile(BaseModel):
    """Operator profile as read from the brief (null = not stated, constraint not applied)."""
    cities: Optional[list[str]] = None
    minAreaSqft: Optional[float] = None
    maxAreaSqft: Optional[float] = None
    minSeats: Optional[int] = None
    maxSeats: Optional[int] = None
    budget: Optional[float] = None
    requireActiveListing: bool = False
    requireScanModel: bool = False
    requireRestaurantUse: bool = False
    matchedText: dict[str, str] = {}


class MatchesResponse(BaseModel):
    dataAvailable: bool
    matches: list[ShortlistMatch]
    profile: Optional[ParsedProfile] = None
    counts: dict[str, int] = {}
    excludedCount: int = 0
    notShownCount: int = 0
    note: str = ""


class NextQuestionRequest(BaseModel):
    history: list[Exchange] = []


class NextQuestionResponse(BaseModel):
    question: Optional[str]
    stub: Literal[True] = True


class TourAgentRequest(BaseModel):
    message: str
    placedCount: int = 0
    tourId: str = ""


class TourAgentResponse(BaseModel):
    reply: str
    action: dict
    stub: Literal[True] = True


# --- Projections (slice 0 contract). Model output is never "observed". ---
ProjectionKind = Literal["published", "fitted", "scenario"]
ProjectionStatus = Literal["estimated", "unknown"]
SCENARIO_LABEL = "scenario analysis, not a forecast"


class Citation(BaseModel):
    source: str
    recordId: str
    asOf: str
    geography: str
    limitations: str


class TrainingWindow(BaseModel):
    start: str
    end: str
    geography: str


class ValidationMetric(BaseModel):
    name: str
    value: float
    threshold: float
    # True only if the metric met its threshold on held-out data.
    passed: bool


class ProjectionCard(BaseModel):
    kind: ProjectionKind
    status: ProjectionStatus
    metric: str
    horizon: str
    scenario: str
    point: Optional[float] = None
    lower: Optional[float] = None
    upper: Optional[float] = None
    unit: str = ""
    method: str
    citation: Optional[Citation] = None
    trainingWindow: Optional[TrainingWindow] = None
    validation: list[ValidationMetric] = Field(default_factory=list)
    # Set automatically when a fitted card fails validation. Clients must not show hidden cards.
    hidden: bool = False
    hiddenReason: str = ""

    @model_validator(mode="after")
    def _check(self):
        bounds = (self.point, self.lower, self.upper)
        if self.status == "unknown":
            if any(b is not None for b in bounds):
                raise ValueError("unknown status must not carry point/lower/upper")
        else:
            if any(b is None for b in bounds):
                raise ValueError("estimated status requires point, lower and upper")
            if not self.lower <= self.point <= self.upper:
                raise ValueError("require lower <= point <= upper")
        if not self.method.strip():
            raise ValueError("method statement is required")
        if self.kind == "published" and self.citation is None:
            raise ValueError("published projections require a citation")
        if self.kind == "fitted":
            if self.trainingWindow is None:
                raise ValueError("fitted projections require trainingWindow")
            if not self.validation:
                raise ValueError("fitted projections require validation metrics")
            if not all(v.passed for v in self.validation):
                self.hidden = True
                self.hiddenReason = "failed validation"
        return self


class AssumptionInput(BaseModel):
    key: str
    value: float
    unit: str = ""
    # Assumptions are user-supplied, never observed evidence.
    note: str = ""


class EquipmentChoice(BaseModel):
    id: str
    quantity: Optional[float] = None


class PriceOverride(BaseModel):
    low: float
    high: float


class AssessInputs(BaseModel):
    """User assumptions for the scenario. Unset stays unknown; nothing here is observed evidence."""
    budget: Optional[float] = None
    equipment: Optional[list[Union[str, EquipmentChoice]]] = None  # None = catalog defaults
    unitPriceOverrides: dict[str, Union[float, PriceOverride]] = {}  # a number = low == high
    repairs: dict[str, float] = {}  # confirmed quantities only
    leaseStartDelayMonths: float = 0.0
    monthlyRent: Optional[float] = None
    rentFreeMonths: Optional[float] = None
    delayCostPerMonth: Optional[float] = None
    plannedOpenMonths: Optional[float] = None
    draws: int = Field(5000, ge=200, le=50000)
    seed: int = 0


class AssessRequest(AssessInputs):
    listingId: Optional[int] = None
    assumptions: list[AssumptionInput] = []
    brief: list[Exchange] = []  # budget is read from the brief when not given


class ScenarioAssessment(BaseModel):
    label: Literal["scenario analysis, not a forecast"] = SCENARIO_LABEL
    listingId: Optional[int] = None
    status: ProjectionStatus = "unknown"
    modelsAvailable: bool
    assumptions: list[AssumptionInput] = []
    projections: list[ProjectionCard] = []
    note: str = ""
    # Slice demo/assess: the scenario result. All null/empty when inputs are missing (unknown, not zero).
    analysisBasis: str = "unknown"  # unknown | buildout_only | buildout_plus_rent_and_delay
    budget: Optional[float] = None
    pOverBudgetBuildout: Optional[float] = None
    pOverBudget: Optional[float] = None
    buildout: Optional[dict] = None
    total: Optional[dict] = None
    sensitivity: Optional[dict] = None
    costLines: list[dict] = []
    totals: Optional[dict] = None
    totalsStatus: str = ""
    excludedLineIds: list[str] = []
    assumptionsUsed: list[dict] = []
    unknownInputs: dict = {}
    notes: list[str] = []
    method: str = ""
    seed: int = 0
    draws: int = 0


class ReplanRequest(BaseModel):
    """profileChange keys: cities, minAreaSqft, maxAreaSqft, minSeats, maxSeats, budget, requireActiveListing,
    requireScanModel, requireRestaurantUse; plus assessment keys (see AssessInputs)."""
    brief: list[Exchange] = []
    profile: Optional[ParsedProfile] = None  # overrides the brief-derived profile when given
    assess: AssessInputs = AssessInputs()
    profileChange: dict
    listingId: Optional[int] = None


class ReplanResponse(BaseModel):
    label: Literal["scenario analysis, not a forecast"] = SCENARIO_LABEL
    dataAvailable: bool
    change: dict
    changed: list[dict]
    countsBefore: dict[str, int]
    countsAfter: dict[str, int]
    pOverBudget: dict
    note: str = ""


class ProjectionsResponse(BaseModel):
    listingId: int
    modelsAvailable: bool
    projections: list[ProjectionCard]
    note: str = ""
