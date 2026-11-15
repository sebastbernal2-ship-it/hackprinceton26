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
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$components$2f$property$2d$info$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/components/property-info.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$components$2f$tour$2d$overlay$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/components/tour-overlay.tsx [app-ssr] (ecmascript)");
"use client";
;
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
    const [info, setInfo] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
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
                        lineNumber: 20,
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
                        lineNumber: 21,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/components/discover.tsx",
                lineNumber: 19,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                className: "mt-10 grid grid-cols-1 gap-x-10 gap-y-14 md:grid-cols-2",
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
                                        lineNumber: 29,
                                        columnNumber: 17
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/app/components/discover.tsx",
                                    lineNumber: 28,
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
                                                            lineNumber: 43,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/app/components/discover.tsx",
                                                    lineNumber: 41,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "mt-1 text-sm text-foreground/50",
                                                    children: match.city
                                                }, void 0, false, {
                                                    fileName: "[project]/app/components/discover.tsx",
                                                    lineNumber: 45,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/app/components/discover.tsx",
                                            lineNumber: 40,
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
                                            lineNumber: 47,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/app/components/discover.tsx",
                                    lineNumber: 39,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "mt-4 text-[0.95rem] leading-relaxed text-foreground/55",
                                    children: match.blurb
                                }, void 0, false, {
                                    fileName: "[project]/app/components/discover.tsx",
                                    lineNumber: 52,
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
                                    lineNumber: 53,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "mt-6 flex flex-wrap gap-2",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            type: "button",
                                            onClick: ()=>setTour(match),
                                            className: "inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-[transform,opacity] duration-300 hover:opacity-90 active:scale-[0.98]",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Cube, {}, void 0, false, {
                                                    fileName: "[project]/app/components/discover.tsx",
                                                    lineNumber: 64,
                                                    columnNumber: 19
                                                }, this),
                                                "Open 3D Tour"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/app/components/discover.tsx",
                                            lineNumber: 59,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            type: "button",
                                            onClick: ()=>setInfo(match),
                                            className: "inline-flex items-center rounded-full border border-foreground/15 px-5 py-2.5 text-sm font-medium transition-[transform,opacity] duration-300 hover:opacity-70 active:scale-[0.98]",
                                            children: "View Info"
                                        }, void 0, false, {
                                            fileName: "[project]/app/components/discover.tsx",
                                            lineNumber: 67,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/app/components/discover.tsx",
                                    lineNumber: 58,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/components/discover.tsx",
                            lineNumber: 27,
                            columnNumber: 13
                        }, this)
                    }, `${match.listingId}-${match.detail}`, false, {
                        fileName: "[project]/app/components/discover.tsx",
                        lineNumber: 26,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/app/components/discover.tsx",
                lineNumber: 24,
                columnNumber: 7
            }, this),
            info && !tour && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$components$2f$property$2d$info$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                match: info,
                onBack: ()=>setInfo(null),
                onTour: ()=>setTour(info)
            }, void 0, false, {
                fileName: "[project]/app/components/discover.tsx",
                lineNumber: 81,
                columnNumber: 9
            }, this),
            tour && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$components$2f$tour$2d$overlay$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                tourId: tour.tourId,
                title: tour.address,
                detail: tour.detail,
                squareFeet: tour.squareFeet,
                onClose: ()=>setTour(null)
            }, void 0, false, {
                fileName: "[project]/app/components/discover.tsx",
                lineNumber: 89,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/components/discover.tsx",
        lineNumber: 18,
        columnNumber: 5
    }, this);
}
function Cube() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
        viewBox: "0 0 24 24",
        className: "h-4 w-4",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1.7",
        "aria-hidden": "true",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                d: "M12 3.5 19 7.5v9L12 20.5 5 16.5v-9L12 3.5Z",
                strokeLinejoin: "round"
            }, void 0, false, {
                fileName: "[project]/app/components/discover.tsx",
                lineNumber: 104,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                d: "M12 12.2 19 7.7M12 12.2 5 7.7M12 12.2v8.3",
                strokeLinejoin: "round"
            }, void 0, false, {
                fileName: "[project]/app/components/discover.tsx",
                lineNumber: 105,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/components/discover.tsx",
        lineNumber: 103,
        columnNumber: 5
    }, this);
}
}),
"[project]/app/components/foreground-tour.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ForegroundTour
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/three/build/three.core.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/three/build/three.module.js [app-ssr] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$examples$2f$jsm$2f$loaders$2f$GLTFLoader$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/three/examples/jsm/loaders/GLTFLoader.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$examples$2f$jsm$2f$loaders$2f$OBJLoader$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/three/examples/jsm/loaders/OBJLoader.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$floor$2d$layout$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/lib/floor-layout.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
function floorColor(entry) {
    const label = entry.label.toLowerCase();
    if (entry.kind === "freezer" && !entry.absorbed) return 0x243028;
    if (entry.kind === "kitchen" || entry.absorbed) return 0x45403b;
    if (entry.kind === "dining") return 0x6a5140;
    if (/bath|restroom|toilet/.test(label)) return 0x3c4650;
    if (/bar/.test(label)) return 0x5a4034;
    if (/office/.test(label)) return 0x4a453c;
    if (/front|entry|foyer/.test(label)) return 0x5c564e;
    if (/stor/.test(label)) return 0x3a3834;
    return 0x4e4944;
}
const WALL = {
    shell: 0xe7e0d4,
    divider: 0xf7f3ec,
    freezer: 0xd9512c
};
function ForegroundTour({ title, detail, squareFeet, layout }) {
    const mountRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const layoutRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(layout);
    const viewRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])("dollhouse");
    const enterRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const [view, setView] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("dollhouse");
    layoutRef.current = layout;
    viewRef.current = view;
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const mount = mountRef.current;
        if (!mount) return;
        const renderer = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__["WebGLRenderer"]({
            antialias: true
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x141413);
        const canvas = renderer.domElement;
        canvas.className = "h-full w-full touch-none";
        mount.appendChild(canvas);
        const scene = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Scene"]();
        scene.fog = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fog"](0x141413, 48, 160);
        const content = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Group"]();
        scene.add(content);
        scene.add(new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["HemisphereLight"](0xfff8ee, 0x2a241e, 1.15));
        const sun = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DirectionalLight"](0xfff3e2, 1.45);
        sun.position.set(14, 22, 10);
        scene.add(sun);
        const fill = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DirectionalLight"](0xd7e0ea, 0.35);
        fill.position.set(-10, 8, -6);
        scene.add(fill);
        const persp = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PerspectiveCamera"](52, 1, 0.08, 200);
        const ortho = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["OrthographicCamera"](-1, 1, 1, -1, 0.1, 200);
        const ceiling = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Mesh"](new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["BoxGeometry"](1, 0.06, 1), new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MeshStandardMaterial"]({
            color: 0xd9d3c7,
            roughness: 1
        }));
        ceiling.visible = false;
        scene.add(ceiling);
        const shown = structuredClone(layoutRef.current);
        const player = {
            ...(0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$floor$2d$layout$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["diningCenter"])(shown),
            yaw: -Math.PI / 2,
            pitch: -0.08
        };
        const keys = new Set();
        let orbitYaw = -0.55;
        let orbitPitch = 0.72;
        let orbitDist = 1.15;
        let planZoom = 1;
        let dragging = false;
        let moved = false;
        let lastX = 0;
        let lastY = 0;
        let builtView = null;
        let previous = performance.now();
        let frameId = 0;
        function resize() {
            const width = mount.clientWidth || 1;
            const height = mount.clientHeight || 1;
            renderer.setSize(width, height, false);
            persp.aspect = width / height;
            persp.updateProjectionMatrix();
        }
        let floorTex = null;
        let floorHref = "";
        let texStamp = 0;
        let builtTex = -1;
        let meshHref = "";
        const reference = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Group"]();
        scene.add(reference);
        let structureDirty = false;
        let motion = null;
        function changedEnough() {
            const target = layoutRef.current;
            if (structureDirty) {
                structureDirty = false;
                return true;
            }
            if (viewRef.current !== builtView) return true;
            if (texStamp !== builtTex) return true;
            if ((shown.geometryKey || "") !== (target.geometryKey || "")) return true;
            if (shown.rooms.length !== target.rooms.length) return true;
            return shown.rooms.some((entry, index)=>{
                const next = target.rooms[index];
                return !next || entry.id !== next.id || entry.absorbed !== next.absorbed || Math.abs(entry.w - next.w) > 0.004 || Math.abs(entry.d - next.d) > 0.004 || Math.abs(entry.x - next.x) > 0.004 || Math.abs(entry.z - next.z) > 0.004;
            });
        }
        function ensureAssets() {
            const href = layoutRef.current.floorplan?.href || "";
            if (href && href !== floorHref) {
                floorHref = href;
                new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TextureLoader"]().load(href, (texture)=>{
                    texture.colorSpace = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SRGBColorSpace"];
                    floorTex = texture;
                    texStamp += 1;
                });
            }
            const nextMesh = layoutRef.current.meshHref || "";
            if (!nextMesh || nextMesh === meshHref) return;
            meshHref = nextMesh;
            const format = layoutRef.current.meshFormat || "";
            const loader = format === "gltf" ? new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$examples$2f$jsm$2f$loaders$2f$GLTFLoader$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["GLTFLoader"]() : new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$examples$2f$jsm$2f$loaders$2f$OBJLoader$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["OBJLoader"]();
            loader.load(nextMesh, (loaded)=>{
                const object = loaded instanceof __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Object3D"] ? loaded : loaded.scene;
                object.traverse((child)=>{
                    if (!(child instanceof __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Mesh"])) return;
                    const source = child.geometry.getAttribute("position");
                    if (source) {
                        child.geometry = child.geometry.clone();
                        const position = child.geometry.getAttribute("position");
                        for(let index = 0; index < position.count; index += 1){
                            const across = position.getY(index);
                            position.setY(index, position.getZ(index));
                            position.setZ(index, across);
                        }
                        position.needsUpdate = true;
                        child.geometry.computeVertexNormals();
                    }
                    const materials = Array.isArray(child.material) ? child.material : [
                        child.material
                    ];
                    for (const material of materials){
                        material.transparent = true;
                        material.opacity = 0.18;
                        material.depthWrite = false;
                        material.side = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DoubleSide"];
                    }
                });
                reference.clear();
                reference.add(object);
                texStamp += 1;
            });
        }
        function rebuild() {
            disposeObject(content);
            content.clear();
            builtTex = texStamp;
            const align = shown.meshAlign;
            reference.scale.setScalar(align?.scale || 1);
            reference.position.set(align?.x || 0, 0, align?.z || 0);
            const pad = 0.45;
            addBox(content, -pad, -0.12, -pad, shown.width + pad * 2, 0.08, shown.depth + pad * 2, 0x171614);
            let draw = shown;
            let from = null;
            let progress = 1;
            if (!motion) canvas.dataset.motion = "settled";
            if (motion) {
                progress = Math.min(1, (performance.now() - motion.started) / 1600);
                canvas.dataset.motion = "playing";
                from = motion.from;
                draw = motion.to;
                if (progress >= 1) {
                    Object.assign(shown, structuredClone(motion.to));
                    motion = null;
                    from = null;
                    draw = shown;
                    progress = 1;
                    canvas.dataset.motion = "settled";
                }
            }
            if (draw.polygons?.length) {
                drawPlan(content, draw, floorTex, viewRef.current !== "inside", from, easeOut(progress), viewRef.current);
                ceiling.scale.set(Math.max(draw.width - 0.24, 0.1), 1, Math.max(draw.depth - 0.24, 0.1));
                ceiling.position.set(draw.width / 2, draw.height + 0.03, draw.depth / 2);
                builtView = viewRef.current;
                return;
            }
            for (const tile of shown.tiles){
                addBox(content, tile.x, 0.01, tile.z, tile.w, 0.04, tile.d, 0x6a5140);
            }
            for (const entry of shown.rooms){
                if (entry.d < 0.18 || entry.w < 0.18) continue;
                addBox(content, entry.x + 0.02, 0.02, entry.z + 0.02, entry.w - 0.04, 0.05, entry.d - 0.04, floorColor(entry));
                if (viewRef.current !== "inside" && !entry.absorbed && entry.w > 1.1 && entry.d > 1.1) {
                    const sprite = makeLabel((0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$floor$2d$layout$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["displayLabel"])(entry.label));
                    sprite.position.set(entry.x + entry.w / 2, shown.height * 0.72, entry.z + entry.d / 2);
                    const scale = labelWidth(Math.max(entry.w, entry.d), viewRef.current);
                    sprite.scale.set(scale, scale * (280 / 1024), 1);
                    content.add(sprite);
                }
            }
            for (const wall of (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$floor$2d$layout$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["layoutWalls"])(shown)){
                addBox(content, wall.x, 0.05, wall.z, wall.w, shown.height, wall.d, WALL[wall.role]);
            }
            ceiling.scale.set(Math.max(shown.width - 0.24, 0.1), 1, Math.max(shown.depth - 0.24, 0.1));
            ceiling.position.set(shown.width / 2, shown.height + 0.03, shown.depth / 2);
            builtView = viewRef.current;
        }
        function lerpLayout(delta) {
            const target = layoutRef.current;
            const same = (shown.geometryKey || "") === (target.geometryKey || "") && shown.rooms.length === target.rooms.length && shown.rooms.every((entry, index)=>entry.id === target.rooms[index].id);
            if (!same) {
                if (!motion || motion.toKey !== (target.geometryKey || "")) {
                    motion = {
                        from: structuredClone(shown),
                        to: structuredClone(target),
                        toKey: target.geometryKey || "",
                        started: performance.now()
                    };
                }
                structureDirty = true;
                return;
            }
            const blend = 1 - Math.pow(0.0015, delta);
            shown.width += (target.width - shown.width) * blend;
            shown.depth += (target.depth - shown.depth) * blend;
            shown.freezerRemoved = target.freezerRemoved;
            shown.rooms.forEach((entry, index)=>{
                const next = target.rooms[index];
                entry.absorbed = next.absorbed;
                entry.label = next.label;
                entry.kind = next.kind;
                entry.x += (next.x - entry.x) * blend;
                entry.z += (next.z - entry.z) * blend;
                entry.w += (next.w - entry.w) * blend;
                entry.d += (next.d - entry.d) * blend;
            });
        }
        function stepPlayer(delta) {
            let forward = 0;
            let strafe = 0;
            if (keys.has("w") || keys.has("arrowup")) forward += 1;
            if (keys.has("s") || keys.has("arrowdown")) forward -= 1;
            if (keys.has("d") || keys.has("arrowright")) strafe += 1;
            if (keys.has("a") || keys.has("arrowleft")) strafe -= 1;
            if (forward === 0 && strafe === 0) return;
            const speed = (keys.has("shift") ? 6.2 : 3.4) * delta;
            const sin = Math.sin(player.yaw);
            const cos = Math.cos(player.yaw);
            const dx = (-sin * forward + cos * strafe) * speed;
            const dz = (-cos * forward - sin * strafe) * speed;
            const radius = 0.32;
            const solid = layoutRef.current;
            if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$floor$2d$layout$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["hitsWall"])(solid, player.x + dx, player.z, radius)) player.x += dx;
            if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$floor$2d$layout$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["hitsWall"])(solid, player.x, player.z + dz, radius)) player.z += dz;
        }
        function enterRoom(id) {
            const kitchen = (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$floor$2d$layout$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["findKitchen"])(shown);
            const resolved = !id || id === "dining" ? shown.rooms.find((entry)=>entry.kind === "dining" && !entry.absorbed)?.id ?? "" : id;
            const spot = (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$floor$2d$layout$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["roomFocus"])(shown, resolved) ?? (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$floor$2d$layout$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["diningCenter"])(shown);
            if (id && id !== "dining" && !(0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$floor$2d$layout$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["roomFocus"])(shown, resolved)) return;
            player.x = spot.x;
            player.z = spot.z;
            const focus = kitchen && kitchen.id !== resolved ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$floor$2d$layout$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["roomFocus"])(shown, kitchen.id) : null;
            if (focus) {
                player.yaw = Math.atan2(-(focus.x - player.x), -(focus.z - player.z));
            }
            player.pitch = -0.05;
            viewRef.current = "inside";
            setView("inside");
        }
        function raycastRoom(camera) {
            const box = canvas.getBoundingClientRect();
            const pointer = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Vector2"]((lastX - box.left) / box.width * 2 - 1, -((lastY - box.top) / box.height) * 2 + 1);
            const ray = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Raycaster"]();
            ray.setFromCamera(pointer, camera);
            if (Math.abs(ray.ray.direction.y) < 1e-4) return null;
            const distance = (0.05 - ray.ray.origin.y) / ray.ray.direction.y;
            if (distance < 0) return null;
            const point = ray.ray.origin.clone().addScaledVector(ray.ray.direction, distance);
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$floor$2d$layout$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["roomAtPoint"])(shown, point.x, point.z);
        }
        function render(now) {
            if (enterRef.current) {
                const id = enterRef.current;
                enterRef.current = null;
                enterRoom(id);
            }
            const delta = Math.min(0.05, (now - previous) / 1000);
            previous = now;
            ensureAssets();
            lerpLayout(delta);
            ceiling.visible = viewRef.current === "inside";
            if (viewRef.current === "inside") {
                stepPlayer(delta);
                if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$floor$2d$layout$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["hitsWall"])(layoutRef.current, player.x, player.z, 0.28)) {
                    const home = (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$floor$2d$layout$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["diningCenter"])(shown);
                    player.x = home.x;
                    player.z = home.z;
                }
            }
            if (changedEnough()) rebuild();
            const cx = shown.width / 2;
            const cz = shown.depth / 2;
            if (viewRef.current === "inside") {
                persp.position.set(player.x, 1.62, player.z);
                persp.rotation.order = "YXZ";
                persp.rotation.y = player.yaw;
                persp.rotation.x = player.pitch;
                persp.rotation.z = 0;
                renderer.render(scene, persp);
            } else if (viewRef.current === "floorplan") {
                const span = Math.max(shown.width, shown.depth) * 0.62 * planZoom;
                const aspect = persp.aspect || 1;
                ortho.left = -span * aspect;
                ortho.right = span * aspect;
                ortho.top = span;
                ortho.bottom = -span;
                ortho.near = 0.1;
                ortho.far = 80;
                ortho.position.set(cx, 40, cz);
                ortho.up.set(0, 0, -1);
                ortho.lookAt(cx, 0, cz);
                ortho.updateProjectionMatrix();
                renderer.render(scene, ortho);
            } else {
                const dist = Math.max(shown.width, shown.depth) * orbitDist;
                const horizontal = Math.cos(orbitPitch) * dist;
                persp.position.set(cx + Math.sin(orbitYaw) * horizontal, Math.sin(orbitPitch) * dist + 1.2, cz + Math.cos(orbitYaw) * horizontal);
                persp.lookAt(cx, 0.7, cz);
                renderer.render(scene, persp);
            }
            frameId = requestAnimationFrame(render);
        }
        function onPointerDown(event) {
            if (event.button !== 0) return;
            dragging = true;
            moved = false;
            lastX = event.clientX;
            lastY = event.clientY;
        }
        function onPointerMove(event) {
            if (!dragging) return;
            const dx = event.clientX - lastX;
            const dy = event.clientY - lastY;
            if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
            lastX = event.clientX;
            lastY = event.clientY;
            if (viewRef.current === "inside") {
                player.yaw -= dx * 0.005;
                player.pitch = Math.max(-1.05, Math.min(0.65, player.pitch - dy * 0.004));
            } else if (viewRef.current === "dollhouse") {
                orbitYaw -= dx * 0.005;
                orbitPitch = Math.max(0.28, Math.min(1.25, orbitPitch + dy * 0.004));
            }
        }
        function onPointerUp() {
            if (dragging && !moved && viewRef.current !== "inside") {
                enterRoom(raycastRoom(viewRef.current === "floorplan" ? ortho : persp) ?? "dining");
            }
            dragging = false;
        }
        function onWheel(event) {
            event.preventDefault();
            const step = Math.exp(event.deltaY * 0.001);
            if (viewRef.current === "floorplan") planZoom = Math.max(0.55, Math.min(2.4, planZoom * step));
            else orbitDist = Math.max(0.72, Math.min(2.15, orbitDist * step));
        }
        function onKeyDown(event) {
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
            keys.add(event.key.toLowerCase());
        }
        function onKeyUp(event) {
            keys.delete(event.key.toLowerCase());
        }
        resize();
        rebuild();
        frameId = requestAnimationFrame(render);
        const observer = new ResizeObserver(resize);
        observer.observe(mount);
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        canvas.addEventListener("pointerdown", onPointerDown);
        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
        canvas.addEventListener("wheel", onWheel, {
            passive: false
        });
        return ()=>{
            cancelAnimationFrame(frameId);
            observer.disconnect();
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
            canvas.removeEventListener("pointerdown", onPointerDown);
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
            canvas.removeEventListener("wheel", onWheel);
            disposeObject(content);
            reference.traverse((child)=>{
                if (child instanceof __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Mesh"]) {
                    child.geometry.dispose();
                    const material = child.material;
                    if (Array.isArray(material)) material.forEach((entry)=>entry.dispose());
                    else material.dispose();
                }
            });
            floorTex?.dispose();
            ceiling.geometry.dispose();
            ceiling.material.dispose();
            renderer.dispose();
            canvas.remove();
        };
    }, [
        enterRef
    ]);
    const dining = layout.rooms.find((entry)=>entry.kind === "dining");
    const number = new Intl.NumberFormat("en-US");
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "absolute inset-0 bg-[#141413] text-background",
        "data-freezer": layout.freezerRemoved ? "gone" : layout.rooms.some((entry)=>entry.kind === "freezer") ? "present" : "none",
        "data-dining-width": dining ? dining.w.toFixed(2) : "",
        "data-dining-depth": dining ? dining.d.toFixed(2) : "",
        "data-wall-shift": (layout.wallShift ?? 0).toFixed(2),
        "data-rooms": layout.rooms.filter((entry)=>!entry.absorbed).map((entry)=>entry.label).join(" | "),
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                ref: mountRef,
                className: "absolute inset-0"
            }, void 0, false, {
                fileName: "[project]/app/components/foreground-tour.tsx",
                lineNumber: 483,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "pointer-events-none absolute left-5 top-16 z-20 text-sm text-background/55",
                children: [
                    title,
                    detail ? ` · ${detail}` : "",
                    " · ",
                    number.format(squareFeet),
                    " sq ft"
                ]
            }, void 0, true, {
                fileName: "[project]/app/components/foreground-tour.tsx",
                lineNumber: 484,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "pointer-events-none absolute bottom-5 left-5 right-5 z-20 flex items-end justify-between gap-4",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "pointer-events-auto ml-10 flex items-center rounded-full bg-[#ece7dd] p-1 text-foreground shadow-[0_10px_30px_rgb(0_0_0/0.28)]",
                        children: [
                            [
                                "dollhouse",
                                "Dollhouse"
                            ],
                            [
                                "inside",
                                "Inside"
                            ],
                            [
                                "floorplan",
                                "Floorplan"
                            ]
                        ].map(([mode, label])=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                onClick: ()=>{
                                    if (mode === "inside") {
                                        enterRef.current = layout.rooms.find((entry)=>entry.kind === "dining" && !entry.absorbed)?.id ?? "";
                                    }
                                    setView(mode);
                                },
                                "aria-pressed": view === mode,
                                className: `rounded-full px-3.5 py-2 text-sm font-medium tracking-tight ${view === mode ? "bg-background text-foreground" : "text-foreground/65 hover:text-foreground"}`,
                                children: label
                            }, mode, false, {
                                fileName: "[project]/app/components/foreground-tour.tsx",
                                lineNumber: 497,
                                columnNumber: 13
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/app/components/foreground-tour.tsx",
                        lineNumber: 489,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "hidden text-sm text-background/70 sm:block",
                        children: view === "inside" ? "Drag to look · WASD to walk" : view === "floorplan" ? "Click a room to walk inside" : "Drag to orbit · click a room to walk inside"
                    }, void 0, false, {
                        fileName: "[project]/app/components/foreground-tour.tsx",
                        lineNumber: 515,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/components/foreground-tour.tsx",
                lineNumber: 488,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/components/foreground-tour.tsx",
        lineNumber: 472,
        columnNumber: 5
    }, this);
}
function drawPlan(group, layout, texture, showLabels, previous, progress, view) {
    const frame = layout.floorplan;
    if (frame && texture && frame.widthM > 0.1 && frame.depthM > 0.1) {
        const plane = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Mesh"](new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PlaneGeometry"](frame.widthM, frame.depthM), new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MeshStandardMaterial"]({
            map: texture,
            roughness: 1
        }));
        plane.rotation.x = -Math.PI / 2;
        plane.position.set(frame.originX + frame.widthM / 2, 0.02, frame.originZ + frame.depthM / 2);
        group.add(plane);
    }
    const edited = layout.freezerRemoved || Math.abs(layout.wallShift ?? 0) > 0.05;
    for (const poly of layout.polygons ?? []){
        const cover = poly.absorbed && poly.kind === "freezer";
        if (poly.absorbed && !cover) continue;
        const painted = cover ? {
            ...poly,
            kind: "kitchen",
            absorbed: true
        } : poly;
        const strong = !texture || edited && (painted.kind === "kitchen" || painted.kind === "dining" || cover);
        addPolygonFloor(group, painted, strong ? 0.94 : 0.34, cover ? 0.05 : 0.04);
        if (!showLabels || poly.absorbed || poly.points.length < 3) continue;
        const box = poly.points.reduce((span, point)=>({
                minX: Math.min(span.minX, point.x),
                maxX: Math.max(span.maxX, point.x),
                minZ: Math.min(span.minZ, point.z),
                maxZ: Math.max(span.maxZ, point.z)
            }), {
            minX: Infinity,
            maxX: -Infinity,
            minZ: Infinity,
            maxZ: -Infinity
        });
        if (box.maxX - box.minX < 1.1 || box.maxZ - box.minZ < 1.1) continue;
        const sprite = makeLabel((0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$floor$2d$layout$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["displayLabel"])(poly.label));
        const center = poly.points.reduce((sum, point)=>({
                x: sum.x + point.x,
                z: sum.z + point.z
            }), {
            x: 0,
            z: 0
        });
        sprite.position.set(center.x / poly.points.length, layout.height * 0.78, center.z / poly.points.length);
        const scale = labelWidth(Math.max(box.maxX - box.minX, box.maxZ - box.minZ), view);
        sprite.scale.set(scale, scale * (280 / 1024), 1);
        group.add(sprite);
    }
    drawWalls(group, previous && progress < 1 ? previous : null, layout, progress);
}
function addPolygonFloor(group, poly, opacity, y) {
    if (poly.points.length < 3) return;
    const shape = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Shape"](poly.points.map((point)=>new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Vector2"](point.x, -point.z)));
    const geometry = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ShapeGeometry"](shape);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Mesh"](geometry, new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MeshStandardMaterial"]({
        color: floorColor({
            id: poly.id,
            label: poly.label,
            kind: poly.kind,
            x: 0,
            z: 0,
            w: 1,
            d: 1,
            absorbed: poly.absorbed
        }),
        roughness: 1,
        transparent: opacity < 0.99,
        opacity
    }));
    mesh.position.y = y;
    group.add(mesh);
}
function drawWalls(group, previous, next, progress) {
    const upcoming = (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$floor$2d$layout$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["wallSegments"])(next);
    if (!previous) {
        for (const segment of upcoming)addSegment(group, segment, next.height, next.thickness, WALL[segment.role], 1);
        return;
    }
    const before = (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$floor$2d$layout$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["wallSegments"])(previous);
    const claimed = new Set();
    for (const segment of before){
        const match = upcoming.findIndex((candidate, index)=>!claimed.has(index) && sameWall(segment, candidate));
        if (match >= 0) {
            claimed.add(match);
            addSegment(group, slideWall(segment, upcoming[match], progress), next.height, next.thickness, WALL[upcoming[match].role], 1);
            continue;
        }
        const height = next.height * (1 - progress);
        if (height < 0.05) continue;
        addSegment(group, segment, height, next.thickness, 0xd9512c, 1 - progress * 0.35);
    }
    upcoming.forEach((segment, index)=>{
        if (claimed.has(index)) return;
        addSegment(group, segment, next.height * progress, next.thickness, WALL[segment.role], progress);
    });
}
function sameWall(left, right) {
    const leftSpan = Math.hypot(left.x2 - left.x1, left.z2 - left.z1) || 1;
    const rightSpan = Math.hypot(right.x2 - right.x1, right.z2 - right.z1) || 1;
    const dot = Math.abs((left.x2 - left.x1) / leftSpan * ((right.x2 - right.x1) / rightSpan) + (left.z2 - left.z1) / leftSpan * ((right.z2 - right.z1) / rightSpan));
    const distance = Math.hypot((left.x1 + left.x2) / 2 - (right.x1 + right.x2) / 2, (left.z1 + left.z2) / 2 - (right.z1 + right.z2) / 2);
    return dot > 0.85 && distance < 2.4 && Math.abs(leftSpan - rightSpan) < Math.max(leftSpan, rightSpan) * 0.6;
}
function slideWall(from, to, progress) {
    const flip = (from.x2 - from.x1) * (to.x2 - to.x1) + (from.z2 - from.z1) * (to.z2 - to.z1) < 0;
    const x2 = flip ? to.x1 : to.x2;
    const z2 = flip ? to.z1 : to.z2;
    const x1 = flip ? to.x2 : to.x1;
    const z1 = flip ? to.z2 : to.z1;
    return {
        x1: from.x1 + (x1 - from.x1) * progress,
        z1: from.z1 + (z1 - from.z1) * progress,
        x2: from.x2 + (x2 - from.x2) * progress,
        z2: from.z2 + (z2 - from.z2) * progress
    };
}
function easeOut(value) {
    return 1 - (1 - value) ** 3;
}
function labelWidth(span, view) {
    const cap = view === "floorplan" ? 12 : 9;
    return Math.min(Math.max(span, 4.4) * 1.2, cap);
}
function addSegment(group, segment, height, thickness, color, opacity = 1) {
    const dx = segment.x2 - segment.x1;
    const dz = segment.z2 - segment.z1;
    const length = Math.hypot(dx, dz);
    if (length < 0.05 || height < 0.04) return;
    const mesh = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Mesh"](new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["BoxGeometry"](length, height, Math.max(thickness, 0.08)), new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MeshStandardMaterial"]({
        color,
        roughness: 0.86,
        transparent: opacity < 0.98,
        opacity
    }));
    mesh.position.set((segment.x1 + segment.x2) / 2, height / 2, (segment.z1 + segment.z2) / 2);
    mesh.quaternion.setFromUnitVectors(new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Vector3"](1, 0, 0), new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Vector3"](dx / length, 0, dz / length));
    group.add(mesh);
}
function addBox(group, x, y, z, w, h, d, color) {
    const mesh = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Mesh"](new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["BoxGeometry"](Math.max(w, 0.01), Math.max(h, 0.01), Math.max(d, 0.01)), new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MeshStandardMaterial"]({
        color,
        roughness: 0.9,
        metalness: 0
    }));
    mesh.position.set(x + w / 2, y + h / 2, z + d / 2);
    group.add(mesh);
}
function makeLabel(text) {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 280;
    const context = canvas.getContext("2d");
    if (!context) return new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Sprite"]();
    context.fillStyle = "rgba(244,241,234,0.94)";
    context.beginPath();
    context.roundRect(20, 34, 984, 212, 106);
    context.fill();
    context.fillStyle = "#1b1a17";
    context.textAlign = "center";
    context.textBaseline = "middle";
    let size = 112;
    context.font = `600 ${size}px sans-serif`;
    while(context.measureText(text).width > 920 && size > 68){
        size -= 6;
        context.font = `600 ${size}px sans-serif`;
    }
    context.fillText(text, canvas.width / 2, canvas.height / 2 + 6);
    const material = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SpriteMaterial"]({
        map: new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CanvasTexture"](canvas),
        transparent: true,
        depthTest: false
    });
    return new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Sprite"](material);
}
function disposeObject(object) {
    object.traverse((child)=>{
        if (child instanceof __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Mesh"]) {
            child.geometry.dispose();
            const material = child.material;
            if (Array.isArray(material)) material.forEach((entry)=>entry.dispose());
            else material.dispose();
        }
        if (child instanceof __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Sprite"]) {
            child.material.map?.dispose();
            child.material.dispose();
        }
    });
}
}),
"[project]/app/components/property-info.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>PropertyInfo
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$matches$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/lib/matches.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$components$2f$space$2d$chat$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/components/space-chat.tsx [app-ssr] (ecmascript)");
"use client";
;
;
;
;
const number = new Intl.NumberFormat("en-US");
function PropertyInfo({ match, onBack, onTour }) {
    const facts = match.facts ?? {
        photos: [
            match.photo
        ],
        property: [
            {
                label: "Space Available",
                value: `${number.format(match.squareFeet)} sq ft`
            },
            {
                label: "Property Type",
                value: "Retail"
            },
            {
                label: "Availability",
                value: "Immediately"
            }
        ],
        location: [
            {
                label: "Matterport",
                value: `Model ${match.tourId}`
            }
        ]
    };
    const photos = facts.photos.length > 0 ? facts.photos : [
        match.photo
    ];
    const [index, setIndex] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(0);
    const [askOpen, setAskOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const hero = photos[index % photos.length];
    const thumbs = photos.filter((_, photoIndex)=>photoIndex !== index % photos.length).slice(0, 3);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const onKey = (event)=>{
            if (event.key !== "Escape") return;
            if (askOpen) {
                setAskOpen(false);
                return;
            }
            onBack();
        };
        window.addEventListener("keydown", onKey);
        return ()=>window.removeEventListener("keydown", onKey);
    }, [
        onBack,
        askOpen
    ]);
    function step(delta) {
        setIndex((current)=>(current + delta + photos.length) % photos.length);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "fixed inset-0 z-40 overflow-y-auto bg-background text-foreground",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                onClick: onBack,
                className: "ml-4 mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-foreground/70 transition-opacity hover:opacity-70",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(ChevronLeft, {}, void 0, false, {
                        fileName: "[project]/app/components/property-info.tsx",
                        lineNumber: 55,
                        columnNumber: 9
                    }, this),
                    "Back to Discover"
                ]
            }, void 0, true, {
                fileName: "[project]/app/components/property-info.tsx",
                lineNumber: 50,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mx-auto max-w-[68rem] px-6 pb-16 pt-8 sm:px-12",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "grid items-stretch gap-4 lg:grid-cols-[1.65fr_0.72fr]",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "relative aspect-[16/10] self-start overflow-hidden rounded-[1.35rem] bg-foreground/5",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                                        src: hero,
                                        alt: `${match.address} ${match.detail}`,
                                        className: "absolute inset-0 h-full w-full object-cover"
                                    }, void 0, false, {
                                        fileName: "[project]/app/components/property-info.tsx",
                                        lineNumber: 63,
                                        columnNumber: 13
                                    }, this),
                                    photos.length > 1 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "button",
                                                onClick: ()=>step(-1),
                                                "aria-label": "Previous photo",
                                                className: "absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm",
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(ChevronLeft, {}, void 0, false, {
                                                    fileName: "[project]/app/components/property-info.tsx",
                                                    lineNumber: 72,
                                                    columnNumber: 19
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/app/components/property-info.tsx",
                                                lineNumber: 66,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "button",
                                                onClick: ()=>step(1),
                                                "aria-label": "Next photo",
                                                className: "absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm",
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(ChevronRight, {}, void 0, false, {
                                                    fileName: "[project]/app/components/property-info.tsx",
                                                    lineNumber: 80,
                                                    columnNumber: 19
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/app/components/property-info.tsx",
                                                lineNumber: 74,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5",
                                                children: photos.map((photo, photoIndex)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: `h-1.5 w-1.5 rounded-full ${photoIndex === index % photos.length ? "bg-background" : "bg-background/45"}`
                                                    }, photo, false, {
                                                        fileName: "[project]/app/components/property-info.tsx",
                                                        lineNumber: 84,
                                                        columnNumber: 21
                                                    }, this))
                                            }, void 0, false, {
                                                fileName: "[project]/app/components/property-info.tsx",
                                                lineNumber: 82,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/components/property-info.tsx",
                                        lineNumber: 65,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/components/property-info.tsx",
                                lineNumber: 60,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "grid grid-cols-3 gap-3 lg:h-full lg:grid-cols-1 lg:grid-rows-3",
                                children: thumbs.map((photo, thumbIndex)=>{
                                    const photoIndex = photos.indexOf(photo);
                                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        onClick: ()=>setIndex(photoIndex),
                                        className: "relative aspect-[16/9] min-h-0 overflow-hidden rounded-[1.1rem] bg-foreground/5 lg:aspect-auto",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                                                src: photo,
                                                alt: "",
                                                className: "absolute inset-0 h-full w-full object-cover"
                                            }, void 0, false, {
                                                fileName: "[project]/app/components/property-info.tsx",
                                                lineNumber: 105,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "sr-only",
                                                children: [
                                                    "Show photo ",
                                                    thumbIndex + 1
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/app/components/property-info.tsx",
                                                lineNumber: 106,
                                                columnNumber: 19
                                            }, this)
                                        ]
                                    }, photo, true, {
                                        fileName: "[project]/app/components/property-info.tsx",
                                        lineNumber: 98,
                                        columnNumber: 17
                                    }, this);
                                })
                            }, void 0, false, {
                                fileName: "[project]/app/components/property-info.tsx",
                                lineNumber: 94,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/components/property-info.tsx",
                        lineNumber: 59,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mt-5 flex flex-wrap items-start justify-between gap-6",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "max-w-xl",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                                        className: "text-[clamp(1.7rem,3vw,2.15rem)] font-medium tracking-tight",
                                        children: [
                                            match.address,
                                            match.detail ? ` · ${match.detail}` : ""
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/components/property-info.tsx",
                                        lineNumber: 115,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "mt-1 text-sm text-foreground/50",
                                        children: match.city
                                    }, void 0, false, {
                                        fileName: "[project]/app/components/property-info.tsx",
                                        lineNumber: 119,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "mt-3 max-w-lg text-[0.95rem] leading-relaxed text-foreground/60",
                                        children: match.blurb
                                    }, void 0, false, {
                                        fileName: "[project]/app/components/property-info.tsx",
                                        lineNumber: 120,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/components/property-info.tsx",
                                lineNumber: 114,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-center gap-3",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-[clamp(1.6rem,2.6vw,2rem)] font-medium tracking-tight tabular-nums",
                                        children: [
                                            "$",
                                            number.format((0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$matches$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["monthlyRent"])(match)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "text-[0.55em] font-normal text-foreground/45",
                                                children: "/mo"
                                            }, void 0, false, {
                                                fileName: "[project]/app/components/property-info.tsx",
                                                lineNumber: 125,
                                                columnNumber: 15
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/components/property-info.tsx",
                                        lineNumber: 123,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "rounded-full bg-match-soft px-3 py-1 text-sm font-medium tabular-nums text-match",
                                        children: [
                                            match.confidence,
                                            "% match"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/components/property-info.tsx",
                                        lineNumber: 127,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/components/property-info.tsx",
                                lineNumber: 122,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/components/property-info.tsx",
                        lineNumber: 113,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mt-8 grid gap-14 border-t border-foreground/10 pt-6 md:grid-cols-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(FactList, {
                                title: "Property Details",
                                rows: facts.property
                            }, void 0, false, {
                                fileName: "[project]/app/components/property-info.tsx",
                                lineNumber: 134,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(FactList, {
                                title: "Location & Area",
                                rows: facts.location
                            }, void 0, false, {
                                fileName: "[project]/app/components/property-info.tsx",
                                lineNumber: 135,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/components/property-info.tsx",
                        lineNumber: 133,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "mt-5 text-xs text-foreground/40",
                        children: "From the CoStar listing and the Matterport model on file."
                    }, void 0, false, {
                        fileName: "[project]/app/components/property-info.tsx",
                        lineNumber: 138,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mt-5 flex flex-wrap gap-3",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                onClick: onTour,
                                className: "inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition-opacity hover:opacity-90",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Cube, {}, void 0, false, {
                                        fileName: "[project]/app/components/property-info.tsx",
                                        lineNumber: 148,
                                        columnNumber: 13
                                    }, this),
                                    "Open 3D Tour"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/components/property-info.tsx",
                                lineNumber: 143,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                onClick: ()=>setAskOpen((current)=>!current),
                                "aria-expanded": askOpen,
                                className: "inline-flex items-center gap-2 rounded-full border border-foreground/20 bg-background px-5 py-3 text-sm font-medium transition-opacity hover:opacity-70",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Spark, {}, void 0, false, {
                                        fileName: "[project]/app/components/property-info.tsx",
                                        lineNumber: 157,
                                        columnNumber: 13
                                    }, this),
                                    "Ask AI About This Space"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/components/property-info.tsx",
                                lineNumber: 151,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/components/property-info.tsx",
                        lineNumber: 142,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/components/property-info.tsx",
                lineNumber: 58,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$components$2f$space$2d$chat$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                match: match,
                open: askOpen,
                onOpenChange: setAskOpen
            }, void 0, false, {
                fileName: "[project]/app/components/property-info.tsx",
                lineNumber: 162,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/components/property-info.tsx",
        lineNumber: 49,
        columnNumber: 5
    }, this);
}
function FactList({ title, rows }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                className: "text-lg font-medium tracking-tight",
                children: title
            }, void 0, false, {
                fileName: "[project]/app/components/property-info.tsx",
                lineNumber: 170,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("dl", {
                className: "mt-6 space-y-5",
                children: rows.map((row)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "grid grid-cols-[1.1fr_1.4fr] items-baseline gap-4 text-base",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("dt", {
                                className: "text-foreground/55",
                                children: row.label
                            }, void 0, false, {
                                fileName: "[project]/app/components/property-info.tsx",
                                lineNumber: 174,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("dd", {
                                className: "font-medium",
                                children: row.value
                            }, void 0, false, {
                                fileName: "[project]/app/components/property-info.tsx",
                                lineNumber: 175,
                                columnNumber: 13
                            }, this)
                        ]
                    }, row.label, true, {
                        fileName: "[project]/app/components/property-info.tsx",
                        lineNumber: 173,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/app/components/property-info.tsx",
                lineNumber: 171,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/components/property-info.tsx",
        lineNumber: 169,
        columnNumber: 5
    }, this);
}
function ChevronLeft() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
        viewBox: "0 0 24 24",
        className: "h-4 w-4",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1.8",
        "aria-hidden": "true",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
            d: "M14.5 6.5 9 12l5.5 5.5",
            strokeLinecap: "round",
            strokeLinejoin: "round"
        }, void 0, false, {
            fileName: "[project]/app/components/property-info.tsx",
            lineNumber: 186,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/app/components/property-info.tsx",
        lineNumber: 185,
        columnNumber: 5
    }, this);
}
function ChevronRight() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
        viewBox: "0 0 24 24",
        className: "h-4 w-4",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1.8",
        "aria-hidden": "true",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
            d: "M9.5 6.5 15 12l-5.5 5.5",
            strokeLinecap: "round",
            strokeLinejoin: "round"
        }, void 0, false, {
            fileName: "[project]/app/components/property-info.tsx",
            lineNumber: 194,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/app/components/property-info.tsx",
        lineNumber: 193,
        columnNumber: 5
    }, this);
}
function Cube() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
        viewBox: "0 0 24 24",
        className: "h-4 w-4",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1.7",
        "aria-hidden": "true",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                d: "M12 3.5 19 7.5v9L12 20.5 5 16.5v-9L12 3.5Z",
                strokeLinejoin: "round"
            }, void 0, false, {
                fileName: "[project]/app/components/property-info.tsx",
                lineNumber: 202,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                d: "M12 12.2 19 7.7M12 12.2 5 7.7M12 12.2v8.3",
                strokeLinejoin: "round"
            }, void 0, false, {
                fileName: "[project]/app/components/property-info.tsx",
                lineNumber: 203,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/components/property-info.tsx",
        lineNumber: 201,
        columnNumber: 5
    }, this);
}
function Spark() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
        viewBox: "0 0 24 24",
        className: "h-4 w-4",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1.7",
        "aria-hidden": "true",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                d: "M12 4.5 13.2 9 17.5 10.2 13.2 11.4 12 16 10.8 11.4 6.5 10.2 10.8 9 12 4.5Z",
                strokeLinejoin: "round"
            }, void 0, false, {
                fileName: "[project]/app/components/property-info.tsx",
                lineNumber: 211,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                d: "m17.2 14.2.5 1.6 1.6.5-1.6.5-.5 1.6-.5-1.6-1.6-.5 1.6-.5.5-1.6Z",
                strokeLinejoin: "round"
            }, void 0, false, {
                fileName: "[project]/app/components/property-info.tsx",
                lineNumber: 212,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/components/property-info.tsx",
        lineNumber: 210,
        columnNumber: 5
    }, this);
}
}),
"[project]/app/components/space-chat.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>SpaceChat
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$matches$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/lib/matches.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
const number = new Intl.NumberFormat("en-US");
const SUGGESTIONS = [
    "Monthly rent",
    "Suite size",
    "The neighborhood",
    "Is it available?"
];
function fact(match, label) {
    const rows = [
        ...match.facts?.property ?? [],
        ...match.facts?.location ?? []
    ];
    return rows.find((row)=>row.label === label)?.value;
}
function answer(match, question) {
    const q = question.toLowerCase();
    const rent = `$${number.format((0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$matches$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["monthlyRent"])(match))}/mo`;
    const space = fact(match, "Space Available") ?? `${number.format(match.squareFeet)} sq ft`;
    const neighborhood = fact(match, "Neighborhood");
    const availability = fact(match, "Availability") ?? "Immediately";
    if (/rent|cost|price|month|afford/.test(q)) {
        return `${match.detail || match.address} is listed at ${rent}, about $${match.rentPerSquareFootYear} per square foot per year.`;
    }
    if (/size|big|square|sq|foot|sf|seat/.test(q)) {
        return `The available space is ${space}. The building line is ${fact(match, "Building") ?? "on the CoStar record"}.`;
    }
    if (/avail|when|move|open/.test(q)) {
        return `CoStar lists this space as ${availability}.`;
    }
    if (/where|neigh|area|near|traffic|front|park|location/.test(q)) {
        const bits = [
            neighborhood,
            fact(match, "Frontage"),
            fact(match, "Daily traffic"),
            fact(match, "Parking")
        ].filter(Boolean);
        return bits.length > 0 ? bits.join(". ") + "." : `${match.address} is in ${match.city}.`;
    }
    if (/built|year|class|renovat|type|restaurant|retail/.test(q)) {
        return [
            fact(match, "Property Type"),
            fact(match, "Built"),
            fact(match, "Building")
        ].filter(Boolean).join(". ") + ".";
    }
    if (/tour|matterport|3d|walk/.test(q)) {
        return `A Matterport model is on file for this space. Open 3D Tour to walk it.`;
    }
    return `${match.blurb} Rent is ${rent}, the suite is ${space}, and availability is ${availability}${neighborhood ? ` in ${neighborhood}` : ""}.`;
}
function SpaceChat({ match, open, onOpenChange }) {
    const [messages, setMessages] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [value, setValue] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const listRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const inputRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
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
    function send(text) {
        const trimmed = text.trim();
        if (!trimmed) return;
        setValue("");
        setMessages((current)=>[
                ...current,
                {
                    role: "user",
                    text: trimmed
                },
                {
                    role: "agent",
                    text: answer(match, trimmed)
                }
            ]);
    }
    function submit(event) {
        event?.preventDefault();
        send(value);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
        "aria-hidden": !open,
        inert: !open,
        className: `fixed bottom-3 right-3 top-3 z-50 flex w-[min(calc(100%-1.5rem),24rem)] flex-col overflow-hidden rounded-[1.75rem] bg-background font-sans font-medium tracking-tight text-foreground shadow-[0_24px_60px_rgb(27_26_23/0.22)] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${open ? "translate-x-0" : "pointer-events-none translate-x-[110%]"}`,
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
                                    d: "M12 3.5v2",
                                    strokeLinecap: "round"
                                }, void 0, false, {
                                    fileName: "[project]/app/components/space-chat.tsx",
                                    lineNumber: 82,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                                    cx: "12",
                                    cy: "2.6",
                                    r: "1",
                                    fill: "currentColor",
                                    stroke: "none"
                                }, void 0, false, {
                                    fileName: "[project]/app/components/space-chat.tsx",
                                    lineNumber: 83,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("rect", {
                                    x: "4.5",
                                    y: "6.5",
                                    width: "15",
                                    height: "12",
                                    rx: "4"
                                }, void 0, false, {
                                    fileName: "[project]/app/components/space-chat.tsx",
                                    lineNumber: 84,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                                    cx: "9",
                                    cy: "12",
                                    r: "1",
                                    fill: "currentColor",
                                    stroke: "none"
                                }, void 0, false, {
                                    fileName: "[project]/app/components/space-chat.tsx",
                                    lineNumber: 85,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                                    cx: "15",
                                    cy: "12",
                                    r: "1",
                                    fill: "currentColor",
                                    stroke: "none"
                                }, void 0, false, {
                                    fileName: "[project]/app/components/space-chat.tsx",
                                    lineNumber: 86,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                    d: "M9 15.2h6",
                                    strokeLinecap: "round"
                                }, void 0, false, {
                                    fileName: "[project]/app/components/space-chat.tsx",
                                    lineNumber: 87,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/components/space-chat.tsx",
                            lineNumber: 81,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/app/components/space-chat.tsx",
                        lineNumber: 80,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "min-w-0 flex-1 pt-0.5",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "text-lg leading-tight",
                                children: "Space agent"
                            }, void 0, false, {
                                fileName: "[project]/app/components/space-chat.tsx",
                                lineNumber: 91,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "mt-0.5 text-sm text-foreground/45",
                                children: "Ask about this listing"
                            }, void 0, false, {
                                fileName: "[project]/app/components/space-chat.tsx",
                                lineNumber: 92,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/components/space-chat.tsx",
                        lineNumber: 90,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: ()=>onOpenChange(false),
                        "aria-label": "Close space agent",
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
                                fileName: "[project]/app/components/space-chat.tsx",
                                lineNumber: 101,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/app/components/space-chat.tsx",
                            lineNumber: 100,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/app/components/space-chat.tsx",
                        lineNumber: 94,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/components/space-chat.tsx",
                lineNumber: 79,
                columnNumber: 7
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
                                            fileName: "[project]/app/components/space-chat.tsx",
                                            lineNumber: 111,
                                            columnNumber: 17
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/app/components/space-chat.tsx",
                                        lineNumber: 110,
                                        columnNumber: 15
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/app/components/space-chat.tsx",
                                    lineNumber: 109,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "leading-snug",
                                            children: [
                                                "Ask anything about ",
                                                match.detail || match.address,
                                                "."
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/app/components/space-chat.tsx",
                                            lineNumber: 115,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "mt-1 text-sm leading-snug text-foreground/55",
                                            children: "Rent, size, availability, and the neighborhood all come from the CoStar listing."
                                        }, void 0, false, {
                                            fileName: "[project]/app/components/space-chat.tsx",
                                            lineNumber: 116,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/app/components/space-chat.tsx",
                                    lineNumber: 114,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/components/space-chat.tsx",
                            lineNumber: 108,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/app/components/space-chat.tsx",
                        lineNumber: 107,
                        columnNumber: 9
                    }, this),
                    messages.map((message, index)=>message.role === "user" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "ml-auto w-fit max-w-[85%] rounded-full bg-accent px-4 py-2 text-sm text-background",
                            children: message.text
                        }, `${message.role}-${index}`, false, {
                            fileName: "[project]/app/components/space-chat.tsx",
                            lineNumber: 125,
                            columnNumber: 13
                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex items-start gap-2",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-foreground/10 text-foreground",
                                    "aria-hidden": true,
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                        width: "14",
                                        height: "14",
                                        viewBox: "0 0 24 24",
                                        fill: "none",
                                        stroke: "currentColor",
                                        strokeWidth: "1.6",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                                d: "M12 3.5v2",
                                                strokeLinecap: "round"
                                            }, void 0, false, {
                                                fileName: "[project]/app/components/space-chat.tsx",
                                                lineNumber: 132,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("rect", {
                                                x: "4.5",
                                                y: "6.5",
                                                width: "15",
                                                height: "12",
                                                rx: "4"
                                            }, void 0, false, {
                                                fileName: "[project]/app/components/space-chat.tsx",
                                                lineNumber: 133,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                                                cx: "9",
                                                cy: "12",
                                                r: "1",
                                                fill: "currentColor",
                                                stroke: "none"
                                            }, void 0, false, {
                                                fileName: "[project]/app/components/space-chat.tsx",
                                                lineNumber: 134,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                                                cx: "15",
                                                cy: "12",
                                                r: "1",
                                                fill: "currentColor",
                                                stroke: "none"
                                            }, void 0, false, {
                                                fileName: "[project]/app/components/space-chat.tsx",
                                                lineNumber: 135,
                                                columnNumber: 19
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/components/space-chat.tsx",
                                        lineNumber: 131,
                                        columnNumber: 17
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/app/components/space-chat.tsx",
                                    lineNumber: 130,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "max-w-[85%] rounded-2xl bg-panel px-3.5 py-2.5 text-sm leading-snug",
                                    children: message.text
                                }, void 0, false, {
                                    fileName: "[project]/app/components/space-chat.tsx",
                                    lineNumber: 138,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, `${message.role}-${index}`, true, {
                            fileName: "[project]/app/components/space-chat.tsx",
                            lineNumber: 129,
                            columnNumber: 13
                        }, this)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "pt-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "mb-2 text-sm text-foreground/60",
                                children: "Try a quick question"
                            }, void 0, false, {
                                fileName: "[project]/app/components/space-chat.tsx",
                                lineNumber: 144,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex flex-wrap gap-2",
                                children: SUGGESTIONS.map((suggestion)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        onClick: ()=>send(suggestion),
                                        className: "rounded-full border border-foreground/15 bg-background px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-panel",
                                        children: suggestion
                                    }, suggestion, false, {
                                        fileName: "[project]/app/components/space-chat.tsx",
                                        lineNumber: 147,
                                        columnNumber: 15
                                    }, this))
                            }, void 0, false, {
                                fileName: "[project]/app/components/space-chat.tsx",
                                lineNumber: 145,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/components/space-chat.tsx",
                        lineNumber: 143,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/components/space-chat.tsx",
                lineNumber: 106,
                columnNumber: 7
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
                            className: "shrink-0 rounded-full bg-[#d5d0c6] px-3.5 py-2 text-sm text-foreground",
                            children: "Ask"
                        }, void 0, false, {
                            fileName: "[project]/app/components/space-chat.tsx",
                            lineNumber: 162,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                            ref: inputRef,
                            value: value,
                            onChange: (event)=>setValue(event.target.value),
                            placeholder: "rent, size, the block…",
                            className: "min-w-0 flex-1 bg-transparent px-1.5 text-sm text-foreground outline-none placeholder:text-foreground/35"
                        }, void 0, false, {
                            fileName: "[project]/app/components/space-chat.tsx",
                            lineNumber: 169,
                            columnNumber: 11
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
                                    fileName: "[project]/app/components/space-chat.tsx",
                                    lineNumber: 183,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/app/components/space-chat.tsx",
                                lineNumber: 182,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/app/components/space-chat.tsx",
                            lineNumber: 176,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/app/components/space-chat.tsx",
                    lineNumber: 161,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/components/space-chat.tsx",
                lineNumber: 160,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/components/space-chat.tsx",
        lineNumber: 72,
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
const FURNITURE_SUGGESTIONS = [
    "Add a dining table",
    "Add a sofa",
    "Add four chairs"
];
const STRUCTURE_SUGGESTIONS = [
    "Remove the bathroom",
    "Extend the kitchen",
    "Add a dining table"
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
function TourChat({ sdk, open, onOpenChange, pieces, onPiecesChange, mode, freezerRemoved, hasFreezer, rooms, anchors, onStructure }) {
    const [messages, setMessages] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [value, setValue] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const [total, setTotal] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(0);
    const [busy, setBusy] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
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
        const result = (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$tour$2d$agent$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["tourAgentReply"])(trimmed, pieces.length, {
            mode,
            freezerRemoved,
            hasFreezer
        });
        if (result.action.type === "structure") onStructure(result.action.edit);
        else if (result.action.type === "move") slide(result.action.direction, result.action.meters);
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
                        lineNumber: 133,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "pointer-events-none absolute inset-0 animate-agent-ring rounded-full border-2 border-accent",
                        "aria-hidden": true
                    }, void 0, false, {
                        fileName: "[project]/app/components/tour-chat.tsx",
                        lineNumber: 134,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "pointer-events-none absolute inset-0 animate-agent-ring rounded-full border-2 border-accent/70 [animation-delay:0.55s]",
                        "aria-hidden": true
                    }, void 0, false, {
                        fileName: "[project]/app/components/tour-chat.tsx",
                        lineNumber: 135,
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
                                    lineNumber: 147,
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
                                    lineNumber: 148,
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
                                    lineNumber: 149,
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
                                    lineNumber: 150,
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
                                    lineNumber: 151,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                    d: "M9 15.2h6",
                                    strokeLinecap: "round"
                                }, void 0, false, {
                                    fileName: "[project]/app/components/tour-chat.tsx",
                                    lineNumber: 152,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/components/tour-chat.tsx",
                            lineNumber: 146,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/app/components/tour-chat.tsx",
                        lineNumber: 139,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/components/tour-chat.tsx",
                lineNumber: 128,
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
                                            lineNumber: 166,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                            d: "M17 18h1.5A1.5 1.5 0 0 0 20 16.5V14",
                                            strokeLinecap: "round"
                                        }, void 0, false, {
                                            fileName: "[project]/app/components/tour-chat.tsx",
                                            lineNumber: 167,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                            d: "M4 13.5C4 10 6.5 8 9 8h6c2.5 0 5 2 5 5.5V14H4v-.5z"
                                        }, void 0, false, {
                                            fileName: "[project]/app/components/tour-chat.tsx",
                                            lineNumber: 168,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                            d: "M7 8V6.5A1.5 1.5 0 0 1 8.5 5h7A1.5 1.5 0 0 1 17 6.5V8"
                                        }, void 0, false, {
                                            fileName: "[project]/app/components/tour-chat.tsx",
                                            lineNumber: 169,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/app/components/tour-chat.tsx",
                                    lineNumber: 165,
                                    columnNumber: 13
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/app/components/tour-chat.tsx",
                                lineNumber: 164,
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
                                        lineNumber: 173,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "mt-0.5 text-sm text-foreground/45",
                                        children: mode === "foreground" ? "Move the walls in this tour" : "Restage this room live as you type"
                                    }, void 0, false, {
                                        fileName: "[project]/app/components/tour-chat.tsx",
                                        lineNumber: 174,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/components/tour-chat.tsx",
                                lineNumber: 172,
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
                                        lineNumber: 185,
                                        columnNumber: 15
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/app/components/tour-chat.tsx",
                                    lineNumber: 184,
                                    columnNumber: 13
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/app/components/tour-chat.tsx",
                                lineNumber: 178,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/components/tour-chat.tsx",
                        lineNumber: 163,
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
                                                    lineNumber: 195,
                                                    columnNumber: 19
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/app/components/tour-chat.tsx",
                                                lineNumber: 194,
                                                columnNumber: 17
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/app/components/tour-chat.tsx",
                                            lineNumber: 193,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "leading-snug",
                                                    children: mode === "foreground" ? "Tell me which wall should move." : "Describe any furniture or layout changes."
                                                }, void 0, false, {
                                                    fileName: "[project]/app/components/tour-chat.tsx",
                                                    lineNumber: 199,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "mt-1 text-sm leading-snug text-foreground/55",
                                                    children: mode === "foreground" ? "Removing the freezer or shifting a wall updates this model while you walk through it." : "I’ll restage this room in the tour as you type, so you can see updates in real time."
                                                }, void 0, false, {
                                                    fileName: "[project]/app/components/tour-chat.tsx",
                                                    lineNumber: 202,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/app/components/tour-chat.tsx",
                                            lineNumber: 198,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/app/components/tour-chat.tsx",
                                    lineNumber: 192,
                                    columnNumber: 13
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/app/components/tour-chat.tsx",
                                lineNumber: 191,
                                columnNumber: 11
                            }, this),
                            messages.map((message, index)=>message.role === "user" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "ml-auto w-fit max-w-[85%] rounded-full bg-accent px-4 py-2 text-sm text-background",
                                    children: message.text
                                }, `${message.role}-${index}`, false, {
                                    fileName: "[project]/app/components/tour-chat.tsx",
                                    lineNumber: 213,
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
                                                        lineNumber: 220,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                                        d: "M3 10c0-2 1.6-3.2 3.4-3.2h3.2C11.4 6.8 13 8 13 10v.4H3V10z"
                                                    }, void 0, false, {
                                                        fileName: "[project]/app/components/tour-chat.tsx",
                                                        lineNumber: 221,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/app/components/tour-chat.tsx",
                                                lineNumber: 219,
                                                columnNumber: 19
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/app/components/tour-chat.tsx",
                                            lineNumber: 218,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "max-w-[85%] rounded-2xl bg-panel px-3.5 py-2.5 text-sm leading-snug",
                                            children: message.text
                                        }, void 0, false, {
                                            fileName: "[project]/app/components/tour-chat.tsx",
                                            lineNumber: 224,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, `${message.role}-${index}`, true, {
                                    fileName: "[project]/app/components/tour-chat.tsx",
                                    lineNumber: 217,
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
                                        lineNumber: 230,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex flex-wrap gap-2",
                                        children: (mode === "foreground" ? STRUCTURE_SUGGESTIONS : FURNITURE_SUGGESTIONS).map((suggestion)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "button",
                                                onClick: ()=>send(suggestion),
                                                className: "rounded-full border border-foreground/15 bg-background px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-panel",
                                                children: suggestion
                                            }, suggestion, false, {
                                                fileName: "[project]/app/components/tour-chat.tsx",
                                                lineNumber: 233,
                                                columnNumber: 17
                                            }, this))
                                    }, void 0, false, {
                                        fileName: "[project]/app/components/tour-chat.tsx",
                                        lineNumber: 231,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/components/tour-chat.tsx",
                                lineNumber: 229,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/components/tour-chat.tsx",
                        lineNumber: 190,
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
                                    className: "shrink-0 rounded-full bg-[#d5d0c6] px-3.5 py-2 text-sm text-foreground",
                                    children: "Edit"
                                }, void 0, false, {
                                    fileName: "[project]/app/components/tour-chat.tsx",
                                    lineNumber: 248,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                    ref: inputRef,
                                    value: value,
                                    onChange: (event)=>setValue(event.target.value),
                                    placeholder: mode === "foreground" ? "change, like “remove the freezer”…" : "change, like “add a rug”…",
                                    className: "min-w-0 flex-1 bg-transparent px-1.5 text-sm text-foreground outline-none placeholder:text-foreground/35"
                                }, void 0, false, {
                                    fileName: "[project]/app/components/tour-chat.tsx",
                                    lineNumber: 255,
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
                                            lineNumber: 269,
                                            columnNumber: 17
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/app/components/tour-chat.tsx",
                                        lineNumber: 268,
                                        columnNumber: 15
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/app/components/tour-chat.tsx",
                                    lineNumber: 262,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/components/tour-chat.tsx",
                            lineNumber: 247,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/app/components/tour-chat.tsx",
                        lineNumber: 246,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/components/tour-chat.tsx",
                lineNumber: 157,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/components/tour-chat.tsx",
        lineNumber: 127,
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
                                        lineNumber: 392,
                                        columnNumber: 19
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "whitespace-nowrap text-xs font-medium tracking-tight",
                                        children: piece.label
                                    }, void 0, false, {
                                        fileName: "[project]/app/components/tour-chat.tsx",
                                        lineNumber: 399,
                                        columnNumber: 19
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/components/tour-chat.tsx",
                                lineNumber: 388,
                                columnNumber: 17
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/app/components/tour-chat.tsx",
                            lineNumber: 387,
                            columnNumber: 15
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/app/components/tour-chat.tsx",
                        lineNumber: 386,
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
                        lineNumber: 403,
                        columnNumber: 13
                    }, this)
                ]
            }, piece.id, true, {
                fileName: "[project]/app/components/tour-chat.tsx",
                lineNumber: 381,
                columnNumber: 11
            }, this);
        })
    }, void 0, false, {
        fileName: "[project]/app/components/tour-chat.tsx",
        lineNumber: 372,
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
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$floor$2d$layout$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/lib/floor-layout.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$components$2f$foreground$2d$tour$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/components/foreground-tour.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$components$2f$tour$2d$chat$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/components/tour-chat.tsx [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
function TourOverlay({ tourId, title, detail, squareFeet, openChat = false, onClose }) {
    const containerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const labelId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useId"])();
    const [status, setStatus] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("loading");
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [sdk, setSdk] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [chatOpen, setChatOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(openChat);
    const [pieces, setPieces] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [mode, setMode] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("matterport");
    const [layout, setLayout] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$floor$2d$layout$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["buildLayout"])(squareFeet));
    const [planError, setPlanError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    function editStructure(edit) {
        setLayout((current)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$floor$2d$layout$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["applyStructure"])(current, edit));
    }
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
            setMode("matterport");
            setLayout((0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$floor$2d$layout$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["buildLayout"])(squareFeet));
            setPlanError(null);
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
        tourId,
        squareFeet
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!sdk) return;
        const scan = {
            rooms: [],
            sweeps: []
        };
        const publish = ()=>{
            const next = (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$floor$2d$layout$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["buildLayoutFromScan"])(scan.rooms, scan.sweeps);
            if (next.source !== "scan") return;
            setLayout((current)=>{
                if (current.source === "plan") return current;
                if (current.measuredKey === next.measuredKey && current.source === "scan") return current;
                return current.freezerRemoved ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$floor$2d$layout$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["applyStructure"])(next, {
                    kind: "remove-freezer"
                }) : next;
            });
        };
        const subscription = sdk.Room.data.subscribe({
            onCollectionUpdated (collection) {
                scan.rooms = Object.values(collection).map((entry)=>({
                        id: entry.id,
                        label: entry.label || "Room",
                        min: {
                            x: entry.bounds.min.x,
                            z: entry.bounds.min.z
                        },
                        max: {
                            x: entry.bounds.max.x,
                            z: entry.bounds.max.z
                        },
                        floor: entry.floorInfo?.sequence ?? 0
                    }));
                publish();
            }
        });
        const sweeps = sdk.Sweep.data.subscribe({
            onCollectionUpdated (collection) {
                scan.sweeps = Object.values(collection).map((entry)=>({
                        x: entry.position.x,
                        z: entry.position.z
                    }));
                publish();
            }
        });
        return ()=>{
            subscription.cancel();
            sweeps.cancel();
        };
    }, [
        sdk
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const controller = new AbortController();
        void (async ()=>{
            try {
                const response = await fetch("/api/layout-analyze", {
                    method: "POST",
                    headers: {
                        "content-type": "application/json"
                    },
                    body: JSON.stringify({
                        modelId: tourId,
                        squareFeet
                    }),
                    signal: controller.signal
                });
                const data = await response.json();
                if (!response.ok || !data.layout || data.layout.source !== "plan") {
                    if (!controller.signal.aborted) setPlanError(data.error || "The floorplan could not be traced.");
                    return;
                }
                setPlanError(null);
                setLayout((current)=>{
                    if (current.measuredKey === data.layout.measuredKey && current.source === "plan") return current;
                    return current.freezerRemoved ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$floor$2d$layout$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["applyStructure"])(data.layout, {
                        kind: "remove-freezer"
                    }) : data.layout;
                });
            } catch (error) {
                if (controller.signal.aborted) return;
                setPlanError(error instanceof Error ? error.message : "The floorplan could not be traced.");
            }
        })();
        return ()=>controller.abort();
    }, [
        tourId,
        squareFeet
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
                        lineNumber: 210,
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
                                lineNumber: 218,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "truncate text-xs text-background/55",
                                children: mode === "foreground" ? "Foreground tour — walk through it, and the layout agent can move the walls" : status !== "ready" ? "Opening tour…" : chatOpen ? "Layout agent is live — edits appear in the tour" : "Aerial view — click into the model to go inside"
                            }, void 0, false, {
                                fileName: "[project]/app/components/tour-overlay.tsx",
                                lineNumber: 222,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/components/tour-overlay.tsx",
                        lineNumber: 217,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/components/tour-overlay.tsx",
                lineNumber: 209,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "relative min-h-0 flex-1 bg-foreground",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: `absolute inset-0 ${mode === "foreground" ? "z-10" : "invisible pointer-events-none"}`,
                        children: layout.source !== "pending" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$components$2f$foreground$2d$tour$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                            title: title,
                            detail: detail,
                            squareFeet: squareFeet,
                            layout: layout
                        }, void 0, false, {
                            fileName: "[project]/app/components/tour-overlay.tsx",
                            lineNumber: 237,
                            columnNumber: 13
                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "absolute inset-0 flex items-center justify-center bg-[#141413] px-8 text-center text-background/70",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "max-w-md text-sm",
                                children: planError ?? "Reading the floorplan…"
                            }, void 0, false, {
                                fileName: "[project]/app/components/tour-overlay.tsx",
                                lineNumber: 240,
                                columnNumber: 15
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/app/components/tour-overlay.tsx",
                            lineNumber: 239,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/app/components/tour-overlay.tsx",
                        lineNumber: 235,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        ref: containerRef,
                        className: `absolute inset-0 ${mode === "matterport" ? "" : "invisible pointer-events-none"}`
                    }, void 0, false, {
                        fileName: "[project]/app/components/tour-overlay.tsx",
                        lineNumber: 244,
                        columnNumber: 9
                    }, this),
                    mode === "matterport" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$components$2f$tour$2d$chat$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TourGhosts"], {
                        pieces: pieces,
                        sdk: sdk,
                        onPiecesChange: setPieces
                    }, void 0, false, {
                        fileName: "[project]/app/components/tour-overlay.tsx",
                        lineNumber: 245,
                        columnNumber: 35
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(TourModeSwitch, {
                        mode: mode,
                        onChange: setMode
                    }, void 0, false, {
                        fileName: "[project]/app/components/tour-overlay.tsx",
                        lineNumber: 246,
                        columnNumber: 9
                    }, this),
                    (status === "ready" || mode === "foreground") && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$components$2f$tour$2d$chat$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                        sdk: sdk,
                        open: chatOpen,
                        onOpenChange: setChatOpen,
                        pieces: pieces,
                        onPiecesChange: setPieces,
                        mode: mode,
                        freezerRemoved: layout.freezerRemoved,
                        hasFreezer: layout.rooms.some((entry)=>entry.kind === "freezer"),
                        onStructure: editStructure
                    }, void 0, false, {
                        fileName: "[project]/app/components/tour-overlay.tsx",
                        lineNumber: 249,
                        columnNumber: 11
                    }, this),
                    status === "loading" && mode === "matterport" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "pointer-events-none absolute inset-0 flex items-center justify-center bg-foreground/40",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "inline-block h-2.5 w-2.5 animate-breathe rounded-full bg-background/70"
                        }, void 0, false, {
                            fileName: "[project]/app/components/tour-overlay.tsx",
                            lineNumber: 264,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/app/components/tour-overlay.tsx",
                        lineNumber: 263,
                        columnNumber: 11
                    }, this),
                    status === "error" && mode === "matterport" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "absolute inset-0 flex items-center justify-center bg-foreground px-8 text-center",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "max-w-md",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "text-lg font-medium",
                                    children: "Tour unavailable"
                                }, void 0, false, {
                                    fileName: "[project]/app/components/tour-overlay.tsx",
                                    lineNumber: 271,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "mt-3 text-sm text-background/60",
                                    children: error
                                }, void 0, false, {
                                    fileName: "[project]/app/components/tour-overlay.tsx",
                                    lineNumber: 272,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: onClose,
                                    className: "mt-8 rounded-full bg-background px-5 py-2.5 text-sm font-medium text-foreground",
                                    children: "Back to Discover"
                                }, void 0, false, {
                                    fileName: "[project]/app/components/tour-overlay.tsx",
                                    lineNumber: 273,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/components/tour-overlay.tsx",
                            lineNumber: 270,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/app/components/tour-overlay.tsx",
                        lineNumber: 269,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/components/tour-overlay.tsx",
                lineNumber: 234,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/components/tour-overlay.tsx",
        lineNumber: 203,
        columnNumber: 5
    }, this);
}
function TourModeSwitch({ mode, onChange }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "absolute left-1/2 top-4 z-30 flex -translate-x-1/2 items-center rounded-full bg-[#ece7dd] p-1 shadow-[0_10px_30px_rgb(0_0_0/0.28)]",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(ModeButton, {
                selected: mode === "matterport",
                onClick: ()=>onChange("matterport"),
                icon: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(CubeIcon, {}, void 0, false, {
                    fileName: "[project]/app/components/tour-overlay.tsx",
                    lineNumber: 294,
                    columnNumber: 15
                }, this),
                label: "Matterport Tour"
            }, void 0, false, {
                fileName: "[project]/app/components/tour-overlay.tsx",
                lineNumber: 291,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(ModeButton, {
                selected: mode === "foreground",
                onClick: ()=>onChange("foreground"),
                icon: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(PlayIcon, {}, void 0, false, {
                    fileName: "[project]/app/components/tour-overlay.tsx",
                    lineNumber: 300,
                    columnNumber: 15
                }, this),
                label: "Foreground Tour"
            }, void 0, false, {
                fileName: "[project]/app/components/tour-overlay.tsx",
                lineNumber: 297,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/components/tour-overlay.tsx",
        lineNumber: 290,
        columnNumber: 5
    }, this);
}
function ModeButton({ selected, onClick, icon, label }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
        type: "button",
        onClick: onClick,
        "aria-pressed": selected,
        className: `inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium tracking-tight transition-colors ${selected ? "bg-background text-foreground shadow-[0_1px_2px_rgb(27_26_23/0.12)]" : "text-foreground/70 hover:text-foreground"}`,
        children: [
            icon,
            label
        ]
    }, void 0, true, {
        fileName: "[project]/app/components/tour-overlay.tsx",
        lineNumber: 319,
        columnNumber: 5
    }, this);
}
function CubeIcon() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
        viewBox: "0 0 24 24",
        className: "h-4 w-4",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1.7",
        "aria-hidden": "true",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                d: "M12 3.5 19 7.5v9L12 20.5 5 16.5v-9L12 3.5Z",
                strokeLinejoin: "round"
            }, void 0, false, {
                fileName: "[project]/app/components/tour-overlay.tsx",
                lineNumber: 336,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                d: "M12 12.2 19 7.7M12 12.2 5 7.7M12 12.2v8.3",
                strokeLinejoin: "round"
            }, void 0, false, {
                fileName: "[project]/app/components/tour-overlay.tsx",
                lineNumber: 337,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/components/tour-overlay.tsx",
        lineNumber: 335,
        columnNumber: 5
    }, this);
}
function PlayIcon() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
        viewBox: "0 0 24 24",
        className: "h-4 w-4",
        fill: "currentColor",
        "aria-hidden": "true",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
            d: "M8 6.5v11l9-5.5-9-5.5Z"
        }, void 0, false, {
            fileName: "[project]/app/components/tour-overlay.tsx",
            lineNumber: 345,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/app/components/tour-overlay.tsx",
        lineNumber: 344,
        columnNumber: 5
    }, this);
}
}),
"[project]/app/lib/floor-layout.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "applyStructure",
    ()=>applyStructure,
    "buildLayout",
    ()=>buildLayout,
    "buildLayoutFromMatterport",
    ()=>buildLayoutFromMatterport,
    "buildLayoutFromScan",
    ()=>buildLayoutFromScan,
    "diningCenter",
    ()=>diningCenter,
    "displayLabel",
    ()=>displayLabel,
    "findDining",
    ()=>findDining,
    "findFreezer",
    ()=>findFreezer,
    "findKitchen",
    ()=>findKitchen,
    "hitsWall",
    ()=>hitsWall,
    "layoutFromPlan",
    ()=>layoutFromPlan,
    "layoutWalls",
    ()=>layoutWalls,
    "removeFreezer",
    ()=>removeFreezer,
    "restoreFreezer",
    ()=>restoreFreezer,
    "room",
    ()=>room,
    "roomAtPoint",
    ()=>roomAtPoint,
    "roomFocus",
    ()=>roomFocus,
    "roomKind",
    ()=>roomKind,
    "shiftServiceWall",
    ()=>shiftServiceWall,
    "wallSegments",
    ()=>wallSegments
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$polygon$2d$clipping$2f$dist$2f$polygon$2d$clipping$2e$esm$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/polygon-clipping/dist/polygon-clipping.esm.js [app-ssr] (ecmascript)");
;
const NEIGHBOR = 0.45;
function roomKind(label) {
    const text = label.toLowerCase();
    if (/freezer|cooler|walk-in|cold room|^fre\b/.test(text)) return "freezer";
    if (/kitchen/.test(text)) return "kitchen";
    if (/dining|living/.test(text)) return "dining";
    return "other";
}
function displayLabel(label) {
    return label.replace(/^main\s+/i, "").replace(/\s+room$/i, "");
}
function buildLayout(squareFeet) {
    void squareFeet;
    return {
        width: 1,
        depth: 1,
        height: 3.05,
        thickness: 0.12,
        rooms: [],
        tiles: [],
        shell: [],
        freezerRemoved: false,
        source: "pending",
        measuredKey: ""
    };
}
function buildLayoutFromScan(measured, sweeps) {
    const usable = measured.filter((entry)=>{
        const w = entry.max.x - entry.min.x;
        const d = entry.max.z - entry.min.z;
        return w > 0.6 && d > 0.6 && Number.isFinite(w) && Number.isFinite(d);
    });
    const points = sweeps.filter((point)=>Number.isFinite(point.x) && Number.isFinite(point.z));
    const floor = pickFloor(usable);
    const onFloor = usable.filter((entry)=>entry.floor === floor);
    if (onFloor.length === 0 && points.length < 3) return buildLayout(0);
    let minX = Infinity;
    let minZ = Infinity;
    for (const entry of onFloor){
        minX = Math.min(minX, entry.min.x);
        minZ = Math.min(minZ, entry.min.z);
    }
    for (const point of points){
        minX = Math.min(minX, point.x);
        minZ = Math.min(minZ, point.z);
    }
    const rooms = onFloor.map((entry)=>({
            id: entry.id,
            label: entry.label || "Room",
            kind: roomKind(entry.label || ""),
            x: round(entry.min.x - minX),
            z: round(entry.min.z - minZ),
            w: round(entry.max.x - entry.min.x),
            d: round(entry.max.z - entry.min.z),
            absorbed: false
        }));
    const walked = points.map((point)=>({
            x: point.x - minX,
            z: point.z - minZ
        }));
    const plate = footprint(walked, rooms);
    return finish({
        width: 0,
        depth: 0,
        height: 3.05,
        thickness: 0.12,
        rooms,
        tiles: plate.tiles,
        shell: plate.shell,
        freezerRemoved: false,
        source: "scan",
        measuredKey: `${rooms.map((entry)=>`${entry.id}:${entry.w}:${entry.d}`).join("|")}#${plate.tiles.length}`
    });
}
function buildLayoutFromMatterport(measured) {
    return buildLayoutFromScan(measured, []);
}
function room(layout, id) {
    return layout.rooms.find((entry)=>entry.id === id) ?? null;
}
function findDining(layout) {
    return largest(layout.rooms.filter((entry)=>entry.kind === "dining"));
}
function findKitchen(layout) {
    return largest(layout.rooms.filter((entry)=>entry.kind === "kitchen"));
}
function findFreezer(layout) {
    return largest(layout.rooms.filter((entry)=>entry.kind === "freezer"));
}
function removeFreezer(layout) {
    if (layout.polygons?.length) return removeFreezerPolygons(layout);
    const freezer = findFreezer(layout);
    if (!freezer || freezer.absorbed) return layout;
    return finish({
        ...layout,
        freezerRemoved: true,
        rooms: layout.rooms.map((entry)=>entry.id === freezer.id ? {
                ...entry,
                absorbed: true
            } : entry)
    });
}
function restoreFreezer(layout) {
    if (layout.polygons?.length) return restoreFreezerPolygons(layout);
    const freezer = findFreezer(layout);
    if (!freezer || !freezer.absorbed) return layout;
    return finish({
        ...layout,
        freezerRemoved: false,
        rooms: layout.rooms.map((entry)=>entry.id === freezer.id ? {
                ...entry,
                absorbed: false
            } : entry)
    });
}
function shiftServiceWall(layout, meters) {
    if (layout.polygons?.length) return shiftPolygonWall(layout, meters);
    const dining = findDining(layout);
    const kitchen = findKitchen(layout);
    if (!dining || !kitchen || Math.abs(meters) < 0.05) return layout;
    const diningMid = dining.x + dining.w / 2;
    const kitchenMid = kitchen.x + kitchen.w / 2;
    const toTheRight = kitchenMid >= diningMid;
    const boundary = toTheRight ? dining.x + dining.w : dining.x;
    let delta = toTheRight ? meters : -meters;
    const attached = layout.rooms.filter((entry)=>entry.id !== dining.id && sharesBoundary(entry, boundary, toTheRight));
    if (attached.length === 0) return layout;
    if (toTheRight) {
        const maxGrow = Math.min(dining.w + 8, ...attached.map((entry)=>entry.w - 1.3));
        delta = Math.max(-dining.w + 2, Math.min(delta, maxGrow));
    } else {
        const maxGrow = Math.min(dining.w + 8, ...attached.map((entry)=>entry.w - 1.3));
        delta = Math.max(-maxGrow, Math.min(delta, dining.w - 2));
    }
    if (Math.abs(delta) < 0.05) return layout;
    return finish({
        ...layout,
        rooms: layout.rooms.map((entry)=>{
            if (entry.id === dining.id) {
                return toTheRight ? {
                    ...entry,
                    w: entry.w + delta
                } : {
                    ...entry,
                    x: entry.x + delta,
                    w: entry.w - delta
                };
            }
            if (!attached.some((item)=>item.id === entry.id)) return entry;
            return toTheRight ? {
                ...entry,
                x: entry.x + delta,
                w: entry.w - delta
            } : {
                ...entry,
                w: entry.w + delta
            };
        })
    });
}
function applyStructure(layout, edit) {
    if (edit.kind === "remove-freezer") return removeFreezer(layout);
    if (edit.kind === "restore-freezer") return restoreFreezer(layout);
    if (edit.kind === "remove-room") return removeNamedRoom(layout, edit.room);
    if (edit.kind === "extend") return extendNamedRoom(layout, edit.room, edit.into, edit.meters);
    return shiftServiceWall(layout, edit.meters);
}
function removeNamedRoom(layout, name) {
    if (layout.polygons?.length) return removeNamedPolygons(layout, name);
    const target = layout.rooms.find((entry)=>!entry.absorbed && roomNamesMatch(entry.label, name));
    if (!target) return layout;
    return finish({
        ...layout,
        rooms: layout.rooms.map((entry)=>entry.id === target.id ? {
                ...entry,
                absorbed: true
            } : entry)
    });
}
function removeNamedPolygons(layout, name) {
    const polygons = (layout.polygons ?? []).map(clonePoly);
    const target = largestPolygon(polygons.filter((entry)=>!entry.absorbed && roomNamesMatch(entry.label, name)));
    if (!target) return layout;
    const neighbor = largestPolygon(polygons.filter((entry)=>entry.id !== target.id && !entry.absorbed && sharedEdge(entry.points, target.points)));
    if (neighbor) neighbor.points = unionRings(neighbor.points, target.points);
    target.absorbed = true;
    return commitPlan({
        ...layout,
        polygons
    });
}
function extendNamedRoom(layout, roomName, intoName, meters) {
    if (!layout.polygons?.length || Math.abs(meters) < 0.05) return layout;
    const polygons = layout.polygons.map(clonePoly);
    const room = largestPolygon(polygons.filter((entry)=>!entry.absorbed && roomNamesMatch(entry.label, roomName)));
    const into = largestPolygon(polygons.filter((entry)=>entry.id !== room?.id && !entry.absorbed && roomNamesMatch(entry.label, intoName)));
    if (!room || !into) return layout;
    const moved = shiftBetween(polygons, room.id, into.id, meters);
    if (Math.abs(moved.applied) < 0.05) return layout;
    return commitPlan({
        ...layout,
        polygons: moved.polygons,
        wallShift: (layout.wallShift ?? 0) + moved.applied
    });
}
function roomNamesMatch(label, query) {
    const left = label.toLowerCase();
    const right = query.toLowerCase();
    if (left.includes(right) || right.includes(left)) return true;
    if (/bath|restroom/.test(left) && /bath|restroom/.test(right)) return true;
    if (/dining|living/.test(left) && /dining|living/.test(right)) return true;
    return false;
}
function layoutWalls(layout) {
    const rooms = layout.rooms.filter((entry)=>!entry.absorbed && entry.w > 0.3 && entry.d > 0.3);
    const walls = [
        ...layout.shell
    ];
    const thickness = layout.thickness;
    for (const entry of rooms){
        const edges = [
            {
                axis: "z",
                at: entry.z,
                from: entry.x,
                to: entry.x + entry.w
            },
            {
                axis: "z",
                at: entry.z + entry.d,
                from: entry.x,
                to: entry.x + entry.w
            },
            {
                axis: "x",
                at: entry.x,
                from: entry.z,
                to: entry.z + entry.d
            },
            {
                axis: "x",
                at: entry.x + entry.w,
                from: entry.z,
                to: entry.z + entry.d
            }
        ];
        for (const edge of edges){
            const shared = sharedSpans(entry, edge, rooms);
            const cuts = mergeIntervals(shared.map((span)=>[
                    span.from,
                    span.to
                ]));
            for (const [from, to] of subtractInterval(edge.from, edge.to, cuts)){
                pushWall(walls, edge.axis, edge.at, from, to, thickness, "shell", false);
            }
            for (const span of shared){
                if (entry.id >= span.otherId) continue;
                if (opensIntoKitchen(entry, span)) continue;
                const role = entry.kind === "freezer" || span.kind === "freezer" ? "freezer" : "divider";
                const solid = role === "freezer" && !entry.absorbed && !span.absorbed;
                pushWall(walls, edge.axis, edge.at, span.from, span.to, thickness, solid ? "freezer" : "divider", !solid);
            }
        }
    }
    return walls;
}
function hitsWall(layout, x, z, radius) {
    if (layout.polygons?.length) return hitsPolygon(layout, x, z, radius);
    if (!insideAny(layout, x, z)) return true;
    for (const wall of layoutWalls(layout)){
        const nearestX = Math.max(wall.x, Math.min(x, wall.x + wall.w));
        const nearestZ = Math.max(wall.z, Math.min(z, wall.z + wall.d));
        const dx = x - nearestX;
        const dz = z - nearestZ;
        if (dx * dx + dz * dz < radius * radius) return true;
    }
    return false;
}
function diningCenter(layout) {
    const diningPoly = largestPolygon(layout.polygons?.filter((entry)=>entry.kind === "dining" && !entry.absorbed) ?? []);
    if (diningPoly) return interiorPoint(diningPoly.points);
    const dining = findDining(layout);
    if (dining) return {
        x: dining.x + dining.w / 2,
        z: dining.z + dining.d / 2
    };
    const tile = layout.tiles.reduce((best, entry)=>{
        if (!best || entry.w * entry.d > best.w * best.d) return entry;
        return best;
    }, null);
    if (tile) return {
        x: tile.x + tile.w / 2,
        z: tile.z + tile.d / 2
    };
    return {
        x: layout.width / 2,
        z: layout.depth / 2
    };
}
function pickFloor(rooms) {
    const area = new Map();
    for (const entry of rooms){
        const size = (entry.max.x - entry.min.x) * (entry.max.z - entry.min.z);
        area.set(entry.floor, (area.get(entry.floor) ?? 0) + size);
    }
    let best = rooms[0]?.floor ?? 0;
    let bestArea = -1;
    for (const [floor, size] of area){
        const hasNamed = rooms.some((entry)=>entry.floor === floor && (roomKind(entry.label) === "dining" || roomKind(entry.label) === "kitchen"));
        const score = size + (hasNamed ? 1_000_000 : 0);
        if (score > bestArea) {
            best = floor;
            bestArea = score;
        }
    }
    return best;
}
function finish(layout) {
    let maxX = 0;
    let maxZ = 0;
    for (const entry of [
        ...layout.rooms,
        ...layout.tiles
    ]){
        maxX = Math.max(maxX, entry.x + entry.w);
        maxZ = Math.max(maxZ, entry.z + entry.d);
    }
    for (const poly of layout.polygons ?? []){
        if (poly.absorbed) continue;
        for (const point of poly.points){
            maxX = Math.max(maxX, point.x);
            maxZ = Math.max(maxZ, point.z);
        }
    }
    if (layout.floorplan) {
        maxX = Math.max(maxX, layout.floorplan.originX + layout.floorplan.widthM);
        maxZ = Math.max(maxZ, layout.floorplan.originZ + layout.floorplan.depthM);
    }
    return {
        ...layout,
        width: round(Math.max(maxX, 1)),
        depth: round(Math.max(maxZ, 1))
    };
}
function largest(rooms) {
    return rooms.reduce((best, entry)=>{
        if (!best || entry.w * entry.d > best.w * best.d) return entry;
        return best;
    }, null);
}
function sharesBoundary(entry, boundary, kitchenOnRight) {
    const edge = kitchenOnRight ? entry.x : entry.x + entry.w;
    return Math.abs(edge - boundary) < NEIGHBOR;
}
function insideAny(layout, x, z) {
    const inTile = layout.tiles.some((tile)=>x >= tile.x + 0.05 && x <= tile.x + tile.w - 0.05 && z >= tile.z + 0.05 && z <= tile.z + tile.d - 0.05);
    if (inTile) return true;
    return layout.rooms.some((entry)=>x >= entry.x + 0.05 && x <= entry.x + entry.w - 0.05 && z >= entry.z + 0.05 && z <= entry.z + entry.d - 0.05);
}
function footprint(points, rooms) {
    const step = 0.85;
    const radius = 1.25;
    let maxX = 0;
    let maxZ = 0;
    for (const point of points){
        maxX = Math.max(maxX, point.x);
        maxZ = Math.max(maxZ, point.z);
    }
    for (const entry of rooms){
        maxX = Math.max(maxX, entry.x + entry.w);
        maxZ = Math.max(maxZ, entry.z + entry.d);
    }
    const cols = Math.max(1, Math.ceil(maxX / step) + 1);
    const rows = Math.max(1, Math.ceil(maxZ / step) + 1);
    const occupied = Array.from({
        length: cols * rows
    }, ()=>false);
    const mark = (col, row)=>{
        if (col < 0 || row < 0 || col >= cols || row >= rows) return;
        occupied[row * cols + col] = true;
    };
    const reach = Math.ceil(radius / step);
    for (const point of points){
        const col = Math.floor(point.x / step);
        const row = Math.floor(point.z / step);
        for(let dz = -reach; dz <= reach; dz += 1){
            for(let dx = -reach; dx <= reach; dx += 1){
                if (dx * dx + dz * dz > reach * reach) continue;
                mark(col + dx, row + dz);
            }
        }
    }
    for (const entry of rooms){
        const c0 = Math.floor(entry.x / step);
        const c1 = Math.floor((entry.x + entry.w) / step);
        const r0 = Math.floor(entry.z / step);
        const r1 = Math.floor((entry.z + entry.d) / step);
        for(let row = r0; row <= r1; row += 1){
            for(let col = c0; col <= c1; col += 1)mark(col, row);
        }
    }
    const tiles = [];
    for(let row = 0; row < rows; row += 1){
        let col = 0;
        while(col < cols){
            if (!occupied[row * cols + col]) {
                col += 1;
                continue;
            }
            let end = col;
            while(end < cols && occupied[row * cols + end])end += 1;
            tiles.push({
                x: round(col * step),
                z: round(row * step),
                w: round((end - col) * step),
                d: round(step)
            });
            col = end;
        }
    }
    const edges = new Map();
    const addEdge = (axis, at, from, to)=>{
        const key = `${axis}:${round(at)}`;
        const list = edges.get(key) ?? [];
        list.push([
            from,
            to
        ]);
        edges.set(key, list);
    };
    for(let row = 0; row < rows; row += 1){
        for(let col = 0; col < cols; col += 1){
            if (!occupied[row * cols + col]) continue;
            const x = col * step;
            const z = row * step;
            if (row === 0 || !occupied[(row - 1) * cols + col]) addEdge("z", z, x, x + step);
            if (row === rows - 1 || !occupied[(row + 1) * cols + col]) addEdge("z", z + step, x, x + step);
            if (col === 0 || !occupied[row * cols + col - 1]) addEdge("x", x, z, z + step);
            if (col === cols - 1 || !occupied[row * cols + col + 1]) addEdge("x", x + step, z, z + step);
        }
    }
    const shell = [];
    const thickness = 0.12;
    for (const [key, spans] of edges){
        const [axis, atText] = key.split(":");
        const at = Number(atText);
        for (const [from, to] of mergeIntervals(spans)){
            pushWall(shell, axis === "x" ? "x" : "z", at, from, to, thickness, "shell", false);
        }
    }
    return {
        tiles,
        shell
    };
}
function sharedSpans(entry, edge, rooms) {
    const spans = [];
    for (const other of rooms){
        if (other.id === entry.id) continue;
        if (edge.axis === "x") {
            const touches = Math.abs(other.x - edge.at) < NEIGHBOR || Math.abs(other.x + other.w - edge.at) < NEIGHBOR;
            if (!touches) continue;
            const from = Math.max(edge.from, other.z);
            const to = Math.min(edge.to, other.z + other.d);
            if (to - from > 0.35) spans.push({
                otherId: other.id,
                kind: other.kind,
                absorbed: other.absorbed,
                from,
                to
            });
        } else {
            const touches = Math.abs(other.z - edge.at) < NEIGHBOR || Math.abs(other.z + other.d - edge.at) < NEIGHBOR;
            if (!touches) continue;
            const from = Math.max(edge.from, other.x);
            const to = Math.min(edge.to, other.x + other.w);
            if (to - from > 0.35) spans.push({
                otherId: other.id,
                kind: other.kind,
                absorbed: other.absorbed,
                from,
                to
            });
        }
    }
    return spans;
}
function opensIntoKitchen(entry, span) {
    const freezerSide = entry.kind === "freezer" || span.kind === "freezer";
    const kitchenSide = entry.kind === "kitchen" || span.kind === "kitchen";
    return freezerSide && kitchenSide && (entry.absorbed || span.absorbed);
}
function mergeIntervals(spans) {
    const sorted = spans.filter(([from, to])=>to - from > 0.05).sort((a, b)=>a[0] - b[0]);
    const merged = [];
    for (const [from, to] of sorted){
        const last = merged[merged.length - 1];
        if (last && from <= last[1] + 0.08) last[1] = Math.max(last[1], to);
        else merged.push([
            from,
            to
        ]);
    }
    return merged;
}
function subtractInterval(from, to, cuts) {
    let cursor = from;
    const open = [];
    for (const [cutFrom, cutTo] of cuts){
        const start = Math.max(cutFrom, from);
        const end = Math.min(cutTo, to);
        if (end <= start) continue;
        if (start - cursor > 0.08) open.push([
            cursor,
            start
        ]);
        cursor = Math.max(cursor, end);
    }
    if (to - cursor > 0.08) open.push([
        cursor,
        to
    ]);
    return open;
}
function pushWall(walls, axis, at, from, to, thickness, role, door) {
    for (const [start, end] of door ? withDoor(from, to) : [
        [
            from,
            to
        ]
    ]){
        if (end - start < 0.08) continue;
        if (axis === "x") walls.push({
            x: at - thickness / 2,
            z: start,
            w: thickness,
            d: end - start,
            role
        });
        else walls.push({
            x: start,
            z: at - thickness / 2,
            w: end - start,
            d: thickness,
            role
        });
    }
}
function withDoor(from, to) {
    const length = to - from;
    if (length < 1.2) return [
        [
            from,
            to
        ]
    ];
    const gap = Math.min(1.1, length * 0.42);
    const mid = (from + to) / 2;
    const pieces = [
        [
            from,
            mid - gap / 2
        ],
        [
            mid + gap / 2,
            to
        ]
    ];
    return pieces.filter(([start, end])=>end - start > 0.08);
}
function round(value) {
    return Math.round(value * 1000) / 1000;
}
function layoutFromPlan(input) {
    const resolution = input.image.resolution > 0 ? input.image.resolution : 100;
    const image = {
        ...input.image,
        resolution
    };
    const normalized = input.rooms.every((room)=>room.pixels.every(([x, y])=>x >= 0 && y >= 0 && x <= 1.5 && y <= 1.5));
    let polygons = input.rooms.map((room, index)=>({
            id: polygonId(room.label, index),
            label: room.label.trim() || "Room",
            kind: roomKind(room.label),
            points: simplify(pixelsToMeters(room.pixels, image, normalized)),
            absorbed: false
        })).filter((room)=>room.points.length >= 3 && Math.abs(shoelace(room.points)) > 0.4);
    if (polygons.length === 0) return buildLayout(input.squareFeet);
    const areaSqft = polygons.reduce((sum, room)=>sum + Math.abs(shoelace(room.points)), 0) * 10.76391041671;
    let scale = 1;
    if (input.squareFeet > 400 && areaSqft > input.squareFeet * 1.8) {
        scale = Math.sqrt(input.squareFeet / areaSqft);
    }
    const frame = {
        originX: image.originX,
        originZ: image.originY,
        widthM: image.width / resolution,
        depthM: image.height / resolution
    };
    const cloud = polygons.flatMap((room)=>room.points);
    const centroid = {
        x: cloud.reduce((sum, point)=>sum + point.x, 0) / cloud.length,
        z: cloud.reduce((sum, point)=>sum + point.z, 0) / cloud.length
    };
    if (scale !== 1) {
        polygons = polygons.map((room)=>({
                ...room,
                points: room.points.map((point)=>scaleAbout(point, centroid, scale))
            }));
        frame.originX = scaleAbout({
            x: frame.originX,
            z: frame.originZ
        }, centroid, scale).x;
        frame.originZ = scaleAbout({
            x: image.originX,
            z: image.originY
        }, centroid, scale).z;
        frame.widthM *= scale;
        frame.depthM *= scale;
    }
    let minX = frame.originX;
    let minZ = frame.originZ;
    for (const room of polygons){
        for (const point of room.points){
            minX = Math.min(minX, point.x);
            minZ = Math.min(minZ, point.z);
        }
    }
    const translate = {
        x: -minX,
        z: -minZ
    };
    polygons = polygons.map((room)=>({
            ...room,
            points: room.points.map((point)=>({
                    x: point.x + translate.x,
                    z: point.z + translate.z
                }))
        }));
    frame.originX += translate.x;
    frame.originZ += translate.z;
    const align = {
        scale,
        x: centroid.x * (1 - scale) + translate.x,
        z: centroid.z * (1 - scale) + translate.z
    };
    return commitPlan({
        width: 1,
        depth: 1,
        height: 3.05,
        thickness: 0.12,
        rooms: [],
        tiles: [],
        shell: [],
        polygons,
        basePolygons: polygons.map(clonePoly),
        floorplan: {
            href: image.href,
            ...frame
        },
        meshHref: input.meshHref,
        meshFormat: input.meshFormat,
        meshAlign: align,
        wallShift: 0,
        freezerRemoved: false,
        source: "plan",
        measuredKey: `plan:${input.modelId}:${polygons.map((room)=>room.label).join("|")}`
    });
}
function roomFocus(layout, id) {
    const poly = layout.polygons?.find((entry)=>entry.id === id && !entry.absorbed);
    if (poly) return interiorPoint(poly.points);
    const rect = room(layout, id);
    if (!rect || rect.absorbed || rect.w < 0.3 || rect.d < 0.3) return null;
    return {
        x: rect.x + rect.w / 2,
        z: rect.z + rect.d / 2
    };
}
function roomAtPoint(layout, x, z) {
    if (layout.polygons?.length) {
        for (const poly of layout.polygons){
            if (poly.absorbed) continue;
            if (pointInPolygon(poly.points, x, z)) return poly.id;
        }
        return null;
    }
    for (const entry of layout.rooms){
        if (entry.absorbed || entry.w < 0.2 || entry.d < 0.2) continue;
        if (x >= entry.x && x <= entry.x + entry.w && z >= entry.z && z <= entry.z + entry.d) return entry.id;
    }
    return null;
}
function wallSegments(layout) {
    const rooms = (layout.polygons ?? []).filter((entry)=>!entry.absorbed && entry.points.length >= 3);
    const segments = [];
    for (const entry of rooms){
        for(let index = 0; index < entry.points.length; index += 1){
            const start = entry.points[index];
            const end = entry.points[(index + 1) % entry.points.length];
            const length = Math.hypot(end.x - start.x, end.z - start.z);
            if (length < 0.08) continue;
            const shared = rooms.find((other)=>other.id !== entry.id && other.points.some((_, edge)=>edgesOverlap(start, end, other.points[edge], other.points[(edge + 1) % other.points.length])));
            if (shared && entry.id > shared.id) continue;
            if (layout.openedWall && shared && (entry.kind === "dining" && shared.kind === "kitchen" || entry.kind === "kitchen" && shared.kind === "dining")) {
                continue;
            }
            const role = !shared ? "shell" : entry.kind === "freezer" || shared.kind === "freezer" ? "freezer" : "divider";
            const solid = role !== "divider";
            for (const [from, to] of solid ? [
                [
                    0,
                    1
                ]
            ] : doorParams(length)){
                segments.push({
                    x1: start.x + (end.x - start.x) * from,
                    z1: start.z + (end.z - start.z) * from,
                    x2: start.x + (end.x - start.x) * to,
                    z2: start.z + (end.z - start.z) * to,
                    role
                });
            }
        }
    }
    return segments;
}
function removeFreezerPolygons(layout) {
    const polygons = (layout.polygons ?? []).map(clonePoly);
    const freezer = polygons.find((entry)=>entry.kind === "freezer" && !entry.absorbed);
    const kitchen = largestPolygon(polygons.filter((entry)=>entry.kind === "kitchen"));
    if (freezer && kitchen) {
        kitchen.points = unionRings(kitchen.points, freezer.points);
        freezer.absorbed = true;
        return commitPlan({
            ...layout,
            polygons,
            freezerRemoved: true
        });
    }
    const dining = largestPolygon(polygons.filter((entry)=>entry.kind === "dining" && !entry.absorbed));
    if (!dining || !kitchen || layout.openedWall) return layout;
    return commitPlan({
        ...layout,
        openedWall: true,
        freezerRemoved: true
    });
}
function restoreFreezerPolygons(layout) {
    if (layout.openedWall) return commitPlan({
        ...layout,
        openedWall: false,
        freezerRemoved: false
    });
    if (!layout.freezerRemoved || !layout.basePolygons?.length) return layout;
    let polygons = layout.basePolygons.map(clonePoly);
    if (layout.wallShift) polygons = moveDiningWall(polygons, layout.wallShift).polygons;
    return commitPlan({
        ...layout,
        polygons,
        freezerRemoved: false
    });
}
function shiftPolygonWall(layout, meters) {
    if (!layout.polygons?.length || Math.abs(meters) < 0.05) return layout;
    const moved = moveDiningWall(layout.polygons, meters);
    if (Math.abs(moved.applied) < 0.05) return layout;
    return commitPlan({
        ...layout,
        polygons: moved.polygons,
        wallShift: (layout.wallShift ?? 0) + moved.applied
    });
}
function moveDiningWall(source, meters) {
    const polygons = source.map(clonePoly);
    const dining = largestPolygon(polygons.filter((entry)=>entry.kind === "dining" && !entry.absorbed));
    const kitchen = largestPolygon(polygons.filter((entry)=>entry.kind === "kitchen" && !entry.absorbed));
    if (!dining || !kitchen) return {
        polygons,
        applied: 0
    };
    const grow = meters >= 0 ? dining.id : kitchen.id;
    const shrink = meters >= 0 ? kitchen.id : dining.id;
    return shiftBetween(polygons, grow, shrink, Math.abs(meters));
}
function shiftBetween(polygons, growId, shrinkId, meters) {
    const grow = polygons.find((entry)=>entry.id === growId);
    const shrink = polygons.find((entry)=>entry.id === shrinkId);
    if (!grow || !shrink) return {
        polygons,
        applied: 0
    };
    const edge = sharedEdge(grow.points, shrink.points) ?? facingEdge(grow.points, shrink.points);
    if (!edge) return {
        polygons,
        applied: 0
    };
    const shrinkEdge = sharedEdge(shrink.points, grow.points) ?? facingEdge(shrink.points, grow.points);
    const mid = midpoint(edge.start, edge.end);
    let nx = -(edge.end.z - edge.start.z);
    let nz = edge.end.x - edge.start.x;
    const span = Math.hypot(nx, nz) || 1;
    nx /= span;
    nz /= span;
    const shrinkCenter = interiorPoint(shrink.points);
    if ((shrinkCenter.x - mid.x) * nx + (shrinkCenter.z - mid.z) * nz < 0) {
        nx = -nx;
        nz = -nz;
    }
    const limit = Math.min(projectedSpan(grow.points, nx, nz), projectedSpan(shrink.points, nx, nz)) * 0.35;
    const applied = Math.max(-limit, Math.min(limit, Math.abs(meters)));
    if (Math.abs(applied) < 0.05) return {
        polygons,
        applied: 0
    };
    moveEdge(grow.points, edge, nx * applied, nz * applied);
    if (shrinkEdge) moveEdge(shrink.points, shrinkEdge, nx * applied, nz * applied);
    return {
        polygons,
        applied
    };
}
function commitPlan(layout) {
    const rooms = layout.polygons ? rectsFromPolygons(layout.polygons) : layout.rooms;
    const finished = finish({
        ...layout,
        rooms
    });
    return {
        ...finished,
        geometryKey: geometryKeyOf(finished)
    };
}
function rectsFromPolygons(polygons) {
    return polygons.map((poly)=>{
        const box = bounds(poly.points);
        return {
            id: poly.id,
            label: poly.label,
            kind: poly.kind,
            x: box.minX,
            z: box.minZ,
            w: Math.max(box.maxX - box.minX, 0),
            d: Math.max(box.maxZ - box.minZ, 0),
            absorbed: poly.absorbed
        };
    });
}
function hitsPolygon(layout, x, z, radius) {
    const walkable = layout.polygons ?? [];
    const inside = walkable.some((poly)=>pointInPolygon(poly.points, x, z) || ringDistance(poly.points, x, z) < 0.28);
    if (!inside) return true;
    return wallSegments(layout).some((segment)=>segmentDistance(x, z, segment) < radius);
}
function pixelsToMeters(pixels, image, normalized) {
    return pixels.map(([px, py])=>({
            x: image.originX + (normalized ? px * image.width : px) / image.resolution,
            z: image.originY + (normalized ? py * image.height : py) / image.resolution
        }));
}
function unionRings(a, b) {
    let parts = fromMulti(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$polygon$2d$clipping$2f$dist$2f$polygon$2d$clipping$2e$esm$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].union(asPolygon(a), asPolygon(b)));
    if (parts.length <= 1) return parts[0] ?? a;
    parts = fromMulti(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$polygon$2d$clipping$2f$dist$2f$polygon$2d$clipping$2e$esm$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].union(asPolygon(a), asPolygon(b), asPolygon(bridgeQuad(a, b))));
    parts.sort((left, right)=>Math.abs(shoelace(right)) - Math.abs(shoelace(left)));
    return parts[0] ?? a;
}
function asPolygon(points) {
    const ring = points.map((point)=>[
            point.x,
            point.z
        ]);
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first && (!last || first[0] !== last[0] || first[1] !== last[1])) ring.push([
        first[0],
        first[1]
    ]);
    return [
        ring
    ];
}
function fromMulti(multi) {
    return multi.map((poly)=>{
        const ring = poly[0] ?? [];
        const points = ring.map(([x, z])=>({
                x,
                z
            }));
        if (points.length > 1) {
            const first = points[0];
            const last = points[points.length - 1];
            if (first.x === last.x && first.z === last.z) points.pop();
        }
        return points;
    }).filter((points)=>points.length >= 3);
}
function bridgeQuad(a, b) {
    let best = Infinity;
    let left = a[0];
    let right = b[0];
    for (const start of a){
        for (const end of b){
            const distance = (start.x - end.x) ** 2 + (start.z - end.z) ** 2;
            if (distance < best) {
                best = distance;
                left = start;
                right = end;
            }
        }
    }
    const dx = right.x - left.x;
    const dz = right.z - left.z;
    const span = Math.hypot(dx, dz) || 1;
    const ox = -dz / span * 0.2;
    const oz = dx / span * 0.2;
    return [
        {
            x: left.x + ox,
            z: left.z + oz
        },
        {
            x: right.x + ox,
            z: right.z + oz
        },
        {
            x: right.x - ox,
            z: right.z - oz
        },
        {
            x: left.x - ox,
            z: left.z - oz
        }
    ];
}
function sharedEdge(source, other) {
    let best = null;
    for(let index = 0; index < source.length; index += 1){
        const start = source[index];
        const end = source[(index + 1) % source.length];
        const overlaps = other.some((_, edge)=>edgesOverlap(start, end, other[edge], other[(edge + 1) % other.length]));
        const length = Math.hypot(end.x - start.x, end.z - start.z);
        if (overlaps && length > (best?.length ?? 0.4)) best = {
            index,
            start,
            end,
            length
        };
    }
    return best;
}
function facingEdge(source, other) {
    const center = interiorPoint(other);
    let best = null;
    for(let index = 0; index < source.length; index += 1){
        const start = source[index];
        const end = source[(index + 1) % source.length];
        const length = Math.hypot(end.x - start.x, end.z - start.z);
        if (length < 0.6) continue;
        const mid = midpoint(start, end);
        const distance = Math.hypot(mid.x - center.x, mid.z - center.z);
        if (!best || distance < best.distance) best = {
            index,
            start,
            end,
            distance
        };
    }
    if (!best || best.distance > 8) return null;
    return best;
}
function moveEdge(points, edge, dx, dz) {
    const start = points[edge.index];
    const end = points[(edge.index + 1) % points.length];
    const before = {
        start: {
            ...start
        },
        end: {
            ...end
        }
    };
    for (const point of points){
        if (pointSegDist(point, before.start, before.end) < 0.45) {
            point.x += dx;
            point.z += dz;
        }
    }
}
function edgesOverlap(a1, a2, b1, b2) {
    const distances = [
        pointSegDist(a1, b1, b2),
        pointSegDist(a2, b1, b2),
        pointSegDist(b1, a1, a2),
        pointSegDist(b2, a1, a2)
    ];
    return distances.filter((distance)=>distance < 0.55).length >= 2;
}
function pointSegDist(point, start, end) {
    return segmentDistance(point.x, point.z, {
        x1: start.x,
        z1: start.z,
        x2: end.x,
        z2: end.z,
        role: "shell"
    });
}
function segmentDistance(x, z, segment) {
    const dx = segment.x2 - segment.x1;
    const dz = segment.z2 - segment.z1;
    const length = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - segment.x1) * dx + (z - segment.z1) * dz) / length));
    return Math.hypot(x - (segment.x1 + dx * t), z - (segment.z1 + dz * t));
}
function ringDistance(points, x, z) {
    let best = Infinity;
    for(let index = 0; index < points.length; index += 1){
        const start = points[index];
        const end = points[(index + 1) % points.length];
        best = Math.min(best, pointSegDist({
            x,
            z
        }, start, end));
    }
    return best;
}
function doorParams(length) {
    if (length < 1.35) return [
        [
            0,
            1
        ]
    ];
    const gap = Math.min(1.35, length * 0.46) / length;
    return [
        [
            0,
            0.5 - gap / 2
        ],
        [
            0.5 + gap / 2,
            1
        ]
    ].filter(([start, end])=>(end - start) * length > 0.08);
}
function projectedSpan(points, nx, nz) {
    const values = points.map((point)=>point.x * nx + point.z * nz);
    return Math.max(...values) - Math.min(...values);
}
function midpoint(start, end) {
    return {
        x: (start.x + end.x) / 2,
        z: (start.z + end.z) / 2
    };
}
function scaleAbout(point, center, scale) {
    return {
        x: center.x + (point.x - center.x) * scale,
        z: center.z + (point.z - center.z) * scale
    };
}
function simplify(points) {
    if (points.length <= 28) return points;
    const kept = [
        points[0]
    ];
    for (const point of points.slice(1)){
        const last = kept[kept.length - 1];
        if (Math.hypot(point.x - last.x, point.z - last.z) >= 0.15) kept.push(point);
    }
    return kept.length >= 3 ? kept : points;
}
function geometryKeyOf(layout) {
    const body = (layout.polygons ?? []).map((poly)=>`${poly.id}:${poly.absorbed ? 1 : 0}:${poly.points.map((point)=>`${point.x.toFixed(2)},${point.z.toFixed(2)}`).join(";")}`).join("|");
    return `${layout.openedWall ? "open" : "shut"}|${body}`;
}
function polygonId(label, index) {
    const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "room";
    return `${base}-${index}`;
}
function clonePoly(poly) {
    return {
        ...poly,
        points: poly.points.map((point)=>({
                ...point
            }))
    };
}
function largestPolygon(rooms) {
    return rooms.reduce((best, entry)=>{
        if (!best || Math.abs(shoelace(entry.points)) > Math.abs(shoelace(best.points))) return entry;
        return best;
    }, null);
}
function bounds(points) {
    return points.reduce((box, point)=>({
            minX: Math.min(box.minX, point.x),
            minZ: Math.min(box.minZ, point.z),
            maxX: Math.max(box.maxX, point.x),
            maxZ: Math.max(box.maxZ, point.z)
        }), {
        minX: Infinity,
        minZ: Infinity,
        maxX: -Infinity,
        maxZ: -Infinity
    });
}
function interiorPoint(points) {
    if (points.length === 0) return {
        x: 0,
        z: 0
    };
    const center = centroid(points);
    if (pointInPolygon(points, center.x, center.z)) return center;
    const box = bounds(points);
    const mid = {
        x: (box.minX + box.maxX) / 2,
        z: (box.minZ + box.maxZ) / 2
    };
    if (pointInPolygon(points, mid.x, mid.z)) return mid;
    return points[0];
}
function centroid(points) {
    const sum = points.reduce((total, point)=>({
            x: total.x + point.x,
            z: total.z + point.z
        }), {
        x: 0,
        z: 0
    });
    return {
        x: sum.x / points.length,
        z: sum.z / points.length
    };
}
function shoelace(points) {
    let area = 0;
    for(let index = 0; index < points.length; index += 1){
        const next = points[(index + 1) % points.length];
        area += points[index].x * next.z - next.x * points[index].z;
    }
    return area / 2;
}
function pointInPolygon(points, x, z) {
    let inside = false;
    for(let index = 0, previous = points.length - 1; index < points.length; previous = index++){
        const current = points[index];
        const prior = points[previous];
        const crosses = current.z > z !== prior.z > z;
        if (crosses && x < (prior.x - current.x) * (z - current.z) / (prior.z - current.z || 1e-9) + current.x) inside = !inside;
    }
    return inside;
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
function tourAgentReply(message, placedCount, context) {
    const structural = structureReply(message, context);
    if (structural) return structural;
    if (context.mode === "foreground") {
        return {
            reply: "Furniture shows up in Matterport Tour. Here I can move walls — try removing the freezer, or giving the dining room more space.",
            action: {
                type: "none",
                note: "furniture-on-foreground"
            }
        };
    }
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
function structureReply(message, context) {
    const text = message.toLowerCase();
    const freezer = /freezer|cooler|walk-in|cold room/.test(text);
    const dining = /dining|living|seating|front of house/.test(text);
    const kitchen = /kitchen/.test(text);
    const more = /more space|bigger|larger|expand|widen|grow/.test(text);
    const less = /less space|smaller|shrink|minimize|reduce|narrow/.test(text);
    const remove = /remov|delet|get rid|take out|knock|open up|merge|absorb|without/.test(text);
    const restore = /bring back|put back|add the freezer|restore|put the freezer/.test(text);
    const wallShift = /wall/.test(text) && /shift|move|slide|push/.test(text);
    const removeWall = /wall/.test(text) && remove;
    const aboutRooms = (dining || kitchen) && (more || less);
    if (!freezer && !wallShift && !aboutRooms && !removeWall) return null;
    let result;
    if ((freezer || removeWall) && restore) {
        result = context.freezerRemoved ? context.hasFreezer ? {
            reply: "The freezer is back, walled off from the kitchen.",
            action: {
                type: "structure",
                edit: {
                    kind: "restore-freezer"
                }
            }
        } : {
            reply: "The wall between the dining room and the kitchen is back.",
            action: {
                type: "structure",
                edit: {
                    kind: "restore-freezer"
                }
            }
        } : {
            reply: "That wall is still up.",
            action: {
                type: "none",
                note: "freezer-present"
            }
        };
    } else if (removeWall || freezer && (remove || kitchen && /take|space|into|that/.test(text))) {
        result = context.freezerRemoved ? {
            reply: "That wall is already down. I can still shift what remains between the dining room and the kitchen.",
            action: {
                type: "none",
                note: "freezer-gone"
            }
        } : context.hasFreezer ? {
            reply: "Removed the freezer. The kitchen now includes that space.",
            action: {
                type: "structure",
                edit: {
                    kind: "remove-freezer"
                }
            }
        } : {
            reply: "Took down the wall between the dining room and the kitchen.",
            action: {
                type: "structure",
                edit: {
                    kind: "remove-freezer"
                }
            }
        };
    } else if (more && dining || less && kitchen || wallShift && /right/.test(text)) {
        result = {
            reply: "Shifted the wall. The dining room is wider, and the kitchen is narrower.",
            action: {
                type: "structure",
                edit: {
                    kind: "shift-wall",
                    meters: 1.6
                }
            }
        };
    } else if (more && kitchen || less && dining || wallShift && /left/.test(text) || wallShift) {
        result = {
            reply: "Shifted the wall. The kitchen is wider, and the dining room is narrower.",
            action: {
                type: "structure",
                edit: {
                    kind: "shift-wall",
                    meters: -1.6
                }
            }
        };
    } else {
        result = {
            reply: "I can remove the freezer, put it back, or shift the wall between the dining room and the kitchen.",
            action: {
                type: "clarify",
                question: "Which wall should move?"
            }
        };
    }
    if (context.mode === "matterport" && result.action.type === "structure") {
        return {
            reply: "Wall changes happen in Foreground Tour. Switch to that toggle and ask again.",
            action: {
                type: "none",
                note: "structure-on-matterport"
            }
        };
    }
    return result;
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

//# sourceMappingURL=%5Broot-of-the-server%5D__0h0l1ranqr9xn._.js.map