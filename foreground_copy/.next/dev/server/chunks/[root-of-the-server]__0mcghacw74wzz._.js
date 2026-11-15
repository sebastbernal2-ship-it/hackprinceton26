module.exports = [
"[externals]/crypto [external] (crypto, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("crypto", () => require("crypto"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/action-async-storage.external.js [external] (next/dist/server/app-render/action-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/action-async-storage.external.js", () => require("next/dist/server/app-render/action-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/runtime-reacts.external.js [external] (next/dist/server/runtime-reacts.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/runtime-reacts.external.js", () => require("next/dist/server/runtime-reacts.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/node:fs [external] (node:fs, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("node:fs", () => require("node:fs"));

module.exports = mod;
}),
"[externals]/node:path [external] (node:path, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("node:path", () => require("node:path"));

module.exports = mod;
}),
"[externals]/node:stream [external] (node:stream, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("node:stream", () => require("node:stream"));

module.exports = mod;
}),
"[externals]/path [external] (path, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("path", () => require("path"));

module.exports = mod;
}),
"[project]/app/api/scan/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$matterport$2d$scan$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/lib/matterport-scan.ts [app-route] (ecmascript)");
;
;
async function GET(request) {
    const url = new URL(request.url);
    const modelId = url.searchParams.get("modelId") || "";
    if (!/^[A-Za-z0-9_-]{4,40}$/.test(modelId)) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "Unknown model."
        }, {
            status: 400
        });
    }
    try {
        const scan = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$matterport$2d$scan$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["loadScan"])(modelId);
        const asset = url.searchParams.get("asset");
        if (asset === "floorplan") {
            if (!scan.floorplan) return new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"]("No floorplan", {
                status: 404
            });
            return new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"](new Uint8Array(scan.floorplan.bytes), {
                headers: {
                    "content-type": scan.floorplan.contentType,
                    "cache-control": "private, max-age=3600"
                }
            });
        }
        if (asset === "mesh") {
            if (!scan.mesh) return new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"]("No mesh", {
                status: 404
            });
            return new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"](new Uint8Array(scan.mesh.bytes), {
                headers: {
                    "content-type": scan.mesh.contentType,
                    "cache-control": "private, max-age=3600"
                }
            });
        }
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            modelId,
            floorplan: scan.floorplan ? {
                href: `/api/scan?modelId=${modelId}&asset=floorplan`,
                originX: scan.floorplan.originX,
                originY: scan.floorplan.originY,
                width: scan.floorplan.width,
                height: scan.floorplan.height,
                resolution: scan.floorplan.resolution,
                flags: scan.floorplan.flags,
                floor: scan.floorplan.floorLabel
            } : null,
            mesh: scan.mesh ? {
                filename: scan.mesh.filename,
                format: scan.mesh.format,
                bytes: scan.mesh.bytes.length
            } : null,
            note: scan.note
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Could not read the scan.";
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: message
        }, {
            status: 502
        });
    }
}
}),
"[project]/app/lib/matterport-scan.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "loadScan",
    ()=>loadScan
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$server$2d$env$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/lib/server-env.ts [app-route] (ecmascript)");
;
const GRAPH = "https://api.matterport.com/api/models/graph";
const MESH_LIMIT = 20 * 1024 * 1024;
const records = new Map();
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
function loadScan(modelId) {
    const existing = records.get(modelId);
    if (existing) return existing;
    const pending = readScan(modelId);
    records.set(modelId, pending);
    pending.catch(()=>records.delete(modelId));
    return pending;
}
async function readScan(modelId) {
    const data = await graphql(FLOORPLAN_QUERY, modelId);
    const chosen = pickFloorplan(data.model?.assets?.floorplans ?? []);
    const floorplan = chosen ? await downloadFloorplan(chosen) : null;
    const mesh = await readUnlockedMesh(modelId);
    const note = floorplan ? mesh ? "Floorplan and an already-unlocked mesh." : "Floorplan only. No mesh bundle is unlocked, and none was purchased." : "This model did not return a photogrammetry floorplan.";
    return {
        modelId,
        floorplan,
        mesh,
        note
    };
}
function pickFloorplan(plans) {
    const ready = plans.filter((plan)=>plan.url && plan.width && plan.height);
    return ready.find((plan)=>plan.format === "jpg" && plan.flags?.length === 1 && plan.flags[0] === "photogramy") ?? ready.find((plan)=>plan.format === "jpg" && plan.flags?.includes("colored_rooms") && !plan.flags?.includes("alpha")) ?? ready.find((plan)=>plan.format === "jpg" && !plan.flags?.includes("alpha")) ?? ready.find((plan)=>!plan.flags?.includes("alpha")) ?? ready[0] ?? null;
}
async function downloadFloorplan(plan) {
    const response = await fetch(plan.url, {
        cache: "no-store"
    });
    if (!response.ok) throw new Error(`Floorplan download failed (${response.status}).`);
    const bytes = Buffer.from(await response.arrayBuffer());
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
        contentType: format === "png" ? "image/png" : "image/jpeg"
    };
}
async function readUnlockedMesh(modelId) {
    try {
        const data = await graphql(MESH_QUERY, modelId);
        const meshes = data.model?.assets?.meshes ?? [];
        const unlocked = (data.model?.bundles ?? []).filter((bundle)=>/unlock|available/i.test(bundle.availability || ""));
        const candidates = [
            ...meshes,
            ...unlocked.flatMap((bundle)=>bundle.assets ?? [])
        ].filter((asset)=>asset.url && meshKind(asset));
        const preferred = candidates.find((asset)=>meshKind(asset) === "obj") ?? candidates.find((asset)=>meshKind(asset) === "gltf") ?? candidates[0];
        if (!preferred?.url) return null;
        return downloadMesh(preferred);
    } catch  {
        return null;
    }
}
function meshKind(asset) {
    const name = `${asset.format || ""} ${asset.filename || ""} ${asset.url || ""}`.toLowerCase();
    if (/\.obj\b|obj/.test(name) && !/object/.test(asset.format || "")) return "obj";
    if (/\.glb\b|\.gltf\b|gltf|glb/.test(name)) return "gltf";
    if (/\.xyz\b|\.ply\b|\.e57\b|\.las\b|point.?cloud|e57/.test(name)) return "cloud";
    if ((asset.format || "").toLowerCase() === "obj") return "obj";
    return null;
}
async function downloadMesh(asset) {
    const response = await fetch(asset.url, {
        cache: "no-store"
    });
    if (!response.ok) return null;
    const length = Number(response.headers.get("content-length") || 0);
    if (length > MESH_LIMIT) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MESH_LIMIT) return null;
    const format = meshKind(asset) || "obj";
    const filename = asset.filename || `scan.${format === "gltf" ? "glb" : format === "cloud" ? "xyz" : "obj"}`;
    const contentType = format === "gltf" ? "model/gltf-binary" : format === "cloud" ? "text/plain" : "model/obj";
    return {
        filename,
        format,
        bytes,
        contentType
    };
}
async function graphql(query, modelId) {
    const key = (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$server$2d$env$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["serverEnv"])("MATTERPORT_API_KEY");
    const token = (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$server$2d$env$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["serverEnv"])("MATTERPORT_API_TOKEN");
    if (!key || !token) throw new Error("Matterport API credentials are missing on the server.");
    const response = await fetch(GRAPH, {
        method: "POST",
        headers: {
            authorization: `Basic ${Buffer.from(`${key}:${token}`).toString("base64")}`,
            "content-type": "application/json"
        },
        body: JSON.stringify({
            query,
            variables: {
                modelId
            }
        }),
        cache: "no-store"
    });
    const body = await response.json();
    if (!response.ok || body.errors?.length || !body.data) {
        throw new Error(body.errors?.[0]?.message || `Matterport request failed (${response.status}).`);
    }
    return body.data;
}
}),
"[project]/app/lib/server-env.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "serverEnv",
    ()=>serverEnv
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$fs__$5b$external$5d$__$28$node$3a$fs$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/node:fs [external] (node:fs, cjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$path__$5b$external$5d$__$28$node$3a$path$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/node:path [external] (node:path, cjs)");
;
;
let loaded = false;
function serverEnv(name) {
    if (!loaded) {
        loaded = true;
        const files = [
            __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$path__$5b$external$5d$__$28$node$3a$path$2c$__cjs$29$__["default"].join(process.cwd(), ".env.local"),
            __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$path__$5b$external$5d$__$28$node$3a$path$2c$__cjs$29$__["default"].join(process.cwd(), ".env"),
            __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$path__$5b$external$5d$__$28$node$3a$path$2c$__cjs$29$__["default"].join(process.cwd(), "..", ".env")
        ];
        for (const file of files){
            if (!(0, __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$fs__$5b$external$5d$__$28$node$3a$fs$2c$__cjs$29$__["existsSync"])(file)) continue;
            for (const line of (0, __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$fs__$5b$external$5d$__$28$node$3a$fs$2c$__cjs$29$__["readFileSync"])(file, "utf8").split("\n")){
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith("#")) continue;
                const eq = trimmed.indexOf("=");
                if (eq <= 0) continue;
                const key = trimmed.slice(0, eq).trim();
                if (process.env[key]) continue;
                let value = trimmed.slice(eq + 1).trim();
                if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
                    value = value.slice(1, -1);
                }
                process.env[key] = value;
            }
        }
    }
    const value = process.env[name];
    return value && value.length > 0 ? value : undefined;
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__0mcghacw74wzz._.js.map