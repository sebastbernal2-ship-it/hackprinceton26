# Foreground design contract v2

Build contract for the redesign in `docs/redesign-plan.md`. Tokens live in `DESIGN.md`; this file is how to build.

## 1. Visual world: "After hours"

- The space itself, seen after closing with the lights still on: a warm near-black stage where real scan imagery is
  the only loud thing, and all UI is a thin layer of warm glass floating over it.
- One friendly display face set large, bone-white type, one bone pill for the next step, one cool "live" blue for
  anything the assistant is doing right now. Red / green / amber appear only on money, with their old meaning.
- Why: owners should feel walked through a place, not handed a tool. Dark makes the photos and the 3D scan glow and
  hides the seams between photo, scan and generated image; warm neutrals keep it hospitable instead of "dev tool".

Dark over light, decided: (a) every step sits on imagery or a 3D scan, and glass over imagery only reads on dark;
(b) the card-to-scan morph needs UI that disappears; (c) one theme only, no toggle. Accent is deliberately not a warm
hue: orange/peach would sit between `needed` red and `maybe` amber and corrupt the cost meaning.

## 2. Tokens

Source of truth is the `DESIGN.md` frontmatter; mirror into `app/globals.css` as `--color-*` under `@theme`.

| Token | Value | Use |
|---|---|---|
| `stage` | `oklch(0.16 0.008 60)` | page ground behind media; never `#000` |
| `stage-2` | `oklch(0.20 0.010 60)` | opaque raised surface (cards off imagery, dialog) |
| `stage-3` | `oklch(0.25 0.012 60)` | hover / pressed fill, user bubble |
| `line` / `line-strong` | `oklch(1 0 0 / 0.10)` / `oklch(1 0 0 / 0.18)` | hairlines, glass edge |
| `text` | `oklch(0.96 0.012 85)` | primary text; also the primary button fill ("bone") |
| `text-2` / `text-3` | `oklch(0.78 0.015 80)` / `oklch(0.64 0.015 75)` | secondary / tertiary (AA on `stage`) |
| `live` / `live-wash` | `oklch(0.82 0.09 235)` / `oklch(0.82 0.09 235 / 0.14)` | streaming caret, focus ring, tour path, base-case line |
| `needed` / `-wash` | `oklch(0.72 0.17 27)` / `... / 0.14` | cost the owner must pay |
| `saved` / `-wash` | `oklch(0.80 0.15 155)` / `... / 0.14` | money saved / reusable |
| `maybe` / `-wash` | `oklch(0.83 0.14 80)` / `... / 0.14` | unknown, needs a landlord answer |
| `scrim` | `linear-gradient(to top, oklch(0.12 0.01 60 / 0.88), transparent 60%)` | under text on photos |

Cost colors always ship with a word or sign ("saves ~$40k", "+$18k to $30k", "ask landlord"); never color alone.

**Glass (the only surface over imagery).** `glass`: `background: oklch(0.18 0.01 60 / 0.62); backdrop-filter:
blur(24px) saturate(140%); border: 1px solid line; box-shadow: inset 0 1px 0 oklch(1 0 0 / 0.08)`. `glass-heavy`
(chat panel, sheet, hero composer): alpha `0.80`, blur `40px`, plus `shadow-float`. Never glass on glass: inside a
glass panel, children use `oklch(1 0 0 / 0.06)` fills. `prefers-reduced-transparency`: both become `stage-2`, no blur.

**Shadows.** `shadow-float: 0 24px 60px -20px oklch(0 0 0 / 0.6)`; `shadow-card: 0 12px 32px -16px oklch(0 0 0 / 0.5)`.
Nothing else casts a shadow.

**Fonts** (`next/font/google` in `app/layout.tsx`, `display: "swap"`, replace Archivo):
`Bricolage_Grotesque` -> `--font-display` (variable, weights 500-700); `Geist` -> `--font-sans`; `Geist_Mono` ->
`--font-mono` (already loaded). All figures are Geist with `font-variant-numeric: tabular-nums` so tweens do not jitter.

