// b_scanreuse viewer: existing house = real MatterPak scan mesh; addition + exterior assembled from textures that were
// cut out of the same scan / the Matterport photos / the drone photos (see build_assets.py).
import * as THREE from '../../vendor/three.module.min.js';

const A = './assets/';
const P = new URLSearchParams(location.search);
const VIEW = P.get('view');
let CASE = P.get('case') || 'main';
const HEADLESS = !!VIEW;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(HEADLESS ? 1 : Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.localClippingEnabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const persp = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.05, 1200);
persp.up.set(0, 0, 1);
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
ortho.up.set(0, 1, 0);
let camera = persp;

// ------------------------------------------------------------------------------------------------ loading
const texLoader = new THREE.TextureLoader();
function tex(name, { srgb = true, repeat = true } = {}) {
  return new Promise((res, rej) => texLoader.load(name, t => {
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    t.anisotropy = 8;
    res(t);
  }, undefined, rej));
}
const [H, test, scanJ, scanBin] = await Promise.all([
  fetch(A + 'house.json').then(r => r.json()),
  fetch('../test_case.json').then(r => r.json()),
  fetch(A + 'scan.json').then(r => r.json()),
  fetch(A + 'scan.bin').then(r => r.arrayBuffer()),
]);
const TX = H.tex;
const names = ['floor_oak.jpg', 'wall_field.jpg', 'ceiling.jpg', 'floor_vent.jpg', 'window_int.png', 'door_casing.png',
  'baseboard.jpg', 'crown.jpg', 'shingles.jpg', 'concrete.jpg', 'gravel.jpg', 'siding.jpg', 'window_sash.jpg', 'lawn.jpg', 'asphalt.jpg', 'siding_gray.jpg'];
const T = {};
await Promise.all(names.map(n => tex(A + n).then(t => T[n.split('.')[0]] = t)));
for (const k of ['window_int', 'door_casing', 'floor_vent', 'window_sash']) { T[k].wrapS = T[k].wrapT = THREE.ClampToEdgeWrapping; }

// ------------------------------------------------------------------------------------------------ materials
const rgb = a => new THREE.Color(a[0] / 255, a[1] / 255, a[2] / 255);
const basic = (map, extra = {}) => new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide, vertexColors: true, ...extra });
const std = (o) => new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.9, metalness: 0, ...o });
const M = {
  // interior, unlit like the scan (its texture already holds the real lighting)
  floor: basic(T.floor_oak), wall: basic(T.wall_field), ceil: basic(null, { color: rgb(TX.ceiling_mean).multiplyScalar(1.12) }), base: basic(T.baseboard),
  crown: basic(T.crown), jamb: basic(null, { color: rgb(TX.casing_mean).multiplyScalar(0.93) }),
  winInt: basic(T.window_int, { transparent: true, alphaTest: 0.02, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  doorInt: basic(T.door_casing, { transparent: true, alphaTest: 0.05, polygonOffset: true, polygonOffsetFactor: -2 }),
  vent: basic(T.floor_vent, { polygonOffset: true, polygonOffsetFactor: -2 }),
  // exterior, lit
  siding: std({ map: T.siding, roughness: 0.85 }),
  trim: std({ color: 0xf2f0ea, roughness: 0.7 }),
  fascia: std({ color: 0xece9e2, roughness: 0.7 }),
  gutter: std({ color: 0x8a7a66, roughness: 0.6 }),
  soffit: std({ color: 0xe6e3dc, roughness: 0.9 }),
  roof: std({ map: T.shingles, roughness: 0.95, color: 0x8c8c8c }),
  ridge: std({ map: T.shingles, roughness: 0.95, color: 0x7a7a7a }),
  sash: std({ map: T.window_sash, color: 0x6c7680, roughness: 0.15, metalness: 0.1 }),
  found: std({ map: T.concrete, color: 0x9a968e, roughness: 0.95 }),
  concrete: std({ map: T.concrete, roughness: 0.95 }),
  gravel: std({ map: T.gravel, roughness: 1, color: 0xd8d0c4 }),
  lawn: std({ map: T.lawn, roughness: 1, vertexColors: true }),
  street: std({ roughness: 0.95, map: T.asphalt }),
  fence: std({ color: 0x9a7b5c, roughness: 0.95 }),
  picket: std({ color: 0xeeeeea, roughness: 0.8 }),
  ventExt: std({ color: 0x3c4046, roughness: 0.8 }),
  door: std({ color: 0xd8b04a, roughness: 0.6 }),
  glassDark: std({ color: 0x202830, roughness: 0.2 }),
};

// ------------------------------------------------------------------------------------------------ geometry builder
class B {
  constructor(mat, tw = 1, th = 1, opt = {}) { Object.assign(this, { mat, tw, th, p: [], uv: [], c: [], i: [], ao: opt.ao || null, cast: opt.cast ?? true, recv: opt.recv ?? true }); }
  v(x, y, z, u, w) {
    this.p.push(x, y, z); this.uv.push(u / this.tw, w / this.th);
    const f = this.ao ? this.ao(x, y, z) : 1; this.c.push(f, f, f); return this.p.length / 3 - 1;
  }
  quad(P0, P1, P2, P3, uv0, uv1, uv2, uv3) {
    const a = this.v(...P0, ...uv0), b = this.v(...P1, ...uv1), c = this.v(...P2, ...uv2), d = this.v(...P3, ...uv3);
    this.i.push(a, b, c, a, c, d);
  }
  tri(P0, P1, P2, uv0, uv1, uv2) { const a = this.v(...P0, ...uv0), b = this.v(...P1, ...uv1), c = this.v(...P2, ...uv2); this.i.push(a, b, c); }
  mesh() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i); g.computeVertexNormals();
    const m = new THREE.Mesh(g, this.mat); m.castShadow = this.cast; m.receiveShadow = this.recv; return m;
  }
}
const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len2 = a => Math.hypot(a[0], a[1]);

/** vertical rectangle on the line a->b (2D), shifted by off along n, from z0..z1, with rectangular holes
 * holes: [t0,t1,z0,z1] in wall coords (t along a->b). uv: u=t+u0, v=z-v0 (metres, builder divides by tile). */
