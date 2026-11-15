"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { saveBrief, useBrief } from "../lib/brief";
import { refreshMatches } from "../lib/discover";
import { FIRST_REFINE, MAX_REFINE, nextRefineQuestion } from "../lib/refine";
import type { Exchange } from "../lib/next-question";

type Phase = "asking" | "thinking" | "leaving";
type Selection = { start: number; end: number };

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

export default function Refine() {
  const brief = useBrief();
  const [history, setHistory] = useState<Exchange[]>([]);
  const [question, setQuestion] = useState(FIRST_REFINE);
  const [phase, setPhase] = useState<Phase>("asking");
  const [value, setValue] = useState("");
  const [selection, setSelection] = useState({ start: 0, end: 0 });

  const inputRef = useRef<HTMLInputElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const alignedAnswers = useRef<number | null>(null);
  const router = useRouter();

  useLayoutEffect(() => {
    const align = (slide: boolean) => {
      const track = trackRef.current;
      const active = activeRef.current;
      if (!track || !active) return;
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

  useEffect(() => {
    if (phase !== "leaving") return;
    const timer = setTimeout(() => router.push("/dashboard"), LEAVING_MS);
    return () => clearTimeout(timer);
  }, [phase, router]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function syncSelection(input: HTMLInputElement) {
    setSelection((current) => selectionOf(input, current));
  }

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

  async function finish(refined: Exchange[]) {
    const nextBrief = [...brief, ...refined];
    saveBrief(nextBrief);
    refreshMatches(nextBrief);
    setPhase("leaving");
  }

  async function submit() {
    const answer = value.trim();
    if (phase !== "asking" || !answer) return;

    const answered = [...history, { question, answer }];
    setHistory(answered);
    clearInput();

    let next: string | null = null;
    if (answered.length < MAX_REFINE) {
      setPhase("thinking");
      next = await nextRefineQuestion(answered, brief);
    }
    if (next === null) {
      await finish(answered);
    } else {
      setQuestion(next);
      setPhase("asking");
    }
  }

  const hasSelection = selection.start !== selection.end;
  const blocks = [...history, null];

  return (
    <div
      className="group relative h-[calc(100dvh)] cursor-text overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_18%)]"
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
            ) : phase === "leaving" ? (
              <p
                className={`${QUESTION} animate-interlude`}
                style={{ animationDuration: `${LEAVING_MS}ms` }}
                role="status"
              >
                Finding better matches
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
    </div>
  );
}