| Role | Face | Size / line / tracking / weight |
|---|---|---|
| `display-xl` (Ask headline) | display | `clamp(2.5rem, 5.2vw, 4.75rem)` / 1.0 / -0.035em / 600 |
| `display` (chapter line, card cost on phone) | display | 2.5rem / 1.05 / -0.03em / 600 |
| `figure` (all-in cost, break-even) | sans | 2rem / 1 / -0.02em / 600, tnum |
| `title` (address, card title) | sans | 1.25rem / 1.3 / -0.01em / 550 |
| `chat` (assistant text) | sans | 1.0625rem / 1.5 / 0 / 400 |
| `body` / `small` | sans | 1rem / 1.55 and 0.875rem / 1.45 |
| `label` (chips, axis, sentence case) | sans | 0.75rem / 1.3 / +0.02em / 500 |
| `source` (data source line) | mono | 0.6875rem / 1.25 |

**Spacing** (4px base): 4, 8, 12, 16, 24, 32, 48, 72, 112. Gutters: 32 desktop, 16 phone. Chat message gap 24;
inside a message 12. **Radius**: `sm` 10 (chips inner, thumbs), `md` 16 (bubbles, inputs), `lg` 24 (cards), `xl` 28
(panel, sheet top, hero composer), `full` (pills, buttons). Full-bleed media has radius 0.

**Controls.** Primary: bone pill, 48 high (56 on Ask), `text` fill, `stage` label, 600. One per screen. Secondary:
glass pill, 44 high. Chip: glass pill 44 high, 16 x-padding. Tap targets >= 44. Focus: 2px `live` ring, 2px offset.

## 3. Motion system

One file, `components/flow/motion.ts` (the old `components/site/motion-tokens.ts` stays for the old pages only).
`motion/react` everywhere; animate only `transform`, `opacity`, `filter`, `clip-path`, SVG `pathLength`.

```ts
export const DUR = { press: 0.1, quick: 0.18, state: 0.3, reveal: 0.5, count: 0.9, draw: 1.2, glide: 1.4 } as const; // s
export const EASE = { out: [0.23, 1, 0.32, 1], inOut: [0.77, 0, 0.175, 1] } as const;
export const SPRING = {
  ui:    { type: "spring", duration: 0.4,  bounce: 0 },    // default for everything
  morph: { type: "spring", duration: 0.7,  bounce: 0 },    // shared-element moves, panel resize
  sheet: { type: "spring", duration: 0.35, bounce: 0.15 }, // bottom sheet after a drag release only
  pop:   { type: "spring", duration: 0.45, bounce: 0.2 },  // a chip or card the user just tapped
} as const;
export const STAGGER = 0.06;  // siblings arriving as a group; cap the total at 0.36
export const STREAM_CPS = 90; // assistant text reveal, characters per second
```

**Shared elements** (`layoutId`, all inside one `<LayoutGroup id="flow">`, transition `SPRING.morph`):

| `layoutId` | From -> to |
|---|---|
| `composer` | Ask hero composer (760x72, centered) -> docked composer (thread bottom) -> panel / sheet composer |
| `chat-surface` | centered 720 thread column -> right glass panel (400, then 560 for outlook) |
| `space-media-{siteId}` | search thumb (96x72) -> pick card photo (357x476) -> full-screen Stage media |
| `space-title-{siteId}` | pick card address -> Stage header chip |

Card-to-scan rule: the thing that morphs is always the **poster image** (CoStar photo or first pano face). The live
viewer (`PanoViewer` or the Matterport iframe) mounts underneath at full size when the morph starts and is revealed by
fading the poster out (`DUR.reveal`) only after the viewer reports ready. Never scale a canvas or an iframe.

**Arrivals.** A new message enters `opacity 0 -> 1, y 12 -> 0, filter blur(6px) -> 0` with `SPRING.ui`; its children
stagger by `STAGGER`. Assistant text streams at `STREAM_CPS` with a 2px `live` caret that fades out when done. Numbers
tween from 0 (or the previous value) over `DUR.count`, `EASE.out`. Chart lines draw via `pathLength` over `DUR.draw`.
Glass surfaces materialize: `scale 0.98 -> 1` with opacity, never opacity alone.

**Exits** mirror the entrance path at 0.6x the duration. Rejected search thumbs stay: a strike line draws
(`DUR.state`), then the thumb settles to 0.45 opacity. **Press:** every pressable scales to 0.97 on pointer-down in
`DUR.press`. **Hover (pick card):** `y -4`, photo `scale 1.03` inside its frame, siblings to 0.72 opacity.
**Loops (the only two):** Ask backdrop cross-fades two photos every 9s over 1.6s, each drifting `scale 1.04 -> 1.10`;
"Working" text shimmers on a 2.2s sweep. Both pause when the tab is hidden.

