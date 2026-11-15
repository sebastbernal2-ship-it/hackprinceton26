module.exports = [
"[project]/app/components/dashboard-shell.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>DashboardShell
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$brief$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/lib/brief.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$discover$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/lib/discover.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
const TABS = [
    {
        href: "/dashboard",
        label: "Discover"
    },
    {
        href: "/dashboard/refine",
        label: "Chat & Refine"
    }
];
const SLIDE = "duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]";
function DashboardShell({ children }) {
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["usePathname"])();
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRouter"])();
    const brief = (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$brief$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useBrief"])();
    // Closed by default so the current tab owns the screen. The toggle slides the nav in when needed.
    const [open, setOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const fullBleed = pathname.startsWith("/dashboard/refine");
    function startOver() {
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$brief$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["clearBrief"])();
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$discover$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["clearMatches"])();
    }
    function go(href) {
        setOpen(false);
        if (href !== pathname) router.push(href);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "relative min-h-dvh flex-1 font-sans",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "fixed left-3 top-4 z-30 flex items-center gap-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: ()=>setOpen((current)=>!current),
                        "aria-label": open ? "Close sidebar" : "Open sidebar",
                        "aria-expanded": open,
                        "aria-controls": "sidebar",
                        className: "flex h-9 w-9 items-center justify-center rounded-lg text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                            width: "20",
                            height: "20",
                            viewBox: "0 0 20 20",
                            fill: "none",
                            stroke: "currentColor",
                            strokeWidth: "1.5",
                            "aria-hidden": true,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("rect", {
                                    x: "2.75",
                                    y: "3.75",
                                    width: "14.5",
                                    height: "12.5",
                                    rx: "2.5"
                                }, void 0, false, {
                                    fileName: "[project]/app/components/dashboard-shell.tsx",
                                    lineNumber: 46,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                    d: "M7.75 3.75v12.5"
                                }, void 0, false, {
                                    fileName: "[project]/app/components/dashboard-shell.tsx",
                                    lineNumber: 47,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/components/dashboard-shell.tsx",
                            lineNumber: 45,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/app/components/dashboard-shell.tsx",
                        lineNumber: 37,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-sm font-medium tracking-tight",
                        children: "Foreground"
                    }, void 0, false, {
                        fileName: "[project]/app/components/dashboard-shell.tsx",
                        lineNumber: 50,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/components/dashboard-shell.tsx",
                lineNumber: 36,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                onClick: ()=>setOpen(false),
                className: `fixed inset-0 z-10 bg-foreground/20 transition-opacity md:hidden ${SLIDE} ${open ? "opacity-100" : "pointer-events-none opacity-0"}`
            }, void 0, false, {
                fileName: "[project]/app/components/dashboard-shell.tsx",
                lineNumber: 53,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
                id: "sidebar",
                "aria-label": "Sidebar",
                inert: !open,
                className: `fixed inset-y-0 left-0 z-20 flex w-64 flex-col overflow-y-auto border-r border-foreground/10 bg-panel px-4 pb-6 pt-20 transition-transform ${SLIDE} ${open ? "translate-x-0" : "-translate-x-full"}`,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("nav", {
                        "aria-label": "Dashboard",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                            className: "flex flex-col gap-1",
                            children: TABS.map((tab)=>{
                                const current = pathname === tab.href;
                                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        onClick: ()=>go(tab.href),
                                        "aria-current": current ? "page" : undefined,
                                        className: `block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${current ? "bg-foreground/5 font-medium" : "text-foreground/60 hover:bg-foreground/5 hover:text-foreground"}`,
                                        children: tab.label
                                    }, void 0, false, {
                                        fileName: "[project]/app/components/dashboard-shell.tsx",
                                        lineNumber: 74,
                                        columnNumber: 19
                                    }, this)
                                }, tab.href, false, {
                                    fileName: "[project]/app/components/dashboard-shell.tsx",
                                    lineNumber: 73,
                                    columnNumber: 17
                                }, this);
                            })
                        }, void 0, false, {
                            fileName: "[project]/app/components/dashboard-shell.tsx",
                            lineNumber: 69,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/app/components/dashboard-shell.tsx",
                        lineNumber: 68,
                        columnNumber: 9
                    }, this),
                    brief.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                        className: "mt-10 px-3",
                        "aria-labelledby": "brief-heading",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                id: "brief-heading",
                                className: "text-xs text-foreground/40",
                                children: "Your brief"
                            }, void 0, false, {
                                fileName: "[project]/app/components/dashboard-shell.tsx",
                                lineNumber: 92,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("dl", {
                                className: "mt-3 flex flex-col gap-4 text-sm",
                                children: brief.map((exchange)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("dt", {
                                                className: "text-foreground/40",
                                                children: exchange.question
                                            }, void 0, false, {
                                                fileName: "[project]/app/components/dashboard-shell.tsx",
                                                lineNumber: 98,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("dd", {
                                                className: "mt-0.5 break-words",
                                                children: exchange.answer
                                            }, void 0, false, {
                                                fileName: "[project]/app/components/dashboard-shell.tsx",
                                                lineNumber: 99,
                                                columnNumber: 19
                                            }, this)
                                        ]
                                    }, `${exchange.question}:${exchange.answer}`, true, {
                                        fileName: "[project]/app/components/dashboard-shell.tsx",
                                        lineNumber: 97,
                                        columnNumber: 17
                                    }, this))
                            }, void 0, false, {
                                fileName: "[project]/app/components/dashboard-shell.tsx",
                                lineNumber: 95,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/components/dashboard-shell.tsx",
                        lineNumber: 91,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mt-auto pt-10",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                            href: "/",
                            onClick: startOver,
                            className: "block rounded-lg px-3 py-2 text-sm text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground",
                            children: "Start over"
                        }, void 0, false, {
                            fileName: "[project]/app/components/dashboard-shell.tsx",
                            lineNumber: 107,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/app/components/dashboard-shell.tsx",
                        lineNumber: 106,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/components/dashboard-shell.tsx",
                lineNumber: 60,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: `transition-[padding] ${SLIDE} ${open ? "md:pl-64" : ""}`,
                children: fullBleed ? children : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
                    className: "mx-auto w-full max-w-[86rem] pb-16 pl-16 pr-6 pt-20 md:pl-24 md:pr-10",
                    children: children
                }, void 0, false, {
                    fileName: "[project]/app/components/dashboard-shell.tsx",
                    lineNumber: 118,
                    columnNumber: 33
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/components/dashboard-shell.tsx",
                lineNumber: 117,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/components/dashboard-shell.tsx",
        lineNumber: 35,
        columnNumber: 5
    }, this);
}
}),
"[project]/app/lib/brief.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "clearBrief",
    ()=>clearBrief,
    "saveBrief",
    ()=>saveBrief,
    "useBrief",
    ()=>useBrief
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
;
const KEY = "foreground.brief";
const CHANGE = "foreground-brief";
function read() {
    try {
        return sessionStorage.getItem(KEY);
    } catch  {
        return null;
    }
}
function notify() {
    window.dispatchEvent(new Event(CHANGE));
}
function saveBrief(brief) {
    sessionStorage.setItem(KEY, JSON.stringify(brief));
    notify();
}
function clearBrief() {
    sessionStorage.removeItem(KEY);
    notify();
}
function subscribe(onChange) {
    window.addEventListener(CHANGE, onChange);
    window.addEventListener("storage", onChange);
    return ()=>{
        window.removeEventListener(CHANGE, onChange);
        window.removeEventListener("storage", onChange);
    };
}
function useBrief() {
    const stored = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useSyncExternalStore"])(subscribe, read, ()=>null);
    if (!stored) return [];
    try {
        return JSON.parse(stored);
    } catch  {
        return [];
    }
}
}),
"[project]/app/lib/discover.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "clearMatches",
    ()=>clearMatches,
    "refreshMatches",
    ()=>refreshMatches,
    "saveMatches",
    ()=>saveMatches,
    "seedMatches",
    ()=>seedMatches,
    "useMatches",
    ()=>useMatches
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$matches$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/lib/matches.ts [app-ssr] (ecmascript)");
;
;
const KEY = "foreground.matches";
const CHANGE = "foreground-matches";
function read() {
    try {
        return sessionStorage.getItem(KEY);
    } catch  {
        return null;
    }
}
function notify() {
    window.dispatchEvent(new Event(CHANGE));
}
function saveMatches(matches) {
    sessionStorage.setItem(KEY, JSON.stringify(matches));
    notify();
}
function seedMatches(brief) {
    saveMatches((0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$matches$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["rankMatches"])(brief));
}
function clearMatches() {
    sessionStorage.removeItem(KEY);
    notify();
}
function refreshMatches(brief) {
    saveMatches((0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$matches$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["rankMatches"])(brief));
}
function subscribe(onChange) {
    window.addEventListener(CHANGE, onChange);
    window.addEventListener("storage", onChange);
    return ()=>{
        window.removeEventListener(CHANGE, onChange);
        window.removeEventListener("storage", onChange);
    };
}
function loadMatches() {
    const stored = read();
    if (!stored) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$matches$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["rankMatches"])([]);
    try {
        const parsed = JSON.parse(stored);
        if (!Array.isArray(parsed)) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$matches$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["rankMatches"])([]);
        return parsed.map((match)=>{
            if (match.facts) return match;
            const source = __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$matches$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MATCH_POOL"].find((space)=>space.address === match.address && space.detail === match.detail);
            return source ? {
                ...match,
                facts: source.facts
            } : match;
        });
    } catch  {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$matches$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["rankMatches"])([]);
    }
}
function useMatches() {
    // Session storage is read after mount so the first paint matches the server.
    const [matches, setMatches] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$matches$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["rankMatches"])([]));
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const apply = ()=>setMatches(loadMatches());
        apply();
        return subscribe(apply);
    }, []);
    return matches;
}
}),
"[project]/app/lib/matches.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "MATCH_POOL",
    ()=>MATCH_POOL,
    "monthlyRent",
    ()=>monthlyRent,
    "rankMatches",
    ()=>rankMatches
]);
const photo = (key)=>`https://ahprd1cdn.csgpimgs.com/i2/${key}/113/image.jpg`;
const MATCH_POOL = [
    {
        listingId: 4105591,
        address: "2600 Travis St",
        detail: "Suite 104",
        city: "Houston, TX",
        blurb: "Second-generation restaurant on a Midtown hard corner, move-in ready for a new concept.",
        photo: photo("_fMjYB-LRQqsWcJ4lFAuLzQ3lyfJS33NxLzNv2_WiVY"),
        squareFeet: 2946,
        rentPerSquareFootYear: 45,
        tourId: "4H2JSnQ3wSj",
        facts: travisFacts("2,946 sq ft", [
            photo("OrjMJfe7Zxqi9wZvtU-Rf39uLtH7bu3klYVjtfMhmfc"),
            photo("oXFElgM0qTiK7d_pwCE6SSaZWUrvMh_RpAlhInvaYkI"),
            photo("_fMjYB-LRQqsWcJ4lFAuLzQ3lyfJS33NxLzNv2_WiVY"),
            photo("jDwhpIGuRb6ByDvySR9t8NFIJOP6mPM7Jx1pkI2zFXY")
        ], "4H2JSnQ3wSj")
    },
    {
        listingId: 40281878,
        address: "3402 Highway 6",
        detail: "Suite A",
        city: "Houston, TX",
        blurb: "Corner retail on the Far Katy corridor, previously a bar and lounge with drive-thru access.",
        photo: photo("bNRz4-a17yoAHWD6kQBW5LUls8VU6-WJWldn1ST8WiA"),
        squareFeet: 3600,
        rentPerSquareFootYear: 25,
        tourId: "skKNvMqD4w1",
        facts: {
            photos: [
                photo("bNRz4-a17yoAHWD6kQBW5LUls8VU6-WJWldn1ST8WiA"),
                photo("UjhW9Iid_06AGakWls2fZ1ogV994oIUt-Up8ovSyqxQ"),
                photo("YRL3FHr1xFFR3fREvMz2KWSRhRedYB0orQnmAdB_4_I"),
                photo("cwjhOloq2B9m_fWWa419kIOjUbDdkt1TdvcI_AME9w0")
            ],
            property: [
                {
                    label: "Space Available",
                    value: "3,600 sq ft"
                },
                {
                    label: "Property Type",
                    value: "Retail"
                },
                {
                    label: "Availability",
                    value: "Immediately"
                },
                {
                    label: "Built",
                    value: "2003 · renovated 2009"
                },
                {
                    label: "Building",
                    value: "Class B · 8,921 sq ft · 1 story"
                }
            ],
            location: [
                {
                    label: "Neighborhood",
                    value: "Far Katy South"
                },
                {
                    label: "Frontage",
                    value: "574 ft on Highway 6"
                },
                {
                    label: "Parking",
                    value: "30 spaces · ratio 3.36"
                },
                {
                    label: "Matterport",
                    value: "Model skKNvMqD4w1"
                }
            ]
        }
    },
    {
        listingId: 27822184,
        address: "1023 Studewood St",
        detail: "Studewood 10.5",
        city: "Houston, TX",
        blurb: "Class A Heights space with a covered terrace and downtown views, suited to a rooftop restaurant.",
        photo: photo("gv4vPareorg_PAI2eqpdQnSn8iV1PFP0TTBgGC9MD1c"),
        squareFeet: 4593,
        rentPerSquareFootYear: 49,
        tourId: "vte2JuhRvq8",
        facts: {
            photos: [
                photo("gv4vPareorg_PAI2eqpdQnSn8iV1PFP0TTBgGC9MD1c"),
                photo("WUs7tYoJDONoIn9I6Rvx0lJ8ELnGHqKVZDfh3DUJ2lc"),
                photo("Y7EAHG59TLcXOxBbWU82Jk8c7VjTjkQNQrKrVQJeUoo"),
                photo("2EC7Ov1HA5Bx9Pye1wcJWr0WVlXyImE5JgkLpws2gjw")
            ],
            property: [
                {
                    label: "Space Available",
                    value: "4,593 sq ft"
                },
                {
                    label: "Property Type",
                    value: "Restaurant and office"
                },
                {
                    label: "Availability",
                    value: "Immediately"
                },
                {
                    label: "Built",
                    value: "2024"
                },
                {
                    label: "Building",
                    value: "Class B · 13,948 sq ft · 3 stories"
                }
            ],
            location: [
                {
                    label: "Neighborhood",
                    value: "Greater Heights"
                },
                {
                    label: "Frontage",
                    value: "125 ft on Studewood"
                },
                {
                    label: "Parking",
                    value: "11 spaces"
                },
                {
                    label: "Matterport",
                    value: "Model vte2JuhRvq8"
                }
            ]
        }
    },
    {
        listingId: 4105591_100,
        address: "2600 Travis St",
        detail: "Suite 100",
        city: "Houston, TX",
        blurb: "Nearly 10,000 SF second-generation restaurant in Midtown, scaled for a flagship dining room.",
        photo: photo("RUETOzmwLhpoCPw4isfcR7yU3hCKMffXtc7swty3iQM"),
        squareFeet: 9889,
        rentPerSquareFootYear: 45,
        tourId: "NxYn1owequw",
        facts: travisFacts("9,889 sq ft", [
            photo("RUETOzmwLhpoCPw4isfcR7yU3hCKMffXtc7swty3iQM"),
            photo("_fMjYB-LRQqsWcJ4lFAuLzQ3lyfJS33NxLzNv2_WiVY"),
            photo("jDwhpIGuRb6ByDvySR9t8NFIJOP6mPM7Jx1pkI2zFXY"),
            photo("tmDOFHswv8MYueUQlYqH_zg7IPTw8sGplwW-KYHoVoQ")
        ], "NxYn1owequw")
    },
    {
        listingId: 4105591_107,
        address: "2600 Travis St",
        detail: "Suite 107",
        city: "Houston, TX",
        blurb: "Compact second-generation restaurant suite in the same Midtown collection as Suite 104.",
        photo: photo("tmDOFHswv8MYueUQlYqH_zg7IPTw8sGplwW-KYHoVoQ"),
        squareFeet: 2127,
        rentPerSquareFootYear: 37,
        tourId: "NxYn1owequw",
        facts: travisFacts("2,127–4,681 sq ft", [
            photo("tmDOFHswv8MYueUQlYqH_zg7IPTw8sGplwW-KYHoVoQ"),
            photo("_fMjYB-LRQqsWcJ4lFAuLzQ3lyfJS33NxLzNv2_WiVY"),
            photo("RUETOzmwLhpoCPw4isfcR7yU3hCKMffXtc7swty3iQM"),
            photo("jDwhpIGuRb6ByDvySR9t8NFIJOP6mPM7Jx1pkI2zFXY")
        ], "NxYn1owequw")
    }
];
function travisFacts(space, photos, tourId) {
    return {
        photos,
        property: [
            {
                label: "Space Available",
                value: space
            },
            {
                label: "Property Type",
                value: "Retail / Restaurant"
            },
            {
                label: "Availability",
                value: "Immediately"
            },
            {
                label: "Built",
                value: "1960 · renovated 2019"
            },
            {
                label: "Building",
                value: "Class A · 36,932 sq ft · 2 stories"
            }
        ],
        location: [
            {
                label: "Neighborhood",
                value: "Midtown"
            },
            {
                label: "Frontage",
                value: "203 ft on Travis St"
            },
            {
                label: "Daily traffic",
                value: "About 26,759 vehicles"
            },
            {
                label: "Matterport",
                value: `Model ${tourId}`
            }
        ]
    };
}
function monthlyRent(match) {
    return Math.round(match.squareFeet * match.rentPerSquareFootYear / 12);
}
function rankMatches(brief) {
    const said = brief.map((exchange)=>exchange.answer).join(" ").toLowerCase();
    const wantsCheap = /cheap|budget|afford|lower rent|less expensive|\b\d{2,3}\s?k\b/.test(said);
    const wantsLarge = /large|big|flagship|100|more seats|[5-9]\d\s*seats?|\d{3}\s*seats?/.test(said);
    const wantsPatio = /patio|terrace|outdoor|rooftop/.test(said);
    const wantsSmall = /small|intimate|cozy|bakery|cafe|coffee/.test(said);
    const wantsMidtown = /midtown|downtown|urban|travis/.test(said);
    const wantsHeights = /heights|studewood|neighborhood/.test(said);
    const wantsKaty = /katy|highway|suburb|drive.?thru/.test(said);
    const scored = MATCH_POOL.map((space, index)=>{
        let score = 40 + index * 17 % 13;
        const rent = monthlyRent(space);
        if (wantsCheap && rent < 10000) score += 28;
        if (wantsCheap && rent >= 15000) score -= 20;
        if (wantsLarge && space.squareFeet >= 4500) score += 26;
        if (wantsLarge && space.squareFeet < 3000) score -= 18;
        if (wantsSmall && space.squareFeet <= 3600) score += 24;
        if (wantsSmall && space.squareFeet > 8000) score -= 22;
        if (wantsPatio && /terrace|rooftop|outdoor/i.test(space.blurb)) score += 30;
        if (wantsMidtown && /travis|midtown/i.test(`${space.address} ${space.blurb}`)) score += 22;
        if (wantsHeights && /studewood|heights/i.test(`${space.address} ${space.blurb}`)) score += 22;
        if (wantsKaty && /highway|katy|drive-thru/i.test(`${space.address} ${space.blurb}`)) score += 22;
        return {
            space,
            score
        };
    });
    scored.sort((a, b)=>b.score - a.score || a.space.squareFeet - b.space.squareFeet);
    const confidences = [
        92,
        84,
        76
    ];
    return scored.slice(0, 3).map((entry, index)=>({
            ...entry.space,
            confidence: confidences[index] ?? Math.max(60, 90 - index * 8)
        }));
}
}),
];

//# sourceMappingURL=app_1ars-7xlztuo5._.js.map