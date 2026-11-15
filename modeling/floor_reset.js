// Reset floor: replace the scanned floor (bumps, smeared furniture remnants) with one flat floor plane and a simple
// procedural texture, deterministically. Plain script: loaded by walk.html, exposes window.FloorReset. The pure
// functions (floor level, masks, cull, classify, textures) take plain arrays so they can be tested under node.
//   z axis is up, metres. Nothing here asks a model.
(function (root) {
'use strict';
const TILE_M = 1.2;          // one texture tile covers 1.2 m x 1.2 m of floor
const SLAB = 0.45;           // everything lower than this above the floor (and not a wall) is scan clutter
const PATCH_DROP = 0.08;     // floor patches from the clear step are moved this far down while the reset floor is on
const CELL = 0.1;            // footprint grid, metres

// ----------------------------------------------------------------- small pure helpers
function triNormalZ(P, a, b, c) {
  const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
  const qx = uy * vz - uz * vy, qy = uz * vx - ux * vz, qz = ux * vy - uy * vx;
  const len = Math.hypot(qx, qy, qz);
  return { nz: len ? Math.abs(qz) / len : 0, area: len / 2 };
}
// The main walkable level: the z with the most up-facing triangle area within +-win of hintZ.
function floorLevel(P, I, hintZ, win) {
  win = win || 0.5; const BIN = 0.02, nb = Math.ceil(2 * win / BIN) + 1, h = new Float64Array(nb), tris = [];
  for (let t = 0; t < I.length / 3; t++) {
    const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3, { nz, area } = triNormalZ(P, a, b, c);
    if (nz < 0.9) continue;
    const z = (P[a + 2] + P[b + 2] + P[c + 2]) / 3, k = Math.round((z - (hintZ - win)) / BIN);
    if (k < 0 || k >= nb) continue;
    h[k] += area; tris.push(t, z, area);
  }
  let best = -1, bv = 0;
  for (let k = 0; k < nb; k++) { const v = h[k] + (k ? h[k - 1] : 0) + (k < nb - 1 ? h[k + 1] : 0); if (v > bv) { bv = v; best = k; } }
  if (best < 0) return null;
  const z0 = hintZ - win + best * BIN; let sw = 0, sz = 0;
  for (let i = 0; i < tris.length; i += 3) if (Math.abs(tris[i + 1] - z0) <= 0.04) { sw += tris[i + 2]; sz += tris[i + 1] * tris[i + 2]; }
  return { z: sw ? sz / sw : z0, area: sw };
}
function makeGrid(x0, y0, x1, y1, cell) {
  while (((x1 - x0) / cell + 4) * ((y1 - y0) / cell + 4) > 1.5e6) cell *= 1.5;
  x0 -= cell; y0 -= cell; const nx = Math.ceil((x1 - x0) / cell) + 2, ny = Math.ceil((y1 - y0) / cell) + 2;
  return { x0, y0, c: cell, nx, ny, N: nx * ny };
}
const cellOf = (G, x, y) => { const i = Math.floor((x - G.x0) / G.c), j = Math.floor((y - G.y0) / G.c); return i < 0 || j < 0 || i >= G.nx || j >= G.ny ? -1 : j * G.nx + i; };
function rasterTri(G, m, P, a, b, c) {
  const xs = [P[a], P[b], P[c]], ys = [P[a + 1], P[b + 1], P[c + 1]];
  const i0 = Math.max(0, Math.floor((Math.min(...xs) - G.x0) / G.c)), i1 = Math.min(G.nx - 1, Math.floor((Math.max(...xs) - G.x0) / G.c));
  const j0 = Math.max(0, Math.floor((Math.min(...ys) - G.y0) / G.c)), j1 = Math.min(G.ny - 1, Math.floor((Math.max(...ys) - G.y0) / G.c));
  const d = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2]); let hit = false;
  if (Math.abs(d) > 1e-12) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = G.x0 + (i + 0.5) * G.c, y = G.y0 + (j + 0.5) * G.c;
    const l1 = ((ys[1] - ys[2]) * (x - xs[2]) + (xs[2] - xs[1]) * (y - ys[2])) / d, l2 = ((ys[2] - ys[0]) * (x - xs[2]) + (xs[0] - xs[2]) * (y - ys[2])) / d;
    if (l1 >= 0 && l2 >= 0 && l1 + l2 <= 1) { m[j * G.nx + i] = 1; hit = true; } }
  if (!hit) { const k = cellOf(G, (xs[0] + xs[1] + xs[2]) / 3, (ys[0] + ys[1] + ys[2]) / 3); if (k >= 0) m[k] = 1; }
}
function rasterSeg(G, m, x0, y0, x1, y1) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (G.c / 2)));
  for (let s = 0; s <= n; s++) { const k = cellOf(G, x0 + (x1 - x0) * s / n, y0 + (y1 - y0) * s / n); if (k >= 0) m[k] = 1; }
}
function rasterRect(G, m, cx, cy, hx, hy, yaw) {      // rotated rectangle (half sizes hx, hy)
  const c = Math.cos(yaw), s = Math.sin(yaw), r = Math.hypot(hx, hy), i0 = Math.max(0, Math.floor((cx - r - G.x0) / G.c)), i1 = Math.min(G.nx - 1, Math.floor((cx + r - G.x0) / G.c));
  const j0 = Math.max(0, Math.floor((cy - r - G.y0) / G.c)), j1 = Math.min(G.ny - 1, Math.floor((cy + r - G.y0) / G.c));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const dx = G.x0 + (i + 0.5) * G.c - cx, dy = G.y0 + (j + 0.5) * G.c - cy;
    if (Math.abs(dx * c + dy * s) <= hx && Math.abs(-dx * s + dy * c) <= hy) m[j * G.nx + i] = 1; }
}
function dilate(G, m, r) {                            // square structuring element, separable
  const tmp = new Uint8Array(G.N), out = new Uint8Array(G.N);
  for (let j = 0; j < G.ny; j++) { let cnt = 0; const row = j * G.nx;
    for (let i = -r; i < G.nx; i++) { if (i + r < G.nx) cnt += m[row + i + r]; if (i - r - 1 >= 0) cnt -= m[row + i - r - 1]; if (i >= 0) tmp[row + i] = cnt > 0 ? 1 : 0; } }
  for (let i = 0; i < G.nx; i++) { let cnt = 0;
    for (let j = -r; j < G.ny; j++) { if (j + r < G.ny) cnt += tmp[(j + r) * G.nx + i]; if (j - r - 1 >= 0) cnt -= tmp[(j - r - 1) * G.nx + i]; if (j >= 0) out[j * G.nx + i] = cnt > 0 ? 1 : 0; } }
  return out;
}
function erode(G, m, r) { const inv = m.map(v => 1 - v), d = dilate(G, inv, r); return d.map(v => 1 - v); }
// distance (metres) from every cell to the nearest seed cell (chamfer 3-4)
function distance(G, seed) {
  const INF = 1e9, d = new Float32Array(G.N); for (let k = 0; k < G.N; k++) d[k] = seed[k] ? 0 : INF;
  const w1 = 1, w2 = Math.SQRT2, nx = G.nx;
  for (let j = 0; j < G.ny; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; let v = d[k];
    if (i > 0) v = Math.min(v, d[k - 1] + w1); if (j > 0) { v = Math.min(v, d[k - nx] + w1); if (i > 0) v = Math.min(v, d[k - nx - 1] + w2); if (i < nx - 1) v = Math.min(v, d[k - nx + 1] + w2); } d[k] = v; }
  for (let j = G.ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) { const k = j * nx + i; let v = d[k];
    if (i < nx - 1) v = Math.min(v, d[k + 1] + w1); if (j < G.ny - 1) { v = Math.min(v, d[k + nx] + w1); if (i < nx - 1) v = Math.min(v, d[k + nx + 1] + w2); if (i > 0) v = Math.min(v, d[k + nx - 1] + w2); } d[k] = v; }
  for (let k = 0; k < G.N; k++) d[k] = Math.min(d[k] * G.c, 9);
  return d;
}

