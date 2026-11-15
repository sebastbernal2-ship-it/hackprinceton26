import json, csv
K=r"C:\Users\admin\Downloads\costar-hackathon-kit (3)"
ids={}
for r in csv.DictReader(open(K+r"\commercial-properties.csv",encoding="utf-8")): ids.setdefault(r["PropertyId"],[]).append(r["MatterportModelId"])
types={}
for line in open(K+r"\data\commercial-property.jsonl",encoding="utf-8"):
    p=json.loads(line); types[str(p["id"])]=(p.get("propertyType"),p.get("buildingName"))
ret=[(pid,m,types[pid]) for pid,m in ids.items() if pid in types and types[pid][0]==6]
print(len(ids),len(types),len(ret))
for x in ret[:8]: print(x)
from collections import Counter; print(Counter(t[0] for pid,t in types.items() if pid in ids))
