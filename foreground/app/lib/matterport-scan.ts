import { requireKey } from "./server-env";

const GRAPH = "https://api.matterport.com/api/models/graph";
const MESH_LIMIT = 20 * 1024 * 1024;

export type ScanFloorplan = {
  format: string;
  flags: string[];
  originX: number;
  originY: number;
  width: number;
  height: number;
  resolution: number;
  floorLabel: string;
  bytes: Buffer;
  contentType: string;
};

export type ScanMesh = {
  filename: string;
  format: string;
  bytes: Buffer;
  contentType: string;
};

export type ScanRecord = {
  modelId: string;
  floorplan: ScanFloorplan | null;
  mesh: ScanMesh | null;
  note: string;
};

type FloorplanNode = {
  floor?: { label?: string | null } | null;
  format?: string | null;
  flags?: string[] | null;
  url?: string | null;
  origin?: { x?: number | null; y?: number | null } | null;
  width?: number | null;
  height?: number | null;
  resolution?: number | null;
};

type AssetNode = {
  filename?: string | null;
  format?: string | null;
  status?: string | null;
  url?: string | null;
  resolution?: string | null;
};

const records = new Map<string, Promise<ScanRecord>>();

const FLOORPLAN_QUERY = `
  query Floorplans($modelId: ID!) {
    model(id: $modelId) {
      assets {
        floorplans(provider: "matterport", flags: [photogramy]) {
          floor { label sequence }
          format
          flags
          url
          origin { x y }
          width
          height
          resolution
        }
      }
    }
  }
`;

const MESH_QUERY = `
  query Meshes($modelId: ID!) {
    model(id: $modelId) {
      assets {
        meshes {
          format
          resolution
          status
          filename
          url
        }
      }
      bundles {
        id
        availability
        assets { filename format status url }
      }
    }
  }
`;

export function loadScan(modelId: string): Promise<ScanRecord> {
  const existing = records.get(modelId);
  if (existing) return existing;
  const pending = readScan(modelId);
  if (records.size >= 50) records.delete(records.keys().next().value as string);
  records.set(modelId, pending);
  pending.catch(() => records.delete(modelId));
  return pending;
}

async function readScan(modelId: string): Promise<ScanRecord> {
  const data = await graphql<{ model?: { assets?: { floorplans?: FloorplanNode[] } } }>(FLOORPLAN_QUERY, modelId);
  const chosen = pickFloorplan(data.model?.assets?.floorplans ?? []);
  const floorplan = chosen ? await downloadFloorplan(chosen) : null;
  const mesh = await readUnlockedMesh(modelId);
  const note = floorplan
    ? mesh
      ? "Floorplan and an already-unlocked mesh."
      : "Floorplan only. No mesh bundle is unlocked, and none was purchased."
    : "This model did not return a photogrammetry floorplan.";
  return { modelId, floorplan, mesh, note };
}

function pickFloorplan(plans: FloorplanNode[]): FloorplanNode | null {
  const ready = plans.filter((plan) => plan.url && plan.width && plan.height);
  return (
    ready.find((plan) => plan.format === "jpg" && plan.flags?.length === 1 && plan.flags[0] === "photogramy") ??
    ready.find((plan) => plan.format === "jpg" && plan.flags?.includes("colored_rooms") && !plan.flags?.includes("alpha")) ??
    ready.find((plan) => plan.format === "jpg" && !plan.flags?.includes("alpha")) ??
    ready.find((plan) => !plan.flags?.includes("alpha")) ??
    ready[0] ??
    null
  );
}

async function downloadFloorplan(plan: FloorplanNode): Promise<ScanFloorplan> {
  const response = await fetch(plan.url!, { cache: "no-store" });
  if (!response.ok) throw new Error(`Floorplan download failed (${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 12 * 1024 * 1024) throw new Error("Floorplan image is larger than the 12 MB limit.");
  const format = (plan.format || "jpg").toLowerCase();
  return {
    format,
    flags: plan.flags ?? [],
    originX: plan.origin?.x ?? 0,
    originY: plan.origin?.y ?? 0,
    width: plan.width ?? 0,
    height: plan.height ?? 0,
    resolution: plan.resolution && plan.resolution > 0 ? plan.resolution : 100,
    floorLabel: plan.floor?.label || "Floor 1",
    bytes,
    contentType: format === "png" ? "image/png" : "image/jpeg",
  };
}

async function readUnlockedMesh(modelId: string): Promise<ScanMesh | null> {
  try {
    const data = await graphql<{
      model?: {
        assets?: { meshes?: AssetNode[] };
        bundles?: { id?: string; availability?: string; assets?: AssetNode[] }[];
      };
    }>(MESH_QUERY, modelId);
    const meshes = data.model?.assets?.meshes ?? [];
    const unlocked = (data.model?.bundles ?? []).filter((bundle) => /unlock|available/i.test(bundle.availability || ""));
    const candidates = [
      ...meshes,
      ...unlocked.flatMap((bundle) => bundle.assets ?? []),
    ].filter((asset) => asset.url && meshKind(asset));
    const preferred =
      candidates.find((asset) => meshKind(asset) === "obj") ??
      candidates.find((asset) => meshKind(asset) === "gltf") ??
      candidates[0];
    if (!preferred?.url) return null;
    return downloadMesh(preferred);
  } catch {
    return null;
  }
}

function meshKind(asset: AssetNode): "obj" | "gltf" | "cloud" | null {
  const name = `${asset.format || ""} ${asset.filename || ""} ${asset.url || ""}`.toLowerCase();
  if (/\.obj\b|obj/.test(name) && !/object/.test(asset.format || "")) return "obj";
  if (/\.glb\b|\.gltf\b|gltf|glb/.test(name)) return "gltf";
  if (/\.xyz\b|\.ply\b|\.e57\b|\.las\b|point.?cloud|e57/.test(name)) return "cloud";
  if ((asset.format || "").toLowerCase() === "obj") return "obj";
  return null;
}

async function downloadMesh(asset: AssetNode): Promise<ScanMesh | null> {
  const response = await fetch(asset.url!, { cache: "no-store" });
  if (!response.ok) return null;
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MESH_LIMIT) return null;
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MESH_LIMIT) return null;
  const format = meshKind(asset) || "obj";
  const filename = asset.filename || `scan.${format === "gltf" ? "glb" : format === "cloud" ? "xyz" : "obj"}`;
  const contentType = format === "gltf" ? "model/gltf-binary" : format === "cloud" ? "text/plain" : "model/obj";
  return { filename, format, bytes, contentType };
}

async function graphql<T>(query: string, modelId: string): Promise<T> {
  const key = requireKey("MATTERPORT_API_KEY");
  const token = requireKey("MATTERPORT_API_TOKEN");
  const response = await fetch(GRAPH, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${key}:${token}`).toString("base64")}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query, variables: { modelId } }),
    cache: "no-store",
  });
  const body = (await response.json()) as { data?: T; errors?: { message?: string }[] };
  if (!response.ok || body.errors?.length || !body.data) {
    throw new Error(body.errors?.[0]?.message || `Matterport request failed (${response.status}).`);
  }
  return body.data;
}
