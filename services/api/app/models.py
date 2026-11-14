from typing import Literal, Optional

from pydantic import BaseModel

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


class MatchesResponse(BaseModel):
    dataAvailable: bool
    matches: list[Match]


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
