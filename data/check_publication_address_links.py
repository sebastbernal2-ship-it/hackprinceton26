#!/usr/bin/env python3
"""Compare Matterport public-address metadata with CoStar property addresses.

Checks only locally shortlisted properties. Emits match diagnostics, never address
strings. The comparison is heuristic and cannot confirm a suite/scan relationship.
"""
import base64, csv, datetime as dt, json, os, pathlib, re, time, urllib.request
ROOT=pathlib.Path(__file__).resolve().parent.parent
QUEUE=ROOT/'data/normalized/costar/human-review-queue.csv'
STARTER=ROOT/'data/raw/costar/marketplace-starter/commercial-properties.csv'
OUT=ROOT/'data/normalized/matterport/shortlist-address-checks.json'
ENDPOINT='https://api.matterport.com/api/models/graph'
QUERY='query($id: ID!) { model(id:$id) { id publication { address published } } }'
def toks(x): return re.findall(r'[a-z0-9]+',str(x or '').casefold())
def main():
 try:
  from dotenv import load_dotenv
 except ImportError:
  pass
 else:
  load_dotenv(ROOT / '.env')
 key,token=os.environ.get('MATTERPORT_API_KEY'),os.environ.get('MATTERPORT_API_TOKEN')
 if not key or not token: raise SystemExit('Set Matterport API credentials in environment')
 pids={r['property_id'] for r in csv.DictReader(QUEUE.open(newline='',encoding='utf-8'))}
 links={}
 for r in csv.DictReader(STARTER.open(newline='',encoding='utf-8-sig')):
  mid=r['MatterportModelId'].strip()
  if r['PropertyId'] in pids and mid: links.setdefault(mid,r)
 auth='Basic '+base64.b64encode(f'{key}:{token}'.encode()).decode();results=[]
 for mid,row in links.items():
  payload=json.dumps({'query':QUERY,'variables':{'id':mid}}).encode()
  req=urllib.request.Request(ENDPOINT,data=payload,headers={'Authorization':auth,'Content-Type':'application/json'},method='POST')
  try:
   with urllib.request.urlopen(req,timeout=20) as res:
    m=(json.loads(res.read()).get('data') or {}).get('model') or {};pub=m.get('publication') or {};a=toks(' '.join([row.get('Address',''),row.get('City',''),row.get('State','')]));b=toks(pub.get('address'))
    na={x for x in a if x.isdigit()};nb={x for x in b if x.isdigit()}
    results.append({'property_id':row['PropertyId'],'model_id':mid,'http_status':res.status,'published':pub.get('published'),'address_present':bool(b),'exact_normalized_match':bool(a and b and ''.join(a)==''.join(b)),'house_number_overlap':bool(na&nb),'city_token_overlap':row.get('City','').casefold() in str(pub.get('address','')).casefold(),'state_token_overlap':row.get('State','').casefold() in str(pub.get('address','')).casefold(),'token_jaccard':round(len(set(a)&set(b))/max(1,len(set(a)|set(b))),3)})
  except Exception as e: results.append({'property_id':row['PropertyId'],'model_id':mid,'http_status':getattr(e,'code',None),'error_type':type(e).__name__})
  time.sleep(.3)
 OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_text(json.dumps({'retrieved_at':dt.datetime.now(dt.timezone.utc).isoformat(),'records':len(results),'results':results},indent=2), encoding="utf-8");OUT.chmod(0o600)
 from collections import Counter
 print('Checked',len(results),'shortlist-linked Matterport models; HTTP',dict(Counter(str(r.get('http_status')) for r in results)),'exact address matches',sum(r.get('exact_normalized_match',False) for r in results),'with number/city/state token overlap',sum(r.get('house_number_overlap') and r.get('city_token_overlap') and r.get('state_token_overlap') for r in results),'saved only comparison metrics locally.')
if __name__=='__main__': main()
