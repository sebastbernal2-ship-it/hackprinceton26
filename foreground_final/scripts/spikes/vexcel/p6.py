from common import *
import urllib.parse as up
B="https://api.vexcelgroup.com/v2/"; H={"X-API-KEY":K}
pt="POINT(-95.533213 29.850575)"
def q(path,**kw): return B+path+"?"+up.urlencode(kw)
def call(path,n=1500,save=None,**kw):
    s,hd,b=req(q(path,**kw),h=H);print("##",path,kw.get("include",""),s,hd.get("Content-Type"),len(b))
    if hd.get("Content-Type","").startswith("image") and s==200:
        if save: open(save,"wb").write(b)
    else: show(s,hd,b,n)
    return s,hd,b
# oblique
for r in ["forward","left","right","backward"]:
    pass
call("oriented/extract",save="oblique_try.jpg",layer="urban",wkt=pt,**{"bbox-dimensions":"150,150","destination-dimensions":"1024,1024,fit","image-format":"jpeg"})
# native zoom
call("ortho/extract",save="ortho_zoom21.jpg",layer="urban",wkt="POINT(-95.533213 29.850575)",zoom="21",**{"bbox-dimensions":"60,60","image-format":"jpeg"})
s,hd,b=call("structure/extract",n=3000,wkt=pt,layer="urban",**{"buffer-meter":"60","page-size":"3"})
open("structure.json","wb").write(b)
s,hd,b=call("property/extract",n=3000,wkt=pt,layer="urban",**{"buffer-meter":"60","page-size":"3"})
open("property.json","wb").write(b)
