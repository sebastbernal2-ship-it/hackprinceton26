// House-DNA rule engine (variant c_housedna).
// Pure JS (no three.js): takes house_dna.json (written by analyse_house.py) + an addition rectangle and decides what
// the new room should be and how it is detailed. Every decision is recorded as a human-readable rule with the evidence.

const r2 = v => Math.round(v * 100) / 100;
const median = a => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgb2hex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => rgb2hex(hex2rgb(a).map((v, i) => v * (1 - t) + hex2rgb(b)[i] * t));

function polyEdges(poly) { return poly.map((p, i) => [p, poly[(i + 1) % poly.length]]); }
function onSegment(p, a, b, tol) {
  const ab = [b[0] - a[0], b[1] - a[1]], L2 = ab[0] ** 2 + ab[1] ** 2;
  const t = ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / L2;
  const q = [a[0] + ab[0] * t, a[1] + ab[1] * t];
  return t > -0.02 && t < 1.02 && Math.hypot(p[0] - q[0], p[1] - q[1]) < tol;
}
export function pointInPoly(poly, p) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi + 1e-12) + xi) ins = !ins;
  }
  return ins;
}

// rect sides: S (y0), N (y1), W (x0), E (x1). Each side as a wall: p0->p1 runs so that `out` is the outward normal.
export function rectSides(R) {
  return {
    S: { p0: [R.x0, R.y0], p1: [R.x1, R.y0], out: [0, -1] },
    E: { p0: [R.x1, R.y0], p1: [R.x1, R.y1], out: [1, 0] },
    N: { p0: [R.x1, R.y1], p1: [R.x0, R.y1], out: [0, 1] },
    W: { p0: [R.x0, R.y1], p1: [R.x0, R.y0], out: [-1, 0] },
  };
}

