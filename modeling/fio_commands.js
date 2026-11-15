// Fio's local command reader for walk.html. Pure functions, no DOM, no network, no model: "clear the room",
// "remove the sofa", "move the chair to the back wall", "add 6 two-tops along the windows", "rotate the table",
// "put a bar by the door", "what is in this room?", "undo". walk.html runs the returned command against the scene.
// Also loaded by the foreground's vitest (foreground/app/lib/__tests__/fio-walk.test.ts).

const NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
const NUMRE = '\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve';
const WALLWORD = 'back|far|rear|front|left|right|north|south|east|west|window|windows|door|entrance|entry';
const STOP = new Set(['the', 'a', 'an', 'all', 'every', 'any', 'of', 'my', 'our', 'this', 'that', 'these', 'those', 'please', 'it', 'me', 'some', 'more']);

const singular = (t) => (/ves$/.test(t) ? t.replace(/ves$/, 'f') : /(ch|sh|x|ss)es$/.test(t) ? t.replace(/es$/, '') : /ies$/.test(t) ? t.replace(/ies$/, 'y') : t.length > 3 ? t.replace(/s$/, '') : t);
const norm = (s) => s.toLowerCase().replace(/two[- ]?tops?/g, 'twotop').replace(/four[- ]?tops?/g, 'fourtop').replace(/high[- ]?tops?/g, 'hightop')
  .replace(/arm[- ]chairs?/g, 'armchair').replace(/couch(es)?/g, 'sofa');
export const words = (phrase) => norm(phrase).split(/[^a-z0-9]+/).filter((t) => t && !STOP.has(t)).map(singular);

// words a person uses -> words that can appear in a piece's label / kind / catalogue name
const SYN = {
  counter: ['counter', 'bar', 'console', 'cabinet', 'dresser'], bar: ['bar', 'counter', 'console', 'cabinet'],
  sofa: ['sofa', 'couch'], stool: ['stool', 'bar chair'], seat: ['chair', 'stool', 'sofa', 'armchair'], seating: ['chair', 'stool', 'sofa', 'armchair'],
  shelf: ['shelf', 'shelve', 'wall unit', 'display'], cabinet: ['cabinet', 'wardrobe', 'dresser', 'console'], desk: ['table', 'console'],
  plant: ['plant', 'decor'], furniture: [''],
};
const text = (p) => `${p.label || ''} ${p.kind || ''} ${p.cat || ''} ${p.name || ''}`.toLowerCase().replace(/[_-]/g, ' ');

/** Which pieces does a phrase like "the sofa" or "all chairs" mean? items: [{id, label, kind, cat, name}]. Exact word match first,
 *  then synonyms (flagged approx, so the reply can say "no counter, closest is ..."). */
export function matchPieces(phrase, items) {
  const toks = words(phrase).filter((t) => !['room', 'space', 'floor', 'scene', 'everything', 'furniture', 'piece', 'thing', 'object'].includes(t));
  if (!toks.length) return { ids: [], approx: false };
  const ids = items.filter((p) => toks.every((t) => text(p).includes(t))).map((p) => p.id);
  if (ids.length) return { ids, approx: false };
  const alt = items.filter((p) => toks.every((t) => (SYN[t] || [t]).some((a) => text(p).includes(a)))).map((p) => p.id);
  return { ids: alt, approx: alt.length > 0 };
}

/** What to add for a phrase, from the catalogue: [{id, role}] where role 'main' is the piece and 'seat' goes beside it. */
export function resolveAdd(phrase, catalog) {
  const toks = words(phrase);
  if (!toks.length) return null;
  const by = (re) => catalog.filter((c) => re.test(`${c.id} ${c.name}`.toLowerCase().replace(/[_-]/g, ' ')));
  const smallest = (l) => [...l].sort((a, b) => (a.size_m[0] * a.size_m[1]) - (b.size_m[0] * b.size_m[1]))[0];
  const largest = (l) => [...l].sort((a, b) => (b.size_m[0] * b.size_m[1]) - (a.size_m[0] * a.size_m[1]))[0];
  const cat = (n) => catalog.filter((c) => c.category === n);
  const stool = by(/stool/)[0], chair = by(/dining chair|wooden chair|chair/).find((c) => c.category === 'Chairs' && !/stool|bar/.test(c.id));
  const j = toks.join(' ');
  const pick = (main, seat, n, label) => (main ? { label, group: [{ id: main.id, role: 'main' }, ...Array(n).fill(0).map(() => seat && { id: seat.id, role: 'seat' }).filter(Boolean)] } : null);
  if (/twotop/.test(j)) return pick(smallest(cat('Tables').filter((c) => /round/.test(c.id))) || smallest(cat('Tables')), chair, 2, 'two-top');
  if (/fourtop/.test(j)) return pick(largest(cat('Tables').filter((c) => /round|dining/.test(c.id))) || largest(cat('Tables')), chair, 4, 'four-top');
  if (/hightop/.test(j)) return pick(smallest(cat('Tables')), stool, 2, 'high-top');
  if (/\b(bar|counter)\b/.test(j)) return pick(largest(by(/cabinet|console/)), stool, 3, 'bar');
  for (const [re, pool, label] of [[/\bsofa\b/, cat('Sofas'), 'sofa'], [/armchair/, cat('Armchairs'), 'armchair'], [/\bstool\b/, by(/stool/), 'stool'],
    [/\bchair\b/, cat('Chairs').filter((c) => !/stool/.test(c.id)), 'chair'], [/\btable\b/, cat('Tables'), 'table'], [/\b(shelf|shelve)\b/, by(/shel/), 'shelf'],
    [/\bcabinet\b/, by(/cabinet/), 'cabinet'], [/\bottoman\b/, by(/ottoman/), 'ottoman']]) {
    if (re.test(j) && pool.length) return pick(pool[0], null, 0, label);
  }
  const direct = catalog.find((c) => toks.every((t) => `${c.id} ${c.name}`.toLowerCase().replace(/[_-]/g, ' ').includes(t)));
  return direct ? pick(direct, null, 0, direct.name) : null;
}

