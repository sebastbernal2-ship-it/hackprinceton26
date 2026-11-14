# Property, listings, market, and competition

**Decision question:** What property is marketed, on what terms, with what prior/current uses and competing food businesses nearby?

**Sources:** Supplied CoStar kit (commercial property, listings, location occupancy, company detail, sales, apartment listings). See local `data/raw/costar/full-kit/index.md`; all 139,915 JSONL records passed supplied schemas locally.

**Preliminary:** 3,339 properties and 1,022 commercial listing records. 65 GeneralRetail properties formed initial investigation set; 18 in current exploratory 1,000–6,000 sq ft shortlist. Exact property-ID listing/occupancy joins exist. Tenant industry join provides coarse historic food-service precedent; not business name in outputs.

**Prep:** distinguish property/building/listing/suite grain; current listing freshness; direct vs portfolio/group listings; lease rate/service basis; availability date; rent/NNN; competing businesses using verified location/time; preserve conflicting fields and status.

**Do not claim:** active source listing is currently available; missing listing means vacant; prior tenant predicts success; portfolio listing applies to a particular suite. Verify rights, refresh status with broker, and use precise match confidence.
