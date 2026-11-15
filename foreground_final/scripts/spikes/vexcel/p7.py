from common import *
import urllib.parse as up
B="https://api.vexcelgroup.com/v2/"; H={"X-API-KEY":K}
pt="POINT(-95.533213 29.850575)"
def q(path,**kw): return B+path+"?"+up.urlencode(kw)
s,hd,b=req(q("oriented/query",wkt=pt,layer="urban",**{"page-size":"50","min-capture-date":"2025-01-01","include":"image-name,capture-date,direction,gsd,product-type"}),h=H)
pass
j=json.loads(b);names=[f["properties"]["image-name"] for f in j["features"]];print(names)
print(json.dumps(j["features"][0]["properties"])[:600])
ob=[n for n in names if "oblique-forward" in n or "oblique" in n]
print(ob[:5])
# also try product-type oblique with direct extract
for n in (ob[:1] or names[:1]):
    s,hd,b=req(q("oriented/extract",**{"image-name":n,"wkt":pt,"bbox-dimensions":"150,150","destination-dimensions":"1024,1024,fit","image-format":"jpeg"}),h=H)
    print(n,s,hd.get("Content-Type"),len(b))
    if s==200: open("oblique.jpg","wb").write(b)
    else: show(s,hd,b)
# elements/detect
s,hd,b=req(B+"elements/detect",data=json.dumps({"wkt":pt}).encode(),h={**H,"Content-Type":"application/json"},method="POST");print("elements/detect",end=" ");show(s,hd,b,600)
# count
s,hd,b=req(q("property/count",wkt=pt,layer="urban",**{"buffer-meter":"60"}),h=H);print("count",end=" ");show(s,hd,b,300)
import re
d=json.load(open("openapi.json",encoding="utf8"))
print(re.sub('<[^>]+>','',json.dumps(d["paths"]["/elements/detect"]["post"])[:1800]))