function wall(bld, a, b, n, off, z0, z1, holes = [], { u0 = 0, v0 = 0, step = 0 } = {}) {
  const L = len2(sub2(b, a)), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  const ts = new Set([0, L]), zs = new Set([z0, z1]);
  for (const h of holes) { ts.add(Math.max(0, Math.min(L, h[0]))); ts.add(Math.max(0, Math.min(L, h[1]))); zs.add(Math.max(z0, Math.min(z1, h[2]))); zs.add(Math.max(z0, Math.min(z1, h[3]))); }
  let T_ = [...ts].sort((x, y) => x - y), Z_ = [...zs].sort((x, y) => x - y);
  if (step) { // subdivide for vertex AO
    const ref = (arr) => { const o = []; for (let k = 0; k < arr.length - 1; k++) { const n_ = Math.max(1, Math.ceil((arr[k + 1] - arr[k]) / step)); for (let j = 0; j < n_; j++) o.push(arr[k] + (arr[k + 1] - arr[k]) * j / n_); } o.push(arr[arr.length - 1]); return o; };
    T_ = ref(T_); Z_ = ref(Z_);
  }
  const pt = (t, z) => [a[0] + u[0] * t + n[0] * off, a[1] + u[1] * t + n[1] * off, z];
  for (let i = 0; i < T_.length - 1; i++) for (let j = 0; j < Z_.length - 1; j++) {
    const tc = (T_[i] + T_[i + 1]) / 2, zc = (Z_[j] + Z_[j + 1]) / 2;
    if (holes.some(h => tc > h[0] && tc < h[1] && zc > h[2] && zc < h[3])) continue;
    const t0 = T_[i], t1 = T_[i + 1], za = Z_[j], zb = Z_[j + 1];
    bld.quad(pt(t0, za), pt(t1, za), pt(t1, zb), pt(t0, zb), [t0 + u0, za - v0], [t1 + u0, za - v0], [t1 + u0, zb - v0], [t0 + u0, zb - v0]);
  }
}
/** textured decal rectangle (full texture) centred at t on the face */
function decal(bld, a, b, n, off, t0, t1, z0, z1) {
  const L = len2(sub2(b, a)), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  const pt = (t, z) => [a[0] + u[0] * t + n[0] * off, a[1] + u[1] * t + n[1] * off, z];
  // texture must not be mirrored when seen from n side: u axis should be "right" when looking against n
  const right = [-n[1], n[0]]; const flip = (u[0] * right[0] + u[1] * right[1]) < 0;
  const ua = flip ? 1 : 0, ub = flip ? 0 : 1;
  bld.quad(pt(t0, z0), pt(t1, z0), pt(t1, z1), pt(t0, z1), [ua, 0], [ub, 0], [ub, 1], [ua, 1]);
}
function box(bld, cx, cy, cz, sx, sy, sz) {
  const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
  const f = (p0, p1, p2, p3, w, h) => bld.quad(p0, p1, p2, p3, [0, 0], [w, 0], [w, h], [0, h]);
  f([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], sx, sz); f([x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], sx, sz);
  f([x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], sy, sz); f([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], sy, sz);
  f([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], sx, sy); f([x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [x0, y0, z0], sx, sy);
}
// oriented box along a wall direction u (2D) with normal n
function wbox(bld, c2, u, n, z0, z1, len, depth) {
  const p = (s, d, z) => [c2[0] + u[0] * s + n[0] * d, c2[1] + u[1] * s + n[1] * d, z];
  const s0 = -len / 2, s1 = len / 2, d0 = 0, d1 = depth;
  const f = (A_, B_, C_, D_, w, h) => bld.quad(A_, B_, C_, D_, [0, 0], [w, 0], [w, h], [0, h]);
  f(p(s0, d1, z0), p(s1, d1, z0), p(s1, d1, z1), p(s0, d1, z1), len, z1 - z0);
  f(p(s0, d0, z0), p(s0, d1, z0), p(s0, d1, z1), p(s0, d0, z1), depth, z1 - z0);
  f(p(s1, d1, z0), p(s1, d0, z0), p(s1, d0, z1), p(s1, d1, z1), depth, z1 - z0);
  f(p(s0, d0, z1), p(s0, d1, z1), p(s1, d1, z1), p(s1, d0, z1), len, depth);
  f(p(s0, d1, z0), p(s0, d0, z0), p(s1, d0, z0), p(s1, d1, z0), len, depth);
}

// ------------------------------------------------------------------------------------------------ constants
const FZ = 0.0, CZ = H.ceiling_z, PZ = H.plate_z, GZ = H.ground_z, HW = H.wall_half, EO = H.ext_offset;
const PITCH = H.pitch, OH = H.overhang;
const ZE = PZ + 0.12 - PITCH * OH;          // roof plane height at the eave edge
const FASCIA = 0.2;
const WIN = TX.window, DOOR = TX.door;

// ------------------------------------------------------------------------------------------------ scan mesh
const scanGroups = [];
const scanRoot = new THREE.Group(); scene.add(scanRoot);
{
  const loaders = scanJ.groups.map(g => tex(g.tex, { repeat: false }));
  const txs = await Promise.all(loaders);
  scanJ.groups.forEach((g, k) => {
    const pos = new Float32Array(scanBin, g.pos, g.nv * 3), uv = new Float32Array(scanBin, g.uv, g.nv * 2), idx = new Uint32Array(scanBin, g.idx, g.ni);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx.slice(), 1));
    txs[k].flipY = true;
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: txs[k], side: THREE.DoubleSide }));
    m.receiveShadow = false; m.castShadow = true;
    scanRoot.add(m); scanGroups.push({ m, pos, idx });
  });
}
function cutScan(boxes) { // boxes: {c:[x,y], u, n, t0,t1, d0,d1, z0,z1}
  window.DBG = { boxes, removed: 0 };
  for (const g of scanGroups) {
    const { pos, idx } = g; const out = [];
    for (let k = 0; k < idx.length; k += 3) {
      const a = idx[k] * 3, b = idx[k + 1] * 3, c = idx[k + 2] * 3;
      const x = (pos[a] + pos[b] + pos[c]) / 3, y = (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3, z = (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3;
      let cut = false;
      for (const B_ of boxes) {
        const dx = x - B_.c[0], dy = y - B_.c[1];
        const t = dx * B_.u[0] + dy * B_.u[1], d = dx * B_.n[0] + dy * B_.n[1];
        if (t > B_.t0 && t < B_.t1 && d > B_.d0 && d < B_.d1 && z > B_.z0 && z < B_.z1) { cut = true; break; }
      }
      if (!cut) out.push(idx[k], idx[k + 1], idx[k + 2]);
    }
    window.DBG.removed += idx.length / 3 - out.length / 3;
    g.m.geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(out), 1));
  }
}


/** pick the doorway position on the shared wall: nearest to the span centre where the existing room has no
 * furniture against the wall (scan triangles 0.14-0.9 m in front of the wall, 0.25-1.3 m high) */
