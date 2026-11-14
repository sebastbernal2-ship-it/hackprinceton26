const TONE: Record<string, string> = {
  observed: "bg-match-soft text-match",
  estimated: "border border-dashed border-foreground/30 text-foreground/70",
  unknown: "border border-foreground/15 text-foreground/50",
  derived: "border border-foreground/20 text-foreground/70",
  verify: "bg-accent/10 text-accent",
  unverified: "border border-dashed border-accent/50 text-accent",
};

export default function Badge({ kind, children }: { kind: keyof typeof TONE | string; children?: React.ReactNode }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[0.7rem] font-medium ${TONE[kind] ?? TONE.unknown}`}>
      {children ?? kind}
    </span>
  );
}
