from mp import *
q='query($id:ID!){ model(id:$id){ id name created modified visibility discoverable state } }'
for auth in ("basic","bearer"):
    for m in ["GpFkvxKtRrp","W34F8paqUAG","wz3SzWEPXar","oNAvrNiXZS7"]:
        s,r=gql(q,{"id":m},auth); print(auth,m,s,scrub(json.dumps(r))[:400])