**Camera.** Tour moves call `viewerRef.goTo(panoId)`; `walkStep` text starts streaming when the glide starts and the
pin callout appears when it ends (`DUR.glide` budget). Input is never locked: a new step or a drag interrupts the
glide, and springs retarget from the current on-screen value.

**Reduced motion** (`useReducedMotion()` plus the CSS media query): every spring and `layoutId` move becomes a 0.2s
cross-fade; no blur, drift, shimmer (static "Working..." label) or stagger; text appears per message, not per
character; numbers render final; the chart renders drawn; tour steps cut instead of glide. Nothing stays hidden.

## 4. Flow layouts (1440x900 and 390x844)

Two permanent layers: **Stage** (fixed, full viewport, z 0) and the **chat surface** (z 10). The route does not
change between steps (`app/page.tsx` holds a `FlowPhase`), so shared elements can morph. Top bar on every step: 64
high, transparent, wordmark "Foreground" (display face, `title` size) at left 32, text link "Details" at right 32
(opens the old pages). Phone: bar 56 high, gutters 16. D = desktop, P = phone, M = what animates.

**Ask.** D: Stage `backdrop`, scrim 0.55. Centered column 760 wide, top at 34vh: `display-xl` headline "What are
you opening, and where?" (2 lines max), 32 gap, hero Composer 760x72, 20 gap, one row of 3 example chips. Nothing
else. P: headline `display` at left 16, top 120; Composer pinned to the bottom (16 inset, above the safe area), 56
high; chips wrap in 2 rows directly above it; no sheet yet. M: headline words rise in (stagger); tapping a chip types
its text into the composer at 40 cps and leaves sending to the user.

**Clarify.** D: headline exits up; Composer morphs (`composer`) to the bottom of a centered thread column 720 wide
(top 96, bottom 32; composer 720x56). Backdrop scrim to 0.78 plus `blur(12px)`. Thread scrolls under a 48px top fade
mask (no divider line). P: thread fills the screen above the pinned composer. M: the prompt lands as the first user
bubble; `clarifyChips` options stagger in; the chosen one pops, the rest fade to 0.4 and lock.

**Search.** D: same column. One `searchProgress` message: status line (shimmer) with a tweening "7 of 12 checked",
a strip of 96x72 thumbs (radius 10, gap 8, 6 per row), then one reason line per rejected space. P: thumbs 72x54, 4
per row. M: each thumb flips in (`rotateY 90 -> 0`, `SPRING.ui`) as it is inspected; rejected ones get the strike.

**Pick.** D: `pickCards` breaks out of the column to 1120 wide: 3 cards, each 357x476 (3:4), gap 24, radius 24.
Card = full-bleed photo with `scrim`; bottom-left stack with 24 padding: rank numeral (`label`), all-in cost range
(`figure`), address (`title`), one-line reason (`small`, 2 lines max), one cost chip (tone wash + words). Composer
stays docked below with 2 suggestion chips. P: cards stack vertically, each 358x224 (16:10), gap 12, reason 1 line;
never a carousel. M: the 3 kept thumbs fly into their card frames (`space-media-*`); cards stagger.

**Walk in.** D: the chosen photo morphs to the full-screen Stage (`space`); the other two cards exit down.
`chat-surface` morphs to a right panel: 400 wide, 16 inset top / right / bottom, `glass-heavy`, radius 28. Stage
header chip at left 32, top 80: back arrow, address, rent. Tour pill bottom-center of the free area (center x 504,
bottom 32): "2 of 5" with prev / next, 48 high, glass. Pin callout: glass label, max 280 wide, anchored to the pin:
tone dot, label, amount. P: Stage full-bleed; chat becomes a bottom sheet (`glass-heavy`, top radius 28, 36x4
grabber) with snaps peek 148 (current step text clamped to 2 lines, next button, composer), half 46%, full 92%;
entering Walk sets peek; header chip at top 64; prev / next live in the peek row. M: each `walkStep` glides the
camera; the callout materializes when the glide ends.

