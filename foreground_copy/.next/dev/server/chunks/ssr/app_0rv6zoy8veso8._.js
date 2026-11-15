module.exports = [
"[project]/app/components/refine.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>Refine
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$brief$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/lib/brief.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$discover$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/lib/discover.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$refine$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/lib/refine.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
const LEAVING_MS = 1800;
function selectionOf(input, current) {
    const length = input.value.length;
    const start = input.selectionStart ?? length;
    const end = input.selectionEnd ?? length;
    return current.start === start && current.end === end ? current : {
        start,
        end
    };
}
const LINE = "text-[clamp(1.6rem,4vw,2.5rem)] leading-tight tracking-tight";
const QUESTION = `${LINE} font-medium`;
const ANSWER = `${LINE} relative mt-3 min-h-[1.25em] whitespace-pre-wrap break-words text-foreground/70`;
function Refine() {
    const brief = (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$brief$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useBrief"])();
    const [history, setHistory] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [question, setQuestion] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$refine$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["FIRST_REFINE"]);
    const [phase, setPhase] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("asking");
    const [value, setValue] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const [selection, setSelection] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({
        start: 0,
        end: 0
    });
    const inputRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const trackRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const activeRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const alignedAnswers = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRouter"])();
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useLayoutEffect"])(()=>{
        const align = (slide)=>{
            const track = trackRef.current;
            const active = activeRef.current;
            if (!track || !active) return;
            const sliding = slide || track.getAnimations().length > 0;
            track.style.transition = sliding ? "" : "none";
            track.style.transform = `translateY(${-(active.offsetTop + active.offsetHeight / 2)}px)`;
        };
        align(alignedAnswers.current !== null && history.length > alignedAnswers.current);
        alignedAnswers.current = history.length;
        const onResize = ()=>align(false);
        window.addEventListener("resize", onResize);
        return ()=>window.removeEventListener("resize", onResize);
    }, [
        history.length,
        phase
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (phase !== "leaving") return;
        const timer = setTimeout(()=>router.push("/dashboard"), LEAVING_MS);
        return ()=>clearTimeout(timer);
    }, [
        phase,
        router
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        inputRef.current?.focus();
    }, []);
    function syncSelection(input) {
        setSelection((current)=>selectionOf(input, current));
    }
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const onSelectionChange = ()=>{
            const input = inputRef.current;
            if (input && document.activeElement === input) {
                setSelection((current)=>selectionOf(input, current));
            }
        };
        document.addEventListener("selectionchange", onSelectionChange);
        return ()=>document.removeEventListener("selectionchange", onSelectionChange);
    }, []);
    function clearInput() {
        setValue("");
        setSelection({
            start: 0,
            end: 0
        });
    }
    async function finish(refined) {
        const nextBrief = [
            ...brief,
            ...refined
        ];
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$brief$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["saveBrief"])(nextBrief);
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$discover$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["refreshMatches"])(nextBrief);
        setPhase("leaving");
    }
    async function submit() {
        const answer = value.trim();
        if (phase !== "asking" || !answer) return;
        const answered = [
            ...history,
            {
                question,
                answer
            }
        ];
        setHistory(answered);
        clearInput();
        let next = null;
        if (answered.length < __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$refine$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MAX_REFINE"]) {
            setPhase("thinking");
            next = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$refine$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["nextRefineQuestion"])(answered);
        }
        if (next === null) {
            await finish(answered);
        } else {
            setQuestion(next);
            setPhase("asking");
        }
    }
    const hasSelection = selection.start !== selection.end;
    const blocks = [
        ...history,
        null
    ];
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "group relative h-[calc(100dvh)] cursor-text overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_18%)]",
        onMouseDown: (event)=>{
            event.preventDefault();
            inputRef.current?.focus();
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("form", {
                onSubmit: (event)=>{
                    event.preventDefault();
                    submit();
                },
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                    ref: inputRef,
                    autoFocus: true,
                    value: value,
                    onChange: (event)=>{
                        if (phase !== "asking") return;
                        setValue(event.target.value);
                        syncSelection(event.target);
                    },
                    onKeyUp: (event)=>syncSelection(event.currentTarget),
                    "aria-label": question,
                    autoComplete: "off",
                    autoCorrect: "off",
                    spellCheck: false,
                    enterKeyHint: "next",
                    className: "pointer-events-none fixed left-1/2 top-1/2 h-px w-px text-base opacity-0"
                }, void 0, false, {
                    fileName: "[project]/app/components/refine.tsx",
                    lineNumber: 131,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/components/refine.tsx",
                lineNumber: 125,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                ref: trackRef,
                "aria-live": "polite",
                className: "absolute inset-x-0 top-1/2 mx-auto flex w-full max-w-3xl flex-col gap-14 px-8 text-center transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform",
                children: blocks.map((past, index)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        ref: past ? undefined : activeRef,
                        className: `transition-opacity duration-700 ${!past ? "opacity-100" : phase === "leaving" ? "opacity-0" : "opacity-30"}`,
                        children: past ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: QUESTION,
                                    children: past.question
                                }, void 0, false, {
                                    fileName: "[project]/app/components/refine.tsx",
                                    lineNumber: 165,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: ANSWER,
                                    children: past.answer
                                }, void 0, false, {
                                    fileName: "[project]/app/components/refine.tsx",
                                    lineNumber: 166,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/components/refine.tsx",
                            lineNumber: 164,
                            columnNumber: 15
                        }, this) : phase === "leaving" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: `${QUESTION} animate-interlude`,
                            style: {
                                animationDuration: `${LEAVING_MS}ms`
                            },
                            role: "status",
                            children: "Finding better matches"
                        }, void 0, false, {
                            fileName: "[project]/app/components/refine.tsx",
                            lineNumber: 169,
                            columnNumber: 15
                        }, this) : phase === "thinking" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "animate-rise",
                            role: "status",
                            "aria-label": "Thinking",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: QUESTION,
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "inline-block h-2.5 w-2.5 animate-breathe rounded-full bg-foreground/50"
                                    }, void 0, false, {
                                        fileName: "[project]/app/components/refine.tsx",
                                        lineNumber: 179,
                                        columnNumber: 19
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/app/components/refine.tsx",
                                    lineNumber: 178,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: ANSWER
                                }, void 0, false, {
                                    fileName: "[project]/app/components/refine.tsx",
                                    lineNumber: 181,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/components/refine.tsx",
                            lineNumber: 177,
                            columnNumber: 15
                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: `${QUESTION} animate-rise`,
                                    children: question
                                }, void 0, false, {
                                    fileName: "[project]/app/components/refine.tsx",
                                    lineNumber: 185,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: ANSWER,
                                    "aria-hidden": true,
                                    children: [
                                        value.slice(0, selection.start),
                                        hasSelection ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "rounded-sm bg-accent/25",
                                            children: value.slice(selection.start, selection.end)
                                        }, void 0, false, {
                                            fileName: "[project]/app/components/refine.tsx",
                                            lineNumber: 189,
                                            columnNumber: 21
                                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "relative inline-block h-[1.1em] w-0 align-text-bottom",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "absolute -left-px top-0 h-full w-[3px] rounded-full bg-accent opacity-30 group-focus-within:animate-caret group-focus-within:opacity-100"
                                            }, void 0, false, {
                                                fileName: "[project]/app/components/refine.tsx",
                                                lineNumber: 195,
                                                columnNumber: 23
                                            }, this)
                                        }, `${value.length}:${selection.start}`, false, {
                                            fileName: "[project]/app/components/refine.tsx",
                                            lineNumber: 191,
                                            columnNumber: 21
                                        }, this),
                                        value.slice(selection.end),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: `absolute inset-x-0 top-full mt-4 text-sm tracking-normal text-foreground/40 transition-opacity duration-500 ${value.trim() ? "opacity-100" : "opacity-0"}`,
                                            children: "Press Enter ↵"
                                        }, void 0, false, {
                                            fileName: "[project]/app/components/refine.tsx",
                                            lineNumber: 199,
                                            columnNumber: 19
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/app/components/refine.tsx",
                                    lineNumber: 186,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/components/refine.tsx",
                            lineNumber: 184,
                            columnNumber: 15
                        }, this)
                    }, index, false, {
                        fileName: "[project]/app/components/refine.tsx",
                        lineNumber: 156,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/app/components/refine.tsx",
                lineNumber: 150,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/components/refine.tsx",
        lineNumber: 118,
        columnNumber: 5
    }, this);
}
}),
"[project]/app/lib/refine.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "FIRST_REFINE",
    ()=>FIRST_REFINE,
    "MAX_REFINE",
    ()=>MAX_REFINE,
    "nextRefineQuestion",
    ()=>nextRefineQuestion
]);
const MAX_REFINE = 2;
const FIRST_REFINE = "What would you like to change?";
const FOLLOW_UPS = [
    {
        question: "Should we prioritize budget, size, or neighborhood?",
        covered: (said)=>/\bbudget\b|\bsize\b|\bneighborhood\b|\bcheap\b|\blarger?\b|\bsmaller?\b|\bpatio\b/i.test(said)
    },
    {
        question: "Anything else to weight in the search?",
        covered: ()=>false
    }
];
async function nextRefineQuestion(history) {
    if (history.length >= MAX_REFINE) return null;
    const said = history.map((exchange)=>exchange.answer).join(" ");
    const asked = new Set(history.map((exchange)=>exchange.question));
    const next = FOLLOW_UPS.find((followUp)=>!asked.has(followUp.question) && !followUp.covered(said));
    await new Promise((resolve)=>setTimeout(resolve, 600));
    return next?.question ?? null;
}
}),
];

//# sourceMappingURL=app_0rv6zoy8veso8._.js.map