// ----------------------------------------------------------------- analysis: footprint, walls, what to cull
// opts: { P, I (triangle soup), floorZ, pieces: [{cx,cy,hx,hy,yaw}] (scanned pieces standing on this floor) }
function analyse(opts) {
  const { P, I, floorZ } = opts, nT = I.length / 3;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const info = new Float32Array(nT * 3);               // per tri: zmin, zmax, nz
  for (let t = 0; t < nT; t++) {
    const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
    info[t * 3] = Math.min(P[a + 2], P[b + 2], P[c + 2]); info[t * 3 + 1] = Math.max(P[a + 2], P[b + 2], P[c + 2]); info[t * 3 + 2] = triNormalZ(P, a, b, c).nz;
    if (info[t * 3] > floorZ + 3.5 || info[t * 3 + 1] < floorZ - 1) continue;      // only what is near this level sets the extent
    for (const v of [a, b, c]) { if (P[v] < x0) x0 = P[v]; if (P[v] > x1) x1 = P[v]; if (P[v + 1] < y0) y0 = P[v + 1]; if (P[v + 1] > y1) y1 = P[v + 1]; }
  }
  if (!isFinite(x0)) return null;
  const G = makeGrid(x0, y0, x1, y1, CELL), occ = new Uint8Array(G.N), wall = new Uint8Array(G.N), pc = new Uint8Array(G.N);
  const tall = [];
  for (let t = 0; t < nT; t++) {
    const zmin = info[t * 3], zmax = info[t * 3 + 1], nz = info[t * 3 + 2], a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
    if (nz >= 0.5 && zmax <= floorZ + SLAB && zmin >= floorZ - 0.4) rasterTri(G, occ, P, a, b, c);          // the scanned floor (and what lies on it)
    else if (nz < 0.35 && zmax > floorZ + 1.0 && zmin < floorZ + 1.5) {                                      // a wall
      tall.push(t); rasterSeg(G, wall, P[a], P[a + 1], P[b], P[b + 1]); rasterSeg(G, wall, P[b], P[b + 1], P[c], P[c + 1]); rasterSeg(G, wall, P[c], P[c + 1], P[a], P[a + 1]); }
  }
  const occ0 = Uint8Array.from(occ);
  for (const p of opts.pieces || []) { rasterRect(G, pc, p.cx, p.cy, p.hx + 0.25, p.hy + 0.25, p.yaw); rasterRect(G, occ, p.cx, p.cy, p.hx, p.hy, p.yaw); }
  // footprint = scanned floor + piece footprints, small gaps closed, kept out of the far side of walls, but tucked under the wall's foot
  const closed = erode(G, dilate(G, occ, 4), 4), near = dilate(G, occ0, 2), mask = new Uint8Array(G.N);
  for (let k = 0; k < G.N; k++) mask[k] = (closed[k] && !wall[k]) || (wall[k] && near[k]) ? 1 : 0;
  const wallNear = dilate(G, wall, 1);
  // cull: non-wall triangles of the slab inside the footprint; wall-foot triangles stay; piece footprints also lose taller remnants
  const cull = new Uint8Array(nT); let culled = 0;
  for (let t = 0; t < nT; t++) {
    const zmin = info[t * 3], zmax = info[t * 3 + 1], nz = info[t * 3 + 2], a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
    if (zmax < floorZ - 0.5 || zmin > floorZ + 1.1) continue;
    const k = cellOf(G, (P[a] + P[b] + P[c]) / 3, (P[a + 1] + P[b + 1] + P[c + 1]) / 3);
    // a long sliver can have its centroid outside the footprint while most of it lies inside: test corners and edge midpoints too
    let inMask = k >= 0 && !!mask[k];
    if (!inMask && zmin >= floorZ - 0.5 && zmax <= floorZ + SLAB && nz >= 0.5) for (const [u, v] of [[a, b], [b, c], [c, a], [a, a], [b, b], [c, c]]) { const q = cellOf(G, (P[u] + P[v]) / 2, (P[u + 1] + P[v + 1]) / 2); if (q >= 0 && mask[q]) { inMask = true; break; } }
    if (!inMask) continue;
    const inPiece = k >= 0 && !!pc[k], flat = nz >= 0.5, nearWall = k >= 0 && !!wallNear[k];
    let kill = false;
    if (zmin >= floorZ - 0.5 && zmax <= floorZ + SLAB) kill = flat || !nearWall;
    else if (inPiece && !nearWall) kill = flat ? (zmin < floorZ + SLAB && zmax <= floorZ + 1.1) : zmax <= floorZ + 0.6;
    if (kill) { cull[t] = 1; culled++; }
  }
  // wall feet: vertices of wall triangles that hang a little above the floor are pulled down to it (no gap above the new floor)
  const snap = new Set();
  for (const t of tall) for (let s = 0; s < 3; s++) { const v = I[t * 3 + s]; const z = P[v * 3 + 2]; if (z > floorZ + 0.003 && z <= floorZ + 0.3) snap.add(v); }
  // shading: distance to the nearest wall / edge of the footprint
  const seed = new Uint8Array(G.N); for (let k = 0; k < G.N; k++) seed[k] = !mask[k] || wall[k] ? 1 : 0;
  return { G, mask, wall, pc, cull, culled, snap: [...snap], dist: distance(G, seed), area: mask.reduce((s, v) => s + v, 0) * G.c * G.c };
}
// floor quads over the footprint, merged into row runs. Returns { pos: Float32Array, idx: Uint32Array }
function floorGeometry(G, mask, z) {
  const pos = [], idx = [];
  for (let j = 0; j < G.ny; j++) for (let i = 0; i < G.nx;) {
    if (!mask[j * G.nx + i]) { i++; continue; }
    let e = i; while (e < G.nx && mask[j * G.nx + e]) e++;
    const xa = G.x0 + i * G.c, xb = G.x0 + e * G.c, ya = G.y0 + j * G.c, yb = ya + G.c, o = pos.length / 3;
    pos.push(xa, ya, z, xb, ya, z, xb, yb, z, xa, yb, z); idx.push(o, o + 1, o + 2, o, o + 2, o + 3); i = e;
  }
  return { pos: Float32Array.from(pos), idx: Uint32Array.from(idx) };
}