**Imagine** (inside Walk). D: while running, a soft `live` light sweep crosses the Stage (2.2s loop) and the message
names the current stage. Done: the Stage shows the imagined 360 with a glass "Hold to see before" pill top-center of
the free area; the message shows before / after thumbs (2 x 176x132) and the cost delta chip. P: sheet stays at
peek. M: imagined texture cross-fades in over `DUR.reveal`; hold swaps to the scan instantly, release swaps back.

**Outlook.** D: Stage to `spaceDim` (viewer stays mounted; scrim 0.7, blur 16); tour pill and pins fade out. Panel
widens 400 -> 560. The `outlookChart` message: one headline sentence, chart 512x260, a row of 3 stat tiles
(break-even covers per day, fair vs asking rent, 3-year base profit), then up to 3 risk lines and the source line.
P: sheet snaps to full; chart full width x 220; stat tiles become rows. M: axes fade in; slow, base, strong lines
draw in that order 0.15s apart; end labels count up; the break-even marker drops last.

**Offer.** D: `offerCta` is the last message: a summary line and the screen's one bone pill, "Draft my offer". It
opens the existing shadcn `Dialog`, restyled (`stage-2`, 720 wide, radius 28): email draft, "Copy email", "Open deal
memo". P: the dialog is a full-height sheet. M: the dialog materializes from the pill (transform-origin at the pill).

Back: the Stage header chip's arrow returns to Pick by reversing the same morph. Scrolling the thread never moves
the Stage; tapping an earlier `walkStep` glides back to it.

## 5. Components (`components/flow/`)

Files: `stage.tsx`, `chat-thread.tsx`, `composer.tsx`, `messages/<kind>.tsx` (one per message kind), `types.ts`,
`motion.ts`. Reuse, do not rewrite: `PanoViewer` + `PanoViewerHandle`, `useAgentStream`, `useImaginePano`,
`lib/format.ts`, engine types. Every number in a message comes from the engine, never from model text.

```ts
// types.ts
export type FlowPhase = "ask" | "clarify" | "search" | "pick" | "walk" | "outlook" | "offer";
export type Tone = "needed" | "saved" | "maybe" | "info";
export type UsdRange = { low: number; high: number };
type Base = { id: string; at: number };

export type SpacePick = {
  siteId: string; rank: 1 | 2 | 3; photo: string; address: string; city: string; sf: number;
  allInUsd: UsdRange; reason: string; highlight?: { tone: Tone; text: string }; hasScan: boolean;
};

export type Message = Base & (
  | { kind: "user"; text: string }
  | { kind: "assistantText"; text: string; streaming: boolean }
  | { kind: "clarifyChips"; question: string; field: "seats" | "budgetUsd" | "city" | "concept";
      options: { label: string; value: string | number }[]; allowFreeText: boolean; answer?: string | number }
  | { kind: "searchProgress"; status: "running" | "done" | "error"; headline: string; checked: number; total: number;
      candidates: { siteId: string; photo: string; address: string;
        state: "queued" | "inspecting" | "kept" | "rejected"; reason?: string }[] }
  | { kind: "pickCards"; intro: string; picks: SpacePick[]; chosenSiteId?: string }          // 1 to 3 picks, never more
  | { kind: "walkStep"; siteId: string; index: number; total: number; panoId?: string; title: string; text: string;
      streaming: boolean; state: "active" | "visited"; source: string;
      pin?: { tone: Tone; label: string; amountUsd?: UsdRange } }
  | { kind: "imagineResult"; siteId: string; panoId: string; instruction: string;
      status: "running" | "done" | "error"; stage?: string; beforeUrl?: string; afterUrl?: string;
      costDeltaUsd?: UsdRange; tone: Tone; note?: string; error?: string }
  | { kind: "outlookChart"; siteId: string; read: string;
      scenarios: Record<"slow" | "base" | "strong", { profitByYearUsd: [number, number, number] }>;
      breakevenCoversPerDay: number; seats: number; turnsPerDay: number;
      rentAskingPerSfYr: number | null; rentFairPerSfYr: UsdRange | null;
      verdict: "comfortable" | "stretch" | "unlikely"; risks: string[]; sources: string[] }
  | { kind: "offerCta"; siteId: string; summary: string; label: string; memoHref: string;
      state: "idle" | "drafting" | "ready" }
);

export type FlowAction =
  | { type: "send"; text: string } | { type: "stop" } | { type: "back" } | { type: "pick"; siteId: string }
  | { type: "answer"; messageId: string; value: string | number } | { type: "walkGo"; index: number }
  | { type: "holdBefore"; held: boolean } | { type: "draftOffer"; siteId: string };
export type SheetSnap = "peek" | "half" | "full";

export type StageProps = {
  mode: "backdrop" | "space" | "spaceDim";
  backdrop: { src: string; alt: string }[];        // real scan interiors for Ask, 4 to 6
  site?: PanoSite; poster?: string;                // poster carries layoutId `space-media-{site.id}`
  viewerRef?: React.Ref<PanoViewerHandle>; onViewerReady?: () => void;
  focus?: { panoId: string; pin?: { tone: Tone; label: string; amountUsd?: UsdRange } };
  imagined?: ImaginedVersion | null; showBefore?: boolean; working?: boolean;   // working = light sweep
  header?: { address: string; rentLabel: string }; tour?: { index: number; total: number };
  rightInset: number;                              // px covered by the chat panel: 0, 432 or 592; phone 0
  onAction: (a: FlowAction) => void;
};
export type ChatThreadProps = {
  messages: Message[]; phase: FlowPhase; composer: React.ReactNode; onAction: (a: FlowAction) => void;
  layout: "center" | "panel" | "sheet";            // center 720, panel 400 / 560, sheet = phone
  panelWidth?: 400 | 560; sheetSnap?: SheetSnap; onSheetSnap?: (s: SheetSnap) => void;
};
export type ComposerProps = {
  variant: "hero" | "docked";                      // hero 72 high, radius 28; docked 56 high, radius full
  value: string; onChange: (v: string) => void; onSubmit: (text: string) => void; placeholder: string;
  examples?: string[];                             // hero only: chips under the field
  suggestions?: string[];                          // docked only: max 2 chips above the field
  busy?: boolean; onStop?: () => void; disabled?: boolean; autoFocus?: boolean;
};
```

