import urllib.request,urllib.error,re,json
def key():
    for l in open(r"C:\Users\admin\Documents\foreground\.env.local",encoding="utf8"):
        if l.startswith("VEXCEL_API_KEY"):
            return l.split("=",1)[1].strip().strip('"').strip("'")
K=key()
def req(u,data=None,h=None,method=None,n=700,raw=False):
    hh={"User-Agent":"probe"}; hh.update(h or {})
    r=urllib.request.Request(u,data=data,headers=hh,method=method)
    try:
        x=urllib.request.urlopen(r,timeout=60); b=x.read(); s=x.status; hd=dict(x.headers)
    except urllib.error.HTTPError as e: b=e.read(); s=e.code; hd=dict(e.headers)
    except Exception as e: return 0,{},str(e).replace(K,"***").encode()
    return s,hd,b
def show(s,hd,b,n=700):
    t=b[:n].decode('utf8','ignore').replace(K,"***").replace("\n"," ")
    print(s,hd.get("Content-Type"),t)