// ----------------------------------------------------------------- what is the scan floor like?
// samples: [[r,g,b] 0..255]. Returns { kind, rgb, sat, hue, cv } ; kind is one of wood | tile | concrete | carpet.
function classifyFloor(samples) {
  const n = samples.length; if (!n) return { kind: 'concrete', rgb: [150, 150, 150], sat: 0, hue: 0, cv: 0 };
  const m = [0, 0, 0]; for (const s of samples) for (let a = 0; a < 3; a++) m[a] += s[a] / n;
  const lum = s => 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2], ml = lum(m);
  let v = 0; for (const s of samples) v += (lum(s) - ml) ** 2; const cv = Math.sqrt(v / n) / Math.max(ml, 1);
  const mx = Math.max(...m), mn = Math.min(...m), sat = mx ? (mx - mn) / mx : 0; let hue = 0;
  if (mx > mn) { const d = mx - mn; hue = mx === m[0] ? ((m[1] - m[2]) / d + 6) % 6 : mx === m[1] ? (m[2] - m[0]) / d + 2 : (m[0] - m[1]) / d + 4; hue *= 60; }
  let kind;
  if (sat > 0.2 && hue >= 8 && hue <= 55) kind = 'wood';
  else if (sat < 0.14) kind = ml > 175 && cv < 0.2 ? 'tile' : 'concrete';
  else kind = cv > 0.1 ? 'carpet' : 'concrete';
  return { kind, rgb: m.map(Math.round), sat: +sat.toFixed(3), hue: Math.round(hue), cv: +cv.toFixed(3) };
}

