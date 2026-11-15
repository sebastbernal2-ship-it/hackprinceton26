from common import *
import urllib.parse as up
B="https://api.vexcelgroup.com/v2/"; H={"X-API-KEY":K}
pt="POINT(-95.533213 29.850575)"
def q(path,**kw): return B+path+"?"+up.urlencode(kw)
def j(path,n=1800,**kw):
    s,hd,b=req(q(path,**kw),h=H);print("##",path,s,hd.get("Content-Type"));
    if hd.get("Content-Type","").startswith("image"): return s,hd,b
    show(s,hd,b,n);return s,hd,b
j("ortho/dates",wkt=pt,layer="urban")
s,hd,b=j("oriented/query",wkt=pt,layer="urban",**{"page-size":"3","metadata-format":"json"},n=2500)
open("oriented_query.json","wb").write(b)
