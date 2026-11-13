# Project docs

## Initial concept: commercial-site decision support

**Working premise:** help an operator decide whether a commercial property is a good fit *before* spending time and money on a site visit or signing a lease. The product brings together property evidence, neighborhood context, a guided virtual inspection, and a realistic estimate of the work required to open.

### The story: Tony's second restaurant

Tony Stelloni built his first Italian restaurant the hard way. Now he wants a second location, but remembers the surprises: property defects that were hard to see, compliance and permitting issues, a slow start to business, and not understanding how the neighborhood was changing. He wants to learn from the first restaurant instead of repeating those costly unknowns.

The product helps Tony compare available commercial spaces against his actual concept and operating needs. It surfaces what is known, what is uncertain, and what still needs an expert to verify—rather than presenting a score as a guarantee.

### Product vision

A property decision workspace with four connected capabilities:

1. **Find and compare locations.** Build a catalog of commercial listings and evaluate each against configurable requirements: restaurant use, size, rent, access, visibility, signage, utilities, and other operator priorities.
2. **Understand the area.** Bring relevant sources into one evidence-backed view: public records and permits, crime data, traffic and mobility, tourism and footfall, demographics and income, schools, climate and hazards, and neighborhood change over time. Show source, date, geographic scope, and confidence for each finding. Distinguish measured facts from estimates and projections.
3. **Inspect remotely.** Let a user explore available listing media or a 3D/360° walkthrough. An AI guide can answer questions grounded in property documents and tour evidence, flag visible items for follow-up, and help create an inspection checklist. It must not claim that a visual tour proves hidden conditions such as mold, structural safety, or code compliance.
4. **Plan the build-out.** Use the first restaurant's layout, equipment list, dimensions, and costs as a starting template. Fit the desired kitchen and operating layout to a candidate space, identify fit and utility constraints, list likely repairs and equipment, and estimate post-lease or post-purchase investment with transparent assumptions and cost ranges.

### Core user journey

1. Tony describes the restaurant he wants to open and the constraints he cares about.
2. The system finds candidate properties and explains their fit, trade-offs, and evidence gaps.
3. Tony compares neighborhood conditions and trends with the first restaurant's history and his target customer.
4. He reviews the virtual tour, asks questions, and records items requiring an in-person or professional inspection.
5. He adapts his existing kitchen plan to the new dimensions and reviews equipment, repairs, permits, and estimated opening costs.
6. Before committing, he gets a diligence packet showing sources, uncertainties, and next steps for brokers, inspectors, contractors, and local authorities.

### Scoring and trust principles

A single opaque risk score is not enough for a high-stakes property decision. Prefer an explainable risk profile with separate dimensions—concept fit, location demand, access/visibility, operating costs, physical condition, and regulatory readiness—and explain how each was derived. Let Tony set priorities and see how changing them changes the ranking. Missing or stale data should lower confidence, not silently count as favorable evidence.

The product is decision support, not a substitute for a licensed inspection, legal advice, zoning determination, or revenue guarantee. Avoid asserting that an agent concealed a defect without verified evidence. Label potential issues as leads to investigate, keep an audit trail of sources and dates, and protect sensitive business and property information.

### Hackathon focus: restaurant site-to-opening planning

For the initial prototype, focus on independent food businesses—restaurants, cafes, and fast casual—and a small inventory of commercial properties with usable Matterport scans in Houston and Los Angeles. The primary user is an owner without a chain's data team, considering a first or next location. The experience starts with “What are you looking for?” and gathers concept, city, budget, seats or capacity, and must-haves. Do not ask users to predict target revenue. Research location context as sourced evidence rather than asking the owner to supply a revenue forecast.

The core promise is: **understand what it would take for this specific space to become this owner's restaurant before committing.** The product should show a shortlist, then help the owner inspect a candidate's interior and exterior context, visualize a business-specific layout, estimate build-out and delay-related costs, and decide what to verify or negotiate.