function chooseDoor(span, horiz, sharedLine, out, w) {
  const bins = new Map(), BS = 0.05;
  for (const g of scanGroups) {
    const { pos, idx } = g;
    for (let k = 0; k < idx.length; k += 3) {
      const a = idx[k] * 3, b = idx[k + 1] * 3, c = idx[k + 2] * 3;
      const z = (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3; if (z < 0.25 || z > 1.3) continue;
      const x = (pos[a] + pos[b] + pos[c]) / 3, y = (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3;
      const d = horiz ? (sharedLine - y) * out[1] : (sharedLine - x) * out[0];
      if (d < 0.14 || d > 0.9) continue;
      const s = horiz ? x : y; if (s < span[0] - 1 || s > span[1] + 1) continue;
      // mark the triangle's whole extent along the wall (big flat furniture tops have few, large triangles)
      const o = horiz ? 0 : 1;
      const lo = Math.min(pos[a + o], pos[b + o], pos[c + o]), hi = Math.max(pos[a + o], pos[b + o], pos[c + o]);
      for (let kb = Math.floor(lo / BS); kb <= Math.floor(hi / BS); kb++) bins.set(kb, (bins.get(kb) || 0) + 1);
    }
  }
  const mid = (span[0] + span[1]) / 2, half = w / 2 + 0.17;
  let best = null;
  for (let c = span[0] + half + 0.05; c <= span[1] - half - 0.05; c += 0.05) {
    let occ = 0; for (let s = c - half; s < c + half; s += BS) occ += (bins.get(Math.floor(s / BS)) || 0) > 6 ? 1 : 0;
    const score = occ * 10 + Math.abs(c - mid);
    if (!best || score < best.score) best = { c, score, occ };
  }
  return best ? best.c : mid;
}

// ------------------------------------------------------------------------------------------------ roof pieces
/** analytic height of a hip/gable piece at (x,y): ZE + pitch * distance to the nearest eave (-inf outside) */
function roofZ(pc, x, y) {
  const [x0, y0, x1, y1] = pc.rect, e = EO + OH;
  const s = pc.axis === 'x' ? x : y, w = pc.axis === 'x' ? y : x;
  const S0 = (pc.axis === 'x' ? x0 : y0) - e, S1 = (pc.axis === 'x' ? x1 : y1) + e, W0 = (pc.axis === 'x' ? y0 : x0) - e, W1 = (pc.axis === 'x' ? y1 : x1) + e;
  if (s < S0 || s > S1 || w < W0 || w > W1) return -1e9;
  let d = Math.min(w - W0, W1 - w);
  if (pc.ends[0] === 'hip') d = Math.min(d, s - S0);
  if (pc.ends[1] === 'hip') d = Math.min(d, S1 - s);
  return ZE + PITCH * d;
}
function roofPiece(G, pc, opts = {}) {
  const [x0, y0, x1, y1] = pc.rect, e = EO + OH;
  const ax = pc.axis;
  // work in a local frame: s along ridge, w across. map back to xy.
  const S0 = (ax === 'x' ? x0 : y0) - e, S1 = (ax === 'x' ? x1 : y1) + e;
  const W0 = (ax === 'x' ? y0 : x0) - e, W1 = (ax === 'x' ? y1 : x1) + e;
  const xy = (s, w) => ax === 'x' ? [s, w] : [w, s];
  const P3 = (s, w, z) => { const q = xy(s, w); return [q[0], q[1], z]; };
  const hw = (W1 - W0) / 2, wm = (W0 + W1) / 2, zr = ZE + PITCH * hw;
  let sa = pc.ends[0] === 'hip' ? S0 + hw : S0, sb = pc.ends[1] === 'hip' ? S1 - hw : S1;
  if (sa > sb) { sa = sb = (S0 + S1) / 2; }
  const slope = Math.sqrt(1 + PITCH * PITCH);
  const R = G.roof;
  // long planes: uv u = s, v = slope distance from eave
  R.quad(P3(S0, W0, ZE), P3(S1, W0, ZE), P3(sb, wm, zr), P3(sa, wm, zr), [S0, 0], [S1, 0], [sb, hw * slope], [sa, hw * slope]);
  R.quad(P3(S1, W1, ZE), P3(S0, W1, ZE), P3(sa, wm, zr), P3(sb, wm, zr), [-S1, 0], [-S0, 0], [-sa, hw * slope], [-sb, hw * slope]);
  // hip ends
  if (pc.ends[0] === 'hip') R.tri(P3(S0, W1, ZE), P3(S0, W0, ZE), P3(sa, wm, zr), [-W1, 0], [-W0, 0], [-wm, (sa - S0) * slope]);
  if (pc.ends[1] === 'hip') R.tri(P3(S1, W0, ZE), P3(S1, W1, ZE), P3(sb, wm, zr), [W0, 0], [W1, 0], [wm, (S1 - sb) * slope]);
  // ridge cap + hip caps (slightly raised strips)
  const others = (opts.all || []).filter(o => o !== pc);
  const capSeg = (p, q) => {
    const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]]; const L = Math.hypot(...d); if (L < 0.02) return;
    const side = new THREE.Vector3(d[0], d[1], d[2]).cross(new THREE.Vector3(0, 0, 1)).normalize().multiplyScalar(0.13);
    const up = 0.03;
    G.ridge.quad([p[0] - side.x, p[1] - side.y, p[2] + up - 0.04], [q[0] - side.x, q[1] - side.y, q[2] + up - 0.04], [q[0], q[1], q[2] + up], [p[0], p[1], p[2] + up], [0, 0], [L, 0], [L, 0.15], [0, 0.15]);
    G.ridge.quad([p[0], p[1], p[2] + up], [q[0], q[1], q[2] + up], [q[0] + side.x, q[1] + side.y, q[2] + up - 0.04], [p[0] + side.x, p[1] + side.y, p[2] + up - 0.04], [0, 0], [L, 0], [L, 0.15], [0, 0.15]);
  };
  // caps only where this piece is the top surface (pieces overlap; union of hip roofs = max of heights)
  const cap = (p, q) => {
    const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 0.15));
    let run = null;
    for (let k = 0; k <= n; k++) {
      const f = k / n, pt = [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f];
      const top = others.every(o => roofZ(o, pt[0], pt[1]) < pt[2] - 0.04);  // coplanar overlap = no crease
      if (top && !run) run = pt;
      if ((!top || k === n) && run) { capSeg(run, pt); run = null; }
    }
  };
  cap(P3(sa, wm, zr), P3(sb, wm, zr));
  if (pc.ends[0] === 'hip') { cap(P3(S0, W0, ZE), P3(sa, wm, zr)); cap(P3(S0, W1, ZE), P3(sa, wm, zr)); }
  if (pc.ends[1] === 'hip') { cap(P3(S1, W0, ZE), P3(sb, wm, zr)); cap(P3(S1, W1, ZE), P3(sb, wm, zr)); }
  // fascia + gutter along eaves, soffit to the wall face
  const fasc = (pA, pB) => {
    G.fascia.quad([pA[0], pA[1], ZE - FASCIA], [pB[0], pB[1], ZE - FASCIA], [pB[0], pB[1], ZE + 0.01], [pA[0], pA[1], ZE + 0.01], [0, 0], [1, 0], [1, 1], [0, 1]);
  };
  const Ws0 = W0 + OH, Ws1 = W1 - OH, Ss0 = S0 + OH, Ss1 = S1 - OH;  // wall-face lines
  fasc(xy(S0, W0), xy(S1, W0)); fasc(xy(S1, W1), xy(S0, W1));
  const soff = (a, b, c, d) => G.soffit.quad([...a, ZE - FASCIA], [...b, ZE - FASCIA], [...c, ZE - FASCIA], [...d, ZE - FASCIA], [0, 0], [1, 0], [1, 1], [0, 1]);
  soff(xy(S0, W0), xy(S1, W0), xy(S1, Ws0), xy(S0, Ws0));
  soff(xy(S1, W1), xy(S0, W1), xy(S0, Ws1), xy(S1, Ws1));
  const endStuff = (k, Se, Sw, dir) => {
    if (pc.ends[k] === 'hip') {
      fasc(xy(Se, W1), xy(Se, W0)); soff(xy(Se, W0), xy(Se, W1), xy(Sw, W1), xy(Sw, W0));
    } else {
      // gable: triangle wall (siding) at the wall face, bargeboards on the rake, vent, frieze
      const zw = (w) => ZE + PITCH * Math.min(w - W0, W1 - w);
      const zwall = zw(Ws0);
      const nOut = dir; // +1 or -1 along s
      const pts = [];
      G.siding.quad(P3(Sw, Ws0, PZ - 0.3), P3(Sw, Ws1, PZ - 0.3), P3(Sw, Ws1, zwall), P3(Sw, Ws0, zwall), [Ws0, PZ - 0.3], [Ws1, PZ - 0.3], [Ws1, zwall], [Ws0, zwall]);
      G.siding.tri(P3(Sw, Ws0, zwall), P3(Sw, Ws1, zwall), P3(Sw, wm, zr - 0.02), [Ws0, zwall], [Ws1, zwall], [wm, zr]);
      // rake soffit (underside of the overhang) and bargeboards
      for (const [wa, wb] of [[W0, wm], [W1, wm]]) {
        const za = zw(wa), zb = zr;
        G.fascia.quad(P3(Se, wa, za - FASCIA), P3(Se, wb, zb - FASCIA), P3(Se, wb, zb + 0.02), P3(Se, wa, za + 0.02), [0, 0], [1, 0], [1, 1], [0, 1]);
        G.soffit.quad(P3(Se, wa, za - FASCIA), P3(Sw, wa, za - FASCIA), P3(Sw, wb, zb - FASCIA), P3(Se, wb, zb - FASCIA), [0, 0], [1, 0], [1, 1], [0, 1]);
      }
      // frieze board across the gable base + louvered vent near the apex
      const c2 = xy(Sw, wm), uu = ax === 'x' ? [0, 1] : [1, 0], nn = ax === 'x' ? [nOut, 0] : [0, nOut];
      wbox(G.trim, c2, uu, nn, PZ - 0.32, PZ - 0.1, Ws1 - Ws0 + 0.1, 0.04);
      const vh = Math.min(0.5, (zr - zwall) * 0.4);
      if (vh > 0.15) {
        const zc = zwall + (zr - zwall) * 0.45;
        wbox(G.trim, c2, uu, nn, zc - vh / 2 - 0.05, zc + vh / 2 + 0.05, vh * 2.2 + 0.1, 0.03);
        for (let k2 = 0; k2 < 5; k2++) wbox(G.vent, c2, uu, nn, zc - vh / 2 + k2 * vh / 5, zc - vh / 2 + k2 * vh / 5 + vh / 9, vh * 2.2, 0.045);
      }
    }
  };
  endStuff(0, S0, Ss0, -1); endStuff(1, S1, Ss1, +1);
}

