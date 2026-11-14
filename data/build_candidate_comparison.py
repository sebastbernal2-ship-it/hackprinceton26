#!/usr/bin/env python3
"""Generate side-by-side candidate evidence dimensions and configurable utility score.

This is a preference-sensitive comparison index, not a probability, safety score,
or objective site recommendation. Unverified factors remain explicitly unknown.
"""
import csv,json,pathlib,datetime
ROOT=pathlib.Path(__file__).resolve().parent.parent
PROFILE=ROOT/'data/comparison-profile.json'
QUEUE=ROOT/'data/normalized/costar/human-review-queue.csv'
EVIDENCE=ROOT/'data/normalized/costar/restaurant-site-evidence.csv'
OPERATOR=ROOT/'data/normalized/costar/operator-review-detail.csv'
CONTEXT=ROOT/'data/normalized/costar/local-context.csv'
OUT=ROOT/'data/normalized/costar/candidate-comparison.csv'
def clamp(x):return max(0,min(100,x))
def main():
 cfg=json.loads(PROFILE.read_text());weights=cfg['weights_percent'];assert sum(weights.values())==100,'weights must sum to 100'
 queue={r['property_id']:r for r in csv.DictReader(QUEUE.open(newline='',encoding='utf-8'))}
 evidence={r['property_id']:r for r in csv.DictReader(EVIDENCE.open(newline='',encoding='utf-8'))}
 op={r['property_id']:r for r in csv.DictReader(OPERATOR.open(newline='',encoding='utf-8'))}
 context={r['property_id']:r for r in csv.DictReader(CONTEXT.open(newline='',encoding='utf-8'))}
 fields=['comparison_profile','profile_version','profile_weights','property_id','city','listed_space_area_sqft','area_match_score_0_100','listing_opportunity_status_observed','listing_opportunity_score_0_100','historical_food_service_precedent_count','food_precedent_score_0_100','matterport_model_count_accessible','defurnished_room_location_count','spatial_evidence_score_0_100','weighted_comparison_index_0_100','score_coverage_percent','unknowns','crime_context_reported_incidents_0_5mi','crime_context_date_range','nearby_retail_properties_1mi','explanation','as_of_date']
 rows=[]
 for pid,q in queue.items():
  e=evidence[pid];o=op.get(pid,{});ctx=context.get(pid,{})
  area=float(q['active_listed_min_available_sqft']) if q['active_listed_min_available_sqft'] else None
  # Do not score fit or opportunity until operator requirements and broker status exist.
  area_score=None
  statuses={x for x in e['listing_statuses'].split(';') if x}
  listing_score=None
  food_count=int(q['historic_food_service_tenant_locations'])
  # Historical precedent counts lack validated relevance/denominator; keep contextual only.
  food_score=None
  model_count=int(q['accessible_model_count'])
  locations=int(o.get('defurnished_location_count') or 0)
  # Scan existence/count is not validated suite identity or dimensional evidence.
  spatial_score=None
  components={'listed_space_area_match':area_score,'listing_opportunity_signal':listing_score,'historic_food_service_precedent':food_score,'interior_scan_evidence':spatial_score}
  active=[(name,val) for name,val in components.items() if val is not None]
  score=sum(val*weights[name]/100 for name,val in active)
  coverage=sum(weights[name] for name,val in active)
  known={'target_area_from_operator':cfg['provisional_assumptions']['target_area_sqft'] is not None,'current_listing_confirmed_with_broker':False,'restaurant_use_zoning_verified':False,'suite_to_scan_verified':False,'dimensions_ground_truthed':False,'hood_exhaust_fire_suppression_verified':False,'grease_utilities_verified':False,'gelato_production_method':'unknown','seating_service_style':'unknown','vexcel_available':False,'crime_context_comparable_across_cities':False}
  rows.append({'comparison_profile':cfg['profile_name'],'profile_version':cfg['version'],'profile_weights':json.dumps(weights,separators=(',',':')),'property_id':pid,'city':q['city'],'listed_space_area_sqft':area if area is not None else '', 'area_match_score_0_100':area_score if area_score is not None else '', 'listing_opportunity_status_observed':';'.join(sorted(statuses)),'listing_opportunity_score_0_100':listing_score if listing_score is not None else '', 'historical_food_service_precedent_count':food_count,'food_precedent_score_0_100':food_score if food_score is not None else '', 'matterport_model_count_accessible':model_count,'defurnished_room_location_count':locations,'spatial_evidence_score_0_100':spatial_score if spatial_score is not None else '', 'weighted_comparison_index_0_100':round(score,1) if active else '', 'score_coverage_percent':coverage,'unknowns':json.dumps(known,separators=(',',':')),'crime_context_reported_incidents_0_5mi':ctx.get('reported_incidents_0_5mi') or '', 'crime_context_date_range':(ctx.get('crime_source_date_start','')+' to '+ctx.get('crime_source_date_end','')) if ctx.get('reported_incidents_0_5mi') else '', 'nearby_retail_properties_1mi':ctx.get('nearby_general_retail_count'), 'explanation':'Exploratory evidence inventory only. No validated comparison components are currently scored; snapshot status and contextual counts are not opportunity, fit, safety, probability, or recommendation.','as_of_date':datetime.date.today().isoformat()})
 rows.sort(key=lambda r:(-float(r['weighted_comparison_index_0_100'] or -1),-int(r['score_coverage_percent']),r['city']))
 OUT.parent.mkdir(parents=True,exist_ok=True)
 with OUT.open('w',newline='',encoding='utf-8') as f:w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(rows)
 print('Wrote',len(rows),'exploratory evidence rows; scored coverage is',sorted({r['score_coverage_percent'] for r in rows}))
 print('No validated preference or diligence components; comparison values are intentionally blank until inputs are verified.')

if __name__=='__main__':main()
