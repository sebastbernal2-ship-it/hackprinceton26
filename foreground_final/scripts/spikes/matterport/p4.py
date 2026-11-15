from mp import *
M=sys.argv[1:] or ["GpFkvxKtRrp","W34F8paqUAG","wz3SzWEPXar"]
P={
 "basic":"id name created modified visibility accessVisibility state description",
 "address":"address{ __typename }",
 "dims":"dimensions(units:imperial){ areaFloor width depth height units }",
 "dimEst":"dimensionEstimates(units:imperial){ area areaIndoor width depth height units }",
 "floors":"floors{ id label sequence dimensionEstimates(units:imperial){area} }",
 "rooms":"rooms{ id label tags classifications{label confidence} dimensionEstimates(units:imperial){area width depth height} floor{id} }",
 "roomBoundary":"rooms{ id boundary{ edges{ vertices{ position{x y} } } } }",
 "floorVerts":"floors{ id vertices{ id position{x y} } edges{ id type thickness } }",
 "panoLocations":"panoLocations{ id label position{x y z} rotation{x y z w} floor{id} }",
 "skybox":"panoLocations{ id skybox(resolution:\"2k\"){ __typename } }",
 "panoImages":"panoLocations{ id image(resolution:\"high\"){ __typename } }",
 "photos":"assets{ photos{ id name label width height url downloadUrl type snapshotLocation{ position{x y z} } } }",
 "floorplans":"assets{ floorplans{ id format floor{id} url width height resolution origin{x y} provider flags } }",
 "meshes":"assets{ meshes{ id format resolution url } }",
 "textures":"assets{ textures{ id quality resolution url urlTemplate } }",
 "resources":"assets{ resources{ id filename format url } }",
 "clips":"assets{ clips{ id url } }",
 "mattertags":"mattertags{ id label description anchorPosition{x y z} stemNormal{x y z} color floor{id} }",
 "labels":"labels{ id label position{x y z} }",
 "locations":"locations{ id label position{x y z} room{id label} floor{id} }",
 "objectAnnotations":"objectAnnotations{ id label confidence classification{ __typename } room{id} }",
 "generatedDescription":"generatedDescription{ summary description }",
 "bundles":"bundles{ id name availability description }",
 "publication":"publication{ published url address summary }",
 "image":"image{ id url width height }",
 "views":"views{ id name type enabled }",
 "roomClassifications":"roomClassifications{ id label }",
 "inferenceEvents":"inferenceEvents{ __typename }",
 "propertyClassifications":"propertyClassifications{ __typename }",
}
out={}
for m in M:
    out[m]={}
    for k,f in P.items():
        s,r=gql('query($id:ID!){ model(id:$id){ %s } }'%f,{"id":m})
        st="OK" if r.get("data") and r["data"].get("model") and not r.get("errors") else ("PARTIAL" if r.get("data") and r["data"].get("model") else "ERR")
        errs=[e.get("message","")[:160]+" "+json.dumps(e.get("extensions",{}))[:100] for e in r.get("errors",[])]
        out[m][k]={"status":s,"st":st,"errors":errs,"data":(r.get("data") or {}).get("model")}
        d=json.dumps(out[m][k]["data"])
        print(m,k,s,st,len(d),scrub(d)[:220]," | ".join(errs)[:260])
json.dump(json.loads(scrub(json.dumps(out))),open("probe_fields.json","w"),indent=1)