// ------------------------------------------------------------------------------------------------ static world
const world = new THREE.Group(); scene.add(world);
let dyn = new THREE.Group(); scene.add(dyn);
function groupOf(builders, parent) { for (const b of Object.values(builders)) if (b.p.length) parent.add(b.mesh()); }
function exteriorBuilders(clip = null, clipInter = true) {
  const cm = (m) => { if (!clip) return m; const c = m.clone(); c.clippingPlanes = clip; c.clipIntersection = clipInter; return c; };
  return {
    siding: new B(M.siding, TX.siding_tile_m[0] * 1.6, TX.siding_tile_m[1]),
    trim: new B(M.trim), fascia: new B(cm(M.fascia)), soffit: new B(cm(M.soffit), 1, 1, { cast: false }),
    roof: new B(M.roof, TX.shingle_tile_m[0], TX.shingle_tile_m[1]), ridge: new B(M.ridge, TX.shingle_tile_m[0], TX.shingle_tile_m[1]),
    sash: new B(M.sash), found: new B(M.found, 2, 2), vent: new B(M.ventExt), door: new B(M.door), glass: new B(M.glassDark),
  };
}

function exteriorWindow(G, a, b, nOut, off, t, w, sill, h) {
  const L = len2(sub2(b, a)), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  const c = [a[0] + u[0] * t + nOut[0] * off, a[1] + u[1] * t + nOut[1] * off];
  decal(G.sash, a, b, nOut, off + 0.005, t - w / 2, t + w / 2, sill, sill + h);
  const cw = 0.1;
  wbox(G.trim, [c[0] - u[0] * (w / 2 + cw / 2), c[1] - u[1] * (w / 2 + cw / 2)], u, nOut, sill - 0.02, sill + h, cw, 0.03);
  wbox(G.trim, [c[0] + u[0] * (w / 2 + cw / 2), c[1] + u[1] * (w / 2 + cw / 2)], u, nOut, sill - 0.02, sill + h, cw, 0.03);
  wbox(G.trim, c, u, nOut, sill + h, sill + h + 0.16, w + 2 * cw + 0.06, 0.035);
  wbox(G.trim, c, u, nOut, sill + h + 0.16, sill + h + 0.2, w + 2 * cw + 0.12, 0.06);
  wbox(G.trim, c, u, nOut, sill - 0.07, sill - 0.02, w + 2 * cw + 0.08, 0.07);
  wbox(G.trim, c, u, nOut, sill - 0.2, sill - 0.07, w + 2 * cw - 0.02, 0.025);
}

/** exterior shell of a closed CCW polygon (wall centre-lines). skip: list of {edge index, t0,t1} spans with no wall */
function shell(G, poly, holesPerEdge = {}, cornerBoards = true) {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const L = len2(sub2(b, a)), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], nOut = [u[1], -u[0]];
    // extend to the outer corners (convex: +EO, concave: -EO)
    const prev = poly[(i - 1 + n) % n], next = poly[(i + 2) % n];
    const cross = (p, q, r) => (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]);
    const ea = cross(prev, a, b) > 0 ? EO : -EO, eb = cross(a, b, next) > 0 ? EO : -EO;
    const A2 = [a[0] - u[0] * ea, a[1] - u[1] * ea], B2 = [b[0] + u[0] * eb, b[1] + u[1] * eb];
    const holes = (holesPerEdge[i] || []).map(h => [h[0] + ea, h[1] + ea, h[2], h[3]]);
    wall(G.siding, A2, B2, nOut, EO, GZ + 0.25, PZ + 0.13, holes, { u0: (A2[0] + A2[1]) * 0.37 });
    wall(G.found, A2, B2, nOut, EO + 0.01, GZ - 0.05, GZ + 0.25, holes.filter(h => h[2] < GZ + 0.25).map(h => [h[0], h[1], -9, 9]));
    if (cornerBoards && ea > 0) wbox(G.trim, [A2[0] + u[0] * 0.05 + nOut[0] * EO, A2[1] + u[1] * 0.05 + nOut[1] * EO], u, nOut, GZ + 0.2, PZ, 0.1, 0.025);
    if (cornerBoards && eb > 0) wbox(G.trim, [B2[0] - u[0] * 0.05 + nOut[0] * EO, B2[1] - u[1] * 0.05 + nOut[1] * EO], u, nOut, GZ + 0.2, PZ, 0.1, 0.025);
  }
}

// ground, street, fences
{
  const g = { gravel: new B(M.gravel, 1.2, 1.2, { cast: false }), conc: new B(M.concrete, 2.0, 2.0, { cast: false }), street: new B(M.street, 4, 1.2, { cast: false }), fence: new B(M.fence), picket: new B(M.picket) };
  const pl = (bl, x0, y0, x1, y1, z) => bl.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [x0, y0], [x1, y0], [x1, y1], [x0, y1]);
  // lawn: grid with low-frequency brightness/hue variation so the drone-lawn tile does not read as a repeat
  const hash = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); };
  const vnoise = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi; const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1); return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy; };
  const lawn = new B(M.lawn, 2.6, 2.6, { cast: false, ao: (x, y) => 0.78 + 0.3 * vnoise(x / 4.5, y / 4.5) + 0.12 * vnoise(x / 1.3 + 7, y / 1.3) });
  for (let x = -70; x < 70; x += 1.5) for (let y = -13.6; y < 70; y += 1.5) pl(lawn, x, y, x + 1.5, y + 1.5, GZ);
  for (let x = -70; x < 70; x += 1.5) for (let y = -80; y < -26.2; y += 1.5) pl(lawn, x, y, x + 1.5, y + 1.5, GZ);
  g.lawn = lawn;
  g.far = new B(M.lawn, 2.6, 2.6, { cast: false, ao: () => 0.92 }); pl(g.far, -500, -500, 500, 500, GZ - 0.03);
  pl(g.street, -200, -24.4, 200, -15.4, GZ - 0.12);
  pl(g.conc, -200, -26.2, 200, -24.4, GZ + 0.01);                 // far sidewalk
  pl(g.gravel, 6.3, -13.4, 6.55, 17.5, GZ + 0.005);               // gravel strip along the driveway fence (DJI ..0830)
  pl(g.conc, -120, -15.4, 120, -13.6, GZ + 0.01);                 // sidewalk
  pl(g.conc, 3.2, -15.4, 6.3, 17.5, GZ + 0.015);                    // driveway (east side, as in the drone photos)
  pl(g.conc, -5.2, -13.6, -4.0, -5.95, GZ + 0.015);               // front walk to the porch
  pl(g.conc, -1.2, 5.1, 3.2, 9.0, GZ + 0.012);                    // back patio (concrete, DJI ..0830)
  // board fences on the property lines + white picket fence at the street (seen in DJI ..0001)
  const fenceRun = (a, b, h, bl, gap) => {
    const L = len2(sub2(b, a)), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n = [-u[1], u[0]];
    for (let s = 0.05; s < L; s += gap) wbox(bl, [a[0] + u[0] * s, a[1] + u[1] * s], u, n, GZ, GZ + h, gap * 0.92, 0.02);
    wbox(bl, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], u, [-n[0], -n[1]], GZ + h * 0.75, GZ + h * 0.75 + 0.08, L, 0.04);
  };
  fenceRun([-18.5, -13.4], [-18.5, 17.5], 1.8, g.fence, 0.14);
  fenceRun([6.6, -13.4], [6.6, 17.5], 1.8, g.fence, 0.14);
  fenceRun([-18.5, 17.5], [6.6, 17.5], 1.8, g.fence, 0.14);
  fenceRun([-17.5, -13.5], [-6.0, -13.5], 0.95, g.picket, 0.16);
  fenceRun([-3.3, -13.5], [3.0, -13.5], 0.95, g.picket, 0.16);
  groupOf(g, world);
}

