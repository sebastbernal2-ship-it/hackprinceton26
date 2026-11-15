# Foreground redesign plan (Nov 14, 2026)

## What is wrong today
- Landing is a form plus a schematic map plus a 12-row listings grid: reads like a real-estate index, not a product.
- Search is a dashboard (inspector lanes, plan checklist, decision log): engineering view, not an owner's.
- The site page is a dense tool with tabs, toggles and a long side sheet: too much at once, no story.
- Three separate screens with three different looks; nothing carries you from one to the next.
- Hydration warning from a browser extension (fixed) and a crashed dev server that served a 500 (restarted).

## The new flow: one conversation, one stage
1. **Ask.** Full-screen dark stage, one prompt: "What are you opening, and where?" Slow cinematic backdrop
   of real scanned interiors. No listings. Example chips type themselves in.
2. **Clarify.** The prompt morphs into a chat thread. If seats or budget are missing, Foreground asks once,
   with tappable answers.
3. **Search, told as a story.** One live message: space photos flip in as each is inspected, weak ones get
   struck through with the reason. Ends with "Here are the 3 I'd look at": three big cinematic cards
   (photo, all-in cost, one-line reason). Never a grid.
4. **Walk in.** The chosen card expands into the full-screen 3D scan (shared-element transition). The chat
   moves to a side panel and narrates a guided tour: the camera glides to each spot ("This hood is reusable,
   saves about $40k"). Type "knock out this wall" in the same chat and the room is reimagined in 360°.
5. **The business.** Last chapter in the chat: animated 3-year outlook (slow / base / strong), break-even
   covers per day, fair rent vs asking, risks. Then "Draft my offer" opens the broker email and memo.

## Visual direction
- Dark, cinematic, image-first: the space is the hero, UI is glass over it.
- One display face at large sizes, tight tracking; one warm accent; red/green only for cost meaning.
- Motion: shared-element morphs between steps, streaming text, number tweens, staggered reveals,
  camera glides. All honor reduced-motion.
- Phone: chat is a bottom sheet over the stage.

## What stays
The engine, agent, Matterport walk, imagine APIs, our two models, tests. This is a front-end rebuild
on top of them. Old pages stay reachable as "details" for judges who want the depth.

## Order of work
1. New shell: stage + chat, landing prompt, morph into thread (shared components, tokens, motion).
2. Search as a chat message, top-3 cards.
3. Card-to-scan transition, guided narrated walk, imagine from chat.
4. Business outlook chapter, offer handoff.
5. Phone layout, reduced motion, browser check, tests, lint, build, push.