For a selected site, present available CoStar property context, Matterport interior, and Vexcel aerial context. Show an interactive before/after view and floor plan where data permits. The central spatial demo projects a restaurant's kitchen/equipment arrangement into candidate-space dimensions, showing fit, circulation conflicts, and possible furniture/layout changes. This is a conceptual planning visualization, not a construction drawing, proof of hidden conditions, or code approval. Prefer existing sponsor scans; new phone scanning is secondary. Unscanned locations are a coverage limitation, not an implied comprehensive inventory.

### Hidden-cost investigation and financial decision support

Treat “Hidden-Cost X-Ray” as a guided, evidence-backed investigation—not a claim that the system can see hidden defects. Combine prior-use/property records with visible scan evidence to surface potential build-out items such as existing kitchen infrastructure, restroom count, or apparent equipment. Each finding should be pinned to its evidence and labeled as observed, inferred, estimated, or unknown. For example, “No hood visible in this scan—confirm with landlord/inspector” is appropriate; “No hood exists” is not. Use sourced, localized low/high cost ranges and show contingency and unresolved items separately.

The financial view should distinguish recurring occupancy cost from one-time build-out and delay-related costs. Estimate dead rent/time-to-open only from explicit assumptions and ranges (lease start, likely scope, permit/construction duration); do not imply a permit outcome. A benchmark comparison such as occupancy cost as a share of sales is a benchmark check, not break-even analysis. Any operating scenario must state its assumptions for sales, food, labor, other costs, days open, and average check. Avoid revenue promises and unverified generic restaurant benchmarks.

Turn findings into owner actions: a prioritized verification checklist, questions for the landlord, potential negotiation asks (such as tenant-improvement allowance or rent abatement), and—if useful—a broker email or concise lender/partner memo. These are drafts for owner review, not legal or financial advice.

### Validated evidence, coverage, and claims

Prefer actual sponsor data and verified source documentation. Confirm what CoStar fields are available; whether Matterport access includes room names, dimensions, floor-plan vectors, or defurnishing; Vexcel imagery resolution and permitted analysis; and the number/type of usable scanned sites. Do not assume “Vexel” vector embeddings, topology outputs, tenant history, or particular API capabilities based on informal recollection. Public-data supplements (permits, jobs, income, crime, etc.) should be included only when relevant, available, and traceable. Clearly state the Houston/Los Angeles and scanned-property coverage limits.

### Refined direction: from site selection to a business decision engine

The cost plan is not the headline by itself: it is the real-time feedback loop that makes spatial and market analysis economically legible. The larger opportunity is to help a business decide **where and how to operate**, using connected evidence about the building, its surroundings, and the business model. The product should quantify consequences—cost, capacity, access, operational fit, and uncertainty—rather than merely describe a property.

This framing fits both the Business & Enterprise track (streamlining business planning and financial decisions) and the CoStar “Inside and Out” challenge. The sponsor challenge explicitly rewards combining at least two of CoStar, Matterport, and Vexcel; agentic reasoning and action; spatial/visual understanding; and a non-obvious use of the combined data. The strongest differentiation is therefore not “AI chat over listings” or “another 3D tour,” but an agent that turns linked market, building, and aerial evidence into a testable operating plan and quantified decision.

#### Build independently first; unify deliberately

The vision is deeply cross-layer, but implementation should not begin by blending every source into one opaque system. Establish separate, inspectable data and capability tracks first, each with clear inputs, outputs, provenance, and limitations. Then connect them through shared property identity, spatial references, and explicit interfaces. This makes each layer testable on its own and lets cross-layer behavior be added incrementally without hiding where an insight came from.

Suggested capability tracks:

- **Market/property intelligence (CoStar):** property identity, availability, leases/sales and market context, subject to actual dataset coverage and access terms.
- **Interior/spatial intelligence (Matterport):** tour and scan-derived geometry, room dimensions/classifications, and spatial observations, with source/measurement confidence made explicit.
- **Aerial/site intelligence (Vexcel):** aerial imagery and derived site context such as visible access, parking, and surrounding physical change, distinguishing observation from inference.
- **Business model and operator profile:** concept requirements, prior location information, equipment, workflows, target capacity, and user priorities.
- **Planning and decision layer:** consume the above through explicit interfaces to compare scenarios, produce visual plans, estimate costs, rank trade-offs, and generate diligence actions.

