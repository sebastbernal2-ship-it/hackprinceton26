"use client";

import { motion, useReducedMotion } from "motion/react";
import { DUR, EASE, REDUCED, SPRING } from "../motion";
import { mailtoHref } from "./data";

const pill = "inline-flex h-11 items-center rounded-full border border-line-strong px-5 text-[0.9375rem] font-medium text-text outline-none transition-transform duration-100 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-live";

/**
 * The finale: the letter has folded into one line built from state, the scrim has lifted, and the stage is gliding
 * through the space with the storefront in view. No confetti.
 */
export function Finale({
  seal,
  subject,
  body,
  memoHref,
  copied,
  onBack,
  onRestart,
}: {
  seal: string;
  subject: string;
  body: string;
  memoHref: string;
  /** false when the browser refused the clipboard: the owner must copy from the letter */
  copied: boolean;
  onBack: () => void;
  onRestart: () => void;
}) {
  const reduce = useReducedMotion();
  const mail = mailtoHref(subject, body);
  const rise = (delay: number) =>
    reduce ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: REDUCED } : { initial: { opacity: 0, y: 16, filter: "blur(8px)" }, animate: { opacity: 1, y: 0, filter: "blur(0px)" }, transition: { ...SPRING.morph, delay } };
  return (
    <div className="pointer-events-none flex h-full flex-col justify-end pb-10">
      <motion.div {...rise(0.15)} className="pointer-events-auto max-w-[640px]">
        <h2 className="flow-display text-text [text-shadow:0_2px_24px_oklch(0.12_0.01_60/0.7)]">Your offer is ready.</h2>
        <motion.p
          className="flow-source mt-3 w-fit max-w-full rounded-full bg-stage/80 px-4 py-2 text-text-2 backdrop-blur-none"
          initial={reduce ? false : { clipPath: "inset(0 100% 0 0)" }}
          animate={{ clipPath: "inset(0 0% 0 0)" }}
          transition={{ duration: DUR.draw, ease: EASE.out, delay: 0.5 }}
        >
          {seal}
        </motion.p>
        <p className="mt-3 text-sm text-text-2 [text-shadow:0_1px_12px_oklch(0.12_0.01_60/0.8)]" role="status">
          {copied ? "The letter is on your clipboard." : "Your browser blocked the clipboard. Go back to the letter and copy it from there."}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {mail ? (
            <a href={mail} className={`${pill} glass`}>
              Open in mail
            </a>
          ) : (
            <span className="flow-label text-text-3">Too long for a mail link: paste it.</span>
          )}
          <a href={memoHref} target="_blank" rel="noreferrer" className={`${pill} glass`}>
            Print memo
          </a>
          <button type="button" onClick={onRestart} className={`${pill} glass`}>
            Start another search
          </button>
          <button type="button" onClick={onBack} className="flow-label h-11 rounded-full px-3 text-text-2 underline-offset-4 hover:text-text hover:underline">
            Back to the documents
          </button>
        </div>
      </motion.div>
    </div>
  );
}
