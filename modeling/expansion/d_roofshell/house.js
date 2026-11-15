// d_roofshell: architectural shell of the existing house + roof-integrated extension.
// Model frame: x east, y north, z up, metres (same as plan.json / MatterPak).
import * as THREE from '../../vendor/three.module.min.js';
import { Batch, WallFrame, board, abox, V3 } from './geom.js';

// ----------------------------------------------------------------------------------------------------------------
// Inferred existing envelope (see NOTES.md):
//  - front-gable California bungalow, gable end + porch face the street at +x (east); ridge runs east-west
//  - roof 6:12, light-grey weathered 3-tab asphalt shingles, white boxed eaves/fascia, white stucco walls
//  - L-shaped porch (east front + south return) under the main roof, chimney on the living-room south wall
export const H = {
  X0: -13.07, X1: 4.45, Y0: -6.21, Y1: 4.98,   // roof rectangle (outer wall faces); ridge along x
  ZW: 3.10,          // roof top surface height where it crosses the wall line ("plate"+heel)
  PITCH: 0.5,        // 6:12
  OV: 0.45, RAKE: 0.35, SLAB: 0.14, FASCIA: 0.2,
  GRADE: -0.55, CEIL: 2.72, WALL_T: 0.16, FLOOR: 0.0,
  PORCH_Z: -0.10,
};
H.ZE = H.ZW - H.OV * H.PITCH;   // roof top at the eave edge
H.ZSOFF = H.ZE - H.FASCIA;      // soffit / porch ceiling level

// outer wall faces, CCW. Bay at the north-east front (window flush with the porch columns on the drone photos).
export const FOOT = [[-13.07, -5.85], [-6.85, -5.85], [-6.85, -6.21], [-2.22, -6.21], [-2.22, -4.84], [2.90, -4.84],
  [2.90, 1.70], [4.45, 1.70], [4.45, 4.98], [-13.07, 4.98]];
export const PORCH = [[-2.22, -6.21], [4.45, -6.21], [4.45, 1.70], [2.90, 1.70], [2.90, -4.84], [-2.22, -4.84]];

const v2 = (x, y) => new THREE.Vector2(x, y);

function pointInPoly(p, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (((yi > p[1]) !== (yj > p[1])) && (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi)) c = !c;
  }
  return c;
}

// ---------------------------------------------------------------------------------------------------------------
// Window / door joinery in a WallFrame. Openings use outer face at off=0, wall interior at off<0.
function windowUnit(B, M, wf, u0, u1, z0, z1, thick, opts = {}) {
  const T = M.trim, cas = 0.09;
  // exterior casing
  wf.box(B, T, u0 - cas, u0, 0, 0.025, z0, z1);
  wf.box(B, T, u1, u1 + cas, 0, 0.025, z0, z1);
  wf.box(B, T, u0 - cas - 0.025, u1 + cas + 0.025, 0, 0.035, z1, z1 + 0.15);         // head casing
  wf.box(B, T, u0 - cas - 0.045, u1 + cas + 0.045, 0, 0.055, z1 + 0.15, z1 + 0.175); // drip cap
  wf.box(B, T, u0 - cas - 0.03, u1 + cas + 0.03, -0.06, 0.06, z0 - 0.045, z0);       // sill
  // sashes (double hung, craftsman 3-over-1)
  const r = -0.06, zm = (z0 + z1) / 2 + 0.03, st = 0.055;
  // lower sash
  wf.box(B, M.sash, u0, u0 + st, r - 0.04, r, z0, zm);
  wf.box(B, M.sash, u1 - st, u1, r - 0.04, r, z0, zm);
  wf.box(B, M.sash, u0, u1, r - 0.04, r, z0, z0 + 0.075);
  wf.box(B, M.sash, u0, u1, r - 0.04, r, zm - 0.035, zm);
  // upper sash (slightly proud of lower)
  const r2 = r + 0.03;
  wf.box(B, M.sash, u0, u0 + st, r2 - 0.04, r2, zm - 0.035, z1);
  wf.box(B, M.sash, u1 - st, u1, r2 - 0.04, r2, zm - 0.035, z1);
  wf.box(B, M.sash, u0, u1, r2 - 0.04, r2, z1 - 0.06, z1);
  wf.box(B, M.sash, u0, u1, r2 - 0.04, r2, zm - 0.035, zm + 0.01);
  const lites = opts.lites ?? 3;
  for (let k = 1; k < lites; k++) { const um = u0 + (u1 - u0) * k / lites; wf.box(B, M.sash, um - 0.012, um + 0.012, r2 - 0.03, r2 - 0.005, zm, z1 - 0.05); }
  // glass
  const g = [wf.P(u0, r - 0.05, z0), wf.P(u1, r - 0.05, z0), wf.P(u1, r - 0.05, z1), wf.P(u0, r - 0.05, z1)];
  B.quad(opts.glass || M.glass, g[0], g[1], g[2], g[3], [[0, 0], [1, 0], [1, 1], [0, 1]], wf.N3);
  if (opts.inner) { // interior side: casing, stool, apron, jamb liners
    const IT = M.intTrim, o = -thick;
    wf.box(B, IT, u0 - 0.075, u0, o - 0.02, o, z0, z1);
    wf.box(B, IT, u1, u1 + 0.075, o - 0.02, o, z0, z1);
    wf.box(B, IT, u0 - 0.1, u1 + 0.1, o - 0.025, o, z1, z1 + 0.12);
    wf.box(B, IT, u0 - 0.06, u1 + 0.06, o - 0.05, r - 0.04, z0 - 0.03, z0);  // stool
    wf.box(B, IT, u0 - 0.04, u1 + 0.04, o - 0.02, o, z0 - 0.12, z0 - 0.03); // apron
  }
}

