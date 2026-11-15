/**
 * Example prompts for the Ask screen, built from the spaces that are actually loaded: one per city present, each
 * with a concept. The first is a complete brief (no questions), the next ones leave something out so the clarify
 * path shows. Pure.
 */
const CONCEPT_PROMPTS = [
  (city: string) => `Taqueria, 40 seats, $150k budget, ${city}`,
  (city: string) => `Coffee shop in ${city}`,
  (city: string) => `Ramen, 30 seats, ${city}`,
];

export function buildExamples(cities: readonly (string | undefined)[]): string[] {
  const present = [...new Set(cities.filter((c): c is string => Boolean(c)))].sort();
  return present.map((city, i) => CONCEPT_PROMPTS[i % CONCEPT_PROMPTS.length](city));
}

/** the Walk composer's one suggestion: build it from the current stop's cost line, or offer none */
export function walkSuggestion(pin: { tone: string; label: string } | undefined, title: string | undefined): string[] {
  if (!pin || !title || pin.tone !== "needed") return [];
  return [`Imagine the ${title.toLowerCase()} in place`];
}
