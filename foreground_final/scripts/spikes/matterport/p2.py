from mp import *
q='{ __schema { queryType{name} types { name kind fields(includeDeprecated:true){ name args{name} type{ name kind ofType{name kind ofType{name kind ofType{name}}}} } } } }'
s,r=gql(q); print(s, list(r.keys()))
json.dump(r,open("schema.json","w"),indent=1)
def tn(t):
    while t and not t.get("name"): t=t.get("ofType")
    return t and t["name"]
T={t["name"]:t for t in r["data"]["__schema"]["types"]}
for n in ["Query","Model","Floor","Room","Asset","Image","ModelAssets","Mattertag","Panorama","Location","DimensionEstimates","Dimension"]:
    if n in T and T[n]["fields"]: print(n,":",", ".join(f["name"]+"("+",".join(a["name"] for a in f["args"])+")->"+str(tn(f["type"])) for f in T[n]["fields"]))
