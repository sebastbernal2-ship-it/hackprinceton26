export function labelsMatch(label: string, query: string) {
  const left = label.toLowerCase();
  const right = query.toLowerCase();
  if (left.includes(right) || right.includes(left)) return true;
  if (/bath|restroom/.test(left) && /bath|restroom/.test(right)) return true;
  if (/dining|living/.test(left) && /dining|living/.test(right)) return true;
  return false;
}
