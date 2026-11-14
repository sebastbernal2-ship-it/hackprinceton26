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

### Refined direction: from site selection to a business decision engine

The cost plan is not the headline by itself: it is the real-time feedback loop that makes spatial and market analysis economically legible. The larger opportunity is to help a business decide **where and how to operate**, using connected evidence about the building, its surroundings, and the business model. The product should quantify consequences—cost, capacity, access, operational fit, and uncertainty—rather than merely describe a property.

This framing fits both the Business & Enterprise track (streamlining business planning and financial decisions) and the CoStar “Inside and Out” challenge. The sponsor challenge explicitly rewards combining at least two of CoStar, Matterport, and Vexcel; agentic reasoning and action; spatial/visual understanding; and a non-obvious use of the combined data. The strongest differentiation is therefore not “AI chat over listings” or “another 3D tour,” but an agent that turns linked market, building, and aerial evidence into a testable operating plan and quantified decision.

#### Potential signature experience: a site-to-operations simulation

Given an operator's concept and a candidate address, the agent could:

1. Link CoStar property/availability context, Matterport interior spatial data, and Vexcel aerial context for that address (where coverage and permitted API access allow).
2. Inspect complementary signals: for example, compare the interior's usable layout with aerially observed parking/access, then relate those constraints to the operator's required capacity, customer arrival pattern, or delivery workflow.
3. Generate one or more feasible operating configurations—not just a ranked listing—including a proposed space plan, equipment/furniture needs, likely repairs, operational constraints, and questions requiring verification.
4. Recalculate the business consequences as the user changes assumptions: estimated build-out investment, usable capacity, visibility/access trade-offs, and key unknowns. Show source evidence and confidence for every consequential claim.
5. Take useful next actions: prepare a diligence or site-visit checklist, request missing information, and produce a shareable decision memo for the owner, broker, lender, contractor, or business partner.

The “surprise” should come from a cross-layer inference or action that would be difficult from any one dataset alone. Illustrative hypotheses to test—not promises of available data or accuracy—include identifying a mismatch between apparent aerial access/parking and interior circulation; testing whether a target operating layout fits the scanned geometry; or showing how alternative layouts change capacity and estimated opening cost. The product must make clear when a signal is inferred, stale, incomplete, or needs on-site verification.

#### Business and enterprise depth

Treat the property as an input to a business plan, not the whole customer problem. Help an operator reason about capital at risk before commitment: distinguish recurring occupancy costs from one-time build-out, itemize assumptions behind estimates, surface high-impact unknowns, and compare scenarios (for example, a lower-rent space with expensive renovation versus a more expensive space that is closer to ready). Where useful, turn the chosen scenario into structured tasks and a diligence packet that can be handed to relevant professionals.

A later extension could connect operators who have opened similar businesses and let them share opted-in, appropriately aggregated lessons about timelines, build-out costs, and operational choices. Such benchmarks need context and provenance; one business's result should not be presented as a prediction for another.

#### Differentiation hypotheses to validate

- **Cross-layer reasoning:** Does linking aerial, interior, and market data reveal useful constraints or opportunities that each source alone misses?
- **Operational simulation:** Can a user change a layout or business requirement and immediately understand the spatial and financial consequences?
- **Agentic diligence:** Can the agent identify missing evidence, plan the next investigation, and prepare actionable work products instead of stopping at a report?
- **Business-specific learning:** Can an operator's own prior location, costs, and operating requirements meaningfully personalize a new-site analysis without overclaiming predictive power?

These are candidate differentiators, not a commitment to build every capability. Validate them against actual Houston/Los Angeles dataset coverage, sponsor API/SDK terms and formats, implementation time, and feedback from a real business owner. A strong hackathon prototype should demonstrate one convincing end-to-end slice, use at least two sponsor data layers substantively, and quantify a decision consequence.

### Initial MVP direction

Keep the first version focused on one operator persona and one market. A useful prototype could support:

- A small set of candidate properties with structured facts and linked sources.
- A restaurant-specific requirements profile and explainable comparison view.
- A neighborhood context brief with dated, sourced indicators.
- A tour question/observation log (the 3D character is an optional interface, not a prerequisite).
- A basic kitchen/equipment fit plan and itemized, assumption-based build-out estimate.
- A diligence checklist that clearly separates verified facts, estimates, and items needing professional review.

### Open questions

- Should the product present a single risk score, a multi-dimensional risk profile, or both? What evidence and calibration would make either trustworthy?
- Which city and data sources are in scope, and what can be licensed or accessed reliably?
- Is Tony leasing or buying, and what property types and restaurant formats are supported?
- What data exists from restaurant one (sales, customer patterns, layout, equipment, costs), and what can safely be reused?
- How will rents, construction costs, equipment prices, and demand estimates be kept current and localized?
- What tour formats are available, and how will the experience handle incomplete or misleading listing media?
- Which outputs require a human inspector, architect, contractor, attorney, or permitting authority?
- What is the first measurable success criterion: faster screening, fewer unsuitable visits, better cost estimates, or fewer post-commitment surprises?

This document captures the initial idea only. Treat product scope, terminology, data availability, and scoring as hypotheses to validate with Tony-like operators.