Each capability should first provide a useful standalone result. The architecture should preserve original evidence and provenance, use a shared address/property key without assuming all datasets align perfectly, and represent missing or conflicting data instead of silently merging it. Cross-layer features can then be built as explicit compositions of these independently validated capabilities.

#### Potential signature experience: business-specific spatial projection and site-to-operations simulation

For Tony, the distinctive spatial idea is to take the kitchen setup from his first restaurant—equipment, dimensions, and operating arrangement—and project or reconstruct it inside a new candidate space using the new space's scan-derived dimensions. A visual “holographic”/3D overlay could show what fits, what does not, and where equipment or circulation conflicts arise. Treat this as a planning visualization, not a construction-ready architectural model; scan accuracy, utilities, code, and hidden conditions require verification.

The broader site-to-operations simulation can then:

1. Analyze each source independently first: market/property context, interior geometry, aerial/site context, and Tony's business requirements.
2. Align relevant outputs for a candidate property, recording identity matches, coordinate/measurement assumptions, source, date, and confidence.
3. Project the business-specific layout into the interior and identify fit constraints, equipment/furniture needs, and questions for an on-site professional.
4. Compare alternative site and operating configurations using a Pareto-style view: expose trade-offs among recurring occupancy cost, one-time build-out investment, capacity, access/visibility, and operational fit. Avoid hiding these dimensions in one arbitrary “best” answer; show options that are not dominated across the user's chosen objectives.
5. Provide real-time cost-and-impact feedback as Tony changes the layout or assumptions, with itemized ranges and a clear distinction between sourced prices, estimates, and unknowns. Calculate cost from structured plan outputs—such as area, equipment/furniture, bathrooms, and selected changes—rather than expecting an LLM to invent prices.
6. Take useful next actions: prepare a diligence/site-visit checklist, request missing information, and produce a shareable decision memo for the owner, broker, lender, contractor, or business partner.

The “we didn't know the data could do that” moment should come from a validated cross-layer inference or action that is difficult with any one source alone. Candidate hypotheses—not promises of data availability or accuracy—include relating aerially observed access/parking to a proposed operating layout, or connecting market context with scan-informed capacity and build-out scenarios. Keep the analysis explainable: show which layer supports each finding and flag stale, incomplete, conflicting, or unverified evidence.

#### Business and enterprise depth

Treat the property as an input to a business plan, not the whole customer problem. Help an operator reason about capital at risk before commitment: distinguish recurring occupancy costs from one-time build-out and dead rent, itemize assumptions behind estimates, surface high-impact unknowns, and compare scenarios (for example, a lower-rent space with expensive renovation versus a more expensive space that is closer to ready). Where useful, turn the chosen scenario into structured tasks and a diligence packet that can be handed to relevant professionals.

The first version should prioritize a grounded site decision over a speculative three-year revenue forecast. A transparent occupancy benchmark can help contextualize rent, but rent divided by a presumed occupancy percentage is not a break-even calculation. A genuine operating model needs explicit sales assumptions and operating costs (food, labor, other expenses, open days, average check, capacity/turns) and must be labeled as scenario analysis, not prediction. Use benchmarks only when sources, definitions, and applicability have been checked.

For the Peri Forward Deployed track, interview a real local food-business owner and use their actual workflow and concerns to shape the prototype. Capture the required evidence (business, contact name/role, and a quote, screenshot, photo, or short video with permission). Treat the interview as product discovery, not just pitch material.

A later extension could connect operators who have opened similar businesses and let them share opted-in, appropriately aggregated lessons about timelines, build-out costs, and operational choices. Such benchmarks need context and provenance; one business's result should not be presented as a prediction for another.

#### Differentiation hypotheses to validate

