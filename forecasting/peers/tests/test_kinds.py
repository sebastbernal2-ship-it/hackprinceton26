from forecasting.peers import kinds


def test_classify_names():
    c = kinds.classify_name
    assert c("Blackwater Coffee Roasters") == "cafe_coffee" and c("Rose Bakery") == "bakery" and c("Sports Bar") == "bar"
    assert c("Subway") == "quick_service" and c("Steak House Grill") == "full_service" and c("Residence Inn") == "non_restaurant"
    assert c("Tutti Frutti Frozen Yogurt") == "dessert_drink" and c("Zzz Holdings") == "non_restaurant" and c("Joyce") == "unclassified_food"
    assert c(None) == "unclassified_food"


def test_relation_by_concept():
    assert kinds.relation("cafe", "cafe_coffee") == "direct" and kinds.relation("cafe", "bakery") == "direct"
    assert kinds.relation("cafe", "dessert_drink") == "partial" and kinds.relation("cafe", "bar") == "complement"
    assert kinds.relation("restaurant", "full_service") == "direct" and kinds.relation("restaurant", "cafe_coffee") == "complement"
    assert all(set(m) == set(kinds.KINDS) for m in kinds.CONCEPT_SIMILARITY.values())
