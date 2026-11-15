"use client";

import Link from "next/link";
import { clearBrief, useBrief } from "../../lib/brief";
import { clearMatches } from "../../lib/discover";

/** The saved intake answers, read-only. Editing means starting the intake again. */
export default function ProfileAnswers() {
  const brief = useBrief();
  if (brief.length === 0) {
    return (
      <p className="text-sm text-foreground/60">
        No intake answers saved yet. <Link href="/" className="underline">Start the intake</Link> to describe what you are looking for.
      </p>
    );
  }
  return (
    <div>
      <dl className="flex flex-col gap-4 text-sm" data-testid="profile-answers">
        {brief.map((exchange) => (
          <div key={`${exchange.question}:${exchange.answer}`}>
            <dt className="text-foreground/50">{exchange.question}</dt>
            <dd className="mt-0.5 break-words leading-relaxed">{exchange.answer}</dd>
          </div>
        ))}
      </dl>
      <Link
        href="/"
        onClick={() => { clearBrief(); clearMatches(); }}
        className="mt-4 inline-block rounded-full border border-foreground/25 px-4 py-1.5 text-sm transition-opacity hover:opacity-70"
      >
        Edit / start over
      </Link>
    </div>
  );
}
