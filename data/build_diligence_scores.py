#!/usr/bin/env python3
"""Build interpretable evidence-readiness and diligence-risk indicators.

Scores describe evidence completeness and unresolved diligence, not restaurant
success, fit probability, lease recommendation, or code compliance.
"""
import csv,json,pathlib,datetime
ROOT=pathlib.Path(__file__).resolve().parent.parent


def has_active_listing_status(statuses, enum):
    """Recognize source enum codes or display labels without implying availability."""
    for status in str(statuses or '').split(';'):
        value = status.strip().casefold()
        if value == 'active':
            return True
        if isinstance(enum, dict):
            for code, label in enum.items():
                names = {str(code).strip().casefold(), str(label).strip().casefold()}
                if value in names and 'active' in names:
                    return True
    return False
KIT=ROOT/'data/raw/costar/full-kit'
QUEUE=ROOT/'data/normalized/costar/human-review-queue.csv'
EVIDENCE=ROOT/'data/normalized/costar/restaurant-site-evidence.csv'
OPERATOR=ROOT/'data/normalized/costar/operator-review-detail.csv'
LOCAL_CONTEXT=ROOT/'data/normalized/costar/local-context.csv'
ACCESS=ROOT/'data/normalized/matterport/model-access-checks.jsonl'
OUT=ROOT/'data/normalized/costar/diligence-scorecard.csv'

def main():
 enums=json.loads((KIT/'schemas/enums.json').read_text()); listing_status=enums['ListingStatus']
 queue={r['property_id']:r for r in csv.DictReader(QUEUE.open(newline='',encoding='utf-8'))}
 evidence={r['property_id']:r for r in csv.DictReader(EVIDENCE.open(newline='',encoding='utf-8'))}
 operator={r['property_id']:r for r in csv.DictReader(OPERATOR.open(newline='',encoding='utf-8'))}
 context={r['property_id']:r for r in csv.DictReader(LOCAL_CONTEXT.open(newline='',encoding='utf-8'))}
 props={}
 for line in (KIT/'data/commercial-property.jsonl').open():
  p=json.loads(line); props[str(p['id'])]=p
 scores={}
 for line in ACCESS.open():
  try:r=json.loads(line)
  except json.JSONDecodeError:continue
  if r.get('http_status')==200 and r.get('result'): scores.setdefault(str(r.get('property_id')),set()).add(r['model_id'])
 today=datetime.date.today()
 fields=['property_id','city','concept','evidence_readiness_score_0_100','diligence_risk_score_0_100','risk_band','component_evidence_linkage','component_listing_status_signal','component_area_signal','component_restaurant_precedent','component_spatial_metadata','component_data_completeness','nearby_commercial_properties_1mi','nearby_retail_properties_1mi','nearby_food_service_historic_properties_1mi','houston_reported_incidents_0_5mi_context_only','houston_crime_source_date_range','known_unknowns','score_interpretation','as_of_date']
 out=[]
 for pid,q in queue.items():
  e=evidence[pid];o=operator.get(pid,{});p=props.get(pid,{});ctx=context.get(pid,{})
  linked=int(q['accessible_model_count'])>0
  has_active=has_active_listing_status(e.get('listing_statuses',''),listing_status)
  freshness=0
  # Active status is source snapshot, not present-day validation; certified freshness field is not in these candidate aggregates.
  if has_active:freshness=25
  area=float(q['active_listed_min_available_sqft'] or 0)
  area_signal=20 if 1500<=area<=4000 else (12 if 1000<=area<=6000 else 0)
  food=max(0,min(20,int(q['historic_food_service_tenant_locations'])*5))
  spatial=15 if int(o.get('defurnished_location_count') or 0)>0 else 0
  join=20 if int(e['listing_record_count'])>0 and linked else (10 if linked else 0)
  # Unknown readiness dimensions subtract score; this is explicitly not risk probability.
  known={'matterport_property_link':linked,'source_active_listing':has_active,'listed_area_sqft':area or None,'historic_food_tenant_locations':int(q['historic_food_service_tenant_locations']),'defurnished_room_locations':int(o.get('defurnished_location_count') or 0),'sprinkler_record':p.get('hasSprinklers'),'zoning_text':p.get('zoningDescription'),'listing_certified_fresh_date_available':False,'suite_to_scan_verified':False,'restaurant_use_verified':False,'hood_exhaust_verified':False,'grease_interceptor_verified':False,'utilities_verified':False,'gelato_cold_chain_verified':False,'accessibility_egress_verified':False,'vexcel_aerial_checked':False}
  # Evidence readiness totals max 100, conservative: source joins, active listing indication, area signal, food precedent, spatial metadata.
  readiness=min(100,join+freshness+area_signal+food+spatial)
  # Diligence risk is unresolved checklist burden, not empirical outcome probability.
  unresolved=sum(1 for k in ['suite_to_scan_verified','restaurant_use_verified','hood_exhaust_verified','grease_interceptor_verified','utilities_verified','gelato_cold_chain_verified','accessibility_egress_verified','vexcel_aerial_checked'] if not known[k])
  risk=min(100,unresolved*10 + (0 if linked else 10) + (0 if has_active else 10) + (10 if p.get('hasSprinklers') is None else 0))
  band='high diligence' if risk>=80 else ('medium diligence' if risk>=50 else 'lower diligence (not low risk)')
  out.append({'property_id':pid,'city':q['city'],'concept':'Italian restaurant with gelato','evidence_readiness_score_0_100':readiness,'diligence_risk_score_0_100':risk,'risk_band':band,'component_evidence_linkage':join,'component_listing_status_signal':freshness,'component_area_signal':area_signal,'component_restaurant_precedent':food,'component_spatial_metadata':spatial,'component_data_completeness':0,'nearby_commercial_properties_1mi':ctx.get('nearby_commercial_property_count'),'nearby_retail_properties_1mi':ctx.get('nearby_general_retail_count'),'nearby_food_service_historic_properties_1mi':ctx.get('nearby_food_service_historic_tenant_property_count'),'houston_reported_incidents_0_5mi_context_only':ctx.get('reported_incidents_0_5mi'),'houston_crime_source_date_range':(ctx.get('crime_source_date_start','')+' to '+ctx.get('crime_source_date_end','')) if ctx.get('reported_incidents_0_5mi') else '', 'known_unknowns':json.dumps(known,separators=(',',':')),'score_interpretation':'Evidence-readiness and unresolved diligence checklist only; not fit probability, business outcome, safety, code compliance or a property recommendation. Snapshot listing status may be stale.','as_of_date':today.isoformat()})
 out.sort(key=lambda x:(-int(x['evidence_readiness_score_0_100']),int(x['diligence_risk_score_0_100']),x['city']))
 with OUT.open('w',newline='',encoding='utf-8') as f:w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(out)
 print(f'Wrote transparent exploratory scorecard for {len(out)} candidates; score represents evidence/diligence only, not probability or recommendation.')
if __name__=='__main__':main()
