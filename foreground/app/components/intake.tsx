"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { saveBrief } from "../lib/brief";
import { seedMatches } from "../lib/discover";
import { FIRST_QUESTION, MAX_QUESTIONS, nextQuestion, type Exchange } from "../lib/next-question";

type Phase = "welcome" | "asking" | "thinking" | "leaving";
type Selection = { start: number; end: number };

const WELCOME_MS = 2600;
const LEAVING_MS = 1800;

function selectionOf(input: HTMLInputElement, current: Selection): Selection {
  const length = input.value.length;
  const start = input.selectionStart ?? length;
  const end = input.selectionEnd ?? length;
  return current.start === start && current.end === end ? current : { start, end };
}

const LINE = "text-[clamp(1.6rem,4vw,2.5rem)] leading-tight tracking-tight";
const QUESTION = `${LINE} font-medium`;
const ANSWER = `${LINE} relative mt-3 min-h-[1.25em] whitespace-pre-wrap break-words text-foreground/70`;

export default function Intake() {
  const [history, setHistory] = useState<Exchange[]>([]);
  const [question, setQuestion] = useState(FIRST_QUESTION);
  const [phase, setPhase] = useState<Phase>("welcome");
  const [value, setValue] = useState("");
  const [selection, setSelection] = useState({ start: 0, end: 0 });

  const inputRef = useRef<HTMLInputElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const alignedAnswers = useRef<number | null>(null);
  const finished = useRef(false);
  const router = useRouter();

  // Keep the active block centred on the screen. The stack slides up only when an answer is added;
  // every other placement (first load, the welcome line giving way, a fresh start) is instant.
  useLayoutEffect(() => {
    const align = (slide: boolean) => {
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
    const onResize = () => align(false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [history.length, phase]);

  // The welcome line fades in and out on its own, then gives way to the first question.
  useEffect(() => {
    const timer = setTimeout(() => {
      setPhase((current) => (current === "welcome" ? "asking" : current));
    }, WELCOME_MS);
    return () => clearTimeout(timer);
  }, []);

  // After the last answer, a closing line fades in and out, then the dashboard takes over.
  useEffect(() => {
    if (phase !== "leaving") return;
    const timer = setTimeout(() => router.push("/dashboard"), LEAVING_MS);
    return () => clearTimeout(timer);
  }, [phase, router]);

  // Next keeps this page alive, hidden, after navigating away. A finished intake is cleared as it
  // is hidden, so coming back starts a new one.
  useLayoutEffect(() => {
    return () => {
      if (!finished.current) return;
      finished.current = false;
      setHistory([]);
      setQuestion(FIRST_QUESTION);
      setPhase("asking");
    };
  }, []);

  // autoFocus only applies on first load; this also returns focus when the page is shown again.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function syncSelection(input: HTMLInputElement) {
    setSelection((current) => selectionOf(input, current));
  }

  // The input is focused before React loads, so React's own onSelect can miss caret moves.
  // The document-level selectionchange event reports them regardless.
  useEffect(() => {
    const onSelectionChange = () => {
      const input = inputRef.current;
      if (input && document.activeElement === input) {
        setSelection((current) => selectionOf(input, current));
      }
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  function clearInput() {
    setValue("");
    setSelection({ start: 0, end: 0 });
  }

  async function submit() {
    if (phase === "welcome") {
      setPhase("asking");
      return;
    }
    const answer = value.trim();
    if (phase !== "asking" || !answer) return;

    const answered = [...history, { question, answer }];
    setHistory(answered);
    clearInput();
    let next: string | null = null;
    if (answered.length < MAX_QUESTIONS) {
      setPhase("thinking");
      next = await nextQuestion(answered);
    }
    if (next === null) {
      saveBrief(answered);
      seedMatches(answered);
      finished.current = true;
      setPhase("leaving");
    } else {
      setQuestion(next);
      setPhase("asking");
    }
  }

  const hasSelection = selection.start !== selection.end;
  const blocks = [...history, null];

  return (
    <main
      className="group relative h-dvh flex-1 cursor-text overflow-hidden font-sans [mask-image:linear-gradient(to_bottom,transparent,black_22%)]"
      onMouseDown={(event) => {
        event.preventDefault();
        inputRef.current?.focus();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <input
          ref={inputRef}
          autoFocus
          value={value}
          onChange={(event) => {
            if (phase !== "asking") return;
            setValue(event.target.value);
            syncSelection(event.target);
          }}
          onKeyUp={(event) => syncSelection(event.currentTarget)}
          aria-label={question}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          className="pointer-events-none fixed left-1/2 top-1/2 h-px w-px text-base opacity-0"
        />
      </form>

      <div
        ref={trackRef}
        aria-live="polite"
        className="absolute inset-x-0 top-1/2 mx-auto flex w-full max-w-3xl flex-col gap-14 px-8 text-center transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform"
      >
        {blocks.map((past, index) => (
          <div
            key={index}
            ref={past ? undefined : activeRef}
            className={`transition-opacity duration-700 ${
              !past ? "opacity-100" : phase === "leaving" ? "opacity-0" : "opacity-30"
            }`}
          >
            {past ? (
              <>
                <p className={QUESTION}>{past.question}</p>
                <p className={ANSWER}>{past.answer}</p>
              </>
            ) : phase === "welcome" ? (
              <h1 className={`${QUESTION} animate-interlude`} style={{ animationDuration: `${WELCOME_MS}ms` }}>
                Welcome to Foreground
              </h1>
            ) : phase === "leaving" ? (
              <p
                className={`${QUESTION} animate-interlude`}
                style={{ animationDuration: `${LEAVING_MS}ms` }}
                role="status"
              >
                Finding places for you
              </p>
            ) : phase === "thinking" ? (
              <div className="animate-rise" role="status" aria-label="Thinking">
                <div className={QUESTION}>
                  <span className="inline-block h-2.5 w-2.5 animate-breathe rounded-full bg-foreground/50" />
                </div>
                <div className={ANSWER} />
              </div>
            ) : (
              <>
                <p className={`${QUESTION} animate-rise`}>{question}</p>
                <p className={ANSWER} aria-hidden>
                  {value.slice(0, selection.start)}
                  {hasSelection ? (
                    <span className="rounded-sm bg-accent/25">{value.slice(selection.start, selection.end)}</span>
                  ) : (
                    <span
                      key={`${value.length}:${selection.start}`}
                      className="relative inline-block h-[1.1em] w-0 align-text-bottom"
                    >
                      <span className="absolute -left-px top-0 h-full w-[3px] rounded-full bg-accent opacity-30 group-focus-within:animate-caret group-focus-within:opacity-100" />
                    </span>
                  )}
                  {value.slice(selection.end)}
                  <span
                    className={`absolute inset-x-0 top-full mt-4 text-sm tracking-normal text-foreground/40 transition-opacity duration-500 ${
                      value.trim() ? "opacity-100" : "opacity-0"
                    }`}
                  >
                    Press Enter ↵
                  </span>
                </p>
              </>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
