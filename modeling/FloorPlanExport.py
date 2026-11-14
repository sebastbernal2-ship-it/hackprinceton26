# pip install requests
from ast import arg
import os, sys, pathlib, requests

MATTERPORT_API_KEY = os.environ["MATTERPORT_API_KEY"]          # keep keys out of source code
MATTERPORT_API_TOKEN = os.environ["MATTERPORT_API_TOKEN"]
ENDPOINT = "https://api.matterport.com/api/models/graph"
AUTH = (MATTERPORT_API_KEY, MATTERPORT_API_TOKEN)               # HTTP Basic: Token ID = user, Secret = password

def gql(query, variables=None):
    r = requests.post(ENDPOINT, json={"query": query, "variables": variables or {}},
                      auth=AUTH, timeout=60)
    r.raise_for_status()
    body = r.json()
    if "errors" in body:
        raise RuntimeError(body["errors"])
    return body["data"]

LIST_MODELS = """
query($offset: String) {
  models(query: "*", offset: $offset) {
    totalResults
    nextOffset
    results { id name }
  }
}"""

FLOORPLANS = """
query($id: ID!) {
  model(id: $id) {
    id
    name
    assets {
      floorplans {
        id status format filename url validUntil provider
        width height resolution
        floor { id }
      }
    }
  }
}"""

def all_models():
    offset = None
    while True:
        page = gql(LIST_MODELS, {"offset": offset})["models"]
        yield from page["results"]
        offset = page.get("nextOffset")
        if not offset:
            break

def download_floorplan(model_id, out_dir="floorplans"):
    model = gql(FLOORPLANS, {"id": model_id})["model"]
    plans = model["assets"]["floorplans"]
    if not plans:
        print(f"{model_id} ({model['name']}): no floor plan ordered/delivered")
    folder = pathlib.Path(out_dir) / model_id
    folder.mkdir(parents=True, exist_ok=True)
    for fp in plans:
        if not fp["url"]:                 # still processing, or no permission
            print(f"  {fp['id']}: status={fp['status']}, no URL yet")
            continue
        name = fp["filename"] or f"{fp['id']}.{fp['format'].lower()}"
        data = requests.get(fp["url"], timeout=120)   # signed URL, no auth header
        data.raise_for_status()
        (folder / name).write_bytes(data.content)
        print(f"  saved {folder / name}")

if __name__ == "__main__":
    model_id = "zvKHR9DHNjJ"  # default for testing
    download_floorplan(model_id)