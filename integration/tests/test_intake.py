from integration.intake import parse_brief

CITIES = ["Springfield", "Shelbyville"]


def p(*a):
    return parse_brief(list(a), CITIES)[0]


def test_full_brief():
    pr = p("Looking in Springfield, budget $250k", "1,500-2,500 sq ft with 40-60 seats", "needs a 3D scan and an active listing")
    assert pr.cities == ("Springfield",) and pr.budget == 250_000
    assert (pr.min_area_sqft, pr.max_area_sqft) == (1500, 2500) and (pr.min_seats, pr.max_seats) == (40, 60)
    assert pr.require_scan_model and pr.require_active_listing and not pr.require_restaurant_use


def test_bounds_and_money_forms():
    assert p("under 3,000 sqft").max_area_sqft == 3000
    assert p("at least 1200 square feet").min_area_sqft == 1200
    assert p("$1.2 million").budget == 1_200_000 and p("budget of about 300k").budget == 300_000
    assert p("60 seats").min_seats == 60 and p("60 seats").max_seats is None


def test_nothing_stated_sets_nothing():
    pr, why = parse_brief(["we love pasta"], CITIES)
    assert pr.cities is None and pr.budget is None and pr.min_area_sqft is None and why == {}
    assert not (pr.require_active_listing or pr.require_scan_model or pr.require_restaurant_use)


def test_budget_phrases_without_dollar_sign_or_the_word_budget():
    for text, expected in [
        ("under 200k", 200_000), ("up to 1.2 million", 1_200_000), ("a 300k budget", 300_000),
        ("below 450k", 450_000), ("no more than $250,000", 250_000),
    ]:
        profile, matched = parse_brief([text], [])
        assert profile.budget == expected, (text, profile.budget)


def test_sqft_bound_is_not_mistaken_for_budget():
    profile, _ = parse_brief(["under 3000 sq ft"], [])
    assert profile.budget is None
