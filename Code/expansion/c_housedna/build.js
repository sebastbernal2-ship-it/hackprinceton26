// Geometry builders for the c_housedna viewer (three.js, model frame: x east, y north, z up).
import * as THREE from '../../vendor/three.module.min.js';

// ------------------------------------------------------------------------------------------ procedural textures
function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function sidingTex() {           // lap siding, 8 courses of 0.12 m per tile (0.96 m), greyscale (tinted by colour)
  const r = rng(7);
  return canvasTex(256, 512, (g, w, h) => {
    const n = 8, ch = h / n;
    for (let i = 0; i < n; i++) {
      const y = i * ch;
      const grd = g.createLinearGradient(0, y, 0, y + ch);
      grd.addColorStop(0, '#f4f4f4'); grd.addColorStop(0.82, '#ffffff'); grd.addColorStop(0.9, '#d9d9d9'); grd.addColorStop(1, '#8a8a8a');
      g.fillStyle = grd; g.fillRect(0, y, w, ch);
    }
    for (let k = 0; k < 2500; k++) { g.fillStyle = `rgba(0,0,0,${r() * 0.035})`; g.fillRect(r() * w, r() * h, 1 + r() * 8, 1); }
  });
}
export function grassTex() {
  const r = rng(3);
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#687a45'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 90; k++) { const x = r() * w, y = r() * h, rr = 20 + r() * 70; const gr = g.createRadialGradient(x, y, 0, x, y, rr);
      const c = r() < 0.5 ? '135,140,85' : '80,95,50'; gr.addColorStop(0, `rgba(${c},0.35)`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(x - rr, y - rr, 2 * rr, 2 * rr); }
    for (let k = 0; k < 26000; k++) { const v = r(); g.strokeStyle = v < 0.5 ? `rgba(48,62,30,${0.25 + r() * 0.3})` : `rgba(160,168,110,${0.2 + r() * 0.25})`;
      const x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y - 2 - r() * 4); g.stroke(); }
  });
}
export function concreteTex(base = '#bdb8ae', joints = true) {
  const r = rng(11);
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 9000; k++) { const v = r(); g.fillStyle = v < 0.5 ? `rgba(0,0,0,${r() * 0.07})` : `rgba(255,255,255,${r() * 0.07})`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); }
    for (let k = 0; k < 30; k++) { const x = r() * w, y = r() * h, rr = 30 + r() * 90; const gr = g.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, `rgba(80,70,60,${0.06 * r()})`); gr.addColorStop(1, 'rgba(80,70,60,0)'); g.fillStyle = gr; g.fillRect(x - rr, y - rr, 2 * rr, 2 * rr); }
    if (joints) { g.strokeStyle = 'rgba(60,55,50,0.45)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 1); g.lineTo(w, 1); g.moveTo(1, 0); g.lineTo(1, h); g.stroke(); }
  });
}
export function asphaltTex() {
  const r = rng(5);
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#4a4a4c'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 9000; k++) { g.fillStyle = r() < 0.5 ? `rgba(0,0,0,${r() * 0.2})` : `rgba(200,200,200,${r() * 0.12})`; g.fillRect(r() * w, r() * h, 1, 1); }
  });
}
export function fenceTex() {
  const r = rng(9);
  return canvasTex(256, 256, (g, w, h) => {
    const n = 8, bw = w / n;
    for (let i = 0; i < n; i++) { const t = 0.85 + r() * 0.3; g.fillStyle = `rgb(${150 * t},${112 * t},${78 * t})`; g.fillRect(i * bw, 0, bw, h);
      g.fillStyle = 'rgba(40,25,10,0.5)'; g.fillRect(i * bw, 0, 2, h);
      for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(60,40,20,${r() * 0.15})`; g.fillRect(i * bw + r() * bw, r() * h, 1, 10 + r() * 40); } }
  });
}

// ------------------------------------------------------------------------------------------ mesh accumulation
// A Batch collects quads for one material; quads are given by 4 corners + per-corner uv; winding fixed to `normal`.
export class Batch {
  constructor() { this.pos = []; this.uv = []; this.nor = []; this.idx = []; }
  quad(A, B, C, D, uvs, normal) {
    const ab = new THREE.Vector3().subVectors(B, A), ad = new THREE.Vector3().subVectors(D, A);
    let n = new THREE.Vector3().crossVectors(ab, ad).normalize();
    let pts = [A, B, C, D], tu = uvs;
    if (normal && n.dot(normal) < 0) { pts = [A, D, C, B]; tu = [uvs[0], uvs[3], uvs[2], uvs[1]]; n.negate(); }
    const b = this.pos.length / 3;
    pts.forEach((p, i) => { this.pos.push(p.x, p.y, p.z); this.nor.push(n.x, n.y, n.z); this.uv.push(tu[i][0], tu[i][1]); });
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  tri(A, B, C, uvs) {
    const n = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(B, A), new THREE.Vector3().subVectors(C, A)).normalize();
    const b = this.pos.length / 3;
    [A, B, C].forEach((p, i) => { this.pos.push(p.x, p.y, p.z); this.nor.push(n.x, n.y, n.z); this.uv.push(uvs[i][0], uvs[i][1]); });
    this.idx.push(b, b + 1, b + 2);
  }
  mesh(mat, shadows = true) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    const m = new THREE.Mesh(g, mat); m.castShadow = shadows; m.receiveShadow = true;
    return m;
  }
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// A planar wall face along a 2D line: base point O, unit dir u, the face plane is offset by `off` along normal n
// (n = desired facing). s in [sa,sb], z in [za,zb], minus rectangular holes {s0,s1,z0,z1}. UV in metres / (su,sv).
export function wallFace(batch, O, u, n, off, sa, sb, za, zb, holes = [], su = 1, sv = 1) {
  const P = (s, z) => V(O[0] + u[0] * s + n[0] * off, O[1] + u[1] * s + n[1] * off, z);
  const N3 = V(n[0], n[1], 0);
  const xs = [sa, sb];
  holes.forEach(h => { if (h.s0 > sa && h.s0 < sb) xs.push(h.s0); if (h.s1 > sa && h.s1 < sb) xs.push(h.s1); });
  xs.sort((a, b) => a - b);
  for (let i = 0; i < xs.length - 1; i++) {
    const c0 = xs[i], c1 = xs[i + 1]; if (c1 - c0 < 1e-4) continue;
    const cm = (c0 + c1) / 2;
    const hs = holes.filter(h => h.s0 <= cm && h.s1 >= cm).map(h => [Math.max(h.z0, za), Math.min(h.z1, zb)]).sort((a, b) => a[0] - b[0]);
    let z = za;
    const spans = [];
    hs.forEach(([h0, h1]) => { if (h0 > z) spans.push([z, h0]); z = Math.max(z, h1); });
    if (z < zb) spans.push([z, zb]);
    spans.forEach(([z0, z1]) => batch.quad(P(c0, z0), P(c1, z0), P(c1, z1), P(c0, z1),
      [[c0 / su, z0 / sv], [c1 / su, z0 / sv], [c1 / su, z1 / sv], [c0 / su, z1 / sv]], N3));
  }
}

// Local frame for trim boxes along a wall: x = along u, y = along n (outward), z up; origin O (2D, on centreline)
export function wallFrame(O, u) {
  const g = new THREE.Group();
  g.position.set(O[0], O[1], 0);
  g.rotation.z = Math.atan2(u[1], u[0]);
  // local +y = left of u. We want local y = n; caller passes sign
  return g;
}
export function box(parent, mat, x0, x1, y0, y1, z0, z1, cast = true) {
  const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
  const m = new THREE.Mesh(g, mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.castShadow = cast; m.receiveShadow = true;
  parent.add(m); return m;
}

// ------------------------------------------------------------------------------------------ windows & doors
// Double-hung craftsman window in a wall frame group (local x along wall, local y towards `outside`, sign ns=+1/-1
// maps "outward" to local +y or -y). t = wall thickness. Builds: casings (outside, optionally inside), jamb returns,
// sill, two sashes with glass; upper sash has `lites` vertical lites.
export function craftsmanWindow(G, M, s0, s1, sill, head, t, opt = {}) {
  const ns = opt.ns || 1, cw = opt.casing || 0.1, lites = opt.lites || 3;
  const Y = d => d * ns;                                 // local y from "outward distance from centreline"
  const by = (a, b) => [Math.min(Y(a), Y(b)), Math.max(Y(a), Y(b))];
  const B = (x0, x1, d0, d1, z0, z1, mat, cast = true) => { const [y0, y1] = by(d0, d1); return box(G, mat, x0, x1, y0, y1, z0, z1, cast); };
  const out = t / 2;
  // exterior casing
  B(s0 - cw, s0, out, out + 0.022, sill, head, M.trim);
  B(s1, s1 + cw, out, out + 0.022, sill, head, M.trim);
  B(s0 - cw - 0.015, s1 + cw + 0.015, out, out + 0.026, head, head + cw + 0.04, M.trim);
  B(s0 - cw - 0.035, s1 + cw + 0.035, out, out + 0.05, head + cw + 0.04, head + cw + 0.07, M.trim);   // drip cap
  B(s0 - cw - 0.03, s1 + cw + 0.03, -out + (opt.hole ? 0.04 : out * 2 - 0.01), out + 0.055, sill - 0.045, sill, M.trim);  // sill
  if (opt.hole) {
    // jamb returns through the wall
    B(s0, s0 + 0.02, -out, out, sill, head, M.trim); B(s1 - 0.02, s1, -out, out, sill, head, M.trim);
    B(s0, s1, -out, out, head - 0.02, head, M.trim);
  }
  // sashes: lower (inner track) and upper (outer track) at the outside half of the jamb
  const zm = (sill + head) / 2, fr = 0.055, d0 = opt.hole ? 0.0 : out + 0.004;
  const sash = (z0, z1, dd, nl) => {
    const dA = d0 + dd, dB = d0 + dd + 0.035;
    B(s0, s0 + fr, dA, dB, z0, z1, M.sash); B(s1 - fr, s1, dA, dB, z0, z1, M.sash);
    B(s0, s1, dA, dB, z0, z0 + fr * (z0 < zm ? 1.6 : 1), M.sash); B(s0, s1, dA, dB, z1 - fr * 0.8, z1, M.sash);
    for (let i = 1; i < nl; i++) { const x = s0 + (s1 - s0) * i / nl; B(x - 0.012, x + 0.012, dA + 0.005, dB - 0.005, z0, z1, M.sash); }
    const [y0, y1] = by(dA + 0.016, dA + 0.02);
    box(G, M.glass, s0 + fr, s1 - fr, y0, y1, z0 + fr, z1 - fr * 0.8, false);
  };
  sash(sill + 0.005, zm + 0.02, opt.hole ? -0.035 : 0.0, 1);
  sash(zm - 0.02, head - 0.005, opt.hole ? 0.005 : 0.006, lites);
  if (opt.interior) {
    const inn = -out;
    B(s0 - cw, s0, inn - 0.02, inn, sill, head, M.trimIn);
    B(s1, s1 + cw, inn - 0.02, inn, sill, head, M.trimIn);
    B(s0 - cw - 0.015, s1 + cw + 0.015, inn - 0.024, inn, head, head + cw + 0.03, M.trimIn);
    B(s0 - cw - 0.03, s1 + cw + 0.03, inn - 0.045, inn, head + cw + 0.03, head + cw + 0.055, M.trimIn);
    B(s0 - cw - 0.03, s1 + cw + 0.03, inn - 0.06, inn + 0.04, sill - 0.03, sill, M.trimIn);          // stool
    B(s0 - cw, s1 + cw, inn - 0.018, inn, sill - 0.03 - 0.09, sill - 0.03, M.trimIn);                // apron
  }
}

// 5-panel craftsman door leaf, hinge at local x=0, opening along +x, thickness along y, standing on z=0
export function doorLeaf(mat, panelMat, knobMat, w, h) {
  const g = new THREE.Group();
  box(g, mat, 0, w, -0.0175, 0.0175, 0.005, h);
  const st = 0.12, top = 0.13, bot = 0.25, n = 5, gap = 0.06;
  const ph = (h - top - bot - gap * (n - 1)) / n;
  for (let i = 0; i < n; i++) {
    const z0 = bot + i * (ph + gap);
    for (const s of [-1, 1]) box(g, panelMat, st, w - st, s * 0.0175 - 0.004, s * 0.0175 + 0.004, z0, z0 + ph, false);
  }
  for (const s of [-1, 1]) { const k = new THREE.Mesh(new THREE.SphereGeometry(0.028, 16, 12), knobMat); k.position.set(w - 0.07, s * 0.05, 0.92); g.add(k); }
  return g;
}

// ------------------------------------------------------------------------------------------ roofs
// Hip roof solid over rect R (already including overhang): eave z, slope k. Returns {roof: Batch faces, soffit}
export function hipRoof(bRoof, bSoffit, R, eave, k, su = 1.7, sv = 0.85) {
  const W = R.x1 - R.x0, D = R.y1 - R.y0, h = Math.min(W, D) / 2 * k;
  const zt = eave + h;
  let P;
  if (W >= D) {            // ridge along x
    const yr = (R.y0 + R.y1) / 2, xa = R.x0 + D / 2, xb = R.x1 - D / 2;
    P = { r0: V(xa, yr, zt), r1: V(xb, yr, zt) };
  } else {
    const xr = (R.x0 + R.x1) / 2, ya = R.y0 + W / 2, yb = R.y1 - W / 2;
    P = { r0: V(xr, ya, zt), r1: V(xr, yb, zt) };
  }
  const c00 = V(R.x0, R.y0, eave), c10 = V(R.x1, R.y0, eave), c11 = V(R.x1, R.y1, eave), c01 = V(R.x0, R.y1, eave);
  const slope = Math.sqrt(1 + k * k);
  // each face: eave edge (A->B) + top points; uv: u along eave, v = distance up the slope
  const face = (A, Bp, tops, nrm) => {
    const e = new THREE.Vector3().subVectors(Bp, A); const L = e.length(); e.normalize();
    const uvOf = p => { const d = new THREE.Vector3().subVectors(p, A); const hz = p.z - eave; return [d.dot(e) / su, hz * slope / k / sv]; };
    if (tops.length === 2) bRoof.quad(A, Bp, tops[1], tops[0], [uvOf(A), uvOf(Bp), uvOf(tops[1]), uvOf(tops[0])], nrm);
    else bRoof.tri(A, Bp, tops[0], [uvOf(A), uvOf(Bp), uvOf(tops[0])]);
  };
  const up = V(0, 0, 1);
  if (W >= D) {
    face(c00, c10, [P.r0, P.r1], V(0, -1, 1)); face(c11, c01, [P.r1, P.r0], V(0, 1, 1));
    face(c10, c11, [P.r1], null); face(c01, c00, [P.r0], null);
  } else {
    face(c10, c11, [P.r0, P.r1], V(1, 0, 1)); face(c01, c00, [P.r1, P.r0], V(-1, 0, 1));
    face(c11, c01, [P.r1], null); face(c00, c10, [P.r0], null);
  }
  bSoffit.quad(c00, c01, c11, c10, [[R.x0, R.y0], [R.x0, R.y1], [R.x1, R.y1], [R.x1, R.y0]], V(0, 0, -1));
  return zt;
}
export function roofHeightAt(rects, eave, k, x, y) {
  let best = -Infinity;
  for (const R of rects) {
    if (x < R.x0 || x > R.x1 || y < R.y0 || y > R.y1) continue;
    best = Math.max(best, eave + k * Math.min(x - R.x0, R.x1 - x, y - R.y0, R.y1 - y));
  }
  return best;
}
// fascia + gutter along the outline of a union of rects: rect edges, minus pieces inside other rects
export function fasciaAndGutter(parent, M, rects, eave, depth) {
  const inside = (x, y, skip) => rects.some((R, i) => i !== skip && x > R.x0 + 1e-3 && x < R.x1 - 1e-3 && y > R.y0 + 1e-3 && y < R.y1 - 1e-3);
  rects.forEach((R, ri) => {
    const edges = [[[R.x0, R.y0], [R.x1, R.y0], [0, -1]], [[R.x1, R.y0], [R.x1, R.y1], [1, 0]], [[R.x1, R.y1], [R.x0, R.y1], [0, 1]], [[R.x0, R.y1], [R.x0, R.y0], [-1, 0]]];
    edges.forEach(([a, b, n]) => {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      const step = 0.05; let s = 0, start = null;
      const flush = (s1) => {
        if (start === null) return; const s0 = start; start = null; if (s1 - s0 < 0.04) return;
        const G = new THREE.Group(); G.position.set(a[0], a[1], 0); G.rotation.z = Math.atan2(u[1], u[0]); parent.add(G);
        // local y = left of u; outward n: for CCW-ish traversal of rect edges above, outward is right of u => -y
        box(G, M.fascia, s0, s1, -0.03, 0.0, eave - depth, eave + 0.01);
        box(G, M.gutter, s0, s1, -0.15, -0.03, eave - depth + 0.02, eave - depth + 0.13);
      };
      for (; s <= L + 1e-6; s += step) {
        const p = [a[0] + u[0] * s + n[0] * 0.02, a[1] + u[1] * s + n[1] * 0.02];
        const hid = inside(p[0] - n[0] * 0.04, p[1] - n[1] * 0.04, ri) || inside(p[0], p[1], ri);
        if (!hid && start === null) start = s;
        if (hid && start !== null) flush(s);
      }
      flush(L);
    });
  });
}

export function mulchTex() {
  const r = rng(21);
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#4a3527'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 7000; k++) { const t = r(); g.fillStyle = t < 0.4 ? `rgba(25,15,8,${0.5 * r()})` : `rgba(140,100,65,${0.5 * r()})`; g.save(); g.translate(r() * w, r() * h); g.rotate(r() * 3.14); g.fillRect(0, 0, 2 + r() * 6, 1 + r() * 2); g.restore(); }
  });
}
export function offsetPoly(poly, d) {      // CCW rectilinear polygon offset (outward d>0)
  const n = poly.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = poly[(i - 1 + n) % n], p1 = poly[i], p2 = poly[(i + 1) % n];
    const e1 = norm2([p1[0] - p0[0], p1[1] - p0[1]]), e2 = norm2([p2[0] - p1[0], p2[1] - p1[1]]);
    const n1 = [e1[1], -e1[0]], n2 = [e2[1], -e2[0]];
    const a1 = [p0[0] + n1[0] * d, p0[1] + n1[1] * d], a2 = [p1[0] + n2[0] * d, p1[1] + n2[1] * d];
    const det = e1[0] * -e2[1] - -e2[0] * e1[1];
    if (Math.abs(det) < 1e-9) { out.push([p1[0] + n1[0] * d, p1[1] + n1[1] * d]); continue; }
    const bx = a2[0] - a1[0], by = a2[1] - a1[1];
    const t = (bx * -e2[1] - -e2[0] * by) / det;
    out.push([a1[0] + e1[0] * t, a1[1] + e1[1] * t]);
  }
  return out;
}
function norm2(v) { const l = Math.hypot(v[0], v[1]); return [v[0] / l, v[1] / l]; }
export function flatPoly(poly, z, mat, rep) {
  const sh = new THREE.Shape(poly.map(p => new THREE.Vector2(p[0], p[1])));
  const g = new THREE.ShapeGeometry(sh);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) { uv.setXY(i, p.getX(i) / rep, p.getY(i) / rep); p.setZ(i, z); }
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; return m;
}
