from common import *
B="https://api.vexcelgroup.com/v2/"; H={"X-API-KEY":K,"Content-Type":"application/json"}
w="POLYGON ((-95.5342 29.8502, -95.5322 29.8502, -95.5322 29.8512, -95.5342 29.8512, -95.5342 29.8502))"
body={"wkt":w,"images":[{"endpoint":"ortho/extract","request":{"layer":"urban","wkt":w}}],
 "model-input":{"elements":[{"label":"parked car","detection-threshold":0.5},{"label":"parking space","detection-threshold":0.4}],"include":["geometry","confidence"]}}
s,hd,b=req(B+"elements/detect",data=json.dumps(body).encode(),h=H,method="POST")
print(s,hd.get("Content-Type"),len(b));
t=b.decode('utf8','ignore');print(t[:1500])
open("detect.json","wb").write(b)
for k in hd:
    if "limit" in k.lower() or "retry" in k.lower(): print(k,hd[k])
