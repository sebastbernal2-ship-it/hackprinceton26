// "Design my place" for the 3D walk: pick real catalogue pieces and a grid of spots on the scanned floor. Pure and deterministic:
// the walk checks every spot against the scan (floor under it, walls, furniture) and drops what does not fit.
const area = (c) => c.size_m[0] * c.size_m[1];
const byCat = (catalog, name) => catalog.filter((c) => c.category === name);

/** Catalogue ids Fio uses: a small round table, a chair to go with it, a taller table for the counter, a sofa for the corner. */
export function pickKit(catalog) {
  const tables = byCat(catalog, 'Tables').sort((a, b) => area(a) - area(b));
  const round = tables.filter((c) => /round/i.test(c.id));
  const chairs = byCat(catalog, 'Chairs').filter((c) => !/stool|bar/i.test(c.id));
  const sofa = byCat(catalog, 'Sofas')[0] || null;
  return { table: (round[0] || tables[0]) || null, chair: chairs[0] || null, sofa };
}

/**
 * bounds: {x0,y0,x1,y1} of the walkable floor in metres; ok(x,y): is there floor there; seats: target seats.
 * Returns an ordered list of {id, label, x, y, yaw} (yaw in degrees, facing the table) ready for sequential drop-in.
 */
export function designPlan({ bounds, catalog, seats = 12, ok = () => true, margin = 0.9, pitch = 2.0 }) {
  const kit = pickKit(catalog);
  if (!kit.table || !kit.chair) return { pieces: [], seats: 0, note: 'The catalogue has no table and chair to design with.' };
  const pieces = [];
  let n = 0;
  const per = 2;                                   // two-tops
  for (let y = bounds.y0 + margin; y <= bounds.y1 - margin && n * per < seats; y += pitch)
    for (let x = bounds.x0 + margin; x <= bounds.x1 - margin && n * per < seats; x += pitch) {
      if (![[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]].every(([dx, dy]) => ok(x + dx, y + dy))) continue;
      n++;
      pieces.push({ id: kit.table.id, label: kit.table.name, x, y, yaw: 0 });
      pieces.push({ id: kit.chair.id, label: kit.chair.name, x: x - 0.55, y, yaw: 0 });
      pieces.push({ id: kit.chair.id, label: kit.chair.name, x: x + 0.55, y, yaw: 180 });
    }
  return { pieces, seats: n * per, note: n ? '' : 'I could not find open floor to place anything.' };
}
