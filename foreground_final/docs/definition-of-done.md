# Foreground: definition of done

A real product a restaurant owner (and CoStar's judges) can use end to end, on any of the 12 sites, without help.

## The loop

1. **Ask** (`/`): type what you're opening; the city map shows which spaces fit.
2. **Search** (`/search`): the agent plans, inspects sites in parallel, drops and re-ranks with reasons; live or replay.
3. **Workspace** (`/site/[id]`): one full-screen workspace with Walk · Plan · Above · Numbers and the plat sheet.
   - **Walk:** the real Matterport 3D scan; Scanned / Empty toggle; cost pins; guided "walk me through it".
   - **Imagine:** type any change (layout, walls, ceiling, finishes, storefront, equipment, use). You get the change
     list, feasibility checks (10 rules, code cites, city permit path), cost and break-even delta, and an
     **immersive 360° imagined room** you can look around in and step through with smooth motion. Each change is a
     version you can branch, compare and undo.
   - **Plan:** layout studio (drag or type); furniture also appears as real 3D objects in Walk.
   - **Above:** Vexcel aerial and oblique with overlays.
   - **Numbers:** X-Ray vs budget, break-even, 3-year outlook, address history, block trend, survival context.
4. **Offer:** landlord ask list, broker email (live Claude), printable deal memo; share link opens the same view.

## Quality bar

- Smooth: 60 fps on a laptop; motion explains state; reduced-motion path; no console errors.
- Usable by anyone: plain language, keyboard-complete, WCAG 2.2 targets, works at 390 px.
- Honest: every number has a source or an "estimate" mark; AI images say "AI visualization, not a construction
  drawing"; walls never shown as freely removable without an engineer flag; weak model shown as context.
- Engineering: `npm test`, `npm run typecheck`, `npm run build` green; no secrets in git; README with setup.

## Tracks

| Track | What proves it |
|---|---|
| CoStar "Inside and Out" | All three layers (CoStar kit, Matterport, Vexcel) combined per address; agentic planner; spatial + visual |
| Business & Enterprise | Hidden-cost X-Ray, lease asks, deal memo for small businesses |
| LangChain deepagents | Planner + parallel site-inspector subagents, streamed |
| Amazon Practical AI | Reasons, plans, acts (ask list, email, memo), adapts to the brief |
| Peri Forward Deployed | Needs the team's interview with a real business (name, role, evidence) |
