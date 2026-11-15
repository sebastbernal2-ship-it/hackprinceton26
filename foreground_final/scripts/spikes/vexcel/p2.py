from common import *
B="https://api.vexcelgroup.com/v2/"
for p in ["api-docs","v3/api-docs","swagger-ui/index.html"]:
    for name,h,q in [("hdr",{"X-API-KEY":K},""),("none",{},"")]:
        s,hd,b=req(B+p+q,h=h);print(p,name,end=" ");show(s,hd,b,300)
print("--auth header variants on healthish")
for name,h,q in [("X-API-KEY",{"X-API-KEY":K},""),("query",{},"?api_key="+K),("bearer",{"Authorization":"Bearer "+K},""),("token",{"token":K},"")]:
    s,hd,b=req(B+"coverage/getmetadata"+q,h=h);print(name,end=" ");show(s,hd,b,300)
