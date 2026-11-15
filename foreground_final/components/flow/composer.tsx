"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, Square } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { DUR, LAYOUT, REDUCED, SPRING, stagger, TYPE_CPS } from "./motion";
import type { ComposerProps } from "./types";

const MAX_LINES = 4;

/**
 * The one text field of the flow: an auto-growing textarea (1 to 4 lines) and a round send button that becomes
 * Stop while busy. Enter sends, Shift+Enter breaks. The field always carries layoutId "composer", so the hero
 * field on Ask morphs into the docked field under the thread.
 */
export function Composer({
  variant,
  value,
  onChange,
  onSubmit,
  placeholder,
  examples,
  suggestions,
  busy = false,
  onStop,
  disabled = false,
  autoFocus = false,
}: ComposerProps) {
  const reduce = useReducedMotion();
  const field = useRef<HTMLTextAreaElement>(null);
  const typing = useRef<ReturnType<typeof setInterval> | null>(null);
  const hero = variant === "hero";
  const chips = hero ? examples : suggestions?.slice(0, 2);
  const canSend = value.trim().length > 0 && !disabled;

  const stopTyping = useCallback(() => {
    if (typing.current) clearInterval(typing.current);
    typing.current = null;
  }, []);
  useEffect(() => stopTyping, [stopTyping]);

  // grow with the text, up to MAX_LINES
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    const line = parseFloat(getComputedStyle(el).lineHeight) || 26;
    el.style.height = `${Math.min(el.scrollHeight, Math.ceil(line * MAX_LINES))}px`;
  }, [value]);

  useEffect(() => {
    if (autoFocus && window.matchMedia("(pointer: fine)").matches) field.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  /** a chip types itself into the field and leaves sending to the owner */
  const typeIn = (text: string) => {
    stopTyping();
    if (window.matchMedia("(pointer: fine)").matches) field.current?.focus({ preventScroll: true });
    if (reduce) return onChange(text);
    let n = 0;
    onChange("");
    typing.current = setInterval(() => {
      n += 1;
      onChange(text.slice(0, n));
      if (n >= text.length) stopTyping();
    }, 1000 / TYPE_CPS);
  };

  const send = () => {
    if (!canSend) return;
    stopTyping();
    onSubmit(value.trim());
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const chipRow = chips?.length ? (
    <motion.div variants={{ exit: { opacity: 0, transition: { duration: DUR.quick } } }} className="flex flex-wrap gap-2">
      {chips.map((text, i) => (
        <motion.button
          key={text}
          type="button"
          onClick={() => (hero ? typeIn(text) : onSubmit(text))}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          whileTap={{ scale: 0.97, transition: { duration: DUR.press } }}
          transition={reduce ? REDUCED : { ...SPRING.ui, delay: (hero ? 0.45 : 0) + stagger(i) }}
          className="flow-label glass inline-flex h-11 items-center rounded-full px-4 text-left text-text-2 transition-colors duration-150 hover:bg-stage-3/80 hover:text-text"
        >
          {text}
        </motion.button>
      ))}
    </motion.div>
  ) : null;

  return (
    <div className={cn("flex w-full gap-3", hero ? "flex-col-reverse sm:flex-col sm:gap-5" : "flex-col")}>
      {!hero ? chipRow : null}
      <motion.form
        layoutId={LAYOUT.composer}
        transition={reduce ? REDUCED : SPRING.morph}
        style={{ borderRadius: 28 }}
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          send();
        }}
        className={cn(
          "glass-heavy flex w-full items-end gap-2 py-[7px] pr-[7px] pl-5 transition-colors duration-150 focus-within:border-live/60",
          hero && "sm:py-[15px] sm:pr-[15px] sm:pl-7",
        )}
      >
        <motion.textarea
          layout="position"
          ref={field}
          rows={1}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={placeholder}
          enterKeyHint="send"
          onChange={(e) => {
            stopTyping();
            onChange(e.target.value);
          }}
          onKeyDown={onKeyDown}
          className={cn(
            "flow-chat min-w-0 flex-1 resize-none self-center bg-transparent py-[7px] text-text outline-none placeholder:text-text-3",
            hero && "sm:text-[1.1875rem]",
          )}
        />
        <motion.button
          layout="position"
          type={busy ? "button" : "submit"}
          onClick={busy ? onStop : undefined}
          disabled={busy ? false : !canSend}
          aria-label={busy ? "Stop" : "Send"}
          whileTap={{ scale: 0.97, transition: { duration: DUR.press } }}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-text text-stage transition-opacity duration-150 disabled:opacity-30"
        >
          {busy ? <Square aria-hidden="true" className="size-3.5 fill-current" /> : <ArrowUp aria-hidden="true" className="size-5" strokeWidth={2.25} />}
        </motion.button>
      </motion.form>
      {hero ? chipRow : null}
    </div>
  );
}
