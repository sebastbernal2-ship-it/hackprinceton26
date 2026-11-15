import urllib.request,urllib.error,sys
def get(u,h=None):
    try:
        r=urllib.request.urlopen(urllib.request.Request(u,headers=h or {"User-Agent":"probe"}),timeout=20)
        return r.status,r.read(1500)
    except urllib.error.HTTPError as e: return e.code,e.read(600)
    except Exception as e: return 0,str(e).encode()
for u in ["https://api.vexcelgroup.com/v2/","https://api.vexcelgroup.com/v2/swagger/v1/swagger.json","https://api.vexcelgroup.com/","https://vexcel.atlassian.net/wiki/spaces/APIDOCS/overview","https://foundry.vexcelgroup.com","https://api.vexcelgroup.com/v2/auth/login"]:
    s,b=get(u);print(u,s,b[:400].decode('utf8','ignore').replace("\n"," "));print()
