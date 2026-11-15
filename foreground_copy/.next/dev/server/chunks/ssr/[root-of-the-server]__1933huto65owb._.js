module.exports = [
"[externals]/next/dist/server/app-render/module-loading/track-module-loading.external.js [external] (next/dist/server/app-render/module-loading/track-module-loading.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/module-loading/track-module-loading.external.js", () => require("next/dist/server/app-render/module-loading/track-module-loading.external.js"));

module.exports = mod;
}),
"[project]/app/components/discover.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>Discover
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$image$2d$component$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__Image__as__default$3e$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/image-component.js [app-ssr] (ecmascript) <export Image as default>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$matches$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/lib/matches.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$discover$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/lib/discover.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$components$2f$tour$2d$overlay$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/components/tour-overlay.tsx [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
const number = new Intl.NumberFormat("en-US");
function Discover() {
    const matches = (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$discover$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMatches"])();
    const [tour, setTour] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                className: "animate-rise",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                        className: "text-[clamp(1.6rem,4vw,2.5rem)] font-medium leading-tight tracking-tight",
                        children: "Discover"
                    }, void 0, false, {
                        fileName: "[project]/app/components/discover.tsx",
                        lineNumber: 18,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "mt-2 text-foreground/50",
                        children: [
                            matches.length,
                            " spaces, best fit first."
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/components/discover.tsx",
                        lineNumber: 19,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/components/discover.tsx",
                lineNumber: 17,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                className: "mt-12 grid grid-cols-1 gap-x-10 gap-y-16 md:grid-cols-2",
                children: matches.map((match, index)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                        className: "animate-rise",
                        style: {
                            animationDelay: `${100 + index * 90}ms`
                        },
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
                            className: "group",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "relative aspect-[16/10] overflow-hidden rounded-[1.75rem] bg-foreground/5 shadow-[0_1px_0_rgb(27_26_23/0.04)] transition-[box-shadow,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-1 group-hover:shadow-[0_22px_50px_rgb(27_26_23/0.12)]",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$image$2d$component$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__Image__as__default$3e$__["default"], {
                                        src: match.photo,
                                        alt: `Exterior of ${match.address}`,
                                        fill: true,
                                        unoptimized: true,
                                        sizes: "(min-width: 768px) 50vw, 100vw",
                                        className: "object-cover transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04]"
                                    }, void 0, false, {
                                        fileName: "[project]/app/components/discover.tsx",
                                        lineNumber: 27,
                                        columnNumber: 17
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/app/components/discover.tsx",
                                    lineNumber: 26,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "mt-6 flex items-start justify-between gap-4",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "min-w-0",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "text-[clamp(1.4rem,2.4vw,1.85rem)] font-medium tracking-tight tabular-nums",
                                                    children: [
                                                        "$",
                                                        number.format((0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$matches$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["monthlyRent"])(match)),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "text-[0.55em] font-normal text-foreground/45",
                                                            children: "/mo"
                                                        }, void 0, false, {
                                                            fileName: "[project]/app/components/discover.tsx",
                                                            lineNumber: 41,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/app/components/discover.tsx",
                                                    lineNumber: 39,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "mt-1 text-sm text-foreground/50",
                                                    children: match.city
                                                }, void 0, false, {
                                                    fileName: "[project]/app/components/discover.tsx",
                                                    lineNumber: 43,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/app/components/discover.tsx",
                                            lineNumber: 38,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "shrink-0 rounded-full bg-match-soft px-3 py-1 text-sm font-medium tabular-nums text-match",
                                            children: [
                                                match.confidence,
                                                "% match"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/app/components/discover.tsx",
                                            lineNumber: 45,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/app/components/discover.tsx",
                                    lineNumber: 37,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "mt-4 max-w-md text-[0.95rem] leading-relaxed text-foreground/55",
                                    children: match.blurb
                                }, void 0, false, {
                                    fileName: "[project]/app/components/discover.tsx",
                                    lineNumber: 50,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "mt-2 text-sm text-foreground/40",
                                    children: [
                                        match.address,
                                        match.detail ? ` · ${match.detail}` : "",
                                        " · ",
                                        number.format(match.squareFeet),
                                        " sq ft"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/app/components/discover.tsx",
                                    lineNumber: 51,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: ()=>setTour(match),
                                    className: "mt-6 inline-flex items-center rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-[transform,opacity] duration-300 hover:opacity-90 active:scale-[0.98]",
                                    children: "Open Tour"
                                }, void 0, false, {
                                    fileName: "[project]/app/components/discover.tsx",
                                    lineNumber: 56,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/components/discover.tsx",
                            lineNumber: 25,
                            columnNumber: 13
                        }, this)
                    }, `${match.listingId}-${match.detail}`, false, {
                        fileName: "[project]/app/components/discover.tsx",
                        lineNumber: 24,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/app/components/discover.tsx",
                lineNumber: 22,
                columnNumber: 7
            }, this),
            tour && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$components$2f$tour$2d$overlay$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                tourId: tour.tourId,
                title: tour.address,
                detail: tour.detail,
                onClose: ()=>setTour(null)
            }, void 0, false, {
                fileName: "[project]/app/components/discover.tsx",
                lineNumber: 69,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/components/discover.tsx",
        lineNumber: 16,
        columnNumber: 5
    }, this);
}
}),
"[project]/app/components/tour-chat.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "TourGhosts",
    ()=>TourGhosts,
    "default",
    ()=>TourChat
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$tour$2d$agent$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/lib/tour-agent.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$tour$2d$scene$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/lib/tour-scene.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
const SUGGESTIONS = [
    "Add rug",
    "Move sofa left",
    "Warm lighting",
    "Minimal style"
];
const SLOTS = [
    {
        x: 22,
        y: 58
    },
    {
        x: 38,
        y: 66
    },
    {
        x: 14,
        y: 72
    },
    {
        x: 32,
        y: 48
    },
    {
        x: 26,
        y: 78
    }
];
function TourChat({ sdk, open, onOpenChange, pieces, onPiecesChange }) {
    const [messages, setMessages] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [value, setValue] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const listRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const inputRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const pieceSeq = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(0);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        listRef.current?.scrollTo({
            top: listRef.current.scrollHeight,
            behavior: "smooth"
        });
    }, [
        messages,
        open
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (open) inputRef.current?.focus();
    }, [
        open
    ]);
    function stage(kind, label) {
        const pieceId = `${kind}-${pieceSeq.current++}`;
        onPiecesChange((current)=>{
            const slot = SLOTS[current.length % SLOTS.length];
            const piece = {
                id: pieceId,
                kind,
                label,
                tagId: null,
                position: {
                    x: slot.x / 10,
                    y: 0.4,
                    z: slot.y / 10
                },
                stem: (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$tour$2d$scene$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["uprightStem"])(kind),
                screen: slot
            };
            return [
                ...current,
                piece
            ];
        });
        if (!sdk) return;
        void (async ()=>{
            const pose = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$tour$2d$scene$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["readPose"])(sdk);
            const frame = document.querySelector("iframe");
            const surface = frame ? await (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$tour$2d$scene$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["placeOnSurface"])(sdk, {
                x: frame.clientWidth / 2,
                y: frame.clientHeight * 0.66
            }, kind, pose.position) : null;
            const position = surface?.position ?? (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$tour$2d$scene$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["pointInFront"])(pose, kind === "wall" ? 2.8 : 2.1);
            const stem = surface?.stem ?? (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$tour$2d$scene$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["uprightStem"])(kind);
            const tagId = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$tour$2d$scene$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["placeInTour"])(sdk, {
                kind,
                label,
                position,
                stem
            });
            if (!tagId) return;
            onPiecesChange((current)=>current.map((item)=>item.id === pieceId ? {
                        ...item,
                        tagId,
                        position,
                        stem
                    } : item));
        })();
    }
    function slide(direction, meters) {
        const current = pieces[pieces.length - 1];
        if (!current) return;
        const screen = {
            x: Math.min(48, Math.max(10, current.screen.x + (direction === "left" ? -8 : direction === "right" ? 8 : 0))),
            y: Math.min(82, Math.max(36, current.screen.y + (direction === "forward" ? -7 : direction === "back" ? 7 : 0)))
        };
        const position = (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$tour$2d$scene$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["nudge"])(current.position, 0, direction, meters);
        onPiecesChange((list)=>list.map((piece)=>piece.id === current.id ? {
                    ...piece,
                    position,
                    screen
                } : piece));
        if (sdk && current.tagId) void (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$tour$2d$scene$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["moveInTour"])(sdk, current.tagId, position, current.stem);
    }
    function send(text) {
        const trimmed = text.trim();
        if (!trimmed) return;
        setValue("");
        const result = (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$tour$2d$agent$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["tourAgentReply"])(trimmed, pieces.length);
        if (result.action.type === "move") slide(result.action.direction, result.action.meters);
        else if (result.action.type === "add") stage(result.action.kind, result.action.label);
        setMessages((current)=>[
                ...current,
                {
                    role: "user",
                    text: trimmed
                },
                {
                    role: "agent",
                    text: result.reply
                }
            ]);
    }
    function submit(event) {
        event?.preventDefault();
        send(value);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: `absolute right-20 top-5 z-20 h-20 w-20 transition-opacity duration-300 ${open ? "pointer-events-none opacity-0" : ""}`,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "pointer-events-none absolute -inset-2 animate-agent-vibrate rounded-full border-2 border-accent",
                        "aria-hidden": true
                    }, void 0, false, {
                        fileName: "[project]/app/components/tour-chat.tsx",
                        lineNumber: 107,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "pointer-events-none absolute inset-0 animate-agent-ring rounded-full border-2 border-accent",
                        "aria-hidden": true
                    }, void 0, false, {
                        fileName: "[project]/app/components/tour-chat.tsx",
                        lineNumber: 108,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "pointer-events-none absolute inset-0 animate-agent-ring rounded-full border-2 border-accent/70 [animation-delay:0.55s]",
                        "aria-hidden": true
                    }, void 0, false, {
                        fileName: "[project]/app/components/tour-chat.tsx",
                        lineNumber: 109,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: ()=>onOpenChange(true),
                        "aria-label": "Open layout agent",
                        "aria-expanded": open,
                        className: "relative flex h-20 w-20 animate-agent-vibrate items-center justify-center rounded-full bg-accent text-background shadow-[0_14px_32px_rgb(0_0_0/0.35)]",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                            width: "40",
                            height: "40",
                            viewBox: "0 0 24 24",
                            fill: "none",
                            stroke: "currentColor",
                            strokeWidth: "1.6",
                            "aria-hidden": true,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                    d: "M12 3.5v2",
                                    strokeLinecap: "round"
                                }, void 0, false, {
                                    fileName: "[project]/app/components/tour-chat.tsx",
                                    lineNumber: 121,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                                    cx: "12",
                                    cy: "2.6",
                                    r: "1",
                                    fill: "currentColor",
                                    stroke: "none"
                                }, void 0, false, {
                                    fileName: "[project]/app/components/tour-chat.tsx",
                                    lineNumber: 122,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("rect", {
                                    x: "4.5",
                                    y: "6.5",
                                    width: "15",
                                    height: "12",
                                    rx: "4"
                                }, void 0, false, {
                                    fileName: "[project]/app/components/tour-chat.tsx",
                                    lineNumber: 123,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                                    cx: "9",
                                    cy: "12",
                                    r: "1",
                                    fill: "currentColor",
                                    stroke: "none"
                                }, void 0, false, {
                                    fileName: "[project]/app/components/tour-chat.tsx",
                                    lineNumber: 124,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                                    cx: "15",
                                    cy: "12",
                                    r: "1",
                                    fill: "currentColor",
                                    stroke: "none"
                                }, void 0, false, {
                                    fileName: "[project]/app/components/tour-chat.tsx",
                                    lineNumber: 125,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                    d: "M9 15.2h6",
                                    strokeLinecap: "round"
                                }, void 0, false, {
                                    fileName: "[project]/app/components/tour-chat.tsx",
                                    lineNumber: 126,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/components/tour-chat.tsx",
                            lineNumber: 120,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/app/components/tour-chat.tsx",
                        lineNumber: 113,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/components/tour-chat.tsx",
                lineNumber: 102,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
                "aria-hidden": !open,
                className: `absolute bottom-3 right-3 top-3 z-30 flex w-[min(calc(100%-1.5rem),24rem)] flex-col overflow-hidden rounded-[1.75rem] bg-background font-sans font-medium tracking-tight text-foreground shadow-[0_24px_60px_rgb(27_26_23/0.22)] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${open ? "translate-x-0" : "pointer-events-none translate-x-[110%]"}`,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex shrink-0 items-start gap-3 px-4 pb-2 pt-4",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-panel text-foreground",
                                "aria-hidden": true,
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                    width: "18",
                                    height: "18",
                                    viewBox: "0 0 24 24",
                                    fill: "none",
                                    stroke: "currentColor",
                                    strokeWidth: "1.7",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                            d: "M4 14v2.5A1.5 1.5 0 0 0 5.5 18H7",
                                            strokeLinecap: "round"
                                        }, void 0, false, {
                                            fileName: "[project]/app/components/tour-chat.tsx",
                                            lineNumber: 140,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                            d: "M17 18h1.5A1.5 1.5 0 0 0 20 16.5V14",
                                            strokeLinecap: "round"
                                        }, void 0, false, {
                                            fileName: "[project]/app/components/tour-chat.tsx",
                                            lineNumber: 141,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                            d: "M4 13.5C4 10 6.5 8 9 8h6c2.5 0 5 2 5 5.5V14H4v-.5z"
                                        }, void 0, false, {
                                            fileName: "[project]/app/components/tour-chat.tsx",
                                            lineNumber: 142,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                            d: "M7 8V6.5A1.5 1.5 0 0 1 8.5 5h7A1.5 1.5 0 0 1 17 6.5V8"
                                        }, void 0, false, {
                                            fileName: "[project]/app/components/tour-chat.tsx",
                                            lineNumber: 143,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/app/components/tour-chat.tsx",
                                    lineNumber: 139,
                                    columnNumber: 13
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/app/components/tour-chat.tsx",
                                lineNumber: 138,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "min-w-0 flex-1 pt-0.5",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-lg leading-tight",
                                        children: "Layout agent"
                                    }, void 0, false, {
                                        fileName: "[project]/app/components/tour-chat.tsx",
                                        lineNumber: 147,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "mt-0.5 text-sm text-foreground/45",
                                        children: "Restage this room live as you type"
                                    }, void 0, false, {
                                        fileName: "[project]/app/components/tour-chat.tsx",
                                        lineNumber: 148,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/components/tour-chat.tsx",
                                lineNumber: 146,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                onClick: ()=>onOpenChange(false),
                                "aria-label": "Close layout agent",
                                className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-panel text-foreground transition-colors hover:bg-foreground/10",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                    width: "14",
                                    height: "14",
                                    viewBox: "0 0 14 14",
                                    fill: "none",
                                    stroke: "currentColor",
                                    strokeWidth: "1.7",
                                    "aria-hidden": true,
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                        d: "M2 2l10 10M12 2L2 12",
                                        strokeLinecap: "round"
                                    }, void 0, false, {
                                        fileName: "[project]/app/components/tour-chat.tsx",
                                        lineNumber: 157,
                                        columnNumber: 15
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/app/components/tour-chat.tsx",
                                    lineNumber: 156,
                                    columnNumber: 13
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/app/components/tour-chat.tsx",
                                lineNumber: 150,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/components/tour-chat.tsx",
                        lineNumber: 137,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        ref: listRef,
                        className: "min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "rounded-2xl bg-panel px-4 py-3.5",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex gap-3",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "mt-0.5 text-foreground",
                                            "aria-hidden": true,
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                                width: "16",
                                                height: "16",
                                                viewBox: "0 0 16 16",
                                                fill: "currentColor",
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                                    d: "M8 1.2l.7 2.2 2.2.7-2.2.7L8 7l-.7-2.2L5.1 4.1l2.2-.7L8 1.2zM12.2 8.2l.45 1.35 1.35.45-1.35.45-.45 1.35-.45-1.35-1.35-.45 1.35-.45.45-1.35z"
                                                }, void 0, false, {
                                                    fileName: "[project]/app/components/tour-chat.tsx",
                                                    lineNumber: 167,
                                                    columnNumber: 19
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/app/components/tour-chat.tsx",
                                                lineNumber: 166,
                                                columnNumber: 17
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/app/components/tour-chat.tsx",
                                            lineNumber: 165,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "leading-snug",
                                                    children: "Describe any furniture or layout changes."
                                                }, void 0, false, {
                                                    fileName: "[project]/app/components/tour-chat.tsx",
                                                    lineNumber: 171,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "mt-1 text-sm leading-snug text-foreground/55",
                                                    children: "I’ll restage this room in the tour as you type, so you can see updates in real time."
                                                }, void 0, false, {
                                                    fileName: "[project]/app/components/tour-chat.tsx",
                                                    lineNumber: 172,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/app/components/tour-chat.tsx",
                                            lineNumber: 170,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/app/components/tour-chat.tsx",
                                    lineNumber: 164,
                                    columnNumber: 13
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/app/components/tour-chat.tsx",
                                lineNumber: 163,
                                columnNumber: 11
                            }, this),
                            messages.map((message, index)=>message.role === "user" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "ml-auto w-fit max-w-[85%] rounded-full bg-accent px-4 py-2 text-sm text-background",
                                    children: message.text
                                }, `${message.role}-${index}`, false, {
                                    fileName: "[project]/app/components/tour-chat.tsx",
                                    lineNumber: 181,
                                    columnNumber: 15
                                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex items-start gap-2",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-foreground/10 text-foreground",
                                            "aria-hidden": true,
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                                width: "14",
                                                height: "14",
                                                viewBox: "0 0 16 16",
                                                fill: "none",
                                                stroke: "currentColor",
                                                strokeWidth: "1.4",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                                        d: "M3 10.5V12h1.2M11.8 12H13v-1.5",
                                                        strokeLinecap: "round"
                                                    }, void 0, false, {
                                                        fileName: "[project]/app/components/tour-chat.tsx",
                                                        lineNumber: 188,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                                        d: "M3 10c0-2 1.6-3.2 3.4-3.2h3.2C11.4 6.8 13 8 13 10v.4H3V10z"
                                                    }, void 0, false, {
                                                        fileName: "[project]/app/components/tour-chat.tsx",
                                                        lineNumber: 189,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/app/components/tour-chat.tsx",
                                                lineNumber: 187,
                                                columnNumber: 19
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/app/components/tour-chat.tsx",
                                            lineNumber: 186,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "max-w-[85%] rounded-2xl bg-panel px-3.5 py-2.5 text-sm leading-snug",
                                            children: message.text
                                        }, void 0, false, {
                                            fileName: "[project]/app/components/tour-chat.tsx",
                                            lineNumber: 192,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, `${message.role}-${index}`, true, {
                                    fileName: "[project]/app/components/tour-chat.tsx",
                                    lineNumber: 185,
                                    columnNumber: 15
                                }, this)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "pt-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "mb-2 text-sm text-foreground/60",
                                        children: "Try a quick change"
                                    }, void 0, false, {
                                        fileName: "[project]/app/components/tour-chat.tsx",
                                        lineNumber: 198,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex flex-wrap gap-2",
                                        children: SUGGESTIONS.map((suggestion)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "button",
                                                onClick: ()=>send(suggestion),
                                                className: "rounded-full border border-foreground/15 bg-background px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-panel",
                                                children: suggestion
                                            }, suggestion, false, {
                                                fileName: "[project]/app/components/tour-chat.tsx",
                                                lineNumber: 201,
                                                columnNumber: 17
                                            }, this))
                                    }, void 0, false, {
                                        fileName: "[project]/app/components/tour-chat.tsx",
                                        lineNumber: 199,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/components/tour-chat.tsx",
                                lineNumber: 197,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/components/tour-chat.tsx",
                        lineNumber: 162,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("form", {
                        onSubmit: submit,
                        className: "shrink-0 px-3 pb-3",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex items-center gap-1.5 rounded-full bg-panel p-1",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: ()=>inputRef.current?.focus(),
                                    className: "shrink-0 rounded-full bg-foreground px-3.5 py-2 text-sm text-background",
                                    children: "Edit"
                                }, void 0, false, {
                                    fileName: "[project]/app/components/tour-chat.tsx",
                                    lineNumber: 216,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                    ref: inputRef,
                                    value: value,
                                    onChange: (event)=>setValue(event.target.value),
                                    placeholder: "change, like “add a rug”…",
                                    className: "min-w-0 flex-1 bg-transparent px-1.5 text-sm text-foreground outline-none placeholder:text-foreground/35"
                                }, void 0, false, {
                                    fileName: "[project]/app/components/tour-chat.tsx",
                                    lineNumber: 223,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "submit",
                                    disabled: !value.trim(),
                                    "aria-label": "Send",
                                    className: "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-background transition-opacity disabled:opacity-40",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                        width: "16",
                                        height: "16",
                                        viewBox: "0 0 16 16",
                                        fill: "none",
                                        stroke: "currentColor",
                                        strokeWidth: "1.8",
                                        "aria-hidden": true,
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                            d: "M8 13V3M4.5 6.5 8 3l3.5 3.5",
                                            strokeLinecap: "round",
                                            strokeLinejoin: "round"
                                        }, void 0, false, {
                                            fileName: "[project]/app/components/tour-chat.tsx",
                                            lineNumber: 237,
                                            columnNumber: 17
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/app/components/tour-chat.tsx",
                                        lineNumber: 236,
                                        columnNumber: 15
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/app/components/tour-chat.tsx",
                                    lineNumber: 230,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    "aria-label": "Latest message",
                                    onClick: ()=>listRef.current?.scrollTo({
                                            top: listRef.current.scrollHeight,
                                            behavior: "smooth"
                                        }),
                                    className: "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                        width: "12",
                                        height: "12",
                                        viewBox: "0 0 12 12",
                                        fill: "none",
                                        stroke: "currentColor",
                                        strokeWidth: "1.7",
                                        "aria-hidden": true,
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                            d: "M2.5 4.5 6 8l3.5-3.5",
                                            strokeLinecap: "round",
                                            strokeLinejoin: "round"
                                        }, void 0, false, {
                                            fileName: "[project]/app/components/tour-chat.tsx",
                                            lineNumber: 247,
                                            columnNumber: 17
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/app/components/tour-chat.tsx",
                                        lineNumber: 246,
                                        columnNumber: 15
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/app/components/tour-chat.tsx",
                                    lineNumber: 240,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/components/tour-chat.tsx",
                            lineNumber: 215,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/app/components/tour-chat.tsx",
                        lineNumber: 214,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/components/tour-chat.tsx",
                lineNumber: 131,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/components/tour-chat.tsx",
        lineNumber: 101,
        columnNumber: 5
    }, this);
}
function TourGhosts({ pieces, sdk, onPiecesChange }) {
    const rootRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const [drag, setDrag] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [anchored, setAnchored] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({});
    const cameraPose = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const dragId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const movedAt = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(0);
    const moveTicket = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(0);
    const silenced = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(new Set());
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!sdk) return;
        for (const piece of pieces){
            if (!piece.tagId || silenced.current.has(piece.tagId)) continue;
            silenced.current.add(piece.tagId);
            const tagId = piece.tagId;
            void sdk.Tag.allowAction(tagId, {
                opening: false,
                navigating: false,
                docking: false,
                sharing: false
            }).catch(()=>{});
            void sdk.Tag.close(tagId).catch(()=>{});
        }
    }, [
        sdk,
        pieces
    ]);
    // Keep each label on its pin as the camera moves.
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!sdk) return;
        function project(pose) {
            const root = rootRef.current;
            if (!root) return;
            const size = {
                w: root.clientWidth,
                h: root.clientHeight
            };
            const next = {};
            for (const piece of pieces){
                if (!piece.tagId) continue;
                const stem = piece.stem ?? (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$tour$2d$scene$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["uprightStem"])(piece.kind);
                const screen = sdk.Conversion.worldToScreen({
                    x: piece.position.x + stem.x,
                    y: piece.position.y + stem.y,
                    z: piece.position.z + stem.z
                }, pose, size);
                next[piece.id] = {
                    x: screen.x,
                    y: screen.y,
                    visible: Number.isFinite(screen.x) && Number.isFinite(screen.y) && screen.z > 0 && screen.x > -160 && screen.x < size.w + 160 && screen.y > -160 && screen.y < size.h + 160
                };
            }
            setAnchored(next);
        }
        const cached = cameraPose.current;
        if (cached) queueMicrotask(()=>project(cached));
        const subscription = sdk.Camera.pose.subscribe((pose)=>{
            cameraPose.current = pose;
            project(pose);
        });
        return ()=>subscription.cancel();
    }, [
        sdk,
        pieces
    ]);
    async function movePinToCursor(piece, clientX, clientY) {
        const root = rootRef.current;
        if (!root || !sdk || !piece.tagId) return null;
        const box = root.getBoundingClientRect();
        const ticket = ++moveTicket.current;
        const placed = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$tour$2d$scene$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["placeOnSurface"])(sdk, {
            x: clientX - box.left,
            y: clientY - box.top
        }, piece.kind, cameraPose.current?.position);
        if (!placed || ticket !== moveTicket.current) return null;
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$tour$2d$scene$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["moveInTour"])(sdk, piece.tagId, placed.position, placed.stem);
        if (ticket !== moveTicket.current) return null;
        onPiecesChange((current)=>current.map((item)=>item.id === piece.id ? {
                    ...item,
                    position: placed.position,
                    stem: placed.stem
                } : item));
        return placed.position;
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        ref: rootRef,
        className: "pointer-events-none absolute inset-0 z-10 overflow-hidden",
        children: pieces.map((piece)=>{
            const tone = (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$tour$2d$agent$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["furnitureTone"])(piece.kind);
            const held = drag?.id === piece.id;
            const pin = anchored[piece.id];
            const origin = pin ? {
                left: pin.x,
                top: pin.y
            } : {
                left: `${piece.screen.x}%`,
                top: `${piece.screen.y}%`
            };
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: `pointer-events-none absolute ${held ? "z-30" : ""} ${pin && !pin.visible && !held ? "invisible" : ""}`,
                style: {
                    ...origin,
                    transition: "none"
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "pointer-events-none absolute left-[-12px] top-4 -translate-x-full",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: held ? "" : "animate-rise",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 shadow-[0_8px_18px_rgb(0_0_0/0.28)]",
                                style: {
                                    background: tone.soft,
                                    color: "#1b1a17"
                                },
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-background",
                                        style: {
                                            background: tone.accent
                                        },
                                        "aria-hidden": true,
                                        children: tone.glyph
                                    }, void 0, false, {
                                        fileName: "[project]/app/components/tour-chat.tsx",
                                        lineNumber: 370,
                                        columnNumber: 19
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "whitespace-nowrap text-xs font-medium tracking-tight",
                                        children: piece.label
                                    }, void 0, false, {
                                        fileName: "[project]/app/components/tour-chat.tsx",
                                        lineNumber: 377,
                                        columnNumber: 19
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/components/tour-chat.tsx",
                                lineNumber: 366,
                                columnNumber: 17
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/app/components/tour-chat.tsx",
                            lineNumber: 365,
                            columnNumber: 15
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/app/components/tour-chat.tsx",
                        lineNumber: 364,
                        columnNumber: 13
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        "aria-label": `Drag ${piece.label}`,
                        className: `pointer-events-auto absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full ${held ? "cursor-grabbing" : "cursor-grab"}`,
                        onPointerDown: (event)=>{
                            const root = rootRef.current;
                            if (!root) return;
                            event.currentTarget.setPointerCapture(event.pointerId);
                            event.stopPropagation();
                            dragId.current = piece.id;
                            const box = root.getBoundingClientRect();
                            setDrag({
                                id: piece.id,
                                x: event.clientX - box.left,
                                y: event.clientY - box.top
                            });
                            if (sdk && piece.tagId) void sdk.Tag.close(piece.tagId).catch(()=>{});
                        },
                        onPointerMove: (event)=>{
                            if (dragId.current !== piece.id) return;
                            const now = performance.now();
                            if (now - movedAt.current < 32) return;
                            movedAt.current = now;
                            void movePinToCursor(piece, event.clientX, event.clientY);
                        },
                        onPointerUp: (event)=>{
                            if (dragId.current !== piece.id) return;
                            dragId.current = null;
                            void movePinToCursor(piece, event.clientX, event.clientY).finally(()=>setDrag(null));
                        }
                    }, void 0, false, {
                        fileName: "[project]/app/components/tour-chat.tsx",
                        lineNumber: 381,
                        columnNumber: 13
                    }, this)
                ]
            }, piece.id, true, {
                fileName: "[project]/app/components/tour-chat.tsx",
                lineNumber: 359,
                columnNumber: 11
            }, this);
        })
    }, void 0, false, {
        fileName: "[project]/app/components/tour-chat.tsx",
        lineNumber: 350,
        columnNumber: 5
    }, this);
}
}),
"[project]/app/components/tour-overlay.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>TourOverlay
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$matterport$2f$sdk$2f$dist$2f$index$2e$esm$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@matterport/sdk/dist/index.esm.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$components$2f$tour$2d$chat$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/components/tour-chat.tsx [app-ssr] (ecmascript)");
"use client";
;
;
;
;
function TourOverlay({ tourId, title, detail, openChat = false, onClose }) {
    const containerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const labelId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useId"])();
    const [status, setStatus] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("loading");
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [sdk, setSdk] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [chatOpen, setChatOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(openChat);
    const [pieces, setPieces] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const onKey = (event)=>{
            if (event.key !== "Escape") return;
            if (chatOpen) {
                setChatOpen(false);
                return;
            }
            onClose();
        };
        window.addEventListener("keydown", onKey);
        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return ()=>{
            window.removeEventListener("keydown", onKey);
            document.body.style.overflow = previous;
        };
    }, [
        onClose,
        chatOpen
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const host = containerRef.current;
        const sdkKey = ("TURBOPACK compile-time value", "ypi9z0yummuf5d6m8gich91tc");
        if (!host) return;
        let cancelled = false;
        let connected = null;
        async function openTour() {
            if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
            ;
            setStatus("loading");
            setError(null);
            setSdk(null);
            setPieces([]);
            host.replaceChildren();
            try {
                // play=1 skips the title card; qs=0 keeps the dollhouse fly-in instead of jumping inside.
                connected = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$matterport$2f$sdk$2f$dist$2f$index$2e$esm$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["setupSdk"])(sdkKey, {
                    space: tourId,
                    container: host,
                    iframeAttributes: {
                        class: "h-full w-full border-0",
                        allow: "fullscreen; xr-spatial-tracking",
                        allowfullscreen: "true"
                    },
                    iframeQueryParams: {
                        play: 1,
                        qs: 0,
                        dh: 1,
                        brand: 0,
                        title: 0
                    }
                });
                if (cancelled) return;
                await connected.App.state.waitUntil((state)=>state.phase === connected.App.Phase.PLAYING);
                if (cancelled) return;
                // Land in dollhouse (aerial) so the user can rotate the exterior, then click in to go inside.
                await connected.Mode.moveTo(connected.Mode.Mode.DOLLHOUSE, {
                    transition: connected.Camera.TransitionType.FLY
                });
                if (cancelled) return;
                setSdk(connected);
                setStatus("ready");
            } catch (cause) {
                if (cancelled) return;
                console.error(cause);
                setStatus("error");
                setError(cause instanceof Error ? cause.message : "Could not open the Matterport tour. The SDK key only works on allow-listed domains like localhost.");
            }
        }
        void openTour();
        return ()=>{
            cancelled = true;
            host.replaceChildren();
            connected = null;
        };
    }, [
        tourId
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": labelId,
        className: "fixed inset-0 z-50 flex flex-col bg-foreground text-background animate-rise",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                className: "flex shrink-0 items-center gap-4 px-4 py-3 md:px-6",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: onClose,
                        className: "rounded-full bg-background/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-background/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                        children: "Close"
                    }, void 0, false, {
                        fileName: "[project]/app/components/tour-overlay.tsx",
                        lineNumber: 124,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "min-w-0 flex-1 pr-14",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                id: labelId,
                                className: "truncate text-sm font-medium tracking-tight",
                                children: [
                                    title,
                                    detail ? ` · ${detail}` : ""
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/components/tour-overlay.tsx",
                                lineNumber: 132,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "truncate text-xs text-background/55",
                                children: status === "ready" ? chatOpen ? "Layout agent is live — edits appear in the tour" : "Aerial view — click into the model to go inside" : "Opening tour…"
                            }, void 0, false, {
                                fileName: "[project]/app/components/tour-overlay.tsx",
                                lineNumber: 136,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/components/tour-overlay.tsx",
                        lineNumber: 131,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/components/tour-overlay.tsx",
                lineNumber: 123,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "relative min-h-0 flex-1 bg-foreground",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        ref: containerRef,
                        className: "absolute inset-0"
                    }, void 0, false, {
                        fileName: "[project]/app/components/tour-overlay.tsx",
                        lineNumber: 147,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$components$2f$tour$2d$chat$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TourGhosts"], {
                        pieces: pieces,
                        sdk: sdk,
                        onPiecesChange: setPieces
                    }, void 0, false, {
                        fileName: "[project]/app/components/tour-overlay.tsx",
                        lineNumber: 148,
                        columnNumber: 9
                    }, this),
                    status === "ready" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$components$2f$tour$2d$chat$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                        sdk: sdk,
                        open: chatOpen,
                        onOpenChange: setChatOpen,
                        pieces: pieces,
                        onPiecesChange: setPieces
                    }, void 0, false, {
                        fileName: "[project]/app/components/tour-overlay.tsx",
                        lineNumber: 151,
                        columnNumber: 11
                    }, this),
                    status === "loading" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "pointer-events-none absolute inset-0 flex items-center justify-center bg-foreground/40",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "inline-block h-2.5 w-2.5 animate-breathe rounded-full bg-background/70"
                        }, void 0, false, {
                            fileName: "[project]/app/components/tour-overlay.tsx",
                            lineNumber: 162,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/app/components/tour-overlay.tsx",
                        lineNumber: 161,
                        columnNumber: 11
                    }, this),
                    status === "error" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "absolute inset-0 flex items-center justify-center bg-foreground px-8 text-center",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "max-w-md",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "text-lg font-medium",
                                    children: "Tour unavailable"
                                }, void 0, false, {
                                    fileName: "[project]/app/components/tour-overlay.tsx",
                                    lineNumber: 169,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "mt-3 text-sm text-background/60",
                                    children: error
                                }, void 0, false, {
                                    fileName: "[project]/app/components/tour-overlay.tsx",
                                    lineNumber: 170,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: onClose,
                                    className: "mt-8 rounded-full bg-background px-5 py-2.5 text-sm font-medium text-foreground",
                                    children: "Back to Discover"
                                }, void 0, false, {
                                    fileName: "[project]/app/components/tour-overlay.tsx",
                                    lineNumber: 171,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/components/tour-overlay.tsx",
                            lineNumber: 168,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/app/components/tour-overlay.tsx",
                        lineNumber: 167,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/components/tour-overlay.tsx",
                lineNumber: 146,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/components/tour-overlay.tsx",
        lineNumber: 117,
        columnNumber: 5
    }, this);
}
}),
"[project]/app/lib/tour-agent.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "furnitureTone",
    ()=>furnitureTone,
    "tourAgentReply",
    ()=>tourAgentReply
]);
const FURNITURE = [
    {
        kind: "table",
        label: "Dining table",
        pattern: /\b(dining\s*)?tables?\b|\bbooths?\b/i
    },
    {
        kind: "chair",
        label: "Chair",
        pattern: /\bchairs?\b|\bseats?\b|\bstools?\b/i
    },
    {
        kind: "sofa",
        label: "Sofa",
        pattern: /\bsofas?\b|\bcouches?\b|\blounges?\b/i
    },
    {
        kind: "counter",
        label: "Service counter",
        pattern: /\bcounters?\b|\bbar\b|\bhost\s*stand\b|\bkitchen\b/i
    },
    {
        kind: "wall",
        label: "Interior wall",
        pattern: /\bwalls?\b|\bpartition\b|\bdivider\b/i
    }
];
const CYCLE = [
    "table",
    "chair",
    "sofa",
    "counter",
    "wall"
];
function tourAgentReply(message, placedCount) {
    const lower = message.trim().toLowerCase();
    const named = FURNITURE.find((item)=>item.pattern.test(message));
    const wantsMove = /\b(move|shift|slide|nudge|push)\b/.test(lower) && placedCount > 0;
    if (wantsMove) {
        const direction = /\bright\b/.test(lower) ? "right" : /\bleft\b/.test(lower) ? "left" : /\b(back|backward|away)\b/.test(lower) ? "back" : "forward";
        return {
            reply: `Moved it ${direction}. It’s in the tour now.`,
            action: {
                type: "move",
                direction,
                meters: 0.75
            }
        };
    }
    const item = named ?? FURNITURE.find((entry)=>entry.kind === CYCLE[placedCount % CYCLE.length]);
    return {
        reply: `Placed a ${item.label.toLowerCase()} in this room.`,
        action: {
            type: "add",
            kind: item.kind,
            label: item.label
        }
    };
}
function furnitureTone(kind) {
    switch(kind){
        case "table":
            return {
                accent: "#c45a2c",
                soft: "#f0ddd2",
                glyph: "▦"
            };
        case "chair":
            return {
                accent: "#8a6a45",
                soft: "#efe4d6",
                glyph: "▣"
            };
        case "sofa":
            return {
                accent: "#6b5b4a",
                soft: "#ebe4dc",
                glyph: "▬"
            };
        case "counter":
            return {
                accent: "#5f6d4e",
                soft: "#e3e7da",
                glyph: "▭"
            };
        case "wall":
            return {
                accent: "#4a5560",
                soft: "#dde2e6",
                glyph: "┃"
            };
    }
}
}),
"[project]/app/lib/tour-scene.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "moveInTour",
    ()=>moveInTour,
    "nudge",
    ()=>nudge,
    "placeInTour",
    ()=>placeInTour,
    "placeOnSurface",
    ()=>placeOnSurface,
    "pointInFront",
    ()=>pointInFront,
    "pointUnderPointer",
    ()=>pointUnderPointer,
    "readPose",
    ()=>readPose,
    "stemHeight",
    ()=>stemHeight,
    "uprightStem",
    ()=>uprightStem
]);
function yawRadians(rotationY) {
    return rotationY * Math.PI / 180;
}
function pointInFront(pose, distance = 2.2) {
    const yaw = yawRadians(pose.rotation.y);
    return {
        x: pose.position.x - Math.sin(yaw) * distance,
        y: pose.position.y - 0.35,
        z: pose.position.z - Math.cos(yaw) * distance
    };
}
function stemHeight(kind) {
    return kind === "wall" ? 1.1 : 0.45;
}
function uprightStem(kind) {
    return {
        x: 0,
        y: stemHeight(kind),
        z: 0
    };
}
const UP = {
    x: 0,
    y: 1,
    z: 0
};
function add(a, b) {
    return {
        x: a.x + b.x,
        y: a.y + b.y,
        z: a.z + b.z
    };
}
function sub(a, b) {
    return {
        x: a.x - b.x,
        y: a.y - b.y,
        z: a.z - b.z
    };
}
function scale(v, amount) {
    return {
        x: v.x * amount,
        y: v.y * amount,
        z: v.z * amount
    };
}
function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}
function len(v) {
    return Math.hypot(v.x, v.y, v.z);
}
function normalize(v) {
    const length = len(v);
    if (length < 1e-5) return null;
    return scale(v, 1 / length);
}
function cross(a, b) {
    return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x
    };
}
async function placeOnSurface(sdk, screen, kind, cameraPosition) {
    const hit = await sdk.Renderer.getWorldPositionData(screen);
    if (!hit.position) return null;
    const sample = 12;
    const [right, down] = await Promise.all([
        sdk.Renderer.getWorldPositionData({
            x: screen.x + sample,
            y: screen.y
        }),
        sdk.Renderer.getWorldPositionData({
            x: screen.x,
            y: screen.y + sample
        })
    ]);
    let normal = UP;
    if (right.position && down.position) {
        const edgeA = sub(right.position, hit.position);
        const edgeB = sub(down.position, hit.position);
        if (len(edgeA) < 0.75 && len(edgeB) < 0.75) {
            const guessed = normalize(cross(edgeA, edgeB));
            if (guessed) normal = guessed;
        }
    }
    if (cameraPosition) {
        const towardCamera = sub(cameraPosition, hit.position);
        if (dot(normal, towardCamera) < 0) normal = scale(normal, -1);
    } else if (normal.y < 0) {
        normal = scale(normal, -1);
    }
    const floorLike = normal.y > 0.65;
    const clearance = kind === "wall" ? 0.34 : floorLike ? 0.28 : 0.22;
    return {
        position: add(hit.position, scale(normal, 0.03)),
        stem: scale(normal, clearance)
    };
}
function pointUnderPointer(pose, view, clientX, clientY) {
    const nx = ((clientX - view.left) / view.width - 0.5) * 2;
    const ny = ((clientY - view.top) / view.height - 0.5) * 2;
    const yaw = pose.rotation.y * Math.PI / 180;
    const pitch = pose.rotation.x * Math.PI / 180;
    const forward = {
        x: -Math.sin(yaw) * Math.cos(pitch),
        y: Math.sin(pitch),
        z: -Math.cos(yaw) * Math.cos(pitch)
    };
    const right = {
        x: Math.cos(yaw),
        z: -Math.sin(yaw)
    };
    const distance = 2.4;
    const spread = 1.6;
    return {
        x: pose.position.x + forward.x * distance + right.x * nx * spread,
        y: pose.position.y + forward.y * distance - ny * 0.9,
        z: pose.position.z + forward.z * distance + right.z * nx * spread
    };
}
function nudge(position, poseYaw, direction, meters) {
    const yaw = yawRadians(poseYaw);
    const forward = {
        x: -Math.sin(yaw),
        z: -Math.cos(yaw)
    };
    const right = {
        x: Math.cos(yaw),
        z: -Math.sin(yaw)
    };
    const delta = direction === "forward" ? {
        x: forward.x * meters,
        z: forward.z * meters
    } : direction === "back" ? {
        x: -forward.x * meters,
        z: -forward.z * meters
    } : direction === "right" ? {
        x: right.x * meters,
        z: right.z * meters
    } : {
        x: -right.x * meters,
        z: -right.z * meters
    };
    return {
        x: position.x + delta.x,
        y: position.y,
        z: position.z + delta.z
    };
}
async function readPose(sdk) {
    return new Promise((resolve)=>{
        const timer = setTimeout(()=>{
            subscription.cancel();
            resolve({
                position: {
                    x: 0,
                    y: 1,
                    z: 0
                },
                rotation: {
                    x: 0,
                    y: 0
                },
                mode: "mode.inside"
            });
        }, 400);
        const subscription = sdk.Camera.pose.subscribe((pose)=>{
            clearTimeout(timer);
            subscription.cancel();
            resolve(pose);
        });
    });
}
const TAG_COLOR = {
    table: {
        r: 0.77,
        g: 0.35,
        b: 0.17
    },
    chair: {
        r: 0.54,
        g: 0.42,
        b: 0.27
    },
    sofa: {
        r: 0.42,
        g: 0.36,
        b: 0.29
    },
    counter: {
        r: 0.37,
        g: 0.43,
        b: 0.31
    },
    wall: {
        r: 0.29,
        g: 0.33,
        b: 0.38
    }
};
async function placeInTour(sdk, piece) {
    try {
        const pose = await readPose(sdk);
        if (pose.mode === sdk.Mode.Mode.DOLLHOUSE || pose.mode === sdk.Mode.Mode.FLOORPLAN) {
            await sdk.Mode.moveTo(sdk.Mode.Mode.INSIDE, {
                transition: sdk.Camera.TransitionType.FLY
            });
        }
        const stem = piece.stem ?? uprightStem(piece.kind);
        const [tagId] = await sdk.Tag.add({
            label: piece.label,
            description: "",
            anchorPosition: piece.position,
            stemVector: stem,
            color: TAG_COLOR[piece.kind]
        });
        try {
            await sdk.Tag.allowAction(tagId, {
                opening: false,
                navigating: false,
                docking: false,
                sharing: false
            });
            await sdk.Tag.close(tagId);
        } catch  {
        // The pin still marks the object if the billboard cannot be silenced.
        }
        return tagId;
    } catch (error) {
        console.error(error);
        return null;
    }
}
async function moveInTour(sdk, tagId, position, stem = {
    x: 0,
    y: 0.28,
    z: 0
}) {
    try {
        await sdk.Tag.editPosition(tagId, {
            anchorPosition: position,
            stemVector: stem
        });
    } catch (error) {
        console.error(error);
    }
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__1933huto65owb._.js.map