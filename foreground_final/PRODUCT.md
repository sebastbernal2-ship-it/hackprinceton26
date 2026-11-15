# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Independent restaurant and cafe owners choosing a first or second location in Houston or Los Angeles. Typical budget
$50k to $250k for build-out, no data team, often deciding with a broker's listing and a landlord's word. They are not
analysts: they are busy, a little anxious about the lease, and want to be walked through it, not handed a tool. Their
job: avoid signing a lease on a space that hides $30k to $120k of build-out work or cannot carry its rent. Brokers and
lenders receive the deal memo but are not primary users.

Hackathon judges (CoStar, Peri, LangChain, Amazon, HackPrinceton Business and Enterprise) evaluate it in a 2-minute
live demo. Submission deadline: 8 AM, Nov 15 2026.

## Product Purpose

You say what you are opening and where. Foreground finds commercial spaces, walks you through the real 3D scan of the
best one, shows what changing it would look like and cost, and shows the next three years of the business there,
before you sign. Success: the owner leaves with three spaces worth seeing, the hidden costs of the chosen one, a
realistic break-even, and a drafted offer for the broker.

## Positioning

Every site-selection tool looks at the outside of a building and is priced for chains. Foreground sees inside the
building (Matterport scans, including defurnished views), from above (Vexcel aerial imagery) and into the market
(CoStar listings, tenant history and sales), for the same address.

## Operating Context

One conversation on one stage (approved flow: `docs/redesign-plan.md`):

1. Ask: one prompt, "What are you opening, and where?"
2. Clarify: Foreground asks once for missing seats or budget, with tappable answers.
3. Search: told as a story in a single live message; ends with exactly three recommended spaces.
4. Walk in: the chosen space opens as the full-screen Matterport scan; the chat narrates a guided tour and takes
   "imagine" requests ("knock out this wall") in the same thread.
5. Business outlook: 3-year slow/base/strong chart, break-even covers per day, fair rent vs asking, risks.
6. Offer: broker email draft and printable deal memo.

- The owner never fills a form, picks a tab or reads a dashboard; the next step is always offered in the chat.
- Phone is a first-class surface (owners are on their feet); the chat is a bottom sheet over the stage.
- Demo runs on a laptop at the venue; replay mode keeps it working without Wi-Fi.
- Data: CoStar hackathon kit (local files, 12 hand-picked sites, 6 Houston and 6 LA), Matterport Model API and
  Showcase SDK, Vexcel API 2.0.
- The earlier dense pages (`/search`, `/site/[id]`) stay reachable as "details" for judges who want depth.

## Capabilities and Constraints

- Hidden-Cost X-Ray: hood, kitchen line, restrooms, grease trap and prior-use findings with low/high dollar ranges.
- Break-even from rent: sales needed, covers per day, table turns for the seats the layout fits.
- Three-year slow/base/strong scenarios from cited restaurant benchmarks; never presented as a promise.
- Address history: past restaurants at the address and how long they lasted.
- Outputs: landlord ask list, broker email draft, printable deal memo.
- Scope: food businesses only; Houston and Los Angeles only; no accounts or payments.

## Brand Commitments

Name: Foreground. Voice: plain, direct, owner-friendly; numbers before adjectives; first person singular for the
assistant ("Here are the 3 I'd look at").

Binding from the user (Nov 14 2026): the product must feel easy and relaxed, like the best modern AI startup product
demo, fully animated, never a dense tool. The earlier "surveyor's plat" look is discarded. Kept from it: the cost
color meaning only (red = cost the owner must pay, green = money saved, amber = maybe / unknown).

## Evidence on Hand

- Research and benchmark sources: the team plan doc (claude.ai artifact) and `SPEC.md`.
- Demo sites: `docs/spikes/top12.json`. Hero site 1018657 (2600 Travis St, Houston): two restaurants failed in the
  same suite. LA site 20219730 (630 W 6th St): existing Type 1 hood and grease interceptor.
- No testimonials or customers exist; do not invent any. A Peri interview quote may be added later.

## Product Principles

1. One thing at a time: one question, one message, one next step. Depth is offered, never imposed.
2. The space is the hero; the interface stays out of its way.
3. Show the cost before the charm: every recommended space carries its all-in cost and one plain reason.
4. Every number has a source or an "estimate" label. Ranges, not promises.
5. The agent's reasoning is visible as a story, including the spaces it rejected and why.
6. Works on stage: fast, cached, no dead air.

## Accessibility & Inclusion

Reduced motion is honored everywhere (the flow must be fully usable with no movement). Cost meaning is never carried
by color alone: every red/green/amber figure has a word or sign next to it. Text over imagery meets WCAG AA.

## Record Notes

Refreshed Nov 14 2026 by a design subagent with no user channel. Users, flow, vibe and color commitments come from the
user's brief and `docs/redesign-plan.md` (approved); nothing here was inferred beyond those two sources.