function windowGroup(B, M, wf, u0, u1, z0, z1, thick, opts) {
  const w = u1 - u0, n = Math.max(1, Math.round(w / 0.95)), uw = w / n;
  for (let k = 0; k < n; k++) windowUnit(B, M, wf, u0 + k * uw + (k ? 0.03 : 0), u0 + (k + 1) * uw - (k < n - 1 ? 0.03 : 0), z0, z1, thick, opts);
}

function frontDoor(B, M, wf, u0, u1, z0, z1) {
  const T = M.trim, cas = 0.11, r = -0.07;
  wf.box(B, T, u0 - cas, u0, 0, 0.03, z0, z1);
  wf.box(B, T, u1, u1 + cas, 0, 0.03, z0, z1);
  wf.box(B, T, u0 - cas - 0.03, u1 + cas + 0.03, 0, 0.04, z1, z1 + 0.18);
  wf.box(B, T, u0 - cas - 0.05, u1 + cas + 0.05, 0, 0.06, z1 + 0.18, z1 + 0.205);
  // door slab with raised stiles and 3 lites at the top (craftsman)
  wf.box(B, M.door, u0, u1, r - 0.045, r, z0, z1);
  const lz0 = z1 - 0.55, lz1 = z1 - 0.18, lw = (u1 - u0 - 0.24) / 3;
  for (let k = 0; k < 3; k++) {
    const a = u0 + 0.12 + k * lw + 0.02, b = a + lw - 0.04;
    const g = [wf.P(a, r + 0.002, lz0), wf.P(b, r + 0.002, lz0), wf.P(b, r + 0.002, lz1), wf.P(a, r + 0.002, lz1)];
    B.quad(M.glass, g[0], g[1], g[2], g[3], null, wf.N3);
  }
  wf.box(B, M.doorDark, u0 + 0.12, u1 - 0.12, r, r + 0.012, z0 + 0.25, lz0 - 0.12);
  wf.box(B, M.metal, u1 - 0.12, u1 - 0.09, r, r + 0.05, z0 + 0.95, z0 + 1.1);
}

