#!/usr/bin/env python3
"""Build local commercial-peer and Houston police incident context for review.

Uses only coarse aggregate counts, not incident-level output. Crime is not a
safety rating or rate: reporting/geocoding coverage and exposure denominators are
not available. Keep source input and outputs ignored/access-controlled.
"""
import csv,datetime as dt,json,math,pathlib,collections
ROOT=pathlib.Path(__file__).resolve().parent.parent
KIT=ROOT/'data/raw/costar/full-kit'
CANDIDATES=ROOT/'data/normalized/costar/restaurant-site-evidence.csv'
POLICE=ROOT/'data/raw/houston-police/NIBRSPublicView2026.csv'
OUT=ROOT/'data/normalized/costar/local-context.csv'
VIOLENT={'09A','09B','11A','11B','11C','11D','120','13A','13B'}
PROPERTY={'200','220','23A','23B','23C','23D','23E','23F','23G','23H','240','250','270','280','290'}

def miles(a,b):
 r=3958.8;p1,p2=math.radians(a[0]),math.radians(b[0]);dp=p2-p1;dl=math.radians(b[1]-a[1]);h=math.sin(dp/2)**2+math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
 return 2*r*math.asin(math.sqrt(h))
def classify_incident(code):
 """Return the aggregate buckets a NIBRS class code counts toward (besides 'incidents')."""
 return [k for k,codes in (('violent',VIOLENT),('property',PROPERTY)) if code in codes]
def add_incident(counter,code,n):
 """Add n offenses with NIBRS class `code` to a per-site counter."""
 counter['incidents']+=n;counter['geocoded_incidents']+=n
 for k in classify_incident(code):counter[k]+=n
def count_nearby(site_coords,incident_coord,code,n,near,radius=0.5):
 """Credit an incident to every site within `radius` miles (inclusive) by haversine."""
 for pid,coord in site_coords.items():
  if miles(coord,incident_coord)<=radius:add_incident(near[pid],code,n)
def site_count(near,site_coords,police_loaded,pid):
 """Per-site incident counters. A geocoded Houston site with police data loaded and no nearby
 incidents is a real zero; an unlocatable site or missing police file stays blank (unknown)."""
 if police_loaded and pid in site_coords:
  return {'incidents':0,'geocoded_incidents':0,'violent':0,'property':0,**near.get(pid,{})}
 return {}
def peers_within(coord,pid,props,radius=1.0):
 """Other commercial properties within `radius` miles of coord; none if coord is unknown."""
 return [p for p in props if p['id']!=pid and coord and miles(coord,(p['lat'],p['lon']))<=radius]