// Italian cypresses along the east property line (they dominate the drone photos DJI ..0001/..0070)
{
  const prof = [];
  for (let i = 0; i <= 24; i++) { const s = i / 24; prof.push(new THREE.Vector2(Math.max(0.02, 0.85 * Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.08)), 0.75) * (1 - 0.35 * s)), s * 11)); }
  const geo = new THREE.LatheGeometry(prof, 18);
  geo.rotateX(Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); const n = 1 + 0.12 * Math.sin(z * 3.1 + x * 5) * Math.cos(y * 4.3 + z * 1.7); pos.setX(i, x * n); pos.setY(i, y * n); }
  geo.computeVertexNormals();
  const mat = std({ color: 0x2f4a2a, roughness: 1, flatShading: true });
  for (const [x, y, h] of [[2.6, -12.4, 1.0], [3.6, -11.0, 0.85], [-16.8, -12.0, 0.9]]) {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, GZ); m.scale.set(1, 1, h); m.castShadow = true; world.add(m);
  }
}

// ------------------------------------------------------------------------------------------------ addition
function makeAddition(add) {
  const grp = new THREE.Group();
  const poly = add.polygon; const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const ca = add.connect_wall.a, cb = add.connect_wall.b;
  const horiz = Math.abs(ca[1] - cb[1]) < 0.05;               // connect wall along x?
  const cz = (x0 + x1) / 2, cyy = (y0 + y1) / 2;
  // outward direction (from house into the addition)
  const out = horiz ? [0, Math.sign(cyy - ca[1])] : [Math.sign(cz - ca[0]), 0];
  // ---- interior (unlit, scan-derived textures) with corner AO
  const ix0 = x0 + HW, ix1 = x1 - HW, iy0 = y0 + HW, iy1 = y1 - HW;
  const ao = (x, y, z) => {
    const dW = Math.min(x - ix0, ix1 - x, y - iy0, iy1 - y), dF = z - FZ, dC = CZ - z;
    const dx = Math.min(x - ix0, ix1 - x), dy = Math.min(y - iy0, iy1 - y);
    let f = 1 - 0.22 * Math.exp(-Math.max(0, dW) / 0.35) - 0.12 * Math.exp(-Math.max(0, dF) / 0.25) - 0.18 * Math.exp(-Math.max(0, dC) / 0.3);
    f -= 0.10 * Math.exp(-Math.max(0, dx) / 0.12) * Math.exp(-Math.max(0, dy) / 0.12); // vertical corners
    // soft daylight: far side brighter
    return Math.max(0.55, Math.min(1.05, f + 0.05));
  };
  const I = {
    floor: new B(M.floor, TX.floor_tile_m[0], TX.floor_tile_m[1], { ao }), wall: new B(M.wall, TX.wall_tile_m[0], TX.wall_tile_m[1], { ao }),
    ceil: new B(M.ceil, TX.ceiling_tile_m[0], TX.ceiling_tile_m[1], { ao }), base: new B(M.base, TX.baseboard_m[0], 0.15, { ao }),
    crown: new B(M.crown, TX.crown_m[0], 0.11, { ao }), jamb: new B(M.jamb, 1, 1, { ao }), win: new B(M.winInt, 1, 1, { ao }),
    door: new B(M.doorInt, 1, 1, { ao }), vent: new B(M.vent, 1, 1, { ao }),
  };
  // floor & ceiling (grid for AO)
  const grid = (bl, z, flip) => {
    const nx = Math.ceil((ix1 - ix0) / 0.25), ny = Math.ceil((iy1 - iy0) / 0.25);
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const xa = ix0 + (ix1 - ix0) * i / nx, xb = ix0 + (ix1 - ix0) * (i + 1) / nx, ya = iy0 + (iy1 - iy0) * j / ny, yb = iy0 + (iy1 - iy0) * (j + 1) / ny;
      bl.quad([xa, ya, z], [xb, ya, z], [xb, yb, z], [xa, yb, z], [xa, ya], [xb, ya], [xb, yb], [xa, yb]);
    }
  };
  grid(I.floor, FZ + 0.03, false); grid(I.ceil, CZ, true);
  // walls: edges of the inner rectangle, inward normals
  const R = [[ix0, iy0], [ix1, iy0], [ix1, iy1], [ix0, iy1]];
  // door opening on the shared wall, centred on the span (like the bedroom's own door), measured from scan/photo
  const DWd = DOOR.opening[0], DHd = DOOR.opening[1];
  const span = horiz ? [Math.max(x0, Math.min(ca[0], cb[0])), Math.min(x1, Math.max(ca[0], cb[0]))] : [Math.max(y0, Math.min(ca[1], cb[1])), Math.min(y1, Math.max(ca[1], cb[1]))];
  const sharedLine = horiz ? ca[1] : ca[0];
  const dc = chooseDoor(span, horiz, sharedLine, out, DWd);
  const windows = [];
  for (let k = 0; k < 4; k++) {
    const a = R[k], b = R[(k + 1) % 4];
    const L = len2(sub2(b, a)), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], nIn = [-u[1], u[0]];
    const isShared = horiz ? (Math.abs(a[1] - b[1]) < 1e-6 && Math.abs(a[1] - (sharedLine + out[1] * HW)) < 0.01)
      : (Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[0] - (sharedLine + out[0] * HW)) < 0.01);
    const holes = [];
    if (isShared) {
      const tdc = horiz ? (dc - a[0]) * u[0] : (dc - a[1]) * u[1];
      holes.push([tdc - DWd / 2, tdc + DWd / 2, FZ - 1, DHd]);
      // jambs (through the wall thickness 2*HW) and casing on the addition side
      const c2 = [a[0] + u[0] * tdc, a[1] + u[1] * tdc];
      const back = [-nIn[0], -nIn[1]];
      const pj = (t, d, z) => [c2[0] + u[0] * t + back[0] * d, c2[1] + u[1] * t + back[1] * d, z];
      const Tt = 2 * HW + 0.01;
      I.jamb.quad(pj(-DWd / 2, 0, FZ), pj(-DWd / 2, Tt, FZ), pj(-DWd / 2, Tt, DHd), pj(-DWd / 2, 0, DHd), [0, 0], [1, 0], [1, 1], [0, 1]);
      I.jamb.quad(pj(DWd / 2, Tt, FZ), pj(DWd / 2, 0, FZ), pj(DWd / 2, 0, DHd), pj(DWd / 2, Tt, DHd), [0, 0], [1, 0], [1, 1], [0, 1]);
      I.jamb.quad(pj(-DWd / 2, 0, DHd), pj(-DWd / 2, Tt, DHd), pj(DWd / 2, Tt, DHd), pj(DWd / 2, 0, DHd), [0, 0], [1, 0], [1, 1], [0, 1]);
      I.floor.quad(pj(-DWd / 2, 0, FZ + 0.031), pj(DWd / 2, 0, FZ + 0.031), pj(DWd / 2, Tt, FZ + 0.031), pj(-DWd / 2, Tt, FZ + 0.031), [0, 0], [DWd, 0], [DWd, Tt], [0, Tt]);
      const dwm = DOOR.size_m[0], dhm = DOOR.size_m[1];
      decal(I.door, a, b, nIn, 0.012, tdc - dwm / 2, tdc + dwm / 2, FZ, FZ + dhm * (DHd + DOOR.top_margin) / (DHd + DOOR.top_margin));
      // existing-room side: same casing decal; the scan's wall (and whatever hung on it) is cut only in the opening
      decal(I.door, a, b, back, 2 * HW + 0.017, tdc - dwm / 2, tdc + dwm / 2, FZ, FZ + dhm);
      grp.userData.cut = {
        c: [a[0], a[1]], u, n: back, // n points into the existing room
        t0: tdc - DWd / 2 - 0.01, t1: tdc + DWd / 2 + 0.01, d0: -0.05, d1: 2 * HW + 0.3, z0: 0.07, z1: DHd + 0.005,
        door: [tdc - DWd / 2, tdc + DWd / 2],
      };
    } else if (L > 1.9) {
      // windows from the photo (same model as the bedroom's double-hung), sill/head as measured
      const nW = L > 4.6 ? 2 : 1;
      for (let j = 0; j < nW; j++) {
        const t = L * (j + 0.5) / nW;
        const wm = WIN.size_m[0], hm = WIN.size_m[1];
        const z0 = WIN.sill - WIN.margin_b, z1 = z0 + hm;
        decal(I.win, a, b, nIn, 0.01, t - wm / 2, t + wm / 2, z0, z1);
        windows.push({ a, b, nIn, t, L });
      }
    }
    wall(I.wall, a, b, nIn, 0, FZ, CZ, holes, { step: 0.3, u0: a[0] + a[1] });
    // baseboard + crown (skip across door)
    const bh = holes.map(h => [h[0], h[1], -9, 9]);
    wall(I.base, a, b, nIn, 0.012, FZ, FZ + 0.15, bh, { step: 0.3, u0: a[0] * 0.7 });
    wall(I.crown, a, b, nIn, 0.02, CZ - 0.11, CZ, [], { step: 0.3 });
  }
  // a floor register like the bedroom's, under the first window
  if (windows.length) {
    const w0 = windows[0]; const L = w0.L, u = [(w0.b[0] - w0.a[0]) / L, (w0.b[1] - w0.a[1]) / L];
    const c = [w0.a[0] + u[0] * w0.t + w0.nIn[0] * 0.25, w0.a[1] + u[1] * w0.t + w0.nIn[1] * 0.25];
    const hx = TX.vent_m[0] / 2 * 0.55, hy = TX.vent_m[1] / 2 * 0.55;
    const ex = [u[0] * hx, u[1] * hx], ey = [w0.nIn[0] * hy, w0.nIn[1] * hy], z = FZ + 0.035;
    I.vent.quad([c[0] - ex[0] - ey[0], c[1] - ex[1] - ey[1], z], [c[0] + ex[0] - ey[0], c[1] + ex[1] - ey[1], z], [c[0] + ex[0] + ey[0], c[1] + ex[1] + ey[1], z], [c[0] - ex[0] + ey[0], c[1] - ex[1] + ey[1], z], [0, 0], [1, 0], [1, 1], [0, 1]);
  }
  for (const b of Object.values(I)) if (b.p.length) { const m = b.mesh(); m.castShadow = false; m.receiveShadow = false; grp.add(m); }

  // ---- exterior shell of the addition (3 new sides) + its roof
  const G = exteriorBuilders();
  const ex = { x0: x0 - EO, x1: x1 + EO, y0: y0 - EO, y1: y1 + EO };
  const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  for (let k = 0; k < 4; k++) {
    const a = corners[k], b = corners[(k + 1) % 4];
    const L = len2(sub2(b, a)), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], nOut = [u[1], -u[0]];
    const isShared = horiz ? Math.abs(a[1] - b[1]) < 1e-6 && Math.abs(a[1] - sharedLine) < 0.01 : Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[0] - sharedLine) < 0.01;
    if (isShared) continue;
    const A2 = [a[0] - u[0] * EO, a[1] - u[1] * EO], B2 = [b[0] + u[0] * EO, b[1] + u[1] * EO];
    const prevShared = false;
    wall(G.siding, A2, B2, nOut, EO, GZ + 0.25, PZ + 0.13, [], { u0: (A2[0] + A2[1]) * 0.37 });
    wall(G.found, A2, B2, nOut, EO + 0.01, GZ - 0.05, GZ + 0.25);
    wbox(G.trim, [A2[0] + u[0] * 0.05 + nOut[0] * EO, A2[1] + u[1] * 0.05 + nOut[1] * EO], u, nOut, GZ + 0.2, PZ, 0.1, 0.025);
    wbox(G.trim, [B2[0] - u[0] * 0.05 + nOut[0] * EO, B2[1] - u[1] * 0.05 + nOut[1] * EO], u, nOut, GZ + 0.2, PZ, 0.1, 0.025);
  }
  for (const w of windows) {
    // map the interior window to the exterior face of the same wall
    const L = w.L, u = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L];
    const nOut = [-w.nIn[0], -w.nIn[1]];
    exteriorWindow(G, w.a, w.b, nOut, HW + EO, w.t, WIN.opening[0], WIN.sill, WIN.opening[1]);
  }
  // roof: extend the rectangle into the house so its inner hip is buried under the main roof; outer end = gable
  const wPar = horiz ? x1 - x0 : y1 - y0;
  const into = wPar / 2 + 1.2;
  let rect, axis, ends;
  if (horiz) { axis = 'y'; rect = out[1] > 0 ? [x0, y0 - into, x1, y1] : [x0, y0, x1, y1 + into]; ends = out[1] > 0 ? ['hip', 'gable'] : ['gable', 'hip']; }
  else { axis = 'x'; rect = out[0] > 0 ? [x0 - into, y0, x1, y1] : [x0, y0, x1 + into, y1]; ends = out[0] > 0 ? ['hip', 'gable'] : ['gable', 'hip']; }
  // its fascia/soffit must not show inside the existing house: clip everything on the house side of the wall face
  const sl = sharedLine, clipN = new THREE.Vector3(out[0], out[1], 0);
  const RG = exteriorBuilders([new THREE.Plane(clipN, -((out[0] + out[1]) * sl + EO))], false);
  grp.userData.roofPiece = { rect, axis, ends };
  roofPiece(RG, grp.userData.roofPiece, { all: housePieces().concat([grp.userData.roofPiece]) });
  // only the parts of the addition roof's own walls/soffits outside the house matter; drop its soffit (inside house)
  const roofGrp = new THREE.Group(); groupOf(RG, roofGrp); roofGrp.userData.roof = true;
  groupOf(G, grp); grp.add(roofGrp);
  grp.userData.box = [x0 + 0.02, y0 + 0.02, x1 - 0.02, y1 - 0.02];
  grp.userData.span = span; grp.userData.horiz = horiz; grp.userData.sharedLine = sharedLine; grp.userData.out = out;
  grp.userData.door = [dc - DWd / 2, dc + DWd / 2];
  return grp;
}

