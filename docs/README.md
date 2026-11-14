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

A single opaque “Rick score” (working name; not yet defined) is not enough for a high-stakes property decision. Prefer a configurable fit summary with separate dimensions—concept fit, location demand, access/visibility, operating costs, physical condition, and regulatory readiness—and explain how each was derived. Let Tony set priorities and see how changing them changes the ranking. Missing or stale data should lower confidence, not silently count as favorable evidence.

The product is decision support, not a substitute for a licensed inspection, legal advice, zoning determination, or revenue guarantee. Avoid asserting that an agent concealed a defect without verified evidence. Label potential issues as leads to investigate, keep an audit trail of sources and dates, and protect sensitive business and property information.

### Initial MVP direction

Keep the first version focused on one operator persona and one market. A useful prototype could support:

- A small set of candidate properties with structured facts and linked sources.
- A restaurant-specific requirements profile and explainable comparison view.
- A neighborhood context brief with dated, sourced indicators.
- A tour question/observation log (the 3D character is an optional interface, not a prerequisite).
- A basic kitchen/equipment fit plan and itemized, assumption-based build-out estimate.
- A diligence checklist that clearly separates verified facts, estimates, and items needing professional review.

### Open questions

- What does “Rick score” mean, and should the product use a named score at all?
- Which city and data sources are in scope, and what can be licensed or accessed reliably?
- Is Tony leasing or buying, and what property types and restaurant formats are supported?
- What data exists from restaurant one (sales, customer patterns, layout, equipment, costs), and what can safely be reused?
- How will rents, construction costs, equipment prices, and demand estimates be kept current and localized?
- What tour formats are available, and how will the experience handle incomplete or misleading listing media?
- Which outputs require a human inspector, architect, contractor, attorney, or permitting authority?
- What is the first measurable success criterion: faster screening, fewer unsuitable visits, better cost estimates, or fewer post-commitment surprises?

This document captures the initial idea only. Treat product scope, terminology, data availability, and scoring as hypotheses to validate with Tony-like operators.