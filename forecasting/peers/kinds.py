"""Food-business 'kind' and concept similarity, derived from the company NAME (CoStar has no cuisine field).

CoStar's industry code 17 (AccommodationAndFoodServices) also holds hotels, corporate housing and caterers, and its
business subtype is uninformative for restaurants (most are 'Retailer_OtherRetail' or 0). So the kind below is a
keyword heuristic over the company name. It is a DERIVED label with unmeasured accuracy: it is never shown as observed.
"""
from __future__ import annotations

import re

KINDS = ("cafe_coffee", "bakery", "dessert_drink", "bar", "quick_service", "full_service", "unclassified_food", "non_restaurant")

# Order matters: the first matching rule wins. Lodging/corporate words come first so 'Residence Inn' is not 'full service'.
_RULES: list[tuple[str, re.Pattern]] = [
    ("non_restaurant", re.compile(r"\b(hotels?|inn|suites?|lodg\w*|resort|motel|hospitality|housing|apartments?|rentals?|aramark|elior|eurest|"
                                  r"avendra|sentral|advenir|trigild|scenic|holdings?|corporation|management|mgmt|group of companies|"
                                  r"spa|dds\w*|optometr\w*|surgical|fitness|cleaning|publishing|computer|design studio|casino|camp|"
                                  r"campground|hunt brothers|insightexpress|international housing)\b", re.I)),
    ("bakery", re.compile(r"\b(bakery|bakehouse|bagels?|donuts?|doughnuts?|pastr\w*|patisserie|boulangerie|baguette|croissant|"
                          r"cupcakes?|cookies|pretzels?|kolache|desserts?|bread|biscuit|fudge)\b", re.I)),
    ("cafe_coffee", re.compile(r"\b(caf[eé]s?|caff[eè]|coffee\w*|espresso|roast\w*|latte|macchiato|tea house|tea room|brunch|"
                               r"grind|dutch bros|starbucks|dunkin|philz|tim hortons|common grounds)\b", re.I)),
    ("dessert_drink", re.compile(r"\b(ice cream|creamery|gelato|froyo|frozen yogurt|yogurt|juice\w*|smoothie\w*|boba|bubble|"
                                 r"acai|a[cç]a[ií]|tea|squeeze|lemonade|haagen|cold stone|milk|robeks|nekter|presotea|blu jam)\b", re.I)),
    ("bar", re.compile(r"\b(bar|bars|lounge|tavern|pub|saloon|taproom|brewing|brewery|biergarten|nightclub|cabaret|wine|"
                       r"daiquiris?|karaoke|draught|draft|cantina|supper club|speakeasy)\b", re.I)),
    ("quick_service", re.compile(r"\b(subway|mcdonald\w*|arby\w*|chipotle|qdoba|panda express|wingstop|wingstreet|domino\w*|papa john\w*|pizza hut|"
                                 r"jack in the box|five guys|jersey mike\w*|jimmy john\w*|quiznos|schlotzsky\w*|taco cabana|el pollo loco|"
                                 r"chick-fil-a|golden chick|fatburger|burgerim|freebirds|baja fresh|sweetgreen|cava|salata|freshii|"
                                 r"which wich|blaze pizza|jollibee|bonchon|deli|sandwich\w*|subs|hoagie\w*|burgers?|tacos?|pizza\w*|"
                                 r"pizzeria|wings?|express|chicken|fried|noodles?|poke|bowl|salad|snap kitchen|bibibop|teriyaki|"
                                 r"gyros?|kabob|falafel|empanadas?|taquitos?|dumpling\w*|ramen|pho)\b", re.I)),
    ("full_service", re.compile(r"\b(restaurants?|grill\w*|steak\w*|seafood|bistro|kitchen|sushi|cuisine|bbq|barbecue|barbeque|bar-b-que|"
                                r"cucina|trattoria|diner|house|eatery|brasserie|fish|crab|oyster|buffet\w*|cafeteria|hot pot|izakaya|"
                                r"supper|tex-mex|mexican|italian|chinese|japanese|thai|mediterranean|korean|soul food|catering)\b", re.I)),
]

# Concepts the operator can target and the kinds that compete directly with each.
# Similarity of a neighbouring business's kind to the target concept (1 = same kind, 0 = unrelated). ASSUMPTION values.
CONCEPT_SIMILARITY: dict[str, dict[str, float]] = {
    "cafe": {"cafe_coffee": 1.0, "bakery": 0.75, "dessert_drink": 0.5, "quick_service": 0.25, "full_service": 0.1, "bar": 0.05,
             "unclassified_food": 0.1, "non_restaurant": 0.0},
    "bakery": {"bakery": 1.0, "cafe_coffee": 0.75, "dessert_drink": 0.5, "quick_service": 0.15, "full_service": 0.05, "bar": 0.0,
               "unclassified_food": 0.1, "non_restaurant": 0.0},
    "restaurant": {"full_service": 1.0, "quick_service": 0.5, "bar": 0.4, "cafe_coffee": 0.2, "bakery": 0.1, "dessert_drink": 0.1,
                   "unclassified_food": 0.2, "non_restaurant": 0.0},
    "bar": {"bar": 1.0, "full_service": 0.4, "quick_service": 0.1, "cafe_coffee": 0.05, "bakery": 0.0, "dessert_drink": 0.0,
            "unclassified_food": 0.1, "non_restaurant": 0.0},
    "quick_service": {"quick_service": 1.0, "full_service": 0.4, "cafe_coffee": 0.3, "bakery": 0.2, "dessert_drink": 0.3, "bar": 0.05,
                      "unclassified_food": 0.2, "non_restaurant": 0.0},
}
CONCEPTS = tuple(CONCEPT_SIMILARITY)
DIRECT_MIN_SIMILARITY = 0.75  # similarity at or above this = direct competitor ('same kind'); an ASSUMPTION
PARTIAL_MIN_SIMILARITY = 0.4  # between this and DIRECT = partial substitute; below = complement / general draw


def classify_name(name: str | None) -> str:
    """Kind of a food-industry company from its name. 'unclassified_food' when no keyword matches (unknown, not other)."""
    if not name:
        return "unclassified_food"
    for kind, rx in _RULES:
        if rx.search(name):
            return kind
    return "unclassified_food"


def similarity(concept: str, kind: str) -> float:
    return CONCEPT_SIMILARITY[concept].get(kind, 0.0)


def relation(concept: str, kind: str) -> str:
    """'direct' | 'partial' | 'complement' for a neighbouring food business of this kind relative to the target concept."""
    s = similarity(concept, kind)
    return "direct" if s >= DIRECT_MIN_SIMILARITY else "partial" if s >= PARTIAL_MIN_SIMILARITY else "complement"
