---
name: Foreground
description: One conversation on one stage. A warm dark room where the real space glows and the interface is thin glass over it.
colors:
  stage: "oklch(0.16 0.008 60)"
  stage-2: "oklch(0.20 0.010 60)"
  stage-3: "oklch(0.25 0.012 60)"
  line: "oklch(1 0 0 / 0.10)"
  line-strong: "oklch(1 0 0 / 0.18)"
  text: "oklch(0.96 0.012 85)"
  text-2: "oklch(0.78 0.015 80)"
  text-3: "oklch(0.64 0.015 75)"
  live: "oklch(0.82 0.09 235)"
  live-wash: "oklch(0.82 0.09 235 / 0.14)"
  needed: "oklch(0.72 0.17 27)"
  needed-wash: "oklch(0.72 0.17 27 / 0.14)"
  saved: "oklch(0.80 0.15 155)"
  saved-wash: "oklch(0.80 0.15 155 / 0.14)"
  maybe: "oklch(0.83 0.14 80)"
  maybe-wash: "oklch(0.83 0.14 80 / 0.14)"
  glass: "oklch(0.18 0.01 60 / 0.62)"
  glass-heavy: "oklch(0.18 0.01 60 / 0.80)"
  glass-fill: "oklch(1 0 0 / 0.06)"
  focus-ring: "oklch(0.82 0.09 235)"
typography:
  display-xl:
    fontFamily: "Bricolage Grotesque, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 5.2vw, 4.75rem)"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.035em"
  display:
    fontFamily: "Bricolage Grotesque, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  figure:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "'tnum' 1"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 550
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  chat:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.5
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
    fontFeature: "'tnum' 1"
  small:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.02em"
  source:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: 1.25
rounded:
  sm: "10px"
  md: "16px"
  lg: "24px"
  xl: "28px"
  full: "9999px"
spacing:
  gutter: "16px"
  gutter-wide: "32px"
  message-gap: "24px"
  message-inner: "12px"
  thread-width: "720px"
  panel-width: "400px"
  panel-width-wide: "560px"
  picks-width: "1120px"
components:
  button-primary:
    backgroundColor: "{colors.text}"
    textColor: "{colors.stage}"
    typography: "{typography.body}"
    rounded: "{rounded.full}"
    padding: "0 24px"
    height: "48px"
  button-secondary:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.full}"
    padding: "0 16px"
    height: "44px"
  chip:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.text}"
    typography: "{typography.small}"
    rounded: "{rounded.full}"
    padding: "0 16px"
    height: "44px"
  composer-hero:
    backgroundColor: "{colors.glass-heavy}"
    textColor: "{colors.text}"
    typography: "{typography.chat}"
    rounded: "{rounded.xl}"
    padding: "0 12px 0 24px"
    height: "72px"
  composer-docked:
    backgroundColor: "{colors.glass-heavy}"
    textColor: "{colors.text}"
    typography: "{typography.chat}"
    rounded: "{rounded.full}"
    padding: "0 8px 0 20px"
    height: "56px"
  user-bubble:
    backgroundColor: "{colors.stage-3}"
    textColor: "{colors.text}"
    typography: "{typography.chat}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  chat-panel:
    backgroundColor: "{colors.glass-heavy}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: "24px"
  pick-card:
    backgroundColor: "{colors.stage-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "24px"
  cost-chip-needed:
    backgroundColor: "{colors.needed-wash}"
    textColor: "{colors.needed}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  cost-chip-saved:
    backgroundColor: "{colors.saved-wash}"
    textColor: "{colors.saved}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  cost-chip-maybe:
    backgroundColor: "{colors.maybe-wash}"
    textColor: "{colors.maybe}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
---

# Design System: Foreground

Replaces the "surveyor's plat" system (Nov 14 2026). Build contract with layouts, motion and component props:
`docs/design-v2.md`. The old pages (`/search`, `/site/[id]`) keep their old styles until they are retired.

## Overview

**Creative North Star: "After hours"**

The space itself, seen after closing with the lights still on. A warm near-black stage where real photos and the 3D
scan are the only loud thing; every piece of interface is thin warm glass floating over it. One conversation carries
the owner from a single question to an offer, so the screen holds one thing at a time: a question, a story, three
cards, a room, a chart, a button.

**Key characteristics**
- Dark only, warm neutrals (hue 60 to 85), never pure black or pure white.
- Bricolage Grotesque for the few large lines; Geist for everything read; Geist Mono for source lines.
- One bone pill per screen is the next step. One cool blue (`live`) marks what the assistant is doing now.
- Red, green and amber are reserved for money and always carry words.
- Motion is spring-based, interruptible and continuous between steps (shared elements); see Motion.