// ----------------------------------------------------------------- procedural textures (seamless over TILE_M)
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function lattice(seed, cu, cv) { const r = rng(seed), g = new Float32Array(cu * cv); for (let i = 0; i < g.length; i++) g[i] = r(); return { g, cu, cv }; }
function pnoise(L, u, v) {                          // periodic value noise, u,v in [0,1) (wraps)
  u = ((u % 1) + 1) % 1; v = ((v % 1) + 1) % 1; const x = u * L.cu, y = v * L.cv, i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), i1 = (i + 1) % L.cu, j1 = (j + 1) % L.cv, g = L.g, W = L.cu;
  const a = g[j * W + i], b = g[j * W + i1], c = g[j1 * W + i], d = g[j1 * W + i1];
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
const KINDS = ['match', 'wood', 'concrete', 'tile', 'carpet', 'plain'];
const PRESET = { wood: [206, 168, 122], concrete: [158, 158, 156], tile: [214, 212, 206], carpet: [128, 122, 118], plain: [188, 186, 182] };
// Returns Uint8ClampedArray RGBA, N x N, tile wraps in both directions.
function makeTexture(kind, rgb, N) {
  N = N || 1024; const out = new Uint8ClampedArray(N * N * 4), base = rgb || PRESET[kind] || PRESET.plain;
  const put = (x, y, f, tint) => { const o = (y * N + x) * 4; for (let a = 0; a < 3; a++) out[o + a] = base[a] * f * (tint ? tint[a] : 1); out[o + 3] = 255; };
  const hash = (x, y, s) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2147483647)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (((h ^ (h >>> 16)) >>> 0) % 65536) / 65536; };
  if (kind === 'wood') {
    const rows = 8, ph = N / rows, r = rng(11), rowTone = [], rowOff = [], rowShift = [];
    for (let i = 0; i < rows; i++) { rowTone.push(1 + (r() - 0.5) * 0.14); rowOff.push(Math.floor(r() * N)); rowShift.push(r()); }
    const grain = lattice(5, 5, 160), mott = lattice(6, 6, 6), warm = [1.02, 1, 0.97];
    for (let y = 0; y < N; y++) { const row = Math.floor(y / ph), yin = y - row * ph;
      for (let x = 0; x < N; x++) {
        const u = x / N + rowShift[row], v = y / N;
        let f = rowTone[row] * (1 + 0.09 * (pnoise(grain, u, v) - 0.5) * 2 + 0.05 * (pnoise(mott, u, v) - 0.5) * 2);
        const dj = Math.min((x - rowOff[row] + N) % N, N - (x - rowOff[row] + N) % N);
        if (yin < 1.5 || yin > ph - 1.5) f *= 0.8; else if (yin < 3) f *= 1.04;       // the gap between planks, and a faint bevel
        if (dj < 1.5) f *= 0.8;                                                       // the butt joint
        put(x, y, f, warm); } }
  } else if (kind === 'tile') {
    const n = 2, ts = N / n, grout = 5, tone = []; const r = rng(3); for (let i = 0; i < n * n; i++) tone.push(1 + (r() - 0.5) * 0.045);
    const mott = lattice(8, 24, 24), gc = 0.84;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const tx = Math.floor(x / ts), ty = Math.floor(y / ts), ix = x - tx * ts, iy = y - ty * ts, e = Math.min(ix, ts - ix, iy, ts - iy);
      let f = tone[ty * n + tx] * (1 + 0.025 * (pnoise(mott, x / N, y / N) - 0.5) * 2);
      if (e < grout / 2) f = gc; else if (e < grout / 2 + 2) f *= 0.96;
      put(x, y, f); }
  } else if (kind === 'concrete') {
    const l1 = lattice(1, 4, 4), l2 = lattice(2, 16, 16), l3 = lattice(3, 64, 64);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const u = x / N, v = y / N;
      put(x, y, 1 + 0.035 * (pnoise(l1, u, v) - 0.5) * 2 + 0.025 * (pnoise(l2, u, v) - 0.5) * 2 + 0.018 * (pnoise(l3, u, v) - 0.5) * 2 + 0.012 * (hash(x, y, 1) - 0.5) * 2); }
  } else if (kind === 'carpet') {
    const l1 = lattice(4, 6, 6), l2 = lattice(9, 128, 128);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const u = x / N, v = y / N;
      put(x, y, 1 + 0.03 * (pnoise(l1, u, v) - 0.5) * 2 + 0.035 * (pnoise(l2, u, v) - 0.5) * 2 + 0.06 * (hash(x, y, 2) - 0.5) * 2); }
  } else {
    const l1 = lattice(12, 3, 3);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) put(x, y, 1 + 0.008 * (pnoise(l1, x / N, y / N) - 0.5) * 2);
  }
  return out;
}
// the colour a preset uses: "match" keeps the scan's own colour, softened; the others use their fixed palette
function baseColour(kind, scan) {
  if (kind === 'match') { const m = scan.rgb, g = (m[0] + m[1] + m[2]) / 3; return m.map(v => Math.round(v * 0.85 + g * 0.15)); }
  return PRESET[kind];
}

