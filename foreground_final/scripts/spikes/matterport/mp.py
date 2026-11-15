import json, base64, urllib.request, urllib.error, sys, csv
ENV = r"C:\Users\admin\Documents\foreground\.env.local"
def env():
    e = {}
    for line in open(ENV, encoding="utf-8"):
        line=line.strip()
        if line and not line.startswith("#") and "=" in line:
            k,v=line.split("=",1); e[k.strip()]=v.strip().strip('"').strip("'")
    return e
E = env()
KEY, TOK, SDK = E["MATTERPORT_API_KEY"], E["MATTERPORT_API_TOKEN"], E["MATTERPORT_SDK_KEY"]
def scrub(s):
    for x in (KEY,TOK,SDK): s = s.replace(x, "<redacted>")
    return s
URL="https://api.matterport.com/api/models/graph"
def gql(query, variables=None, auth="basic"):
    body=json.dumps({"query":query,"variables":variables or {}}).encode()
    h={"Content-Type":"application/json"}
    if auth=="basic": h["Authorization"]="Basic "+base64.b64encode(f"{KEY}:{TOK}".encode()).decode()
    elif auth=="bearer": h["Authorization"]="Bearer "+TOK
    req=urllib.request.Request(URL,data=body,headers=h)
    try:
        with urllib.request.urlopen(req,timeout=60) as r: return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        t=e.read().decode(errors="replace")
        try: return e.code, json.loads(t)
        except Exception: return e.code, {"raw":scrub(t[:500])}