// ------------------------------------------------------------------------------------------------ existing house exterior
let _hp = null;
function housePieces() {
  if (!_hp) { const pr = H.porch.rect; _hp = H.roof.concat([{ id: 'porch', rect: [pr[0], pr[1], pr[2], pr[3] + 2.0], axis: 'y', ends: ['gable', 'hip'] }]); }
  return _hp;
}
function buildHouse(add) {
  const grp = new THREE.Group();
  const G = exteriorBuilders();
  const FP = H.footprint; const n = FP.length;
  // holes in the shell where the addition attaches (whole span: the addition's own interior wall takes over)
  const holesPerEdge = {};
  if (add) {
    const { span, horiz, sharedLine } = add.userData;
    for (let i = 0; i < n; i++) {
      const a = FP[i], b = FP[(i + 1) % n];
      const on = horiz ? (Math.abs(a[1] - sharedLine) < 0.1 && Math.abs(b[1] - sharedLine) < 0.1) : (Math.abs(a[0] - sharedLine) < 0.1 && Math.abs(b[0] - sharedLine) < 0.1);
      if (!on) continue;
      const L = len2(sub2(b, a)), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      const t0 = horiz ? (span[0] - a[0]) * u[0] : (span[0] - a[1]) * u[1], t1 = horiz ? (span[1] - a[0]) * u[0] : (span[1] - a[1]) * u[1];
      holesPerEdge[i] = [[Math.min(t0, t1) - EO + 0.02, Math.max(t0, t1) + EO - 0.02, GZ - 1, PZ + 0.5]];
    }
  }
  shell(G, FP, holesPerEdge);
  // existing windows (rule-based layout, see build_assets.layout_windows)
  for (const w of H.windows) {
    const a = w.a, b = w.b; const L = len2(sub2(b, a)), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], nOut = [u[1], -u[0]];
    if (add) {
      const { span, horiz, sharedLine } = add.userData;
      const px = a[0] + u[0] * w.t, py = a[1] + u[1] * w.t;
      if (horiz && Math.abs(py - sharedLine) < 0.1 && px > span[0] - 0.5 && px < span[1] + 0.5) continue;
      if (!horiz && Math.abs(px - sharedLine) < 0.1 && py > span[0] - 0.5 && py < span[1] + 0.5) continue;
    }
    // porch wall gets the front door instead
    if (Math.abs(a[1] - -4.2) < 0.05 && Math.abs(b[1] - -4.2) < 0.05) continue;
    exteriorWindow(G, a, b, nOut, EO, w.t, w.w, w.sill, w.h);
  }
  // porch: slab, steps, columns, front door (yellow craftsman door seen in DJI ..0001)
  const pr = H.porch.rect;
  box(G.found, (pr[0] + pr[2]) / 2, (pr[1] + pr[3]) / 2 - 0.1, (GZ + FZ - 0.02) / 2, pr[2] - pr[0] - 0.1, pr[3] - pr[1] + 0.1, FZ - 0.02 - GZ);
  box(G.found, -4.6, pr[1] - 0.35, GZ + 0.15, 1.4, 0.35, 0.3);
  for (const x of [pr[0] + 0.25, pr[2] - 0.25]) { box(G.trim, x, pr[1] + 0.2, (FZ + PZ) / 2, 0.26, 0.26, PZ - FZ); box(G.found, x, pr[1] + 0.2, FZ + 0.25, 0.4, 0.4, 0.5); }
  box(G.trim, (pr[0] + pr[2]) / 2, pr[1] + 0.2, PZ - 0.1, pr[2] - pr[0], 0.24, 0.3);
  box(G.door, -4.6, -4.2 - EO - 0.01, FZ + 1.05, 0.95, 0.03, 2.1);
  box(G.trim, -4.6, -4.2 - EO - 0.02, FZ + 2.17, 1.25, 0.04, 0.16);
  for (const s of [-1, 1]) box(G.trim, -4.6 + s * 0.55, -4.2 - EO - 0.02, FZ + 1.05, 0.12, 0.04, 2.15);
  // roofs (main + wings + porch gable)
  // the house's eave soffit/fascia would hang into the new room: clip them inside the addition's footprint
  let clip = null;
  if (add) {
    const b = add.userData.box, m = 0.02;
    clip = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), b[0] - EO - m), new THREE.Plane(new THREE.Vector3(1, 0, 0), -(b[2] + EO + m)),
      new THREE.Plane(new THREE.Vector3(0, -1, 0), b[1] - EO - m), new THREE.Plane(new THREE.Vector3(0, 1, 0), -(b[3] + EO + m))];
  }
  const RG = exteriorBuilders(clip, true);
  const all = housePieces().concat(add ? [add.userData.roofPiece] : []);
  for (const pc of housePieces()) roofPiece(RG, pc, { all });
  const roofGrp = new THREE.Group(); groupOf(RG, roofGrp); roofGrp.userData.roof = true;
  groupOf(G, grp); grp.add(roofGrp);
  return grp;
}