Behavior notes. **Stage** owns every pixel behind the chat and is the only place a viewer mounts; it keeps the
viewer alive across Walk, Imagine and Outlook. **ChatThread** is a `role="log"` list (`aria-live="polite"`) that
auto-scrolls only when the user is at the bottom; `user` is a right-aligned `stage-3` bubble (radius 16), every
assistant kind is unboxed text or media on the surface, with no avatar and no bubble. **Composer** is one
auto-growing textarea (1 to 4 lines) plus a round 40px send button that becomes Stop while `busy`; Enter sends,
Shift+Enter breaks; it always carries `layoutId="composer"`. `outlookChart` is hand-built SVG (three `motion.path`
lines, `saved` / `live` / `text-2` for strong / base / slow, direct end labels, zero line in `line-strong`).

## 6. Library components to use (reference only, nothing installed yet)

- **shadcn `drawer` (Vaul)**: the phone bottom sheet; snap points and velocity-projected release come free.
- **21st.dev "Prompt Input" by syeddhasnainn** (id 36483): base for `Composer` (auto-grow, submit / stop). Drop its
  attachment and model controls.
- **21st.dev "Morphing Dialog" by patrick-xin** (id 25363): reference for the card-to-full-screen `layoutId` morph.
- **21st.dev "Text Shimmer" by serafimcloud** (id 12336, Agent Elements): the "Working" status line.
- Existing shadcn `dialog` and `button` are kept and re-tokened. No chart library: the outlook chart is SVG + `motion`.

## 7. Don'ts

- No grids of listings, tabs, toggles, side rails, KPI tile walls or dashboards in the new flow. One thing at a time.
- No carousel, no timed auto-advance, no scroll-triggered fade-ins, no parallax, no scroll-jacking, no 3D tilt.
- No purple / violet, no gradient text, no glow borders, no neon, no emoji, no sparkle "AI" icon, no avatar for the bot.
- No warm orange / peach accent, and no red, green or amber on anything that is not money.
- No glass on glass, no cards inside cards, no shadow on anything that is not floating over imagery.
- No uppercase tracked eyebrow labels, no captions under photos, no centered body paragraphs longer than 2 lines.
- No number without its source or the word "estimate"; no single-point forecasts; no invented reviews or logos.
- No fixed-duration CSS keyframes for anything the user can touch; no input lock during a transition.
- No more than one bone primary button on screen; no second accent color.
- No spinner: progress is always the story (thumbs, stage names, streaming text).