// ----------------------------------------------------------------- flatness metric (used by tests and the demo)
function flatness(heights, planeZ) {
  let n = 0, mx = 0, s2 = 0; for (const h of heights) { if (!isFinite(h)) continue; const d = h - planeZ; n++; mx = Math.max(mx, Math.abs(d)); s2 += d * d; }
  return { n, maxDev: mx, rms: n ? Math.sqrt(s2 / n) : 0 };
}

// ----------------------------------------------------------------- the controller (needs three.js; used by walk.html)
// ctx: { THREE, scene, house, P, IDX, CP, CI, groups, meta, pieces, patchGroup, hintZ(): number, rebuild(): void }
function create(ctx) {
  const THREE = ctx.THREE; let st = null, kindNow = 'match', mesh = null, texMat = null;
  const api = { active: false, info: null, kinds: KINDS };
  function sampleScan(floorZ, A) {                  // colours of the visible scan floor (not under furniture)
    const { P, CI, groups, meta } = ctx, cache = new Map(), out = [], nT = CI.length / 3, tex = new Int16Array(nT).fill(-1);
    for (const g of meta.groups) for (let k = g.start / 3; k < (g.start + g.count) / 3; k++) tex[k] = g.tex;
    const imgData = gi => { if (cache.has(gi)) return cache.get(gi); let d = null; const g = groups[gi], img = g && (g.full || g.low) && (g.full || g.low).image;
      if (img && img.width) { const S = 256, cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(S, S) : Object.assign(document.createElement('canvas'), { width: S, height: S });
        const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0, S, S); d = cx.getImageData(0, 0, S, S).data; }
      cache.set(gi, d); return d; };
    const cand = []; for (let t = 0; t < nT; t++) { const a = CI[t * 3] * 3, b = CI[t * 3 + 1] * 3, c = CI[t * 3 + 2] * 3;
      if (A.cull[t] && tex[t] >= 0) { const { nz } = triNormalZ(ctx.CP, a, b, c); const zc = (ctx.CP[a + 2] + ctx.CP[b + 2] + ctx.CP[c + 2]) / 3;
        if (nz > 0.9 && Math.abs(zc - floorZ) < 0.06 && !A.pc[cellOf(A.G, (ctx.CP[a] + ctx.CP[b] + ctx.CP[c]) / 3, (ctx.CP[a + 1] + ctx.CP[b + 1] + ctx.CP[c + 1]) / 3)]) cand.push(t); } }
    const step = Math.max(1, Math.floor(cand.length / 1500)), UVd = ctx.UV;
    for (let q = 0; q < cand.length; q += step) { const t = cand[q], d = imgData(tex[t]); if (!d) continue;
      const w = [[1 / 3, 1 / 3, 1 / 3], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2]];
      for (const [l1, l2, l3] of w) { const u = UVd[CI[t * 3] * 2] * l1 + UVd[CI[t * 3 + 1] * 2] * l2 + UVd[CI[t * 3 + 2] * 2] * l3, v = UVd[CI[t * 3] * 2 + 1] * l1 + UVd[CI[t * 3 + 1] * 2 + 1] * l2 + UVd[CI[t * 3 + 2] * 2 + 1] * l3;
        const x = Math.min(255, Math.max(0, Math.floor((u - Math.floor(u)) * 256))), y = Math.min(255, Math.max(0, Math.floor((v - Math.floor(v)) * 256))), o = (y * 256 + x) * 4; out.push([d[o], d[o + 1], d[o + 2]]); } }
    return out;
  }
  function shadeTexture(A) {
    const G = A.G, data = new Uint8Array(G.N * 4);
    for (let k = 0; k < G.N; k++) { const v = Math.min(255, Math.round(A.dist[k] * 255)); data[k * 4] = v; data[k * 4 + 1] = v; data[k * 4 + 2] = v; data[k * 4 + 3] = 255; }
    const t = new THREE.DataTexture(data, G.nx, G.ny, THREE.RGBAFormat, THREE.UnsignedByteType); t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true; return t;
  }
  function tileTexture(kind, scan, mode) {
    const N = 1024, px = makeTexture(kind, mode === 'match' ? baseColour('match', scan) : baseColour(kind, scan), N);
    const t = new THREE.DataTexture(new Uint8Array(px.buffer), N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
    t.anisotropy = ctx.aniso || 8; t.needsUpdate = true; return t;
  }
  function material(kind) {
    const A = st.A, G = A.G;
    const m = texMat || new THREE.ShaderMaterial({ side: THREE.DoubleSide, uniforms: { tile: { value: null }, shade: { value: shadeTexture(A) }, box: { value: new THREE.Vector4(G.x0, G.y0, G.nx * G.c, G.ny * G.c) }, tileM: { value: TILE_M } },
      vertexShader: 'varying vec2 vXY; void main(){ vXY = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D tile, shade; uniform vec4 box; uniform float tileM; varying vec2 vXY;\n' +
        'void main(){ vec3 c = texture2D(tile, vXY / tileM).rgb; float d = texture2D(shade, (vXY - box.xy) / box.zw).r;   // metres to the nearest wall, up to 1\n' +
        ' float s = 0.34 * (1.0 - smoothstep(0.0, 0.45, d)) + 0.18 * (1.0 - smoothstep(0.0, 0.05, d));\n' +
        ' gl_FragColor = vec4(c * (1.0 - s), 1.0);\n #include <colorspace_fragment>\n}' });
    texMat = m; return m;
  }
  api.apply = function (kind) {
    kind = KINDS.includes(kind) ? kind : 'match';
    if (!api.active) {
      const hint = ctx.hintZ(), lvl = floorLevel(ctx.CP, ctx.CI, hint, 0.5); if (!lvl) return null;
      const pcs = ctx.pieces.filter(p => !p.added && p.on_floor && Math.abs(p.floor_z - lvl.z) < 0.35).map(p => ({ cx: p.cx, cy: p.cy, hx: p.size[0] / 2, hy: p.size[1] / 2, yaw: p.yaw_deg * Math.PI / 180 }));
      const A = analyse({ P: ctx.CP, I: ctx.CI, floorZ: lvl.z, pieces: pcs }); if (!A) return null;
      const scan = classifyFloor(sampleScan(lvl.z, A)), nT = ctx.CI.length / 3, nH = ctx.HOUSE_END / 3, gh = ctx.house.geometry;
      st = { A, scan, floorZ: lvl.z, origIndex: gh.index, snapped: A.snap.map(v => [v, ctx.P[v * 3 + 2]]) };
      // visual: the culled triangles become degenerate; wall feet are pulled to the floor
      const lo = ctx.houseLo, hi = ctx.HOUSE_END, ni = Uint32Array.from(ctx.IDX.subarray(lo, hi));
      for (let t = lo / 3; t < nH; t++) if (A.cull[t]) { const k = (t - lo / 3) * 3; ni[k] = ni[k + 1] = ni[k + 2] = ni[k]; }
      gh.setIndex(new THREE.BufferAttribute(ni, 1));
      for (const [v] of st.snapped) ctx.P[v * 3 + 2] = lvl.z; ctx.posAttr.needsUpdate = true;
      // the flat floor, for the eye and for the feet
      const fg = floorGeometry(A.G, A.mask, lvl.z), g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(fg.pos, 3)); g.setIndex(new THREE.BufferAttribute(fg.idx, 1));
      mesh = new THREE.Mesh(g, material(kind)); mesh.raycast = () => {}; mesh.frustumCulled = false; ctx.scene.add(mesh);
      const keep = []; for (let t = 0; t < nT; t++) if (!A.cull[t]) keep.push(ctx.CI[t * 3], ctx.CI[t * 3 + 1], ctx.CI[t * 3 + 2]);
      const base = ctx.CP.length / 3, pos2 = new Float32Array(ctx.CP.length + fg.pos.length); pos2.set(ctx.CP); pos2.set(fg.pos, ctx.CP.length);
      const idx2 = new Uint32Array(keep.length + fg.idx.length); idx2.set(keep); for (let k = 0; k < fg.idx.length; k++) idx2[keep.length + k] = fg.idx[k] + base;
      st.cp = pos2; st.ci = idx2; api.active = true;
      st.moved = ctx.floorPatches(); for (const m of st.moved) m.position.z -= PATCH_DROP;   // inferred floor patches go under the new floor (wall patches stay)
      api.info = { floorZ: +lvl.z.toFixed(3), culled: A.culled, footprintM2: +A.area.toFixed(1), snappedVerts: st.snapped.length, scan: st.scan, kind };
    }
    kindNow = kind; if (texMat.uniforms.tile.value) texMat.uniforms.tile.value.dispose();
    texMat.uniforms.tile.value = tileTexture(kind === 'match' ? st.scan.kind : kind, st.scan, kind);   // "match": the class the scan floor was sorted into, in the scan's colour
    api.info.kind = kind; ctx.rebuild(); return api.info;
  };
  api.restore = function () {
    if (!api.active) return false;
    ctx.house.geometry.setIndex(st.origIndex);
    for (const [v, z] of st.snapped) ctx.P[v * 3 + 2] = z; ctx.posAttr.needsUpdate = true;
    ctx.scene.remove(mesh); mesh.geometry.dispose(); texMat.uniforms.tile.value.dispose(); texMat.uniforms.shade.value.dispose(); texMat.dispose(); mesh = texMat = null;
    for (const m of st.moved) m.position.z += PATCH_DROP;
    api.active = false; st = null; api.info = null; ctx.rebuild(); return true;
  };
  api.collision = (cp, ci) => api.active ? [st.cp, st.ci] : [cp, ci];
  api.kind = () => kindNow; api.floorZ = () => st && st.floorZ;
  return api;
}

const api = { PATCH_DROP, create, floorLevel, analyse, floorGeometry, classifyFloor, makeTexture, baseColour, flatness, makeGrid, KINDS, PRESET, TILE_M, SLAB };
root.FloorReset = api; if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
