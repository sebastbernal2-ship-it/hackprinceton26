#!/usr/bin/env python3
"""Build a non-ranking, one-row-per-site/factor evidence card inventory."""
import csv, json, pathlib, sys
ROOT=pathlib.Path(__file__).resolve().parent.parent


def evidence_as_of(record):
    return str(record.get('evidence_as_of') or '').strip()


def crime_time_window(context):
    start=str(context.get('crime_source_date_start') or '').strip()
    end=str(context.get('crime_source_date_end') or '').strip()
    return f'{start} to {end}' if start and end else ''
REG=ROOT/'data/registry'
QUEUE=ROOT/'data/normalized/costar/human-review-queue.csv'
CANDIDATES=ROOT/'data/normalized/costar/restaurant-site-candidates.csv'
EVIDENCE=ROOT/'data/normalized/costar/restaurant-site-evidence.csv'
OPERATOR=ROOT/'data/normalized/costar/operator-review-detail.csv'
CONTEXT=ROOT/'data/normalized/costar/local-context.csv'
OUT=ROOT/'data/normalized/costar/factor-cards.csv'

def rows(path):
    with path.open(newline='',encoding='utf-8') as f:return list(csv.DictReader(f))
DERIVED=ROOT/'data/derived'
# Registry factor -> adapter folder under data/derived when the two names differ.
ADAPTER_DIR={'crime_safety':'crime_safety_la'}
CARD_KEYS=('factorId','status','value','unit','source','recordId','asOf','geography','limitations')
STATUSES={'observed','derived','estimated','unknown'}
def load_adapter_observations(factors,derived=None):
    """{(property_id, factor_id): [card, ...]} from data/derived/<adapter>/observations.json.
    Absent file, malformed JSON or an invalid card contributes nothing, so the factor stays unknown."""
    derived=pathlib.Path(derived) if derived else DERIVED
    found={}
    for f in factors:
        fid=f['factor_id'];path=derived/ADAPTER_DIR.get(fid,fid)/'observations.json'
        if not path.is_file():continue
        try:cards=json.loads(path.read_text(encoding='utf-8'))
        except (OSError,ValueError):continue
        for c in cards if isinstance(cards,list) else []:
            if not isinstance(c,dict) or not c.get('propertyId') or any(not isinstance(c.get(k),str) for k in CARD_KEYS):continue
            if c['status'] not in STATUSES or (c['status']=='unknown' and c['value']!=''):continue
            found.setdefault((str(c['propertyId']),fid),[]).append(c)
    return found
FIELDS=['site_id','property_id','city','factor_id','factor_name','status','value','unit','source','record_id','retrieved_or_observed_date','geography','time_window','method','coverage','uncertainty','unknown_reason','interpretation']
OTHER_FACTORS=['schools_education','traffic_access','income_demographics','signage_visibility','climate_weather','natural_hazards','mobility_tourism','aerial_site','infrastructure_permits','costs_timeline','labor_supply']
def build_cards(factors,sites,evidence,operator,context,adapter_obs=None):
    """One card per site and factor, or one per adapter observation where an adapter ran.
    Unknown cards never carry a value; blank is not zero."""
    adapter_obs=adapter_obs or {}
    out=[]
    for site in sites:
        pid=site['property_id'];ev=evidence.get(pid,{});op=operator.get(pid,{});ctx=context.get(pid,{})
        def add(fid,status='unknown',value='',unit='',source='',record='',date='',geo='',period='',method='',coverage='',uncertainty='',reason='Not fetched, verified, or applicable evidence unavailable.',note='Context only; not a suitability or prediction score.'):
            factor=next(f for f in factors if f['factor_id']==fid)
            out.append({'site_id':'site-costar-'+pid,'property_id':pid,'city':site.get('city',''),'factor_id':fid,'factor_name':factor['folder'].replace('-',' '),'status':status,'value':value,'unit':unit,'source':source,'record_id':record,'retrieved_or_observed_date':date,'geography':geo,'time_window':period,'method':method,'coverage':coverage,'uncertainty':uncertainty,'unknown_reason':reason if status=='unknown' else '', 'interpretation':note})
        def add_adapter(fid):
            obs=adapter_obs.get((pid,fid),[])
            for o in obs:
                add(fid,o['status'],o['value'],o['unit'],o['source'],o['recordId'],o['asOf'],o['geography'],method='factor adapter observation',note=o['limitations'] or 'Context only; not a suitability or prediction score.',reason='Adapter reported unknown: '+(o['limitations'] or 'no reason given'))
            return bool(obs)
        # An observed source status does not establish current availability.
        stat=';'.join(x for x in ev.get('listing_statuses','').split(';') if x)
        add('property_market','observed' if stat else 'unknown',stat,'source status codes','CoStar local snapshot',pid,evidence_as_of(ev),'property / listing grain','snapshot','source status only; no broker confirmation','candidate has linked listing records' if stat else 'no linked listing record', 'Snapshot status only; no current availability claim.')
        add('operator_preferences',reason='Independent cafe is the working concept; menu, service style, seating, budget, and on-site baking are unconfirmed.')
        add('spatial_interior','observed' if op.get('matterport_model_ids') else 'unknown',op.get('matterport_model_ids',''),'model IDs','Matterport local lookup',op.get('matterport_model_ids',''),evidence_as_of(op),'property association; suite identity unresolved','','property-level association; not suite match or dimension validation','model association record present' if op.get('matterport_model_ids') else 'no model evidence','User-selected tour does not verify marketed suite identity or dimensions.')
        crime=ctx.get('reported_incidents_0_5mi','')
        if not crime and add_adapter('crime_safety'):pass
        else:add('crime_safety','observed' if crime else 'unknown',crime,'reported incidents (raw aggregate; not a rate)','Houston PD NIBRS public view',pid,ctx.get('crime_source_retrieved_at',''),'0.5-mile point buffer',crime_time_window(ctx),'partial-year incident aggregate','Houston subset only; LA unavailable','Partial-year counts; not rate, safety score, probability, or cross-city comparison.')
        # Other factors remain explicit null/unknown with registry blocker summaries.
        for fid in OTHER_FACTORS:
            if add_adapter(fid):continue
            factor=next(f for f in factors if f['factor_id']==fid)
            add(fid,reason=factor.get('notes') or factor.get('preliminary_status') or 'No verified site-level evidence.')
    return out
def main(argv=()):
    """Default sites = human review queue; `--all-candidates` builds cards for every candidate site."""
    factors=rows(REG/'factors.csv')
    sites=rows(CANDIDATES if '--all-candidates' in argv else QUEUE); evidence={r['property_id']:r for r in rows(EVIDENCE)}
    operator={r['property_id']:r for r in rows(OPERATOR)}; context={r['property_id']:r for r in rows(CONTEXT)}
    out=build_cards(factors,sites,evidence,operator,context,load_adapter_observations(factors))
    with OUT.open('w',newline='',encoding='utf-8') as f:
        w=csv.DictWriter(f,fieldnames=FIELDS);w.writeheader();w.writerows(out)
    print(f'Wrote {len(out)} factor cards for {len(sites)} sites; unknown values remain blank.')
if __name__=='__main__':main(sys.argv[1:])
