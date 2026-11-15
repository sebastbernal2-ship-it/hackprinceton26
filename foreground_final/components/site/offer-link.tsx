import Link from "next/link";

/** "Prepare offer" link from the site page; carries the owner's brief to the offer page. */
export function OfferLink({ siteId, brief }: { siteId: string; brief: { concept: string; seats?: number; budgetUsd?: number } }) {
  const q = new URLSearchParams({ concept: brief.concept });
  if (brief.seats !== undefined) q.set("seats", String(brief.seats));
  if (brief.budgetUsd !== undefined) q.set("budget", String(brief.budgetUsd));
  return (
    <p className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <Link
        href={`/site/${siteId}/offer?${q}`}
        className="inline-flex h-9 items-center rounded-sm bg-ink px-3 text-sm font-semibold text-on-ink transition-[transform,background-color] hover:bg-ink/90 active:scale-[0.97]"
      >
        Prepare offer
      </Link>
      <span className="text-sm text-ink-2">Ask list, a draft email to the broker, and a printable deal memo.</span>
    </p>
  );
}
