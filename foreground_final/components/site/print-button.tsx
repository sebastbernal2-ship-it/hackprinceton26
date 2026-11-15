"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="h-9 rounded-sm bg-ink px-3 text-sm font-semibold text-on-ink transition-[transform,background-color] hover:bg-ink/90 active:scale-[0.97] print:hidden"
    >
      Print memo
    </button>
  );
}