- **Cross-layer reasoning:** Does linking aerial, interior, and market data reveal useful constraints or opportunities that each source alone misses?
- **Operational simulation:** Can a user change a layout or business requirement and immediately understand the spatial and financial consequences?
- **Agentic diligence:** Can the agent identify missing evidence, plan the next investigation, and prepare actionable work products instead of stopping at a report?
- **Business-specific learning:** Can an operator's own prior location, costs, and operating requirements meaningfully personalize a new-site analysis without overclaiming predictive power?

These are candidate differentiators, not a commitment to build every capability. Validate them against actual Houston/Los Angeles dataset coverage, sponsor API/SDK terms and formats, implementation time, and feedback from a real business owner. A strong hackathon prototype should demonstrate one convincing end-to-end slice, use at least two sponsor data layers substantively, and quantify a decision consequence.

### Initial MVP direction

Keep the first version focused on one food-business persona and a small inventory of scanned properties. A credible end-to-end prototype could support:

- A simple “What are you looking for?” intake and ranked shortlist, with concept, city, budget, capacity, and must-haves—but no target-revenue prompt.
- A selected-site view that combines at least two sponsor data layers substantively, while displaying source-specific evidence separately.
- An interior tour with a few evidence-backed, confidence-labeled risk/fit pins; a potential missing feature is a verification lead, not a confirmed defect.
- A business-specific kitchen/equipment layout projection into the scanned space, plus a before/after view or floor plan.
- Transparent, itemized build-out cost ranges from explicit plan quantities, assumptions, and prices, including a separate contingency and unknowns.
- A concise “what to verify / what to ask the landlord” action list.
- At least one visible re-plan triggered by a finding—for example, a candidate becoming less attractive when a required upgrade pushes the estimated project beyond the owner's stated budget.

Treat dead rent, neighborhood trajectory, restaurant survival history, patio eligibility, and multi-year profit scenarios as stretch features until their inputs and assumptions are validated. Do not claim that an estimated break-even or revenue scenario predicts success. Use a genuine operating model only if the team can show its assumptions and credible source data.

For the demo, prepare property research and analysis ahead of time where possible. The judged flow should be fast and reliable; only a bounded final plan adjustment needs to run live. Parallel data gathering may be useful, but source-specific tools/agents should produce inspectable outputs for a planner to compose. Cache results, use timeouts, show partial progress, and provide a prepared fallback. Optimize for a convincing end-to-end demonstration, not maximum agent count or exhaustive coverage.

### Validation questions and success criteria

Before implementation, confirm sponsor API/SDK capabilities, dataset coverage, data-use terms, sample schemas, and property matching across sources. In particular, ask whether Matterport access exposes room measurements/vectors and defurnishing; which CoStar fields cover availability, rent, and prior tenants; and what Vexcel imagery resolution/rate limits support. Select a small set of viable scanned food-business sites and document gaps.

Validate the workflow with a real local restaurant or cafe owner. Learn what they actually check before committing, which decisions are costly or routinely missed, and whether a layout projection, cost range, dead-rent estimate, or landlord ask list would change their behavior. Capture the Peri track's required consultation evidence with permission.

Prototype success should be measured by a reliable short demo: a user can state a food-business concept and constraints, get an explainable shortlist, inspect one candidate using multiple sponsor data layers, see a plausible business-specific spatial plan and sourced cost range, and receive a useful verification or negotiation action. Show at least one finding changing the plan or ranking. Be explicit about accuracy limits and coverage.

### Open questions

- Which exact sponsor data capabilities and sites are accessible under the hackathon keys and terms?
- What is the smallest useful set of food-business requirements and plan outputs for a live demo?
- Can the team validate scan-derived dimensions against published plans or physical measurements?
- Which cost lines can be sourced credibly and localized, and which must remain unknown or user-supplied?
- Can timeline/dead-rent estimates be grounded in trustworthy local data, or should they remain out of scope?
- What does a local operator identify as the most valuable pre-lease action or avoided surprise?
- Which findings require review by an inspector, architect, contractor, attorney, or permitting authority?

This is a working product brief. Scope, data capabilities, estimates, and differentiation hypotheses must be validated against sponsor access and real operator feedback.