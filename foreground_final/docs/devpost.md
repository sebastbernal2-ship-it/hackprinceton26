# Devpost draft: Foreground

**Tagline:** Stand inside a real space, imagine it as your restaurant, and know what it costs before you sign.

**Tracks:** Business & Enterprise (main) · CoStar "Inside and Out" · LangChain deepagents · Amazon Practical AI ·
Peri Forward Deployed (needs the team's interview: business name, person and role, evidence).

## Inspiration
Independent restaurant owners sign leases on spaces that look cheap. Then they find $30k–$120k of hidden work (hood,
grease interceptor, electrical, gas) and pay months of rent before opening. Site-selection tools look at the outside
of a building and are priced for chains. Nobody combines the inside of the building, the view from above and the
market for one address. CoStar now owns all three.

## What it does
- Type what you're opening. An agent plans, inspects spaces in parallel, and drops or re-ranks them with reasons.
  Example: "dropped 2600 Travis St: break-even needs 3.8 turns a day, and 2 food tenants left this suite within 2
  years; Mezcal Houston closed in Oct 2026".
- Open any space as a workspace:
  - Walk the real Matterport scan, and switch between scanned and furniture-removed.
  - See the hood and kitchen line found by AI vision, with what they save you.
  - Arrange your floor plan as 3D furniture.
- Imagine any change, such as opening a wall, a bar along the windows, or new finishes. You get feasibility checks
  with code citations and permit times, cost and break-even changes, and a 360° imagined room you can look around
  and walk through.
- See break-even, a 3-year outlook, fair rent vs asking from our own model, the address's tenant history, and the
  aerial view.
- Get a landlord ask list, a broker email and a deal memo.

## How we built it
- **Next.js 16 / React 19 / Tailwind 4**, with motion for animation.
- **LangChain deepagents:** a Claude Sonnet 5.5 planner with Haiku 5.5 site-inspector subagents, streamed over SSE,
  with replays.
- **Matterport:**
  - The Model API (rooms, panos, Defurnish views).
  - The Web Component / Bundle SDK: Scene API for GLB furniture, View API for Empty, Tags for cost pins,
    screenshots.
  - Our own three.js 360° viewer for imagined rooms.
- **Vexcel API 2.0:** ortho, oblique, footprint and vehicle counts, plus the detect endpoint for parking.
- **CoStar kit:** listings, tenancies, companies and sales for 12 restaurant-ready spaces.
- **Gemini image editing** on Matterport cube faces. Each neighbouring face uses the edited face as a reference to
  keep seams continuous.
- **Our own ML on CoStar data:**
  - A fair-rent model: median error 20% vs 26% for the submarket median.
  - A restaurant survival model: AUC 0.64, disclosed as a weak signal.
- **A tested money engine:** hidden-cost X-Ray, break-even and scenarios, all with sources.

## Challenges
- Making break-even, the 3-year curves and the agent's statements agree. We added invariant tests across all sites
  and concepts.
- Telling a tenant who closed apart from one who moved. We never say "failed" unless CoStar records a closure.
- Mapping Matterport cube faces and model space to three.js. Getting AI edits to stay consistent across cube faces.

## What we learned
CoStar's three layers together answer a question none answers alone: what will this exact space cost to become my
business, and will it carry its rent?

## What's next
Bring-your-own Matterport scan for brokers, a licensed cost database, more city permit packs, and a contractor-bid
loop to calibrate costs.