// ------------------------------------------------------------------------------------------------ lights / sky
scene.background = new THREE.Color(0xc9d6e2);
{
  // sky dome gradient (overcast-bright LA sky as in the drone photos)
  const g = new THREE.SphereGeometry(450, 32, 16);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vp; void main(){ vp=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'varying vec3 vp; void main(){ float h=clamp(vp.z,0.,1.); vec3 c=mix(vec3(0.86,0.88,0.89),vec3(0.55,0.68,0.82),pow(h,0.55)); if(vp.z<0.02) c=vec3(0.79,0.83,0.86); gl_FragColor=vec4(c,1.); }',
  });
  const sky = new THREE.Mesh(g, m); sky.renderOrder = -1; scene.add(sky);
  scene.fog = new THREE.Fog(0xc9d3dc, 50, 330);
}
const hemi = new THREE.HemisphereLight(0xdfe8f2, 0x8a8070, 1.25); hemi.position.set(0, 0, 1); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
sun.position.set(-14, -18, 26); sun.target.position.set(-5, 1, 0); scene.add(sun, sun.target);
sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 90 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
// the scan mesh must not darken the exterior: it's unlit, but it casts shadows only inside the shell anyway.

// ------------------------------------------------------------------------------------------------ scene assembly
let houseGrp = null, addGrp = null, neighbours = null;
const additions = Object.fromEntries(test.additions.map(a => [a.id, a]));
let editPoly = null;
function rebuild() {
  if (houseGrp) { dyn.remove(houseGrp); houseGrp.traverse(o => o.geometry && o.geometry.dispose()); }
  if (addGrp) { dyn.remove(addGrp); addGrp.traverse(o => o.geometry && o.geometry.dispose()); }
  const add = JSON.parse(JSON.stringify(additions[CASE]));
  if (editPoly) add.polygon = editPoly;
  addGrp = makeAddition(add);
  houseGrp = buildHouse(addGrp);
  dyn.add(houseGrp, addGrp);
  if (!neighbours) {
    neighbours = new THREE.Group(); scene.add(neighbours);
    const base = buildHouse(null);
    const paints = [0xd9cfb8, 0xa9b8c4, 0xe6dcc6, 0xc4ad94, 0xb7c2b0, 0xd8d8d2, 0xc9b49a];
    const spots = [[-22.5, 0, 0], [23.5, 0, 0], [-19, -50.5, Math.PI], [5.5, -50.5, Math.PI], [-44, -50.5, Math.PI], [-45, 0, 0], [46, 0, 0]];
    spots.forEach(([dx, dy, rot], k) => {
      const c = base.clone(true);
      const tint = new THREE.Color(paints[k % paints.length]);
      const mat = M.siding.clone(); mat.map = T.siding_gray; mat.color = tint;
      c.traverse(o => { if (o.isMesh && o.material === M.siding) o.material = mat; });
      c.position.set(dx, dy, 0); c.rotation.z = rot;
      if (rot) c.position.x += -10.18 * 2 * 0;   // rotated about the model origin
      neighbours.add(c);
    });
  }
  const cut = addGrp.userData.cut;
  const ab = addGrp.userData.box;
  const clear = cut ? [{ ...cut, t0: cut.t0 - 0.45, t1: cut.t1 + 0.45, d0: 2 * HW + 0.05, d1: 2 * HW + 2.2, z0: 0.07, z1: 2.4 }] : [];
  cutScan((cut ? [cut] : []).concat(clear).concat([{ c: [0, 0], u: [1, 0], n: [0, 1], t0: ab[0], t1: ab[2], d0: ab[1], d1: ab[3], z0: -5, z1: 5 }]));
  applyRoofVis();
}
let showRoof = true;
function applyRoofVis() {
  const vis = showRoof && VIEW_NOW !== 'plan';
  scene.traverse(o => { if (o.userData && o.userData.roof) o.visible = vis; });
}