## Colors

- **Ground:** `stage` behind all media; `stage-2` for opaque raised surfaces (pick cards, dialog); `stage-3` for
  pressed fills and the user bubble.
- **Text:** `text` (bone), `text-2`, `text-3`. All pass AA on `stage` and on `glass-heavy`.
- **Live:** `live` for streaming caret, focus ring, tour progress, the base-case chart line. Never a fill for buttons.
- **Money (kept meaning):** `needed` = cost the owner must pay; `saved` = money saved or reusable; `maybe` = unknown
  until someone answers. Each has a 14% wash for chips.

**Named rules**
- *Money-only hue:* red, green and amber never appear on anything that is not a dollar consequence.
- *Words with color:* every toned figure carries a sign or phrase ("saves ~$40k", "+$18k to $30k", "ask landlord").
- *No warm accent:* orange or peach would sit between `needed` and `maybe`; the brand warmth lives in the neutrals.

## Typography

Loaded with `next/font/google`: `Bricolage_Grotesque` (`--font-display`), `Geist` (`--font-sans`), `Geist_Mono`
(`--font-mono`). Display sizes tighten tracking (-0.03em and beyond); body stays at 0; labels open slightly.
All figures are Geist with tabular numerals so tweens do not jitter. Labels are sentence case, never uppercase.
Every figure has a `source` line or the word "estimate".

## Layout

Two layers: a fixed full-viewport **Stage** and a **chat surface** that is a centered 720 column (Ask to Pick), a
400 / 560 right glass panel (Walk, Outlook) or a bottom sheet on phone. Gutters 32 desktop, 16 phone. The three pick
cards are the only element allowed wider than the thread (1120). No grids, tabs or side rails.

## Elevation & Depth

Depth is material, not shadow. `glass` = 62% warm dark + `blur(24px) saturate(140%)` + 1px `line` + a 1px inner top
highlight. `glass-heavy` (panel, sheet, hero composer) = 80% + `blur(40px)` + `0 24px 60px -20px oklch(0 0 0 / 0.6)`.
Pick cards get `0 12px 32px -16px oklch(0 0 0 / 0.5)`. Text over photos sits on a bottom scrim
(`oklch(0.12 0.01 60 / 0.88)` to transparent at 60%).

**Named rules**
- *Never glass on glass:* children of a glass surface use `glass-fill`.
- *Materialize:* glass arrives with scale 0.98 to 1 plus opacity, never opacity alone.
- *Reduced transparency:* glass becomes `stage-2` with no blur.

## Shapes

Radius 10 (thumbs), 16 (bubbles, inputs), 24 (cards), 28 (panel, sheet top, hero composer), full (pills, buttons,
chips). Full-bleed media has no radius.

## Components

- **Primary button:** bone pill, 48 high (56 on Ask), one per screen. Pressed: scale 0.97 on pointer-down.
- **Secondary button / chip:** glass pill, 44 high.
- **Composer:** hero (72 high, radius 28) on Ask; docked (56 high, pill) afterwards; same element, morphs.
- **Messages:** user = right-aligned `stage-3` bubble; assistant = unboxed text and media, no avatar.
- **Pick card:** 3:4 photo card with scrim, rank, all-in cost range, address, one reason, one cost chip.
- **Cost chip:** tone wash + tone text + words.
- **Stage header chip, tour pill, pin callout:** glass, over the scan only.

## Motion

Tokens in `components/flow/motion.ts`. Springs with `bounce: 0` by default (`ui` 0.4s, `morph` 0.7s); bounce only
after a drag release (`sheet`) or a tap the user just made (`pop`). Shared elements: `composer`, `chat-surface`,
`space-media-{siteId}`, `space-title-{siteId}`. Text streams; numbers tween (0.9s); chart lines draw (1.2s); groups
stagger 0.06s (cap 0.36s). Only two loops: the Ask backdrop drift and the "Working" shimmer. Input is never locked
during a transition. Reduced motion: everything becomes a 0.2s cross-fade and final values; nothing stays hidden.

## Do's and Don'ts

### Do:
- Keep one thing on screen at a time and offer the next step in the chat.
- Let the space be the picture; keep interface small, glass and at the edges.
- Give every number a source or "estimate", and every range both ends.

### Don't:
- No dashboards, listing grids, tabs, toggles, KPI tile walls, carousels or spinners.
- No purple, gradient text, glow borders, neon, emoji, sparkle icons, bot avatars or uppercase eyebrows.
- No red, green or amber on anything that is not money; no second accent.
- No glass on glass, cards in cards, scroll-triggered fade-ins, parallax, tilt or scroll-jacking.