// ---------------------------------------------------------------------------------------------------------------
// Gable roof over a rectangle in a local (s along ridge, c across) frame.
//  o: {S:Vector3 (unit s dir), C:Vector3 (unit c dir), O:Vector3 origin, sa,sb (roof extents incl. overhang),
//      c0,c1 (wall lines), zw, p, eaveRanges:{A:[[s0,s1]],B:[[s0,s1]]}, rakeAt:[sa?,sb?], ridgeFrom,ridgeTo}
function gableRoof(B, M, o) {
  const { S, C, O, sa, sb, c0, c1, zw, p } = o, ov = H.OV, slab = H.SLAB;
  const W = (s, c, z) => O.clone().addScaledVector(S, s).addScaledVector(C, c).setZ(z);
  const cr = (c0 + c1) / 2, zr = zw + (c1 - c0) / 2 * p, ze = zw - ov * p, k = Math.hypot(1, p);
  const cA = c0 - ov, cB = c1 + ov;
  const zt = c => c <= cr ? zw + (c - c0) * p : zw + (c1 - c) * p;
  const up = V3(0, 0, 1), nA = C.clone().multiplyScalar(-p).add(up).normalize(), nB = C.clone().multiplyScalar(p).add(up).normalize();
  for (const [ca, cb, n, vfun] of [[cA, cr, nA, c => (c - cA) * k], [cr, cB, nB, c => (cB - c) * k]]) {
    const q = [W(sa, ca, zt(ca)), W(sb, ca, zt(ca)), W(sb, cb, zt(cb)), W(sa, cb, zt(cb))];
    const uv = [[sa, vfun(ca)], [sb, vfun(ca)], [sb, vfun(cb)], [sa, vfun(cb)]];
    B.quad(M.roof, ...q, uv, n);
    const qb = q.map(v => v.clone().setZ(v.z - slab));
    B.quad(M.soffit, ...qb, uv, n.clone().negate());
    // edge faces
    const ce = n === nA ? ca : cb, outC = n === nA ? C.clone().negate() : C.clone();
    B.quad(M.trim, W(sa, ce, zt(ce)), W(sb, ce, zt(ce)), W(sb, ce, zt(ce) - slab), W(sa, ce, zt(ce) - slab), null, outC);
    for (const [s, sd] of [[sa, -1], [sb, 1]]) {
      B.quad(M.trim, W(s, ca, zt(ca)), W(s, cb, zt(cb)), W(s, cb, zt(cb) - slab), W(s, ca, zt(ca) - slab), null, S.clone().multiplyScalar(sd));
    }
  }
  // ridge cap
  const r0 = o.ridgeFrom ?? sa, r1 = o.ridgeTo ?? sb, rw = 0.16;
  B.quad(M.ridge, W(r0, cr - rw, zr - rw * p + 0.03), W(r1, cr - rw, zr - rw * p + 0.03), W(r1, cr, zr + 0.06), W(r0, cr, zr + 0.06), [[r0, 0], [r1, 0], [r1, 0.2], [r0, 0.2]], nA);
  B.quad(M.ridge, W(r0, cr + rw, zr - rw * p + 0.03), W(r1, cr + rw, zr - rw * p + 0.03), W(r1, cr, zr + 0.06), W(r0, cr, zr + 0.06), [[r0, 0], [r1, 0], [r1, 0.2], [r0, 0.2]], nB);
  // fascia + gutters along eaves (ranges may be cut where a wing ties in)
  for (const [side, ce, out] of [['A', cA, C.clone().negate()], ['B', cB, C.clone()]]) {
    for (const [s0, s1] of (o.eaveRanges?.[side] ?? [[sa, sb]])) {
      const inw = out.clone().negate();
      board(B, M.trim, W(s0, ce, ze + 0.015).addScaledVector(out, 0.03), W(s1, ce, ze + 0.015).addScaledVector(out, 0.03), H.FASCIA + 0.015, 0.05, inw, out);
      // K-style gutter
      const g0 = W(s0, ce, ze - 0.03).addScaledVector(out, 0.17), g1 = W(s1, ce, ze - 0.03).addScaledVector(out, 0.17);
      board(B, M.gutter, g0, g1, 0.12, 0.14, inw, out);
      // downspouts at the free ends
      for (const [s, end] of [[s0, o.spoutAt?.[side]?.[0] ?? true], [s1, o.spoutAt?.[side]?.[1] ?? true]]) {
        if (!end) continue;
        const sIn = s === s0 ? s + 0.35 : s - 0.35;
        const cw = side === 'A' ? c0 : c1, top = W(sIn, ce, ze - 0.14).addScaledVector(out, 0.1);
        const wallPt = W(sIn, cw, 0).addScaledVector(out, 0.06);
        // elbow from gutter to the wall, then down to grade
        const mid = wallPt.clone().setZ(ze - 0.45);
        spout(B, M.gutter, top, mid); spout(B, M.gutter, mid, wallPt.clone().setZ(H.GRADE + 0.25));
        spout(B, M.gutter, wallPt.clone().setZ(H.GRADE + 0.25), wallPt.clone().addScaledVector(out, 0.3).setZ(H.GRADE + 0.08));
      }
    }
  }
  // rake boards (bargeboards) on gable ends
  for (const [s, sd, on] of [[sa, -1, o.rakeBoards?.[0] ?? true], [sb, 1, o.rakeBoards?.[1] ?? true]]) {
    if (!on) continue;
    const out = S.clone().multiplyScalar(sd), inw = out.clone().negate();
    board(B, M.trim, W(s, cA, ze + 0.02).addScaledVector(out, 0.03), W(s, cr, zr + 0.02).addScaledVector(out, 0.03), 0.24, 0.05, inw, out);
    board(B, M.trim, W(s, cr, zr + 0.02).addScaledVector(out, 0.03), W(s, cB, ze + 0.02).addScaledVector(out, 0.03), 0.24, 0.05, inw, out);
  }
  return { ze, zr, zt, cr, cA, cB, W };
}

function spout(B, mat, a, b) {
  const d = b.clone().sub(a), L = d.length();
  const g = new THREE.BoxGeometry(0.075, 0.075, L);
  const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), d.clone().normalize());
  const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V3(1, 1, 1));
  B.addGeometry(g, mat, m);
}