const num = (s) => (s ? (NUM[s] ?? (Number(s) || 1)) : null);
const WALLS = { back: 'ahead', far: 'ahead', rear: 'ahead', front: 'behind', left: 'left', right: 'right', north: 'north', south: 'south', east: 'east', west: 'west',
  window: 'windows', windows: 'windows', door: 'door', entrance: 'door', entry: 'door' };
const wallOf = (w) => WALLS[w] || null;
const TARGET = new RegExp(`\\s+(?:to|against|along|by|near|next to|beside|at|on|toward|towards)\\s+(?:the\\s+)?(${WALLWORD})(?:\\s+wall)?(?:\\s+side)?$`);

/** Text -> command, or null when this is not a scene command (the caller then asks the model / property answerer). */
export function parseCommand(input) {
  const s = String(input || '').toLowerCase().replace(/[.!?,]+$/g, '').replace(/^(hey |ok |okay )?(fio[, ]+)?(please |can you |could you |would you |i want you to |i('d| would) like you to )/, '').trim();
  if (!s) return null;
  if (/^(undo|go back|revert|put it back)( that| the last( change)?)?$/.test(s)) return { op: 'undo' };
  if (/\bwhat('s| is| are| do we have)\b.*\b(in|inside|here|around)\b.*\b(room|space|scene|cafe|place|here)\b|^what do (we|i) have\b|^(describe|list|inventory)\b|^how many (pieces|chairs|tables|stools|sofas|things) (are )?(in|here|do (we|i) have)\b/.test(s))
    return { op: 'describe', what: (/how many (\w+)/.exec(s) || [])[1] || null };
  if (/^(clear|empty|wipe|strip|clean)( out)?( the| this)?( whole| entire)?( room| space| floor| scene| cafe| place| it| everything)?( out)?$/.test(s) && !/^(clear|empty|wipe|strip|clean)$/.test(s)
    || /^(remove|delete|take out|get rid of|take away)\s+(everything|all( of it)?|all (the )?(furniture|pieces|objects|items|stuff))( in (the|this) (room|space|scene))?$/.test(s)
    || /^(start (from )?scratch|start over|blank slate|empty slate)$/.test(s)) return { op: 'clear' };

  const nudge = new RegExp(`^(?:move|push|slide|shift|scoot)\\s+(.+?)\\s+(left|right|forward|backward|back|closer|away)(?:\\s+(?:by\\s+)?(\\d+(?:\\.\\d+)?)\\s*(m|meters?|metres?|ft|feet|cm)?)?$`).exec(s);
  if (nudge && !/\bwall\b/.test(s)) {
    const unit = nudge[4] || 'm', v = Number(nudge[3] || 1) * (/^f/.test(unit) ? 0.3048 : unit === 'cm' ? 0.01 : 1);
    return { op: 'nudge', what: nudge[1], dir: nudge[2] === 'back' ? 'backward' : nudge[2] === 'closer' ? 'backward' : nudge[2] === 'away' ? 'forward' : nudge[2], metres: v };
  }
  const mv = new RegExp(`^(move|push|slide|shift|send|put|place|set|bring|stick)\\s+(.+?)${TARGET.source}`).exec(s);
  if (mv) {
    const adding = /^(put|place|set|bring|stick)$/.test(mv[1]) && new RegExp(`^(${NUMRE})\\b`).test(mv[2]);
    if (!adding) return { op: 'move', what: mv[2], wall: wallOf(mv[3]), wallWord: mv[3] };
  }
  const rot = new RegExp(`^(rotate|turn|spin|flip|swivel)\\s+(.+?)(?:\\s+(?:by\\s+)?(\\d+)\\s*(?:degrees?|deg|°))?(\\s+around)?$`).exec(s);
  if (rot) return { op: 'rotate', what: rot[2].replace(/\s+around$/, ''), degrees: rot[3] ? Number(rot[3]) : /flip|around/.test(s) ? 180 : 90 };
  const rm = new RegExp(`^(?:remove|delete|take out|get rid of|take away|clear out|clear|drop|ditch)\\s+(?:(${NUMRE})\\s+)?(.+)$`).exec(s);
  if (rm) return { op: 'remove', what: rm[2], count: num(rm[1]), all: /\b(all|every|each)\b/.test(s) };
  const add = new RegExp(`^(?:add|put|place|bring in|set up|give me|i need|we need|build|make|create|get|throw in)\\s+(?:(${NUMRE})\\s+)?(.+?)(?:${TARGET.source.replace(/\$$/, '')})?$`).exec(s);
  if (add) return { op: 'add', what: add[2], count: num(add[1]) ?? 1, wall: add[3] ? wallOf(add[3]) : null, wallWord: add[3] || null };
  return null;
}
