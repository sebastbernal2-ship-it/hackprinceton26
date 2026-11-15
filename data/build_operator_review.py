#!/usr/bin/env python3
"""Build detailed local review rows for the cafe review queue.

Only emits direct source IDs, listing-space facts, Matterport linkage/state,
and explicit verification caveats. Does not emit tenant or contact names.
"""
import csv
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
KIT = ROOT / "data/raw/costar/full-kit"
STARTER = ROOT / "data/raw/costar/marketplace-starter/commercial-properties.csv"
QUEUE = ROOT / "data/normalized/costar/human-review-queue.csv"
ACCESS = ROOT / "data/normalized/matterport/model-access-checks.jsonl"
OUT = ROOT / "data/normalized/costar/operator-review-detail.csv"


def main():
    queue = [r for r in csv.DictReader(QUEUE.open(newline="", encoding="utf-8")) if int(r["historic_food_service_tenant_locations"]) > 0]
    ids = {r["property_id"] for r in queue}
    models = {}
    for r in csv.DictReader(STARTER.open(newline="", encoding="utf-8-sig")):
        mid = r["MatterportModelId"].strip()
        if r["PropertyId"] in ids and mid:
            models.setdefault(r["PropertyId"], set()).add(mid)
    access = {}
    if ACCESS.exists():
        for line in ACCESS.open(encoding="utf-8"):
            try: r = json.loads(line)
            except json.JSONDecodeError: continue
            if r.get("model_id") in {m for ms in models.values() for m in ms} and r.get("result"):
                access[r["model_id"]] = r
    publication_path = ROOT / "data/normalized/matterport/shortlist-address-checks.json"
    publication = {}
    if publication_path.exists():
        publication = {r["model_id"]: r for r in json.loads(publication_path.read_text(encoding="utf-8")).get("results", [])}
    spatial_path = ROOT / "data/normalized/matterport/operator-spatial-metadata.json"
    spatial = {}
    if spatial_path.exists():
        spatial = {r["model_id"]: r for r in json.loads(spatial_path.read_text(encoding="utf-8")).get("results", [])}
    listings = {pid: [] for pid in ids}
    for line in (KIT / "data/commercial-listing-summary.jsonl").open(encoding="utf-8"):
        l = json.loads(line)
        pid = str(l.get("propertyId", ""))
        if pid in ids:
            for s in (l.get("forLeaseSummary") or {}).get("spaces", []):
                if s.get("propertyId") and str(s["propertyId"]) != pid: continue
                listings[pid].append((l, s))
    columns = ["property_id", "city", "address", "food_service_tenant_location_count", "matterport_model_ids", "matterport_checked_states", "publication_address_match_statuses", "publication_address_token_overlap_count", "defurnished_location_count", "floor_id_count", "listing_ids", "listing_status_codes", "directly_linked_space_count", "suite_codes", "listed_size_min_sqft", "listed_size_max_sqft", "availability_dates_as_listed", "verification_note"]
    with OUT.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=columns); w.writeheader()
        for q in queue:
            pid=q["property_id"]; pairs=list(listings.get(pid, [])); spaces=[s for _,s in pairs]
            listing_ids=sorted({str(l.get("id")) for l,_ in pairs})
            models_for_site=sorted(models.get(pid, set()))
            states=sorted({str((access.get(m,{}).get("result") or {}).get("state", "not checked/returned")) for m in models_for_site})
            spatial_rows=[spatial[m] for m in models_for_site if m in spatial]
            publication_statuses=sorted({"exact" if publication[m].get("exact_normalized_match") else "partial-components" if publication[m].get("house_number_overlap") and publication[m].get("city_token_overlap") and publication[m].get("state_token_overlap") else "unresolved" for m in models_for_site if m in publication})
            publication_components=sum(bool(publication[m].get("house_number_overlap") and publication[m].get("city_token_overlap") and publication[m].get("state_token_overlap")) for m in models_for_site if m in publication)
            mins=[s["squareFeetMin"] for s in spaces if isinstance(s.get("squareFeetMin"),(int,float))]
            maxs=[s.get("squareFeetMax") or s.get("squareFeetMin") for s in spaces if isinstance(s.get("squareFeetMax") or s.get("squareFeetMin"),(int,float))]
            dates=sorted({s.get("availableOnDate", "")[:10] for s in spaces if s.get("availableOnDate")})
            w.writerow({"property_id":pid,"city":q["city"],"address":q["address"],"food_service_tenant_location_count":q["historic_food_service_tenant_locations"],"matterport_model_ids":";".join(models_for_site),"matterport_checked_states":";".join(states),"publication_address_match_statuses":";".join(publication_statuses),"publication_address_token_overlap_count":publication_components,"defurnished_location_count":sum(x.get("defurnished_location_count",0) for x in spatial_rows),"floor_id_count":sum(x.get("floor_id_count",0) for x in spatial_rows),"listing_ids":";".join(listing_ids),"listing_status_codes":";".join(sorted({str(l.get("listingStatus")) for l,_ in pairs})),"directly_linked_space_count":len(spaces),"suite_codes":";".join(sorted({str(s.get("suite")) for s in spaces if s.get("suite")})),"listed_size_min_sqft":min(mins) if mins else "","listed_size_max_sqft":max(maxs) if maxs else "","availability_dates_as_listed":";".join(dates),"verification_note":"IDs join at property level only; must verify each exact marketed suite is the space in the Matterport scan and re-confirm listing availability with broker."})
    print(f"Wrote {len(queue)} local operator review records to {OUT.relative_to(ROOT)}")

if __name__ == "__main__": main()
