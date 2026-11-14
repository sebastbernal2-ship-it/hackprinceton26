import requests, os

TOKEN_ID     = os.environ["MATTERPORT_API_KEY"]
TOKEN_SECRET = os.environ["MATTERPORT_API_TOKEN"]
AUTH = (os.environ["MATTERPORT_API_KEY"], os.environ["MATTERPORT_API_TOKEN"])
MODEL_ID     = "zvKHR9DHNjJ"   # your model's SID

URL = "https://api.matterport.com/api/models/graph"

def gql(query, variables=None):
    r = requests.post(URL, json={"query": query, "variables": variables or {}}, auth=AUTH)
    r.raise_for_status()
    d = r.json()
    if "errors" in d: raise SystemExit(d["errors"])
    return d["data"]

# 1. Check whether the MatterPak bundle is unlocked
q = """query($id: ID!){ model(id:$id){ name
  bundle(id:"mp:matterpak"){ id availability
    assets{ url filename } } } }"""
b = gql(q, {"id": MODEL_ID})["model"]["bundle"]
print("MatterPak availability:", b["availability"])

# 2. Download each asset (the signed URLs expire, so download immediately)
if b["availability"] == "unlocked":
    for a in b["assets"]:
        name = a.get("filename") or a["url"].split("?")[0].split("/")[-1]
        with requests.get(a["url"], stream=True) as r, open(name, "wb") as f:
            for chunk in r.iter_content(1 << 20): f.write(chunk)
        print("saved", name)
else:
    print("Not unlocked. Buy it in Matterport Cloud, or use the unlockModelBundle mutation (charges your account).")