// ------------------------------------------------------------------------------------------------ cameras
let VIEW_NOW = VIEW || 'aerial';
const target = new THREE.Vector3();
function setView(v) {
  VIEW_NOW = v; const V = test.views[v];
  const asp = innerWidth / innerHeight;
  renderer.clippingPlanes = [];
  if (V.type === 'orthographic_topdown') {
    const w = V.width_m, h = w / asp;
    Object.assign(ortho, { left: -w / 2, right: w / 2, top: h / 2, bottom: -h / 2 });
    ortho.position.set(V.center[0], V.center[1], 40); ortho.up.set(0, 1, 0); ortho.lookAt(V.center[0], V.center[1], 0);
    ortho.updateProjectionMatrix(); camera = ortho; target.set(V.center[0], V.center[1], 0);
    renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 0, -1), 2.2)];
  } else {
    persp.fov = V.fov_v; persp.aspect = asp; persp.position.set(...V.pos); target.set(...V.target);
    persp.up.set(0, 0, 1); persp.lookAt(target); persp.near = v === 'interior' ? 0.05 : 0.2; persp.updateProjectionMatrix(); camera = persp;
  }
  applyRoofVis();
}

// ------------------------------------------------------------------------------------------------ orbit controls
{
  let drag = null;
  const el = renderer.domElement;
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('pointerdown', e => { drag = { b: e.button, x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointerup', () => drag = null);
  el.addEventListener('pointermove', e => {
    if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
    if (camera === ortho) { const s = (ortho.right - ortho.left) / innerWidth; ortho.position.x -= dx * s; ortho.position.y += dy * s; return; }
    const off = persp.position.clone().sub(target);
    if (drag.b === 0) {
      const r = off.length(); let th = Math.atan2(off.y, off.x), ph = Math.acos(off.z / r);
      th -= dx * 0.005; ph = Math.min(Math.PI - 0.05, Math.max(0.05, ph - dy * 0.005));
      off.set(r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th), r * Math.cos(ph));
      persp.position.copy(target).add(off);
    } else {
      const s = off.length() * 0.0015; const right = new THREE.Vector3().crossVectors(off, persp.up).normalize();
      const up = new THREE.Vector3().crossVectors(right, off).normalize();
      const d = right.multiplyScalar(dx * s).add(up.multiplyScalar(dy * s));
      persp.position.add(d); target.add(d);
    }
    persp.lookAt(target);
  });
  el.addEventListener('wheel', e => {
    e.preventDefault(); const f = Math.exp(e.deltaY * 0.001);
    if (camera === ortho) { for (const k of ['left', 'right', 'top', 'bottom']) ortho[k] *= f; ortho.updateProjectionMatrix(); return; }
    const off = persp.position.clone().sub(target).multiplyScalar(f); persp.position.copy(target).add(off); persp.lookAt(target);
  }, { passive: false });
}

// ------------------------------------------------------------------------------------------------ UI
function ui() {
  const box_ = document.getElementById('ui'); box_.style.display = '';
  const cs = document.getElementById('cases'), vs = document.getElementById('views');
  const mk = (par, label, on, fn) => { const b = document.createElement('button'); b.textContent = label; if (on) b.classList.add('on'); b.onclick = fn; par.appendChild(b); return b; };
  const refreshBtns = () => { [...cs.children].forEach(b => b.classList.toggle('on', b.textContent === CASE)); [...vs.children].forEach(b => b.classList.toggle('on', b.textContent === VIEW_NOW)); };
  for (const c of Object.keys(additions)) mk(cs, c, c === CASE, () => { CASE = c; editPoly = null; syncSliders(); rebuild(); refreshBtns(); });
  for (const v of ['aerial', 'backyard', 'interior', 'front', 'plan']) mk(vs, v, v === VIEW_NOW, () => { setView(v); refreshBtns(); });
  const sd = id => document.getElementById(id);
  function base() { const a = additions[CASE]; const xs = a.polygon.map(p => p[0]), ys = a.polygon.map(p => p[1]); return { a, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; }
  function syncSliders() {
    const { a, x0, x1, y0, y1 } = base(); const horiz = Math.abs(a.connect_wall.a[1] - a.connect_wall.b[1]) < 0.05;
    sd('depth').value = horiz ? y1 - y0 : x1 - x0; sd('width').value = horiz ? x1 - x0 : y1 - y0; sd('shift').value = 0; lab();
  }
  function lab() { for (const k of ['depth', 'width', 'shift']) sd(k + 'v').textContent = (+sd(k).value).toFixed(1); }
  function apply() {
    lab(); const { a, x0, x1, y0, y1 } = base(); const horiz = Math.abs(a.connect_wall.a[1] - a.connect_wall.b[1]) < 0.05;
    const D = +sd('depth').value, W = +sd('width').value, S = +sd('shift').value;
    let p;
    if (horiz) { const sl = a.connect_wall.a[1], dir = Math.sign((y0 + y1) / 2 - sl), cx = (x0 + x1) / 2 + S; p = [[cx - W / 2, sl], [cx + W / 2, sl], [cx + W / 2, sl + dir * D], [cx - W / 2, sl + dir * D]]; }
    else { const sl = a.connect_wall.a[0], dir = Math.sign((x0 + x1) / 2 - sl), cy = (y0 + y1) / 2 + S; p = [[sl, cy - W / 2], [sl, cy + W / 2], [sl + dir * D, cy + W / 2], [sl + dir * D, cy - W / 2]]; }
    editPoly = p; rebuild();
  }
  for (const k of ['depth', 'width', 'shift']) sd(k).addEventListener('change', apply), sd(k).addEventListener('input', lab);
  sd('roofchk').onchange = e => { showRoof = e.target.checked; applyRoofVis(); };
  syncSliders();
}

rebuild();
setView(VIEW_NOW);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); setView(VIEW_NOW); });
document.getElementById('msg').style.display = 'none';
if (!HEADLESS) ui();
let frames = 0;
function loop() {
  renderer.render(scene, camera);
  if (++frames === 4 && HEADLESS) document.title = 'READY';
  requestAnimationFrame(loop);
}
loop();
