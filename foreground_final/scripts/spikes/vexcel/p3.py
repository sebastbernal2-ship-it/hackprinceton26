from common import *
B="https://api.vexcelgroup.com/v2/"
for name,h,q in [("X-API-KEY",{"X-API-KEY":K},""),("query",{},"?api_key="+K),("bearer",{"Authorization":"Bearer "+K},"")]:
    s,hd,b=req(B+"status/query"+q,h=h);print(name,end=" ");show(s,hd,b,300)
H={"X-API-KEY":K}
for p in ["profile/query","usage/query?period-start=2026-11-01&period-end=2026-11-13"]:
    s,hd,b=req(B+p,h=H);print(p,end=" ");show(s,hd,b,900)
s,hd,b=req(B+"ortho/collections?wkt=POINT(-95.533213%2029.850575)&layer=urban",h=H);print("collections",end=" ");show(s,hd,b,1500)
