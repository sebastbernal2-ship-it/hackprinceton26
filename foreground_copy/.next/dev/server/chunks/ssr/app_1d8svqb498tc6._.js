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
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$brief$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/lib/brief.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$discover$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/lib/discover.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$next$2d$question$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/lib/next-question.ts [app-ssr] (ecmascript)");
"use client";
;
;
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
    // is hidden, so coming back starts a new one.
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useLayoutEffect"])(()=>{
        return ()=>{
            if (!finished.current) return;
            finished.current = false;
            setHistory([]);
            setQuestion(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$next$2d$question$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["FIRST_QUESTION"]);
            setPhase("asking");
        };
    }, []);
    // autoFocus only applies on first load; this also returns focus when the page is shown again.
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        inputRef.current?.focus();
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
        if (answered.length < __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$next$2d$question$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MAX_QUESTIONS"]) {
            setPhase("thinking");
            next = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$next$2d$question$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["nextQuestion"])(answered);
        }
        if (next === null) {
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$brief$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["saveBrief"])(answered);
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$lib$2f$discover$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["seedMatches"])(answered);
            finished.current = true;
            setPhase("leaving");
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
                    "aria-label": question,
                    autoComplete: "off",
                    autoCorrect: "off",
                    spellCheck: false,
                    enterKeyHint: "next",
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
                        className: `transition-opacity duration-700 ${!past ? "opacity-100" : phase === "leaving" ? "opacity-0" : "opacity-30"}`,
                        children: past ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: QUESTION,
                                    children: past.question
                                }, void 0, false, {
                                    fileName: "[project]/app/components/intake.tsx",
                                    lineNumber: 191,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: ANSWER,
                                    children: past.answer
                                }, void 0, false, {
                                    fileName: "[project]/app/components/intake.tsx",
                                    lineNumber: 192,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/components/intake.tsx",
                            lineNumber: 190,
                            columnNumber: 15
                        }, this) : phase === "welcome" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                            className: `${QUESTION} animate-interlude`,
                            style: {
                                animationDuration: `${WELCOME_MS}ms`
                            },
                            children: [
                                "Welcome to ",
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "text-accent",
                                    children: "Foreground"
                                }, void 0, false, {
                                    fileName: "[project]/app/components/intake.tsx",
                                    lineNumber: 196,
                                    columnNumber: 28
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/components/intake.tsx",
                            lineNumber: 195,
                            columnNumber: 15
                        }, this) : phase === "leaving" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: `${QUESTION} animate-interlude`,
                            style: {
                                animationDuration: `${LEAVING_MS}ms`
                            },
                            role: "status",
                            children: "Finding places for you"
                        }, void 0, false, {
                            fileName: "[project]/app/components/intake.tsx",
                            lineNumber: 199,
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
                                        lineNumber: 209,
                                        columnNumber: 19
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/app/components/intake.tsx",
                                    lineNumber: 208,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: ANSWER
                                }, void 0, false, {
                                    fileName: "[project]/app/components/intake.tsx",
                                    lineNumber: 211,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/components/intake.tsx",
                            lineNumber: 207,
                            columnNumber: 15
                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: `${QUESTION} animate-rise`,
                                    children: question
                                }, void 0, false, {
                                    fileName: "[project]/app/components/intake.tsx",
                                    lineNumber: 215,
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
                                            lineNumber: 219,
                                            columnNumber: 21
                                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "relative inline-block h-[1.1em] w-0 align-text-bottom",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "absolute -left-px top-0 h-full w-[3px] rounded-full bg-accent opacity-30 group-focus-within:animate-caret group-focus-within:opacity-100"
                                            }, void 0, false, {
                                                fileName: "[project]/app/components/intake.tsx",
                                                lineNumber: 225,
                                                columnNumber: 23
                                            }, this)
                                        }, `${value.length}:${selection.start}`, false, {
                                            fileName: "[project]/app/components/intake.tsx",
                                            lineNumber: 221,
                                            columnNumber: 21
                                        }, this),
                                        value.slice(selection.end),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: `absolute inset-x-0 top-full mt-4 text-sm tracking-normal text-foreground/40 transition-opacity duration-500 ${value.trim() ? "opacity-100" : "opacity-0"}`,
                                            children: "Press Enter ↵"
                                        }, void 0, false, {
                                            fileName: "[project]/app/components/intake.tsx",
                                            lineNumber: 229,
                                            columnNumber: 19
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/app/components/intake.tsx",
                                    lineNumber: 216,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/components/intake.tsx",
                            lineNumber: 214,
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

//# sourceMappingURL=app_1d8svqb498tc6._.js.map