def main():
 props=[]
 with (KIT/'data/commercial-property.jsonl').open() as f:
  for line in f:
   p=json.loads(line);a=p.get('primaryAddress') or {}
   try:lat,lon=float(a['latitude']),float(a['longitude'])
   except (KeyError,TypeError,ValueError):continue
   props.append({'id':str(p['id']),'lat':lat,'lon':lon,'type':p.get('propertyType'),'city':str(a.get('city') or '').casefold(),'submarket':p.get('primarySubmarketId')})
 occ=collections.defaultdict(set)
 with (KIT/'data/location-occupancy.jsonl').open() as f:
  for line in f:
   x=json.loads(line)
   if x.get('tenantLocationId') is not None:occ[str(x.get('propertyId'))].add(str(x['tenantLocationId']))
 # Tenant-industry joins count food-service historic tenant locations, no names.
 tenant_food=set()
 with (KIT/'data/company-detail.jsonl').open() as f:
  for line in f:
   x=json.loads(line);profile=x.get('profile') or {}
   if str(profile.get('industryType'))=='17':tenant_food.add(str(x.get('id')))
 food_by_property=collections.defaultdict(set)
 with (KIT/'data/location-occupancy.jsonl').open() as f:
  for line in f:
   x=json.loads(line);tid=str(x.get('tenantLocationId')) if x.get('tenantLocationId') is not None else None
   if tid in tenant_food:food_by_property[str(x['propertyId'])].add(tid)
 candidates=list(csv.DictReader(CANDIDATES.open(newline='',encoding='utf-8')))
 target={r['property_id']:r for r in candidates}
 site_coords={}
 for pid,site in target.items():
  if site['city'].casefold()!='houston':continue
  try:site_coords[pid]=(float(site['latitude']),float(site['longitude']))
  except (TypeError,ValueError):continue
 citycrime=collections.defaultdict(collections.Counter); near=collections.defaultdict(collections.Counter); date_range={}
 police_loaded=POLICE.exists()
 if police_loaded:
  with POLICE.open(newline='',encoding='utf-8-sig',errors='replace') as f:
   for r in csv.DictReader(f):
    city=str(r.get('City') or '').strip().casefold()
    if city!='houston':continue
    try:n=max(1,int(r.get('Offense Count') or 1))
    except ValueError:n=1
    code=str(r.get('NIBRS Class') or '').strip();date=str(r.get('Occurrence Date') or '').strip()
    c=citycrime[city];c['incidents']+=n
    if date:
     date_range[city]=[min(date,date_range.get(city,[date,date])[0]),max(date,date_range.get(city,[date,date])[1])]
    try:pt=(float(r['Map Latitude']),float(r['Map Longitude']))
    except (TypeError,ValueError,KeyError):continue
    c['geocoded_incidents']+=n
    if code in VIOLENT:c['violent']+=n
    if code in PROPERTY:c['property']+=n
    count_nearby(site_coords,pt,code,n,near)
 outrows=[]
 for pid,row in target.items():
  try:coord=(float(row['latitude']),float(row['longitude']))
  except (TypeError,ValueError):coord=None
  peers=peers_within(coord,pid,props)
  food_history=len(food_by_property.get(pid,set()))
  outrows.append({'property_id':pid,'city':row['city'],'peer_radius_miles':1.0,'nearby_commercial_property_count':len(peers),'nearby_general_retail_count':sum(p['type']==6 for p in peers),'nearby_hospitality_count':sum(p['type']==1 for p in peers),'nearby_food_service_historic_tenant_property_count':sum(bool(food_by_property.get(p['id'])) for p in peers),'site_historic_food_service_tenant_locations':food_history,'crime_source':'Houston Police Department NIBRS public view','crime_source_date_start':(date_range.get('houston') or ['',''])[0],'crime_source_date_end':(date_range.get('houston') or ['',''])[1],'crime_radius_miles':0.5 if row['city'].casefold()=='houston' else '', 'reported_incidents_0_5mi':site_count(near,site_coords,police_loaded,pid).get('incidents','') if row['city'].casefold()=='houston' else '', 'geocoded_incidents_0_5mi':site_count(near,site_coords,police_loaded,pid).get('geocoded_incidents','') if row['city'].casefold()=='houston' else '', 'violent_classified_incidents_0_5mi':site_count(near,site_coords,police_loaded,pid).get('violent','') if row['city'].casefold()=='houston' else '', 'property_classified_incidents_0_5mi':site_count(near,site_coords,police_loaded,pid).get('property','') if row['city'].casefold()=='houston' else '', 'crime_method_note':'Raw HPD NIBRS incident counts within 0.5 mi; not population-adjusted, not an official rate, not a safety score. Houston only; blank means unavailable/not computed.'})
 OUT.parent.mkdir(parents=True,exist_ok=True)
 with OUT.open('w',newline='',encoding='utf-8') as f:
  w=csv.DictWriter(f,fieldnames=list(outrows[0]));w.writeheader();w.writerows(outrows)
 print('Wrote local context for',len(outrows),'retail candidates. Houston police rows aggregated:',sum(v['incidents'] for v in citycrime.values()),'events weighted by Offense Count; date range',date_range.get('houston'))
 print('Context contains 1-mile commercial-peer aggregates and Houston-only 0.5-mile incident counts; not a safety score/rate.')
if __name__=='__main__':main()
