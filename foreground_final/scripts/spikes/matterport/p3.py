import json
r=json.load(open("schema.json"))
def tn(t):
    while t and not t.get("name"): t=t.get("ofType")
    return t and t["name"]
T={t["name"]:t for t in r["data"]["__schema"]["types"]}
for n in ["ModelFloor","ModelRoom","Dimensions","Photo","PhotoResolution","PanoramicImage","SnapshotLocation","BoundedRegion","Vertex","Edge","AnchorPosition","Pose","PanoramicImage","PanoramicImageLocation","Floorplan","Mesh","Texture","Point","Label","AnchorLocation","GeneratedModelDescription","ObjectAnnotation","ModelBundle","Clip","ScanEstimates","ModelView","RoomClassification","BoundingBox","Polygon","ModelLayer","ModelPublicationDetails"]:
    if n in T and T[n].get("fields"): print(n,":",", ".join(f["name"]+("("+",".join(a["name"] for a in f["args"])+")" if f["args"] else "")+"->"+str(tn(f["type"])) for f in T[n]["fields"]))
    elif n in T: print(n, T[n]["kind"])
