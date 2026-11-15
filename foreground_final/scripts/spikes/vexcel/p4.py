from common import *
import urllib.parse as up
B="https://api.vexcelgroup.com/v2/"; H={"X-API-KEY":K}
pt="POINT(-95.533213 29.850575)"
def q(path,**kw):
    return B+path+"?"+up.urlencode(kw)
# ortho
s,hd,b=req(q("ortho/extract",layer="urban",wkt=pt,**{"bbox-dimensions":"200,200","destination-dimensions":"1024,1024,fit","image-format":"jpeg","include":"estimate-date"}),h=H)
print("ortho",s,hd.get("Content-Type"),len(b),{k:v for k,v in hd.items() if k.lower().startswith(("x-","ratelimit","retry"))})
if s==200 and b[:2]==b'\xff\xd8': open("ortho_urban_200m.jpg","wb").write(b)
else: show(s,hd,b)
# ortho metadata/dates
s,hd,b=req(q("ortho/collections",wkt=pt,layer="urban",**{"metadata-format":"json"}),h=H)
try:
    j=json.loads(b)
    for f in j["features"]: print(f["properties"])
except Exception: show(s,hd,b)