// gable-end triangle above soffit level (closes boxed eave returns too) + frieze band + attic vent
function gableEnd(B, M, roof, o, sWall, outSign, cFrom, cTo) {
  const { S, C, O } = o, out2 = v2(S.x * outSign, S.y * outSign);
  const cA = cFrom ?? roof.cA, cB = cTo ?? roof.cB;
  const p0 = roof.W(sWall, cA, 0), p1 = roof.W(sWall, cB, 0);
  const wf = new WallFrame(v2(p0.x, p0.y), v2(p1.x, p1.y), out2);
  const L = cB - cA, zs = H.ZSOFF + (o.zw - H.ZW) - (o.p - H.PITCH) * H.OV, sl = H.SLAB + 0.01;
  const cr = roof.cr - cA;
  const outline = [[0, zs], [L, zs], [L, roof.zt(cB) - sl], [cr, roof.zr - sl], [0, roof.zt(cA) - sl]];
  wf.slab(B, M.stucco, M.stucco, outline, [], 0.12, M.stucco);
  wf.box(B, M.trim, -0.0, L, 0, 0.035, zs - 0.02, zs + 0.2);
  // louvered attic vent
  const vz = (roof.zr + zs) / 2 + 0.05, vw = 0.36;
  if (roof.zr - zs > 1.0) {
    wf.box(B, M.trim, cr - vw - 0.07, cr + vw + 0.07, 0, 0.04, vz - 0.27, vz + 0.27);
    wf.box(B, M.vent, cr - vw, cr + vw, 0, 0.05, vz - 0.2, vz + 0.2);
    for (let k = -3; k <= 3; k++) wf.box(B, M.trim, cr - vw, cr + vw, 0.03, 0.07, vz + k * 0.055 - 0.012, vz + k * 0.055 + 0.012);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Addition analysis: which wall it connects to, its frame and the roof strategy.
export function analyseAddition(add) {
  const P = add.polygon, xs = P.map(p => p[0]), ys = P.map(p => p[1]);
  const r = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  let cw = add.connect_wall;
  const horiz = cw ? Math.abs(cw.a[1] - cw.b[1]) < 1e-3 : (r.x1 - r.x0 > r.y1 - r.y0);
  let n, t, sAttach, c0, c1, sOut;
  if (horiz) {
    const yw = cw ? cw.a[1] : r.y0;
    const north = Math.abs(yw - r.y0) < Math.abs(yw - r.y1);
    n = north ? V3(0, 1, 0) : V3(0, -1, 0); t = V3(1, 0, 0);
    sAttach = north ? H.Y1 : -H.Y0;           // s = dot(p, n)
    sOut = north ? r.y1 : -r.y0; c0 = r.x0; c1 = r.x1;
  } else {
    const xw = cw ? cw.a[0] : r.x1;
    const west = Math.abs(xw - r.x1) < Math.abs(xw - r.x0);
    n = west ? V3(-1, 0, 0) : V3(1, 0, 0); t = V3(0, 1, 0);
    sAttach = west ? -H.X0 : H.X1;
    sOut = west ? -r.x0 : r.x1; c0 = r.y0; c1 = r.y1;
  }
  // main roof ridge is along x: walls along x are eave walls
  const eaveSide = horiz;
  return { rect: r, n, t, sAttach, sOut, c0, c1, eaveSide, label: add.connect_to_room_label || 'Bedroom' };
}

// ---------------------------------------------------------------------------------------------------------------
export function buildHouse(M, style, plan, add) {
  const group = new THREE.Group(), B = new Batch(), BI = new Batch();
  const A = add ? analyseAddition(add) : null;
  const toW = (s, c) => A.n.clone().multiplyScalar(s).addScaledVector(A.t, c); // wing frame -> world (z=0)
  const doorW = 0.81, doorH = 2.03;
  let door = null;
  if (A) { const cm = (A.c0 + A.c1) / 2; door = { c0: cm - doorW / 2, c1: cm + doorW / 2 }; }

  // ------------------------------------------------ walls of the existing house
  const roomAt = (x, y) => (plan.rooms.find(r => pointInPoly([x, y], r.polygon)) || {}).label || '';
  const edges = FOOT.map((p, i) => {
    const a = v2(...p), b = v2(...FOOT[(i + 1) % FOOT.length]), d = b.clone().sub(a).normalize();
    return { a, b, wf: new WallFrame(a, b, v2(d.y, -d.x)), holes: [] };
  });
  // map floor-plan openings to edges
  for (const op of style.openings) {
    let best = null, bo = 0;
    for (const e of edges) {
      const isH = Math.abs(e.a.y - e.b.y) < 1e-6;
      if ((op.axis === 'y') !== isH) continue;
      const ec = isH ? e.a.y : e.a.x, dist = Math.abs(ec - op.c);
      if (dist > 1.7) continue;
      const lo = Math.max(op.t0, Math.min(isH ? e.a.x : e.a.y, isH ? e.b.x : e.b.y) + 0.2);
      const hi = Math.min(op.t1, Math.max(isH ? e.a.x : e.a.y, isH ? e.b.x : e.b.y) - 0.2);
      const ovl = hi - lo - dist * 0.2;
      if (ovl > 0.3 && ovl > bo) { bo = ovl; best = { e, lo, hi }; }
    }
    if (!best) continue;
    const { e, lo, hi } = best, wf = e.wf;
    const u = t => (e.a.x === e.b.x) ? (t - e.a.y) * wf.t.y : (t - e.a.x) * wf.t.x;
    let u0 = Math.min(u(lo), u(hi)), u1 = Math.max(u(lo), u(hi));
    // drop openings infilled by the addition (shared wall)
    if (A) {
      const onShared = (A.eaveSide ? Math.abs(Math.abs(e.a.y) - Math.abs(A.sAttach * A.n.y)) < 0.05 && Math.sign(e.a.y) === Math.sign(A.n.y) && Math.abs(e.a.y - e.b.y) < 1e-6
        : Math.abs(e.a.x - e.b.x) < 1e-6 && Math.abs(e.a.x - A.sAttach * A.n.x) < 0.05);
      if (onShared && hi > A.c0 - 0.1 && lo < A.c1 + 0.1) continue;
    }
    const mid = wf.P((u0 + u1) / 2, -0.5, 0), room = roomAt(mid.x, mid.y);
    let z0 = 0.80, z1 = 2.15;
    if (/Bath/.test(room)) { z0 = 1.25; z1 = 2.0; } else if (/Kitchen/.test(room)) { z0 = 1.05; }
    const isFront = op.side === 'E' && op.t0 < 0.07 && op.t1 > 0.07 && Math.abs(e.a.x - 2.90) < 0.01;
    if (isFront) {
      const c = (u0 + u1) / 2; e.holes.push({ u0: c - 0.46, u1: c + 0.46, z0: H.PORCH_Z, z1: 2.1, kind: 'door' });
    } else e.holes.push({ u0, u1, z0, z1, kind: 'window' });
  }
  const zTop = H.ZSOFF + 0.01;
  for (const e of edges) {
    const L = e.wf.len, segs = [];
    // shared wall segment for the addition
    let shared = null;
    if (A) {
      const isH = Math.abs(e.a.y - e.b.y) < 1e-6;
      const sCoord = isH ? e.a.y * A.n.y : e.a.x * A.n.x;
      const match = (A.eaveSide === isH) && Math.abs(sCoord - A.sAttach) < 0.05;
      if (match) {
        const u = t => isH ? (t - e.a.x) * e.wf.t.x : (t - e.a.y) * e.wf.t.y;
        const ua = Math.max(0, Math.min(u(A.c0), u(A.c1))), ub = Math.min(L, Math.max(u(A.c0), u(A.c1)));
        if (ub - ua > 0.5) shared = { ua, ub, d0: Math.min(u(door.c0), u(door.c1)), d1: Math.max(u(door.c0), u(door.c1)) };
      }
    }
    const cuts = shared ? [[0, shared.ua, false], [shared.ua, shared.ub, true], [shared.ub, L, false]] : [[0, L, false]];
    for (const [u0, u1, isShared] of cuts) {
      if (u1 - u0 < 0.01) continue;
      if (!isShared) {
        const holes = e.holes.filter(h => h.u0 >= u0 && h.u1 <= u1);
        e.wf.slab(B, M.stucco, M.stucco, [[u0, H.GRADE], [u1, H.GRADE], [u1, zTop], [u0, zTop]], holes, H.WALL_T, M.stucco);
        // foundation band
        e.wf.box(B, M.foundation, u0 - (u0 === 0 ? 0.012 : 0), u1 + (u1 === L ? 0.012 : 0), -0.02, 0.012, H.GRADE - 0.02, H.GRADE + 0.28);
        for (const h of holes) {
          if (h.kind === 'door') frontDoor(B, M, e.wf, h.u0, h.u1, h.z0, h.z1);
          else windowGroup(B, M, e.wf, h.u0, h.u1, h.z0, h.z1, H.WALL_T, {});
        }
      } else {
        // old exterior wall face becomes an interior wall of the new room; doorway like the existing doors
        const dh = { u0: shared.d0, u1: shared.d1, z0: H.FLOOR, z1: doorH, revealMat: M.intTrim };
        e.wf.slab(BI, M.intWall, M.intWall, [[u0, H.FLOOR], [u1, H.FLOOR], [u1, H.CEIL], [u0, H.CEIL]], [dh], H.WALL_T, M.intWall);
        doorCasing(BI, M, e.wf, dh, 0, 1);
        doorCasing(BI, M, e.wf, dh, -H.WALL_T, -1);
        baseboards(BI, M, e.wf, u0, u1, 0, [dh], 1);
        crown(BI, M, e.wf, u0, u1, 0, 1);
      }
    }
  }

  // ------------------------------------------------ main roof
  const MO = { S: V3(1, 0, 0), C: V3(0, 1, 0), O: V3(0, 0, 0), sa: H.X0 - H.RAKE, sb: H.X1 + H.RAKE, c0: H.Y0, c1: H.Y1, zw: H.ZW, p: H.PITCH };
  if (A && A.eaveSide) {
    const side = A.n.y > 0 ? 'B' : 'A', a0 = A.c0 - H.OV, a1 = A.c1 + H.OV;
    MO.eaveRanges = { [side]: [[MO.sa, a0], [a1, MO.sb]] };
    MO.spoutAt = { [side]: [[true, false], [false, true]] };
    MO.spoutAt[side] = [true, true];
    MO.eaveRanges[side === 'A' ? 'B' : 'A'] = [[MO.sa, MO.sb]];
  }
  const main = gableRoof(B, M, MO);
  if (MO.eaveRanges) { /* spouts at cut ends handled: keep one at each outer corner only */ }
  gableEnd(B, M, main, MO, H.X0, -1);
  gableEnd(B, M, main, MO, H.X1, 1);
  // soffit / porch ceiling = roof rectangle minus footprint
  const soffit = (rect, foot, z) => {
    const o = [V3(rect[0], rect[2], z), V3(rect[1], rect[2], z), V3(rect[1], rect[3], z), V3(rect[0], rect[3], z)];
    B.poly(M.soffit, o, { o: V3(0, 0, z), u: V3(1, 0, 0), v: V3(0, 1, 0) }, V3(0, 0, -1), [foot.map(p => V3(p[0], p[1], z))]);
  };
  soffit([H.X0 - 0.02, H.X1 + 0.02, H.Y0 - H.OV, H.Y1 + H.OV], FOOT, H.ZSOFF);

  // chimney (living-room fireplace on the south wall, rises through the porch roof)
  const chx0 = -0.18, chx1 = 0.72, chy0 = -5.55, chy1 = -4.84, chTop = main.zt(chy0) + 1.0;
  abox(B, M.stucco, chx0, chx1, chy0, chy1, H.GRADE, chTop);
  abox(B, M.capstone, chx0 - 0.05, chx1 + 0.05, chy0 - 0.05, chy1 + 0.05, chTop, chTop + 0.08);
  abox(B, M.flue, chx0 + 0.25, chx0 + 0.5, chy0 + 0.2, chy0 + 0.45, chTop + 0.08, chTop + 0.3);
  // plumbing vents + roof jack
  for (const [x, y] of [[-9.6, 1.6], [-11.4, -3.6], [-7.6, 2.4]]) {
    const z = main.zt(y), g = new THREE.CylinderGeometry(0.045, 0.045, 0.5, 10); g.rotateX(Math.PI / 2);
    B.addGeometry(g, M.vent, new THREE.Matrix4().makeTranslation(x, y, z + 0.2));
  }

  // ------------------------------------------------ porch
  const pz = H.PORCH_Z;
  const deck = PORCH.map(p => V3(p[0], p[1], pz));
  B.poly(M.porchFloor, deck, { o: V3(0, 0, pz), u: V3(1, 0, 0), v: V3(0, 1, 0) }, V3(0, 0, 1));
  for (let i = 0; i < PORCH.length; i++) { // porch skirt (only where it is outside the house)
    const a = PORCH[i], b = PORCH[(i + 1) % PORCH.length];
    const onHouse = (Math.abs(a[0] - 2.90) < 0.01 && Math.abs(b[0] - 2.90) < 0.01) || (Math.abs(a[1] + 4.84) < 0.01 && Math.abs(b[1] + 4.84) < 0.01) || (Math.abs(a[0] + 2.22) < 0.01 && Math.abs(b[0] + 2.22) < 0.01) || (Math.abs(a[1] - 1.70) < 0.01 && Math.abs(b[1] - 1.70) < 0.01);
    if (onHouse) continue;
    const d = v2(b[0] - a[0], b[1] - a[1]).normalize();
    const wf = new WallFrame(v2(...a), v2(...b), v2(d.y, -d.x));
    wf.box(B, M.stucco, 0, wf.len, -0.2, 0.0, H.GRADE, pz);
    wf.box(B, M.porchFloor, -0.02, wf.len + 0.02, -0.05, 0.03, pz - 0.05, pz + 0.005);
  }
  // steps to the front walk, centred on the front door
  const stepY0 = -0.69, stepY1 = 0.81, nSteps = 3, rise = (pz - H.GRADE) / nSteps;
  for (let k = 0; k < nSteps; k++) {
    const zTopS = pz - rise * (k + 1) + rise, x1 = H.X1 + 0.3 * (k + 1);
    abox(B, M.step, H.X1, x1, stepY0, stepY1, H.GRADE, zTopS - rise + rise * 0.999);
  }
  abox(B, M.stucco, H.X1, H.X1 + 0.95, stepY0 - 0.2, stepY0, H.GRADE, pz + 0.3);
  abox(B, M.stucco, H.X1, H.X1 + 0.95, stepY1, stepY1 + 0.2, H.GRADE, pz + 0.3);
  // tapered craftsman columns on the half wall, beams under the soffit
  const zb = H.ZSOFF - 0.28;
  const cols = [[4.25, -6.01], [4.25, -3.5], [4.25, -0.95], [4.25, 1.50], [-2.02, -6.01], [1.15, -6.01]];
  for (const [x, y] of cols) {
    const h = zb - (pz + 0.85), g = new THREE.CylinderGeometry(0.15, 0.21, h, 4, 1); g.rotateX(Math.PI / 2); g.rotateZ(Math.PI / 4);
    B.addGeometry(g, M.trim, new THREE.Matrix4().makeTranslation(x, y, pz + 0.85 + h / 2));
    abox(B, M.stucco, x - 0.26, x + 0.26, y - 0.26, y + 0.26, pz, pz + 0.85);
    abox(B, M.trim, x - 0.3, x + 0.3, y - 0.3, y + 0.3, pz + 0.85, pz + 0.9);
  }
  // half walls between columns (front, except the step opening; south return)
  const hw = (x0, x1, y0, y1) => { abox(B, M.stucco, x0, x1, y0, y1, pz, pz + 0.8); abox(B, M.trim, x0 - 0.03, x1 + 0.03, y0 - 0.03, y1 + 0.03, pz + 0.8, pz + 0.86); };
  hw(4.15, 4.35, -5.75, -1.21); hw(-1.76, 3.99, -6.11, -5.91);
  // beams
  abox(B, M.stucco, 4.15, 4.45, -6.21, 1.70, zb, H.ZSOFF); abox(B, M.stucco, -2.22, 4.45, -6.21, -5.91, zb, H.ZSOFF);
  // porch light
  abox(B, M.metal, 2.90, 2.98, 0.86, 0.98, 1.9, 2.15);

  // ------------------------------------------------ addition
  let info = null;
  if (A) info = buildAddition(B, BI, M, A, main, MO, door, doorH, style);
  B.build(group); BI.build(group, { cast: false });
  return { group, A, door, doorH, info };
}

function doorCasing(B, M, wf, h, off, dir) {
  // flat craftsman casing: 0.1 legs, 0.15 head with cap
  const o0 = off, o1 = off + dir * 0.02, c = 0.1;
  const lo = Math.min(o0, o1), hi = Math.max(o0, o1);
  wf.box(B, M.intTrim, h.u0 - c, h.u0, lo, hi, h.z0, h.z1);
  wf.box(B, M.intTrim, h.u1, h.u1 + c, lo, hi, h.z0, h.z1);
  wf.box(B, M.intTrim, h.u0 - c - 0.02, h.u1 + c + 0.02, lo, hi, h.z1, h.z1 + 0.15);
  const o2 = off + dir * 0.035;
  wf.box(B, M.intTrim, h.u0 - c - 0.035, h.u1 + c + 0.035, Math.min(off, o2), Math.max(off, o2), h.z1 + 0.15, h.z1 + 0.18);
}
function baseboards(B, M, wf, u0, u1, off, holes, dir) {
  let cur = u0;
  const hs = holes.slice().sort((a, b) => a.u0 - b.u0);
  const lo = Math.min(off, off + dir * 0.018), hi = Math.max(off, off + dir * 0.018);
  for (const h of hs) { if (h.u0 - 0.1 > cur) wf.box(B, M.intTrim, cur, h.u0 - 0.1, lo, hi, H.FLOOR, H.FLOOR + 0.16); cur = Math.max(cur, h.u1 + 0.1); }
  if (u1 > cur) wf.box(B, M.intTrim, cur, u1, lo, hi, H.FLOOR, H.FLOOR + 0.16);
}
function crown(B, M, wf, u0, u1, off, dir) {
  const a = Math.min(off, off + dir * 0.07), b = Math.max(off, off + dir * 0.07);
  wf.box(B, M.intTrim, u0, u1, a, b, H.CEIL - 0.1, H.CEIL);
}

// ---------------------------------------------------------------------------------------------------------------
function buildAddition(B, BI, M, A, main, MO, door, doorH, style) {
  const { n, t } = A, ov = H.OV, rake = H.RAKE;
  const W2 = (s, c) => { const p = n.clone().multiplyScalar(s).addScaledVector(t, c); return v2(p.x, p.y); };
  const sA = A.sAttach, sO = A.sOut, c0 = A.c0, c1 = A.c1, half = (c1 - c0) / 2;
  // pitch: same as the main roof; for a gable-end tie-in, limit so the wing ridge stays under the main rake soffit
  let p = H.PITCH, sIn, ridgeFrom, valley = null;
  const mainEaveS = A.eaveSide ? (A.n.y > 0 ? H.Y1 + ov : -(H.Y0 - ov)) : null;
  if (A.eaveSide) {
    // ridge must stay at least 0.4 m under the main ridge
    p = Math.min(p, (main.zr - 0.4 - H.ZW) / half);
    const zrw = H.ZW + half * p;
    // where does the wing ridge meet the main roof plane? main plane height = zw + (wall - y)*p along n
    const sMeet = sA - (zrw - H.ZW) / H.PITCH;
    sIn = sMeet - 0.6; ridgeFrom = sMeet;
    valley = { zrw, sMeet };
  } else {
    const ridgeC = (c0 + c1) / 2, zUnder = main.zt(ridgeC) - H.SLAB - 0.08;
    p = Math.min(p, (zUnder - H.ZW) / half);
    sIn = sA - 0.25; ridgeFrom = sA;
  }
  const zrw = H.ZW + half * p;
  const O = V3(0, 0, 0);
  const S = n.clone(), C = t.clone();
  const sFascia0 = A.eaveSide ? mainEaveS : sA + rake + 0.05;
  const WO = { S, C, O, sa: sIn, sb: sO + rake, c0, c1, zw: H.ZW, p, ridgeFrom: ridgeFrom, ridgeTo: sO + rake,
    eaveRanges: { A: [[sFascia0, sO + rake]], B: [[sFascia0, sO + rake]] }, rakeBoards: [false, true],
    spoutAt: { A: [false, true], B: [false, true] } };
  const wing = gableRoof(B, M, WO);
  gableEnd(B, M, wing, WO, sO, 1);
  // valley flashing (eave-side tie-in): from wing/main eave intersection up to where the wing ridge meets the main plane
  if (valley) {
    const ze = H.ZE;
    for (const ce of [c0 - ov, c1 + ov]) {
      const a = wing.W(mainEaveS, ce, ze + 0.012), b = wing.W(valley.sMeet, (c0 + c1) / 2, valley.zrw + 0.012);
      const d = b.clone().sub(a), side = V3(0, 0, 1).cross(d).normalize().multiplyScalar(0.11);
      B.quad(M.flashing, a.clone().add(side), b.clone().add(side), b.clone().sub(side), a.clone().sub(side), null, V3(0, 0, 1));
    }
  }
  // wing soffit (two side strips + outer end handled by gable)
  const zs = H.ZW - ov * p - H.FASCIA;
  const s0f = A.eaveSide ? mainEaveS : sA;
  for (const [ca, cb] of [[c0 - ov, c0], [c1, c1 + ov]]) {
    const q = [W2(s0f, ca), W2(sO, ca), W2(sO, cb), W2(s0f, cb)].map(v => V3(v.x, v.y, zs));
    B.quad(M.soffit, ...q, null, V3(0, 0, -1));
  }
  // walls: two sides + outer end (connect side is the existing wall)
  const T = H.WALL_T, zTop = zs + 0.01;
  const wallsDef = [
    { a: [sA, c0], b: [sO, c0], out: t.clone().negate() },
    { a: [sO, c0], b: [sO, c1], out: n.clone() },
    { a: [sO, c1], b: [sA, c1], out: t.clone() },
  ];
  const interiorHoles = [];
  for (const wd of wallsDef) {
    const a = W2(...wd.a), b = W2(...wd.b), wf = new WallFrame(a, b, v2(wd.out.x, wd.out.y)), L = wf.len;
    const holes = [];
    const isEnd = wd.a[0] === sO && wd.b[0] === sO;
    if (isEnd) { const w = Math.min(1.7, L - 1.2); holes.push({ u0: L / 2 - w / 2, u1: L / 2 + w / 2, z0: 0.8, z1: 2.15 }); }
    else if (L > 2.4) { const um = (wd.a[0] === sA ? 0.55 : 0.45) * L; holes.push({ u0: um - 0.42, u1: um + 0.42, z0: 0.8, z1: 2.15 }); }
    wf.slab(B, M.stucco, null, [[0, H.GRADE], [L, H.GRADE], [L, zTop], [0, zTop]], holes, T, M.stucco);
    // interior face (separate, room colour) from floor to ceiling, inset by wall thickness at both ends
    const wi = new WallFrame(a, b, v2(wd.out.x, wd.out.y));
    const iu0 = wd.a[0] === sA ? 0 : T, iu1 = wd.b[0] === sA ? L : L - T;
    const ih = holes.map(h => ({ ...h, revealMat: M.intWall }));
    const innerQuad = [[iu0, H.FLOOR], [iu1, H.FLOOR], [iu1, H.CEIL], [iu0, H.CEIL]].map(([u, z]) => wi.P(u, -T, z));
    BI.poly(isEnd ? M.intWall : M.intWallSide, innerQuad, { o: wi.P(0, -T, 0), u: wi.T3, v: V3(0, 0, 1) }, wi.N3.negate(), ih.map(h => [[h.u0, h.z0], [h.u1, h.z0], [h.u1, h.z1], [h.u0, h.z1]].map(([u, z]) => wi.P(u, -T, z))));
    wf.box(B, M.foundation, -0.012, L + 0.012, -0.02, 0.012, H.GRADE - 0.02, H.GRADE + 0.28);
    for (const h of holes) windowGroup(B, M, wf, h.u0, h.u1, h.z0, h.z1, T, { inner: true, glass: M.glassClear });
    baseboards(BI, M, wi, iu0, iu1, -T, [], -1);
    crown(BI, M, wi, iu0, iu1, -T, -1);
  }
  // floor + ceiling of the new room
  const f = [W2(sA, c0 + T), W2(sO - T, c0 + T), W2(sO - T, c1 - T), W2(sA, c1 - T)];
  BI.poly(M.floor, f.map(v => V3(v.x, v.y, H.FLOOR + 0.002)), { o: V3(0, 0, 0), u: n.clone().cross(V3(0, 0, 1)).negate().normalize(), v: V3(n.x, n.y, 0) }, V3(0, 0, 1));
  BI.poly(M.intCeil, f.map(v => V3(v.x, v.y, H.CEIL)), { o: V3(0, 0, 0), u: V3(1, 0, 0), v: V3(0, 1, 0) }, V3(0, 0, -1));
  // slab edge / floor framing below grade line hidden by foundation; a lintel infill over the old wall above ceiling
  return { p, zrw, area: ((sO - sA) * (c1 - c0)).toFixed(1) };
}