export function makeSpec(dna, add) {
  const rules = [];
  const rule = (group, title, value, why) => rules.push({ group, title, value, why });
  const xs = add.polygon.map(p => p[0]), ys = add.polygon.map(p => p[1]);
  const R = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  const W = R.x1 - R.x0, D = R.y1 - R.y0, area = W * D;
  const tExt = dna.walls.exterior_thickness, tInt = dna.walls.interior_thickness;

  // ---- which side touches the house
  const sides = rectSides(R);
  const a = add.connect_wall.a, b = add.connect_wall.b;
  let shared = 'S';
  for (const k of Object.keys(sides)) {
    const s = sides[k];
    if (onSegment(a, s.p0, s.p1, 0.06) && onSegment(b, s.p0, s.p1, 0.06)) shared = k;
  }
  const sh = sides[shared];
  // ---- neighbour room: room with that label whose boundary contains the connect wall
  const cands = dna.rooms.filter(r => r.label === add.connect_to_room_label);
  let nb = cands.find(r => polyEdges(r.polygon).some(([p, q]) => onSegment(a, p, q, 0.08) && onSegment(b, p, q, 0.08)))
        || cands.find(r => pointInPoly(r.polygon, [(a[0] + b[0]) / 2 + sh.out[0] * 0.3, (a[1] + b[1]) / 2 + sh.out[1] * 0.3]))
        || dna.rooms.find(r => pointInPoly(r.polygon, [(a[0] + b[0]) / 2 + sh.out[0] * 0.3, (a[1] + b[1]) / 2 + sh.out[1] * 0.3])) || cands[0] || dna.rooms[0];

  // ---- room type
  const bedrooms = dna.rooms.filter(r => r.label === 'Bedroom');
  const minBed = Math.min(...bedrooms.map(r => r.area_m2));
  let type, why;
  if (nb.label === 'Bedroom') {
    if (area >= 0.85 * minBed) { type = 'Bedroom'; why = `${r2(area)} m² ≥ 85 % of the smallest existing bedroom (${r2(minBed)} m²) and it is only reachable through the ${nb.label} → bedroom (suite extension of the private wing)`; }
    else if (area >= 6) { type = 'Study / nursery'; why = `${r2(area)} m² is too small for a bedroom like the existing ones (${r2(minBed)} m²) but reached through a bedroom → study / nursery`; }
    else { type = 'Walk-in closet'; why = `${r2(area)} m² off a bedroom → walk-in closet`; }
  } else if (/Living|Dining/.test(nb.label)) { type = 'Family room'; why = `opens off the ${nb.label} (public zone) → family room`; }
  else if (/Kitchen/.test(nb.label)) { type = area > 8 ? 'Breakfast room' : 'Pantry'; why = `opens off the kitchen`; }
  else { type = 'Den'; why = `neighbour is ${nb.label}`; }
  rule('Room', 'Room type', type, why);

  // ---- heights / thickness
  const ceiling = dna.levels.ceiling;
  rule('Room', 'Ceiling height', `${r2(ceiling)} m`, `modal ceiling of the scan: ${dna.levels.ceiling_support} of ${dna.levels.ceiling_n} rooms within ±3 cm (neighbour ${nb.label}: ${nb.ceiling_m} m)`);
  rule('Room', 'Wall thickness', `${tExt} m ext / ${tInt} m int`, `length-weighted mode of ${dna.walls.exterior_n} exterior and ${dna.walls.interior_n} interior plan walls`);

  // ---- finishes copied from the neighbour room
  const ft = dna.floor_textures[nb.id] || Object.values(dna.floor_textures)[0];
  const floorMat = nb.floor ? nb.floor.material : 'hardwood';
  const ownTex = !!dna.floor_textures[nb.id];
  const nHard = dna.rooms.filter(q => q.floor && q.floor.material.startsWith('hardwood')).length;
  if (!ownTex) rule('Finish', 'Floor', 'hardwood', `${nb.label} next door is ${floorMat.split(' (')[0]} (wet-room finish); a ${type.toLowerCase()} takes the house's dominant floor instead: hardwood in ${nHard} of ${dna.rooms.length} rooms, texture baked from a bedroom floor`);
  else rule('Finish', 'Floor', floorMat.split(' (')[0], `${nb.label} next door is ${floorMat}; texture baked top-down from its cleanest ${ft.size_m} m patch at (${ft.sampled_at.map(r2)}) and laid with the boards running the same way (${ft.board_axis_world}) so the floor reads as continuous through the door`);
  const paint = nb.wall_paint ? nb.wall_paint.colour_balanced : '#e8e2d4';
  rule('Finish', 'Wall paint', paint, `${nb.label} walls (frieze band 2.0–2.4 m, ${Math.round((nb.wall_paint || {}).share * 100)} % of samples) white-balanced with its ceiling as the white reference (scan ${nb.wall_paint && nb.wall_paint.colour})`);
  const trim = mix(dna.door_stats.casing_colour, '#ffffff', 0.55);
  rule('Finish', 'Trim', trim, `door casings in the scan are painted ${dna.door_stats.casing_colour} (${dna.door_stats.casing_support} doors, lighting-compensated)`);
  rule('Finish', 'Baseboard', `${dna.style.baseboard_height} m`, `median of ${dna.style.baseboard_support} rooms where a baseboard band was separable from the wall paint`);
  const crown = nb.crown && nb.crown.depth_m >= 0.04 ? nb.crown.depth_m : (dna.style.crown_depth || 0);
  rule('Finish', 'Crown / cove', crown ? `${r2(crown)} m` : 'none', nb.crown && nb.crown.depth_m >= 0.04 ? `copied from the ${nb.label} (public rooms carry 0.21 m crowns, bedrooms a small cove)` : `house median ${dna.style.crown_depth} m`);

  // ---- door in the shared wall
  const ds = dna.door_stats;
  const doorW = ds.width, doorH = ds.head, casing = Math.min(ds.casing_width, 0.13);
  const shLen = Math.hypot(sh.p1[0] - sh.p0[0], sh.p1[1] - sh.p0[1]);
  const u = [(sh.p1[0] - sh.p0[0]) / shLen, (sh.p1[1] - sh.p0[1]) / shLen];
  // existing doors of the neighbour room -> which end of the shared wall is closer to its circulation
  const nbDoors = dna.doors.filter(d => d.room_ids.includes(nb.id));
  let endNear = 0;
  if (nbDoors.length) {
    const c = [median(nbDoors.map(d => d.centre[0])), median(nbDoors.map(d => d.centre[1]))];
    const d0 = Math.hypot(c[0] - sh.p0[0], c[1] - sh.p0[1]), d1 = Math.hypot(c[0] - sh.p1[0], c[1] - sh.p1[1]);
    endNear = d0 < d1 ? 0 : 1;
  }
  const inner0 = tExt / 2, inner1 = shLen - tExt / 2;           // inner corners of the new room along the shared wall
  const off = ds.corner_offset;
  const ds0 = endNear === 0 ? inner0 + off : inner1 - off - doorW;
  const door = { s0: ds0, s1: ds0 + doorW, head: doorH, casing, width: doorW, hingeEnd: endNear };
  rule('Door', 'Doorway', `${r2(doorW)} × ${r2(doorH)} m`, `clear width like ${ds.width_support} of ${ds.n_doors} measured doorways, head like ${ds.head_support} of ${ds.n_doors}`);
  rule('Door', 'Position', `${r2(off)} m from the corner`, `${ds.n_near_corner} of ${ds.n_doors} existing doors sit within 0.45 m of a corner (median ${r2(off)} m); placed at the end of the shared wall nearest the ${nb.label}'s existing door${nbDoors.length > 1 ? 's' : ''} to keep circulation short and leave the long walls for furniture`);
  rule('Door', 'Casing', `${r2(casing)} m flat, head ${r2(casing + 0.03)} m`, `measured casing width ${ds.casing_width} m (${ds.casing_support} doors, capped at 0.13 m: scan blur widens it); craftsman flat casing with a thicker head`);

  // ---- windows
  const ws = dna.window_stats;
  const unitW = ws.unit_width, sill = ws.sill, head = Math.min(ws.head, doorH + 0.05);
  const unitA = unitW * (head - sill);
  const target = ws.glazing_to_floor_area_median * area;
  let nWin = Math.max(1, Math.round(target / unitA));
  rule('Windows', 'Unit', `${r2(unitW)} × ${r2(head - sill)} m`, `modal unit width ${unitW} m (${ws.unit_support} of ${ws.n} windows), sill ${sill} m (${ws.sill_support} of ${ws.n}), head ${r2(head)} m aligned with the door heads (${ws.head_support} windows)`);
  rule('Windows', 'Count', `${nWin}`, `house glazing ≈ ${Math.round(ws.glazing_to_floor_area_median * 100)} % of floor area (median over rooms) → ${r2(target)} m² / ${r2(unitA)} m² per unit`);
  // walls of the addition: the side opposite the shared one is the "far" wall; the others are side walls
  const opp = { S: 'N', N: 'S', E: 'W', W: 'E' }[shared];
  const sideKeys = Object.keys(sides).filter(k => k !== shared && k !== opp);
  // side wall facing more open space (further from the existing footprint)
  const env = dna.envelope_outer;
  const clearance = k => {
    const s = sides[k]; const m = [(s.p0[0] + s.p1[0]) / 2, (s.p0[1] + s.p1[1]) / 2];
    let d = 0; for (let t = 0.2; t < 12; t += 0.2) { if (pointInPoly(env, [m[0] + s.out[0] * t, m[1] + s.out[1] * t])) break; d = t; }
    return d;
  };
  // most open side first; ties -> the side facing the back yard (+y), like the existing bedrooms
  sideKeys.sort((p, q) => (clearance(q) - clearance(p)) || (sides[q].out[1] - sides[p].out[1]));
  // existing bedrooms put their windows near the wall ends (flanking): offset from the wall end
  const offs = dna.windows.filter(w => w.wall_len > 3).map(w => w.offset_from_wall_end).filter(v => v > 0.1 && v < 1.0);
  const winOff = offs.length ? median(offs) : 0.35;
  const windows = [];
  const lenOf = k => { const s = sides[k]; return Math.hypot(s.p1[0] - s.p0[0], s.p1[1] - s.p0[1]); };
  const place = (k, n) => {
    const L = lenOf(k); const i0 = tExt / 2, i1 = L - tExt / 2;
    if (n === 1) windows.push({ side: k, s0: L / 2 - unitW / 2, s1: L / 2 + unitW / 2, sill, head });
    else if (n === 2) {
      const pairOK = (i1 - i0) - 2 * winOff - 2 * unitW > 0.6;
      if (pairOK) { windows.push({ side: k, s0: i0 + winOff, s1: i0 + winOff + unitW, sill, head }); windows.push({ side: k, s0: i1 - winOff - unitW, s1: i1 - winOff, sill, head }); }
      else { windows.push({ side: k, s0: L / 2 - unitW - 0.05, s1: L / 2 - 0.05, sill, head }); windows.push({ side: k, s0: L / 2 + 0.05, s1: L / 2 + unitW + 0.05, sill, head }); }
    }
  };
  const nFar = Math.min(2, nWin), nSide = nWin - nFar;
  place(opp, nFar);
  if (nSide >= 1) place(sideKeys[0], 1);
  if (nSide >= 2) place(sideKeys[1], 1);
  rule('Windows', 'Placement', `${nFar} on the far wall${nSide ? `, ${nSide} on the ${sideKeys.slice(0, nSide).join('/')} wall` : ''}`,
    `existing bedrooms flank their outer walls with windows ${r2(winOff)} m from the corners (median of ${offs.length}); the side wall with the most open yard (${r2(clearance(sideKeys[0]))} m clear) gets the next one`);
  rule('Windows', 'Style', 'double-hung, 3-over-1', 'scan elevations show double-hung sashes with vertical muntins in the upper sash and white flat casings');

  // ---- exterior
  const ex = dna.exterior, roof = ex.roof;
  const ov = roof.overhang_m;
  // roof solid: addition + overhang on the three free sides; on the house side run into the existing roof
  const into = ov + tExt / 2 + 1.8;
  const RR = { x0: R.x0 - tExt / 2 - ov, x1: R.x1 + tExt / 2 + ov, y0: R.y0 - tExt / 2 - ov, y1: R.y1 + tExt / 2 + ov };
  if (shared === 'S') RR.y0 = R.y0 - into; if (shared === 'N') RR.y1 = R.y1 + into;
  if (shared === 'W') RR.x0 = R.x0 - into; if (shared === 'E') RR.x1 = R.x1 + into;
  const span = Math.min(RR.x1 - RR.x0, RR.y1 - RR.y0);
  const k = Math.tan(roof.pitch_deg * Math.PI / 180);
  rule('Exterior', 'Roof', `hip ${roof.pitch_ratio}, eave z ${r2(roof.eave_z)} m`, `existing roof is a hipped composition-shingle roof (drone): the addition gets its own hip at the same ${roof.pitch_ratio} pitch, same eave line and ${ov} m overhang; its ridge (${r2(span / 2 * k)} m above the eave) runs into the main roof and meets it in two valleys`);
  rule('Exterior', 'Cladding', 'lap siding', `${ex.cladding.colour} sampled from the drone photo of the back wall; white trim and fascia as on the house`);
  rule('Exterior', 'Foundation', `floor ${r2(ex.foundation.floor_above_grade)} m above grade`, ex.foundation.evidence);

  return {
    id: add.id, rect: R, area, shared, sides, neighbour: nb, type, ceiling, tExt, tInt,
    floor: { tex: ft.file, size: ft.size_m, axis: ft.board_axis_world, colour: nb.floor && nb.floor.colour_balanced },
    paint, trim, baseboard: dna.style.baseboard_height, crown, door, windows,
    ceilingColour: '#f1efea',
    roof: { rect: RR, eave: roof.eave_z, k, overhang: ov },
    rules,
  };
}
