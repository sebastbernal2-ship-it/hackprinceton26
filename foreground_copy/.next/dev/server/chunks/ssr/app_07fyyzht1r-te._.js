module.exports = [
"[project]/app/components/intake.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>Intake
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$next$2d$question$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/lib/next-question.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
const WELCOME_MS = 2600;
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
function Intake() {
    const [history, setHistory] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [question, setQuestion] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$next$2d$question$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["FIRST_QUESTION"]);
    const [phase, setPhase] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("welcome");
    const [value, setValue] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const [selection, setSelection] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({
        start: 0,
        end: 0
    });
    const inputRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const trackRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const activeRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const alignedAnswers = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const finished = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(false);
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRouter"])();
    // Keep the active block centred on the screen. The stack slides up only when an answer is added;
    // every other placement (first load, the welcome line giving way, a fresh start) is instant.
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useLayoutEffect"])(()=>{
        const align = (slide)=>{
            const track = trackRef.current;
            const active = activeRef.current;
            if (!track || !active) return;
            // A slide already under way is left to finish, so the next question arriving cannot cut it short.
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
    // The welcome line fades in and out on its own, then gives way to the first question.
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const timer = setTimeout(()=>{
            setPhase((current)=>current === "welcome" ? "asking" : current);
        }, WELCOME_MS);
        return ()=>clearTimeout(timer);
    }, []);
    // After the last answer, a closing line fades in and out, then the dashboard takes over.
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (phase !== "leaving") return;
        const timer = setTimeout(()=>router.push("/dashboard"), LEAVING_MS);
        return ()=>clearTimeout(timer);
    }, [
        phase,
        router
    ]);
    // Next keeps this page alive, hidden, after navigating away. A finished intake is cleared as it
    // is hidden, so coming back starts a new one; the typing line takes focus again whenever it is shown.
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useLayoutEffect"])(()=>{
        inputRef.current?.focus();
        return ()=>{
            if (!finished.current) return;
            finished.current = false;
            setHistory([]);
            setQuestion(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$next$2d$question$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["FIRST_QUESTION"]);
            setPhase("asking");
        };
    }, []);
    function syncSelection(input) {
        setSelection((current)=>selectionOf(input, current));
    }
    // The input is focused before React loads, so React's own onSelect can miss caret moves.
    // The document-level selectionchange event reports them regardless.
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
    async function submit() {
        if (phase === "welcome") {
            setPhase("asking");
            return;
        }
        if (phase === "done") {
            setHistory([]);
            setQuestion(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$next$2d$question$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["FIRST_QUESTION"]);
            setPhase("asking");
            clearInput();
            return;
        }
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
        if (answered.length >= __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$next$2d$question$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MAX_QUESTIONS"]) {
            setPhase("done");
            return;
        }
        setPhase("thinking");
        const next = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$next$2d$question$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["nextQuestion"])(answered);
        if (next === null) {
            setPhase("done");
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
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
        className: "group relative h-dvh flex-1 cursor-text overflow-hidden font-sans [mask-image:linear-gradient(to_bottom,transparent,black_22%)]",
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
                    "aria-label": phase === "done" ? "Press Enter to start over" : question,
                    autoComplete: "off",
                    autoCorrect: "off",
                    spellCheck: false,
                    enterKeyHint: phase === "done" ? "done" : "next",
                    className: "pointer-events-none fixed left-1/2 top-1/2 h-px w-px text-base opacity-0"
                }, void 0, false, {
                    fileName: "[project]/app/components/intake.tsx",
                    lineNumber: 157,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/components/intake.tsx",
                lineNumber: 151,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                ref: trackRef,
                "aria-live": "polite",
                className: "absolute inset-x-0 top-1/2 mx-auto flex w-full max-w-3xl flex-col gap-14 px-8 text-center transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform",
                children: blocks.map((past, index)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        ref: past ? undefined : activeRef,
                        className: `transition-opacity duration-700 ${past ? "opacity-30" : "opacity-100"}`,
                        children: past ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: QUESTION,
                                    children: past.question
                                }, void 0, false, {
                                    fileName: "[project]/app/components/intake.tsx",
                                    lineNumber: 189,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: ANSWER,
                                    children: past.answer
                                }, void 0, false, {
                                    fileName: "[project]/app/components/intake.tsx",
                                    lineNumber: 190,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/components/intake.tsx",
                            lineNumber: 188,
                            columnNumber: 15
                        }, this) : phase === "welcome" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                            className: `${QUESTION} animate-welcome`,
                            style: {
                                animationDuration: `${WELCOME_MS}ms`
                            },
                            children: "Welcome to Foreground"
                        }, void 0, false, {
                            fileName: "[project]/app/components/intake.tsx",
                            lineNumber: 193,
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
                                        fileName: "[project]/app/components/intake.tsx",
                                        lineNumber: 199,
                                        columnNumber: 19
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/app/components/intake.tsx",
                                    lineNumber: 198,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: ANSWER
                                }, void 0, false, {
                                    fileName: "[project]/app/components/intake.tsx",
                                    lineNumber: 201,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/components/intake.tsx",
                            lineNumber: 197,
                            columnNumber: 15
                        }, this) : phase === "done" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "animate-rise",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: QUESTION,
                                    children: "That's everything I need."
                                }, void 0, false, {
                                    fileName: "[project]/app/components/intake.tsx",
                                    lineNumber: 205,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "mt-5 text-sm text-foreground/40",
                                    children: "Press Enter to start over"
                                }, void 0, false, {
                                    fileName: "[project]/app/components/intake.tsx",
                                    lineNumber: 206,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/components/intake.tsx",
                            lineNumber: 204,
                            columnNumber: 15
                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: `${QUESTION} animate-rise`,
                                    children: question
                                }, void 0, false, {
                                    fileName: "[project]/app/components/intake.tsx",
                                    lineNumber: 210,
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
                                            fileName: "[project]/app/components/intake.tsx",
                                            lineNumber: 214,
                                            columnNumber: 21
                                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "relative inline-block h-[1.1em] w-0 align-text-bottom",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "absolute -left-px top-0 h-full w-[3px] rounded-full bg-accent opacity-30 group-focus-within:animate-caret group-focus-within:opacity-100"
                                            }, void 0, false, {
                                                fileName: "[project]/app/components/intake.tsx",
                                                lineNumber: 220,
                                                columnNumber: 23
                                            }, this)
                                        }, `${value.length}:${selection.start}`, false, {
                                            fileName: "[project]/app/components/intake.tsx",
                                            lineNumber: 216,
                                            columnNumber: 21
                                        }, this),
                                        value.slice(selection.end),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: `absolute inset-x-0 top-full mt-4 text-sm tracking-normal text-foreground/40 transition-opacity duration-500 ${value.trim() ? "opacity-100" : "opacity-0"}`,
                                            children: "Press Enter ↵"
                                        }, void 0, false, {
                                            fileName: "[project]/app/components/intake.tsx",
                                            lineNumber: 224,
                                            columnNumber: 19
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/app/components/intake.tsx",
                                    lineNumber: 211,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/components/intake.tsx",
                            lineNumber: 209,
                            columnNumber: 15
                        }, this)
                    }, index, false, {
                        fileName: "[project]/app/components/intake.tsx",
                        lineNumber: 182,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/app/components/intake.tsx",
                lineNumber: 176,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/components/intake.tsx",
        lineNumber: 144,
        columnNumber: 5
    }, this);
}
}),
"[project]/app/lib/next-question.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "FIRST_QUESTION",
    ()=>FIRST_QUESTION,
    "MAX_QUESTIONS",
    ()=>MAX_QUESTIONS,
    "nextQuestion",
    ()=>nextQuestion
]);
const MAX_QUESTIONS = 3;
const FIRST_QUESTION = "What are you looking for?";
const FOLLOW_UPS = [
    {
        question: "Which city, Houston or Los Angeles?",
        covered: (said)=>/\bhouston\b|\blos angeles\b/i.test(said) || /\bL\.?A\.?\b/.test(said)
    },
    {
        question: "What is your budget for the build-out?",
        covered: (said)=>/\$\s?\d|\b\d+(\.\d+)?\s?(k|grand|thousand|million)\b|\bbudget\b/i.test(said)
    },
    {
        question: "How many seats are you planning for?",
        covered: (said)=>/\b\d+[\s-]*(seats?|seater|covers|guests|people)\b/i.test(said)
    },
    {
        question: "Anything the space must have?",
        covered: ()=>false
    }
];
async function nextQuestion(history) {
    if (history.length >= MAX_QUESTIONS) return null;
    const said = history.map((exchange)=>exchange.answer).join(" ");
    const asked = new Set(history.map((exchange)=>exchange.question));
    const next = FOLLOW_UPS.find((followUp)=>!asked.has(followUp.question) && !followUp.covered(said));
    // Simulated agent latency, so the thinking state is visible until the real agent is wired in.
    await new Promise((resolve)=>setTimeout(resolve, 600));
    return next?.question ?? null;
}
}),
];

//# sourceMappingURL=app_07fyyzht1r-te._.js.map