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
"[project]/app/api/layout-agent/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "POST",
    ()=>POST
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$layout$2d$gemini$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/lib/layout-gemini.ts [app-route] (ecmascript)");
;
;
async function POST(request) {
    const body = await request.json().catch(()=>null);
    const message = body?.message?.trim() || "";
    if (!message) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        error: "Say what should change."
    }, {
        status: 400
    });
    try {
        const decision = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$layout$2d$gemini$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["decideLayout"])({
            message,
            mode: body?.mode === "foreground" ? "foreground" : "matterport",
            rooms: Array.isArray(body?.rooms) ? body.rooms : [],
            placed: Array.isArray(body?.placed) ? body.placed : [],
            total: Number(body?.total) || 0
        });
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(decision);
    } catch (error) {
        const reply = error instanceof Error ? error.message : "The layout agent is unavailable.";
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: reply
        }, {
            status: 502
        });
    }
}
}),
"[project]/app/lib/layout-catalog.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "CATALOG",
    ()=>CATALOG,
    "EXTEND_PRICE_PER_METER",
    ()=>EXTEND_PRICE_PER_METER,
    "REMOVE_ROOM_PRICE",
    ()=>REMOVE_ROOM_PRICE,
    "findCatalogItem",
    ()=>findCatalogItem,
    "money",
    ()=>money
]);
const CATALOG = [
    {
        id: "dining-table",
        label: "Dining table",
        kind: "table",
        width: 1.8,
        depth: 0.9,
        price: 1400
    },
    {
        id: "chair",
        label: "Chair",
        kind: "chair",
        width: 0.5,
        depth: 0.5,
        price: 180
    },
    {
        id: "sofa",
        label: "Sofa",
        kind: "sofa",
        width: 2.1,
        depth: 0.9,
        price: 2200
    },
    {
        id: "counter",
        label: "Service counter",
        kind: "counter",
        width: 2.4,
        depth: 0.7,
        price: 3200
    }
];
const REMOVE_ROOM_PRICE = 2500;
const EXTEND_PRICE_PER_METER = 800;
function money(value) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0
    }).format(value);
}
function findCatalogItem(name) {
    const key = name.toLowerCase().replace(/[_ ]+/g, "-");
    return CATALOG.find((item)=>item.id === key || item.label.toLowerCase() === name.toLowerCase()) ?? CATALOG.find((item)=>item.id.includes(key) || key.includes(item.kind)) ?? null;
}
}),
"[project]/app/lib/layout-fit.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "catalogPrompt",
    ()=>catalogPrompt,
    "findRoom",
    ()=>findRoom,
    "labelsMatch",
    ()=>labelsMatch,
    "pieceFits",
    ()=>pieceFits,
    "summarizeRooms",
    ()=>summarizeRooms
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$layout$2d$catalog$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/lib/layout-catalog.ts [app-route] (ecmascript)");
;
const CLEARANCE = 0.6;
function summarizeRooms(rooms) {
    return rooms.filter((room)=>!room.absorbed && room.w > 0.4 && room.d > 0.4).map((room)=>({
            id: room.id,
            label: room.label,
            width: round(room.w),
            depth: round(room.d),
            area: round(room.w * room.d)
        }));
}
function findRoom(rooms, name) {
    const needle = name.toLowerCase();
    const hits = rooms.filter((room)=>labelsMatch(room.label, needle));
    return hits.sort((left, right)=>right.area - left.area)[0] ?? null;
}
function pieceFits(room, item, already) {
    const used = already.filter((piece)=>labelsMatch(piece.room, room.label)).reduce((sum, piece)=>sum + piece.width + CLEARANCE, 0);
    const freeWidth = room.width - CLEARANCE - used;
    const freeDepth = room.depth - CLEARANCE;
    const along = item.width <= freeWidth && item.depth <= freeDepth || item.depth <= freeWidth && item.width <= freeDepth;
    if (along) return {
        ok: true
    };
    return {
        ok: false,
        reply: `A ${item.label.toLowerCase()} is ${item.width} m by ${item.depth} m. ${room.label} is ${room.width.toFixed(1)} m by ${room.depth.toFixed(1)} m, so it does not fit.`
    };
}
function catalogPrompt() {
    return __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$layout$2d$catalog$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["CATALOG"].map((item)=>`${item.id}: ${item.label}, ${item.width} m by ${item.depth} m, ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$layout$2d$catalog$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["money"])(item.price)}`).join("\n");
}
function labelsMatch(label, query) {
    const left = label.toLowerCase();
    const right = query.toLowerCase();
    if (left.includes(right) || right.includes(left)) return true;
    if (/bath|restroom/.test(left) && /bath|restroom/.test(right)) return true;
    if (/dining|living/.test(left) && /dining|living/.test(right)) return true;
    return false;
}
function round(value) {
    return Math.round(value * 10) / 10;
}
}),
"[project]/app/lib/layout-gemini.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "decideLayout",
    ()=>decideLayout
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$layout$2d$catalog$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/lib/layout-catalog.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$layout$2d$fit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/lib/layout-fit.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$server$2d$env$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/lib/server-env.ts [app-route] (ecmascript)");
;
;
;
const MODELS = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-flash-latest"
];
async function decideLayout(input) {
    const raw = await askGemini(promptFor(input));
    return resolveDecision(raw, input);
}
function promptFor(input) {
    const rooms = input.rooms.map((room)=>`${room.label}: ${room.width} m by ${room.depth} m, ${room.area} m²`).join("\n") || "No measured rooms yet.";
    const placed = input.placed.map((piece)=>`${piece.item} in ${piece.room}, ${piece.width} m by ${piece.depth} m`).join("\n") || "Nothing placed yet.";
    return `You are the layout agent for a restaurant space. Decide what this sentence asks for. Return JSON only, with one of these shapes:
{"action":"add","item":"dining-table","room":"Main Dining Room","reply":"short sentence"}
{"action":"remove-room","room":"Bath","reply":"short sentence"}
{"action":"extend","room":"Kitchen","into":"Bath","meters":1.6,"reply":"short sentence"}
{"action":"none","reply":"short sentence"}

Rules:
- item must be one of the catalog ids. Do not invent a size or a price.
- room and into must be a room name from the list below.
- extend meters is between 0.5 and 2.
- Use add for furniture. If they ask for several of one piece, still return one add for that item.
- Use remove-room when the user wants a room or its walls gone, including a bathroom or freezer. Use extend when they want one room to take space from another, including a bigger kitchen. If they do not name the room to take space from, set into to the smallest different room and meters to 1.6.
- Use none when the sentence is not one of those changes.
- The reply is one or two sentences. Do not mention the catalog ids.

Mode: ${input.mode}
Running total: ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$layout$2d$catalog$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["money"])(input.total)}
Removing a room costs ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$layout$2d$catalog$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["money"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$layout$2d$catalog$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["REMOVE_ROOM_PRICE"])}. Extending a room costs ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$layout$2d$catalog$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["money"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$layout$2d$catalog$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["EXTEND_PRICE_PER_METER"])} per meter.

Catalog:
${(0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$layout$2d$fit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["catalogPrompt"])()}

Rooms:
${rooms}

Already placed:
${placed}

User: ${input.message}`;
}
function resolveDecision(raw, input) {
    const action = String(raw.action || "none");
    const reply = String(raw.reply || "").trim();
    if (action === "add") {
        const item = (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$layout$2d$catalog$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["findCatalogItem"])(String(raw.item || ""));
        if (!item) return {
            reply: reply || "That piece is not in the catalog.",
            total: input.total,
            action: {
                type: "none"
            }
        };
        const room = (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$layout$2d$fit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["findRoom"])(input.rooms, String(raw.room || "")) ?? largestRoom(input.rooms);
        if (!room) return {
            reply: "I need a measured room before I can place that.",
            total: input.total,
            action: {
                type: "none"
            }
        };
        const fit = (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$layout$2d$fit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["pieceFits"])(room, item, input.placed);
        if (!fit.ok) return {
            reply: fit.reply,
            total: input.total,
            action: {
                type: "none"
            }
        };
        const total = input.total + item.price;
        return {
            reply: finishReply(reply || `Placed a ${item.label.toLowerCase()} in ${room.label}. It is ${item.width} m by ${item.depth} m.`, total),
            total,
            action: {
                type: "add",
                item,
                room: room.label
            }
        };
    }
    if (action === "remove-room" || action === "extend") {
        if (input.mode === "matterport") {
            return {
                reply: "Wall changes happen in Foreground Tour. Switch to that toggle and ask again.",
                total: input.total,
                action: {
                    type: "none"
                }
            };
        }
        if (action === "remove-room") {
            const room = (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$layout$2d$fit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["findRoom"])(input.rooms, String(raw.room || ""));
            if (!room) return {
                reply: reply || "I can't find that room on this plan.",
                total: input.total,
                action: {
                    type: "none"
                }
            };
            const total = input.total + __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$layout$2d$catalog$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["REMOVE_ROOM_PRICE"];
            return {
                reply: finishReply(reply || `Took down the walls around ${room.label}.`, total),
                total,
                action: {
                    type: "structure",
                    edit: {
                        kind: "remove-room",
                        room: room.label
                    },
                    price: __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$layout$2d$catalog$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["REMOVE_ROOM_PRICE"]
                }
            };
        }
        const room = (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$layout$2d$fit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["findRoom"])(input.rooms, String(raw.room || ""));
        const into = (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$layout$2d$fit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["findRoom"])(input.rooms, String(raw.into || ""));
        const meters = Math.max(0.5, Math.min(2, Number(raw.meters) || 1.6));
        if (!room || !into || room.id === into.id) {
            return {
                reply: reply || "I need two different rooms on this plan before I can move that wall.",
                total: input.total,
                action: {
                    type: "none"
                }
            };
        }
        const price = Math.round(meters * __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$layout$2d$catalog$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["EXTEND_PRICE_PER_METER"]);
        const total = input.total + price;
        return {
            reply: finishReply(reply || `Extended ${room.label} by ${meters.toFixed(1)} m into ${into.label}.`, total),
            total,
            action: {
                type: "structure",
                edit: {
                    kind: "extend",
                    room: room.label,
                    into: into.label,
                    meters
                },
                price
            }
        };
    }
    return inferEdit(input, reply) ?? {
        reply: reply || "Tell me a piece to add, a room to remove, or a room to extend.",
        total: input.total,
        action: {
            type: "none"
        }
    };
}
function inferEdit(input, reply) {
    const message = input.message?.toLowerCase() || "";
    if (input.mode !== "foreground" || !input.rooms.length) return null;
    if (/remove|take down|get rid|delete/.test(message)) {
        const room = namedRoom(input.rooms, message);
        if (!room) return null;
        const total = input.total + __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$layout$2d$catalog$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["REMOVE_ROOM_PRICE"];
        return {
            reply: finishReply(reply || `Took down the walls around ${room.label}.`, total),
            total,
            action: {
                type: "structure",
                edit: {
                    kind: "remove-room",
                    room: room.label
                },
                price: __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$layout$2d$catalog$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["REMOVE_ROOM_PRICE"]
            }
        };
    }
    if (/extend|more space|bigger/.test(message)) {
        const room = namedRoom(input.rooms, message);
        const into = input.rooms.filter((entry)=>entry.id !== room?.id).sort((left, right)=>left.area - right.area)[0];
        if (!room || !into) return null;
        const meters = 1.6;
        const price = Math.round(meters * __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$layout$2d$catalog$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["EXTEND_PRICE_PER_METER"]);
        const total = input.total + price;
        return {
            reply: finishReply(`Extended ${room.label} by ${meters.toFixed(1)} m into ${into.label}.`, total),
            total,
            action: {
                type: "structure",
                edit: {
                    kind: "extend",
                    room: room.label,
                    into: into.label,
                    meters
                },
                price
            }
        };
    }
    return null;
}
function namedRoom(rooms, message) {
    return rooms.find((room)=>message.includes(room.label.toLowerCase())) ?? rooms.find((room)=>{
        const word = room.label.toLowerCase().replace(/^main\s+/, "").replace(/\s+room$/, "");
        return word.length > 2 && message.includes(word);
    }) ?? null;
}
function finishReply(reply, total) {
    return `${reply} Running total ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$layout$2d$catalog$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["money"])(total)}.`;
}
function largestRoom(rooms) {
    return rooms.slice().sort((left, right)=>right.area - left.area)[0] ?? null;
}
async function askGemini(prompt) {
    const key = (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$server$2d$env$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["serverEnv"])("GEMINI_API_KEY");
    if (!key) throw new Error("GEMINI_API_KEY is missing on the server.");
    let lastError = "Gemini did not return a layout decision.";
    for (const model of MODELS){
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-goog-api-key": key
            },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            {
                                text: prompt
                            }
                        ]
                    }
                ],
                generationConfig: {
                    temperature: 0.1,
                    responseMimeType: "application/json"
                }
            }),
            cache: "no-store"
        });
        if (response.status === 404) {
            lastError = `${model} is not available.`;
            continue;
        }
        const body = await response.json();
        if (!response.ok) {
            lastError = body.error?.message || `Gemini request failed (${response.status}).`;
            if (response.status === 400 || response.status === 401 || response.status === 403) break;
            continue;
        }
        const text = body.candidates?.[0]?.content?.parts?.map((part)=>part.text || "").join("\n") || "";
        const parsed = parseJson(text);
        if (parsed) return parsed;
        lastError = "Gemini did not return a layout decision.";
    }
    throw new Error(lastError);
}
function parseJson(text) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
        const value = JSON.parse(text.slice(start, end + 1));
        return value && typeof value === "object" ? value : null;
    } catch  {
        return null;
    }
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

//# sourceMappingURL=%5Broot-of-the-server%5D__1fg7hvk-sc97f._.js.map