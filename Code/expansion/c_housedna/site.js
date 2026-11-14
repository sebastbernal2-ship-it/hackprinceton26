// Neighbourhood context for c_housedna. Ported from d_roofshell/site.js (painted ground + detail shader, street with
// curbs / parkway / sidewalks, neighbour massing, textured foliage, hedges, cypress) and re-dressed to match the drone
// photo of this LA block: front porch and street to the south (-y), driveway along the east side, fan palms, lush
// planting, muted stucco / siding neighbours with dark shingle or clay-tile roofs (no white stucco, no white roofs).
import * as THREE from '../../vendor/three.module.min.js';
import { makeNoise, rng, grassDetailTex, concreteTex, leafTex } from './site_tex.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// --------------------------------------------------------------------------------------------- foliage helpers
function blob(geo, seed, amp, freq) {
  const p = geo.attributes.position, n3 = makeNoise(seed, 64), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + amp * (n3(v.x * freq + 10, v.y * freq + v.z * freq * 0.7 + 10) - 0.5) * 2;
    v.multiplyScalar(k); p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals(); return geo;
}

// one fan-palm crown (Washingtonia): ~20 pleated fans on petioles, merged into one geometry with vertex colours.
function fanCrownGeometry(seed, R = 1.0) {
  const r = rng(seed), pos = [], col = [], idx = [];
  const nFr = 22;
  for (let f = 0; f < nFr; f++) {
    const az = f / nFr * Math.PI * 2 + r() * 0.3;
    const elev = 1.05 - (f % 3) * 0.45 - r() * 0.35;          // upper, level and drooping fronds
    const L = 0.55 + r() * 0.3;                                  // petiole length
    const age = Math.max(0, -elev) * 0.9 + r() * 0.15;          // lower fronds older / yellower
    const g = [0.17 + age * 0.22, 0.27 + age * 0.07, 0.11 - age * 0.03];
    const rot = new THREE.Matrix4().makeRotationZ(az).multiply(new THREE.Matrix4().makeRotationY(-elev));
    const add = (x, y, z, c) => { const v = V3(x, y, z).applyMatrix4(rot); pos.push(v.x, v.y, v.z); col.push(...c); return pos.length / 3 - 1; };
    // petiole: thin flat strip along +x
    const p0 = add(0, -0.025, 0, g), p1 = add(L, -0.02, 0, g), p2 = add(L, 0.02, 0, g), p3 = add(0, 0.025, 0, g);
    idx.push(p0, p1, p2, p0, p2, p3);
    // fan: leaflets radiating from the petiole end, span 150 deg, pleated, tips drooping
    const N = 15, span = 2.6, Rf = R * (0.85 + r() * 0.3);
    const c0 = add(L, 0, 0.02, g);
    for (let i = 0; i < N; i++) {
      const a0 = -span / 2 + span * i / N, a1 = -span / 2 + span * (i + 1) / N, am = (a0 + a1) / 2;
      const rt = Rf * (0.92 + r() * 0.12), rm = Rf * 0.62;
      const droop = rr => -0.45 * (rr / Rf) ** 2.2 * (0.6 + 0.4 * Math.abs(Math.sin(am)));
      const pleat = (i % 2 ? 0.035 : -0.035);
      const sh = 0.86 + 0.14 * (i % 2);
      const gc = g.map(v => v * sh);
      const q0 = add(L + Math.cos(a0) * rm, Math.sin(a0) * rm, droop(rm), gc);
      const q1 = add(L + Math.cos(am) * rm * 1.02, Math.sin(am) * rm * 1.02, droop(rm) + pleat, gc);
      const q2 = add(L + Math.cos(a1) * rm, Math.sin(a1) * rm, droop(rm), gc);
      idx.push(c0, q0, q1, c0, q1, q2);
      // split tips (two thin segments per leaflet)
      for (const [aa, qq] of [[a0 * 0.6 + am * 0.4, q0], [a1 * 0.6 + am * 0.4, q2]]) {
        const t = add(L + Math.cos(aa) * rt, Math.sin(aa) * rt, droop(rt) - 0.08, gc);
        idx.push(qq, q1, t);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}

// --------------------------------------------------------------------------------------------- painted ground
export const SITE = { x0: -40, x1: 32, y0: -36, y1: 36, px: 2048 };

function paintGround(L) {
  const N = SITE.px, s = N / (SITE.x1 - SITE.x0);
  const X = x => (x - SITE.x0) * s, Y = y => (SITE.y1 - y) * s;
  const c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d');
  // lawn colour field (LA lawns: green with dry patches)
  const img = g.createImageData(N, N), d = img.data, n1 = makeNoise(101, 32), n2 = makeNoise(103, 128), n3 = makeNoise(107, 512), R = rng(5);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = n1(i / 96, j / 96), b = n2(i / 20, j / 20), e = n3(i / 3, j / 3);
    const dry = Math.max(0, a - 0.6) * 2.4;
    const t = 0.55 * b + 0.45 * e;
    let r = 90 + 28 * t, gg = 104 + 24 * t, bb = 60 + 12 * t;
    r += dry * 40; gg += dry * 16; bb += dry * 14;
    const k = (j * N + i) * 4, jit = (R() - 0.5) * 16;
    d[k] = r + jit; d[k + 1] = gg + jit; d[k + 2] = bb + jit * 0.6; d[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // mask: white = grass detail, grey = concrete detail, black = none
  const mask = document.createElement('canvas'); mask.width = mask.height = N / 2; const m = mask.getContext('2d');
  m.fillStyle = '#fff'; m.fillRect(0, 0, N / 2, N / 2); m.scale(0.5, 0.5);
  const rect = (ctx, x0, x1, y0, y1) => ctx.fillRect(X(x0), Y(y1), (x1 - x0) * s, (y1 - y0) * s);
  const polyPath = (ctx, P) => { ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))); ctx.closePath(); };
  // planting beds (dark soil / mulch) - front yard beds and side strips, as on the drone photo (little lawn, lots of planting)
  const Rs = rng(9);
  const bed = (x0, x1, y0, y1) => {
    g.fillStyle = '#4f3d2e'; rect(g, x0, x1, y0, y1); m.fillStyle = '#000'; rect(m, x0, x1, y0, y1);
    g.fillStyle = 'rgba(30,20,12,0.5)'; for (let k = 0; k < (x1 - x0) * (y1 - y0) * 120; k++) g.fillRect(X(x0 + Rs() * (x1 - x0)), Y(y0 + Rs() * (y1 - y0)), 2, 2);
    g.fillStyle = 'rgba(150,120,90,0.35)'; for (let k = 0; k < (x1 - x0) * (y1 - y0) * 60; k++) g.fillRect(X(x0 + Rs() * (x1 - x0)), Y(y0 + Rs() * (y1 - y0)), 2, 1);
  };
  for (const b of L.beds) bed(...b);
  // paving
  const conc = (x0, x1, y0, y1, joint, dir, col = '#c4c0b7') => {
    g.fillStyle = col; rect(g, x0, x1, y0, y1); m.fillStyle = '#808080'; rect(m, x0, x1, y0, y1);
    g.strokeStyle = 'rgba(70,66,60,0.55)'; g.lineWidth = 1.4;
    if (dir === 'x') for (let x = x0 + joint; x < x1 - 0.1; x += joint) { g.beginPath(); g.moveTo(X(x), Y(y0)); g.lineTo(X(x), Y(y1)); g.stroke(); }
    else for (let y = y0 + joint; y < y1 - 0.1; y += joint) { g.beginPath(); g.moveTo(X(x0), Y(y)); g.lineTo(X(x1), Y(y)); g.stroke(); }
    g.strokeStyle = 'rgba(60,56,50,0.35)'; g.lineWidth = 1; g.strokeRect(X(x0), Y(y1), (x1 - x0) * s, (y1 - y0) * s);
  };
  const D = L.drive;
  conc(D.x0, D.x1, D.y0, D.y1, 3.0, 'y');
  g.strokeStyle = 'rgba(70,66,60,0.5)'; g.beginPath(); g.moveTo(X((D.x0 + D.x1) / 2), Y(D.y0)); g.lineTo(X((D.x0 + D.x1) / 2), Y(D.y1)); g.stroke();
  g.fillStyle = 'rgba(80,76,70,0.12)'; rect(g, D.x0 + 0.5, D.x0 + 0.95, D.y0, D.y1 - 1); rect(g, D.x1 - 0.95, D.x1 - 0.5, D.y0, D.y1 - 1);   // tyre stains
  conc(L.walk.x0, L.walk.x1, L.walk.y0, L.walk.y1, 1.2, 'y');                                   // front walk
  for (const sw of L.sidewalks) conc(SITE.x0, SITE.x1, sw[0], sw[1], 1.5, 'x');                 // public sidewalks
  conc(D.x0 - 0.4, D.x1 + 0.4, L.curbN, L.sidewalks[0][0], 3, 'x');                             // driveway apron across the parkway
  // curbs + street
  g.fillStyle = '#b9b5ad'; rect(g, SITE.x0, SITE.x1, L.curbN - 0.18, L.curbN); rect(g, SITE.x0, SITE.x1, L.curbS, L.curbS + 0.18);
  const Ra = rng(77);
  g.fillStyle = '#4b4c4d'; rect(g, SITE.x0, SITE.x1, L.curbS + 0.18, L.curbN - 0.18);
  for (let k = 0; k < 50000; k++) { const v = 50 + Ra() * 45; g.fillStyle = `rgba(${v},${v},${v + 2},0.5)`; g.fillRect(Ra() * N, Y(L.curbS + 0.18 + Ra() * (L.curbN - L.curbS - 0.36)), 2, 2); }
  g.fillStyle = 'rgba(30,30,32,0.35)'; for (let k = 0; k < 14; k++) { const x0 = SITE.x0 + Ra() * (SITE.x1 - SITE.x0); rect(g, x0, x0 + 0.6 + Ra() * 3, L.curbS + 1 + Ra() * 6, L.curbS + 1.1 + Ra() * 6.2); }  // crack seal
  g.fillStyle = 'rgba(70,70,72,0.5)'; rect(g, SITE.x0, SITE.x1, L.curbN - 0.6, L.curbN - 0.18); rect(g, SITE.x0, SITE.x1, L.curbS + 0.18, L.curbS + 0.6);   // gutter pans
  m.fillStyle = '#404040'; rect(m, SITE.x0, SITE.x1, L.curbS, L.curbN);
  // contact shadow / ambient occlusion around the house and the lot fences
  const ao = document.createElement('canvas'); ao.width = ao.height = N; const a = ao.getContext('2d');
  a.fillStyle = '#fff'; a.fillRect(0, 0, N, N); a.filter = `blur(${Math.round(0.35 * s)}px)`; a.fillStyle = '#000';
  polyPath(a, L.env); a.fill();
  for (const f of L.fences) { a.beginPath(); a.moveTo(X(f[0]), Y(f[1])); a.lineTo(X(f[2]), Y(f[3])); a.lineWidth = 0.25 * s; a.strokeStyle = '#000'; a.stroke(); }
  g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.5; g.drawImage(ao, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const mt = new THREE.CanvasTexture(mask); mt.colorSpace = THREE.NoColorSpace;
  return { tex: t, mask: mt };
}

function groundMaterial(tex, mask, grassDetail, concDetail) {
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = sh => {
    sh.uniforms.tGrass = { value: grassDetail }; sh.uniforms.tConc = { value: concDetail }; sh.uniforms.tMask = { value: mask };
    sh.uniforms.uScale = { value: new THREE.Vector2(SITE.x1 - SITE.x0, SITE.y1 - SITE.y0) };
    sh.fragmentShader = 'uniform sampler2D tGrass; uniform sampler2D tConc; uniform sampler2D tMask; uniform vec2 uScale;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      { vec2 wuv = vMapUv * uScale; float mk = texture2D(tMask, vMapUv).r;
        vec3 gd = texture2D(tGrass, wuv * 1.3).rgb * 2.0; vec3 gd2 = texture2D(tGrass, wuv * 0.37 + 0.3).rgb * 2.0;
        vec3 cd = texture2D(tConc, wuv * 0.5).rgb / vec3(0.77,0.76,0.73);
        vec3 det = mk > 0.75 ? mix(vec3(1.0), gd * gd2, 0.75) : (mk > 0.3 ? cd : vec3(1.0));
        diffuseColor.rgb *= det; }`);
  };
  return mat;
}

// --------------------------------------------------------------------------------------------- the site
// ctx: { G0, env (outer envelope CCW), ex0, ex1, ey0, ey1, LOT, porchX, M (C materials), B (build.js), roofMat, soffitMat, sidingMap }
export function buildSite(ctx) {
  const { G0, env, ex1, ey1, LOT, M, B } = ctx;
  const group = new THREE.Group();
  const curbN = LOT.y0 - 3.5, curbS = curbN - 9.5;
  const L = {
    env, curbN, curbS,
    sidewalks: [[LOT.y0 - 2.6, LOT.y0 - 1.0], [curbS - 2.4, curbS - 0.9]],
    drive: { x0: ex1 + 0.9, x1: ex1 + 3.9, y0: LOT.y0 - 1.0, y1: ey1 + 1.0 },
    walk: { x0: ctx.porchX - 0.6, x1: ctx.porchX + 0.6, y0: LOT.y0 - 1.0, y1: ctx.porchY },
    beds: [
      [LOT.x0 + 0.3, ctx.porchX - 1.6, LOT.y0 - 0.6, LOT.y0 + 1.6],        // front beds along the sidewalk
      [ctx.porchX + 1.6, ex1 + 0.6, LOT.y0 - 0.6, LOT.y0 + 1.6],
      [LOT.x0 + 0.2, LOT.x0 + 2.4, LOT.y0 + 1.6, LOT.y1 - 0.3],            // west side lot-line planting
      [LOT.x0 + 0.2, LOT.x1 - 0.3, LOT.y1 - 2.0, LOT.y1 - 0.2],            // back fence planting
      [ex1 + 4.1, LOT.x1 + 2.4, LOT.y0 - 0.6, ey1 + 1.0],                   // strip east of the driveway
    ],
    fences: [[LOT.x0, LOT.y0 + 4, LOT.x0, LOT.y1], [LOT.x0, LOT.y1, LOT.x1, LOT.y1], [LOT.x1, LOT.y1, LOT.x1, ey1 + 1.5]],
  };
  ctx.layout = L;
  const { tex, mask } = paintGround(L);
  const gdet = grassDetailTex(), cdet = concreteTex();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(SITE.x1 - SITE.x0, SITE.y1 - SITE.y0), groundMaterial(tex, mask, gdet, cdet));
  ground.position.set((SITE.x0 + SITE.x1) / 2, (SITE.y0 + SITE.y1) / 2, G0); ground.receiveShadow = true; group.add(ground);
  // far ground, continuing street + sidewalks
  const farTex = gdet.clone(); farTex.repeat.set(400, 400); farTex.needsUpdate = true;
  const far = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshStandardMaterial({ color: 0x6c7a4a, roughness: 1, map: farTex }));
  far.position.set(0, 0, G0 - 0.03); far.receiveShadow = true; group.add(far);
  const strip = (y0, y1, col, dz) => { const mm = new THREE.Mesh(new THREE.PlaneGeometry(1600, y1 - y0), new THREE.MeshStandardMaterial({ color: col, roughness: 0.95 }));
    mm.position.set(0, (y0 + y1) / 2, G0 - dz); mm.receiveShadow = true; group.add(mm); };
  strip(curbS, curbN, 0x4b4c4d, 0.012); strip(L.sidewalks[0][0], L.sidewalks[0][1], 0xc4c0b7, 0.015); strip(L.sidewalks[1][0], L.sidewalks[1][1], 0xc4c0b7, 0.015);
  // raised curbs
  B.box(group, M.concrete, -800, 800, curbN - 0.18, curbN, G0 - 0.02, G0 + 0.12, false);
  B.box(group, M.concrete, -800, 800, curbS, curbS + 0.18, G0 - 0.02, G0 + 0.12, false);

  // ---------------- materials for planting
  const leafM = (rgb) => new THREE.MeshStandardMaterial({ map: leafTex(rgb), roughness: 0.95 });
  const leaves = [leafM([58, 86, 44]), leafM([44, 72, 38]), leafM([72, 98, 46]), leafM([36, 58, 34]), leafM([86, 104, 52])];
  const hedgeM = leafM([42, 66, 38]), cypM = leafM([34, 54, 32]);
  const trunkM = new THREE.MeshStandardMaterial({ color: 0x6b5a48, roughness: 1 });
  const palmTrunkM = new THREE.MeshStandardMaterial({ color: 0x7d6e5c, roughness: 1 });
  const frondM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  const skirtM = new THREE.MeshStandardMaterial({ map: leafTex([112, 88, 58]), roughness: 1 });
  ctx.leaves = leaves;

  const shrub = (x, y, r, mat, seed, sq = 0.8) => { const geo = blob(new THREE.IcosahedronGeometry(r, 3), seed, 0.22, 2.2); geo.scale(1, 1, sq);
    const mm = new THREE.Mesh(geo, mat); mm.position.set(x, y, G0 + r * 0.55); mm.castShadow = mm.receiveShadow = true; group.add(mm); return mm; };
  ctx.shrub = shrub;
  const hedge = (x0, x1, y0, y1, h, mat, seed) => {
    const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, h, Math.max(2, Math.round((x1 - x0) * 3)), Math.max(2, Math.round((y1 - y0) * 3)), 4);
    const p = geo.attributes.position, nz = makeNoise(seed, 64);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = (nz((x + x0) * 2.1, (y + y0) * 2.1 + z * 2) - 0.5) * 0.14;
      const rx = Math.sign(x) * (Math.abs(x) > (x1 - x0) / 2 - 1e-3 ? k : 0), ry = Math.sign(y) * (Math.abs(y) > (y1 - y0) / 2 - 1e-3 ? k : 0);
      p.setXYZ(i, x + rx, y + ry, z + (z > h / 2 - 1e-3 ? k : 0));
    }
    geo.computeVertexNormals();
    const uvh = geo.attributes.uv, nh = geo.attributes.normal;
    for (let i = 0; i < uvh.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const top = Math.abs(nh.getZ(i)) > 0.7;
      uvh.setXY(i, (Math.abs(nh.getX(i)) > Math.abs(nh.getY(i)) ? y : x) * 1.6, (top ? (Math.abs(nh.getX(i)) > 0.5 ? x : y) : z) * 1.6); }
    const mm = new THREE.Mesh(geo, mat); mm.position.set((x0 + x1) / 2, (y0 + y1) / 2, G0 + h / 2); mm.castShadow = mm.receiveShadow = true; group.add(mm);
  };
  const cypress = (x, y, h, r) => {
    const pts = []; for (let k = 0; k <= 16; k++) { const t = k / 16; pts.push(new THREE.Vector2(r * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.7) * (1 - t * 0.35) + 0.01, t * h)); }
    const geo = new THREE.LatheGeometry(pts, 14); geo.rotateX(Math.PI / 2); blob(geo, Math.floor(x * 13 + y), 0.12, 1.4);
    const uvc = geo.attributes.uv; for (let i = 0; i < uvc.count; i++) uvc.setXY(i, uvc.getX(i) * 4, uvc.getY(i) * h / 1.5);
    const mm = new THREE.Mesh(geo, cypM); mm.position.set(x, y, G0 + 0.3); mm.castShadow = mm.receiveShadow = true; group.add(mm);
  };
  const tree = (x, y, h, r, mat, seed) => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, h * 0.6, 8).rotateX(Math.PI / 2), trunkM); t.position.set(x, y, G0 + h * 0.3); t.castShadow = true; group.add(t);
    const R2 = rng(seed);
    for (let k = 0; k < 7; k++) {
      const geo = blob(new THREE.IcosahedronGeometry(r * (0.55 + R2() * 0.3), 3), seed + k, 0.25, 1.1);
      const uvb = geo.attributes.uv; for (let i = 0; i < uvb.count; i++) uvb.setXY(i, uvb.getX(i) * 6, uvb.getY(i) * 3);
      const mm = new THREE.Mesh(geo, mat); mm.position.set(x + (R2() - 0.5) * r * 1.1, y + (R2() - 0.5) * r * 1.1, G0 + h * 0.62 + (R2() - 0.3) * r * 0.6);
      mm.castShadow = mm.receiveShadow = true; group.add(mm);
    }
  };
  // fan palm: slightly leaning tapered trunk, shaggy skirt of dead fronds, crown of pleated fans
  const crowns = [fanCrownGeometry(11, 1.0), fanCrownGeometry(23, 1.15), fanCrownGeometry(37, 0.9)];
  const palm = (x, y, h, seed, lean = 0.04, skirt = 1.2) => {
    const R2 = rng(seed), ax = (R2() - 0.5) * 2 * lean, ay = (R2() - 0.5) * 2 * lean;
    const G = new THREE.Group(); G.position.set(x, y, G0); G.rotation.set(ay, -ax, 0); group.add(G);
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.27, h, 10, 6).rotateX(Math.PI / 2), palmTrunkM); tr.position.z = h / 2; tr.castShadow = true; tr.receiveShadow = true; G.add(tr);
    for (let z = 0.4; z < h - skirt; z += 0.35) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2 + 0.07 * (1 - z / h), 0.025, 4, 10), palmTrunkM); ring.position.z = z; G.add(ring); }
    if (skirt > 0) { const sk = new THREE.Mesh(blob(new THREE.CylinderGeometry(0.42, 0.33, skirt, 10, 4).rotateX(Math.PI / 2), seed, 0.12, 3), skirtM); sk.position.z = h - skirt / 2 - 0.1; sk.castShadow = true; G.add(sk); }
    const cr = new THREE.Mesh(crowns[seed % 3], frondM); cr.position.z = h; cr.rotation.z = R2() * 6; cr.castShadow = true; cr.receiveShadow = true; G.add(cr);
    const s = 1.0 + R2() * 0.25; cr.scale.set(s, s, s);
  };
  // big-leaf tropicals (banana / bird of paradise clumps seen along the front on the drone photo)
  const paddleGeo = (() => { const s = new THREE.Shape(); s.moveTo(0, 0); s.bezierCurveTo(0.32, 0.2, 0.3, 0.8, 0.02, 1.0); s.bezierCurveTo(-0.3, 0.8, -0.32, 0.2, 0, 0);
    const g = new THREE.ShapeGeometry(s, 6); g.rotateX(Math.PI / 2); return g; })();
  const paddleM = new THREE.MeshStandardMaterial({ color: 0x3a6128, roughness: 0.8, side: THREE.DoubleSide });
  const tropical = (x, y, h, seed) => {
    const R2 = rng(seed), G = new THREE.Group(); G.position.set(x, y, G0); group.add(G);
    for (let k = 0; k < 7; k++) {
      const az = R2() * Math.PI * 2, el = 0.35 + R2() * 0.7, len = h * (0.55 + R2() * 0.45);
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, len * 0.55, 5).rotateX(Math.PI / 2), paddleM);
      const dir = V3(Math.cos(az) * Math.cos(el), Math.sin(az) * Math.cos(el), Math.sin(el));
      st.position.copy(dir.clone().multiplyScalar(len * 0.27)); st.quaternion.setFromUnitVectors(V3(0, 0, 1), dir); G.add(st);
      const lf = new THREE.Mesh(paddleGeo, paddleM); lf.scale.set(len * 0.7, 1, len * 0.75);
      lf.position.copy(dir.clone().multiplyScalar(len * 0.5)); lf.rotation.set(0, 0, 0);
      lf.quaternion.setFromUnitVectors(V3(0, 0, 1), V3(dir.x * 0.8, dir.y * 0.8, 0.6).normalize()); lf.rotateZ(az);
      lf.castShadow = true; G.add(lf);
    }
  };

  // ---------------- planting on the lot (kept clear of the fixed camera sight lines)
  const R = rng(31);
  // front yard: lush beds along the sidewalk, cypress screen and a fan palm by the driveway (drone photo)
  for (let x = LOT.x0 + 0.8; x < ctx.porchX - 1.8; x += 0.9 + R() * 0.5) shrub(x, LOT.y0 + 0.4 + R() * 0.6, 0.35 + R() * 0.3, leaves[Math.floor(R() * 5)], Math.floor(R() * 999));
  for (let x = ctx.porchX + 1.8; x < ex1 + 0.4; x += 0.9 + R() * 0.5) shrub(x, LOT.y0 + 0.4 + R() * 0.6, 0.35 + R() * 0.3, leaves[Math.floor(R() * 5)], Math.floor(R() * 999));
  tropical(LOT.x0 + 3.2, LOT.y0 + 0.9, 1.8, 5); tropical(ex1 - 0.8, LOT.y0 + 0.8, 1.6, 6); tropical(ctx.porchX + 3.4, LOT.y0 + 1.0, 1.3, 7);
  cypress(ex1 + 4.8, LOT.y0 - 0.2, 8.5, 0.75); cypress(ex1 + 5.6, LOT.y0 + 1.0, 7.6, 0.7); cypress(ex1 + 5.0, LOT.y0 + 2.4, 8.0, 0.72);
  palm(ex1 + 4.9, ey1 - 1.5, 7.5, 3, 0.05, 1.0);
  hedge(ex1 + 4.3, ex1 + 5.4, LOT.y0 + 3.5, ey1 - 2.5, 1.6, hedgeM, 4);
  // parkway palms along the street (classic LA), outside the front-view frustum centre
  for (const [x, h, sd] of [[LOT.x0 + 1.5, 13, 1], [ex1 + 7.5, 15, 2], [LOT.x0 - 13, 14, 4], [ex1 + 21, 12.5, 5], [-46, 15, 6], [36, 13.5, 7]]) palm(x, curbN + 0.45, h, sd, 0.05, 1.6);
  // west side yard and back yard
  for (let y = LOT.y0 + 3; y < LOT.y1 - 2; y += 1.1 + R() * 0.6) shrub(LOT.x0 + 0.9 + R() * 0.5, y, 0.45 + R() * 0.35, leaves[Math.floor(R() * 5)], Math.floor(R() * 999));
  hedge(LOT.x0 + 0.3, LOT.x0 + 1.2, LOT.y1 - 7, LOT.y1 - 0.4, 2.0, hedgeM, 8);
  for (let x = LOT.x0 + 2; x < LOT.x1 - 1; x += 1.3 + R() * 0.8) if (x < -9 || x > 1.5) shrub(x, LOT.y1 - 1.0 - R() * 0.4, 0.5 + R() * 0.4, leaves[Math.floor(R() * 5)], Math.floor(R() * 999));
  tropical(LOT.x0 + 1.6, LOT.y1 - 1.6, 2.4, 9); tropical(LOT.x1 - 1.4, LOT.y1 - 1.3, 2.2, 10);
  palm(LOT.x0 + 1.2, 3.5, 9.5, 12, 0.06, 1.2);                       // fan palm in the west side yard (drone)
  palm(LOT.x1 - 1.2, LOT.y1 - 1.0, 11, 13, 0.05, 1.4);
  tree(-8, LOT.y1 + 4.5, 8, 4.0, leaves[1], 400);
  tree(LOT.x0 - 6, 12, 7.5, 3.4, leaves[0], 500);
  cypress(LOT.x0 - 1.2, LOT.y1 + 1.5, 8, 0.8);
  // fences (vertical board, LA rear/side yards)
  ctx.buildFences && ctx.buildFences(L.fences);

  // ---------------- neighbours: LA bungalows / small apartments, muted stucco & siding, dark shingle or clay tile roofs
  const NB = new THREE.Group(); group.add(NB);
  const walls = ['#ddd2bd', '#c8cbb6', '#bcc6c6', '#e0cfb4', '#d3c4b0', '#c4ccc0', '#e3d8c4'].map(c => new THREE.MeshStandardMaterial({ color: c, map: ctx.stuccoMap, roughness: 0.95 }));
  const sidingNb = ['#aebcc0', '#c9c2ad', '#b7c0ae'].map(c => new THREE.MeshStandardMaterial({ color: c, map: ctx.sidingMap, roughness: 0.9 }));
  const roofs = [ctx.roofMat, ctx.roofMat, new THREE.MeshStandardMaterial({ map: ctx.roofMat.map, color: '#8a8580', roughness: 0.95 }),
    new THREE.MeshStandardMaterial({ map: ctx.tileMap, color: '#c98d6a', roughness: 0.85 })];
  const glassN = new THREE.MeshStandardMaterial({ color: '#2a333a', roughness: 0.1, metalness: 0.2 });
  const batches = new Map();                 // material -> Batch (all neighbours merged: a few draw calls only)
  const bat = (mat) => { if (!batches.has(mat)) batches.set(mat, new B.Batch()); return batches.get(mat); };
  const house = (x0, y0, x1, y1, h, wallMat, roofMat, opts = {}) => {
    const pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    const floors = h > 4.5 ? [0, 2.9] : [0];
    pts.forEach((a, i) => { const b = pts[(i + 1) % 4]; const Lg = Math.hypot(b[0] - a[0], b[1] - a[1]); const u = [(b[0] - a[0]) / Lg, (b[1] - a[1]) / Lg], n = [u[1], -u[0]];
      B.wallFace(bat(wallMat), a, u, n, 0, 0, Lg, G0 - 0.05, G0 + h, [], 1, 0.96);
      for (const fz of floors) for (let x = 1.6; x < Lg - 1.2; x += 3.1) {
        B.wallFace(bat(M.trim), a, u, n, 0.02, x - 0.5, x + 0.5, G0 + fz + 1.25, G0 + fz + 2.55);
        B.wallFace(bat(glassN), a, u, n, 0.03, x - 0.4, x + 0.4, G0 + fz + 1.33, G0 + fz + 2.47);
      } });
    const ov = opts.ov ?? 0.45;
    B.hipRoof(bat(roofMat), bat(ctx.soffitMat), { x0: x0 - ov, y0: y0 - ov, x1: x1 + ov, y1: y1 + ov }, G0 + h, Math.tan((opts.pitch || 22) * Math.PI / 180));
  };
  // immediate neighbours (west, east across the driveway strip, north, across the street)
  house(-33, -7, -21.5, 6, 3.3, walls[0], roofs[3]);
  house(-33, 9, -22.5, 19, 3.3, sidingNb[0], roofs[0]);
  house(ex1 + 9.5, -7, ex1 + 20, 5, 3.4, walls[1], roofs[3], { pitch: 20 });
  house(ex1 + 9.5, 8.5, ex1 + 19, 19, 3.2, sidingNb[1], roofs[2]);
  house(-15, 22.5, 3, 32, 6.4, walls[3], roofs[0], { pitch: 18 });       // two-storey apartment block behind (drone)
  house(-28, 23, -17, 33, 3.3, walls[2], roofs[3]);
  house(6, 23, 16, 32, 3.3, sidingNb[2], roofs[0]);
  for (const [x0, w, wi, ri] of [[-31, 11, 4, 3], [-16, 11, 5, 0], [-1, 11, 6, 2], [14, 11, 0, 3], [29, 10, 2, 0]]) house(x0, curbS - 15, x0 + w, curbS - 4.5, 3.3, walls[wi], roofs[ri]);
  // the rest of the block: loose grid of bungalows with canopy trees and palms so the horizon is not a void
  const Rn = rng(909), farTrees = [], farPalms = [];
  for (let gx = -120; gx <= 120; gx += 18) for (let gy = -140; gy <= 140; gy += 15) {
    const x = gx + (Rn() - 0.5) * 4, y = gy + (Rn() - 0.5) * 3;
    if (x > -48 && x < 40 && y > curbS - 17 && y < 36) continue;            // our block + front row, handled above
    if (y > curbS - 3 && y < curbN + 3) continue;                           // street corridor
    const w = 8 + Rn() * 5, d = 10 + Rn() * 6, tall = Rn() < 0.12;
    const wm = Rn() < 0.3 ? sidingNb[Math.floor(Rn() * 3)] : walls[Math.floor(Rn() * walls.length)];
    house(x, y, x + w, y + d, tall ? 6.4 : 3.2, wm, roofs[Math.floor(Rn() * 4)], { pitch: 18 + Rn() * 6 });
    for (let k = 0; k < 2; k++) if (Rn() < 0.75) (Rn() < 0.35 ? farPalms : farTrees).push([x + Rn() * 18 - 3, y + (Rn() < 0.5 ? -2 : d + 1.5), 3 + Rn() * 3.5]);
  }
  for (const [x, y, r] of [[-26, -9, 4], [-36, 8, 4.5], [24, 22, 3.5], [26, -9, 4], [-45, 20, 4.5], [-40, -40, 4], [22, -40, 4]]) farTrees.push([x, y, r]);
  for (const [mat, b] of batches) NB.add(b.mesh(mat, mat !== ctx.soffitMat));
  const cg = blob(new THREE.IcosahedronGeometry(1, 2), 4242, 0.28, 1.4);
  const cuv = cg.attributes.uv; for (let i = 0; i < cuv.count; i++) cuv.setXY(i, cuv.getX(i) * 4, cuv.getY(i) * 2);
  const inst = new THREE.InstancedMesh(cg, leaves[0], farTrees.length * 4), tr = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.22, 1, 6).rotateX(Math.PI / 2), trunkM, farTrees.length);
  let ii = 0; const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  farTrees.forEach(([x, y, r], k) => {
    const h = r * 1.6;
    tr.setMatrixAt(k, m4.compose(V3(x, y, G0 + h * 0.3), q.identity(), V3(1, 1, h * 0.6)));
    for (let j = 0; j < 4; j++) {
      const s = r * (0.55 + Rn() * 0.3); e.set(Rn() * 6, Rn() * 6, Rn() * 6);
      inst.setMatrixAt(ii++, m4.compose(V3(x + (Rn() - 0.5) * r, y + (Rn() - 0.5) * r, G0 + h * 0.7 + (Rn() - 0.3) * r * 0.5), q.setFromEuler(e), V3(s, s, s * 0.85)));
    }
  });
  inst.castShadow = inst.receiveShadow = true; tr.castShadow = true; group.add(inst, tr);
  // far palms (instanced trunk + crown) - the LA skyline
  const pt = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.25, 1, 6).rotateX(Math.PI / 2).translate(0, 0, 0.5), palmTrunkM, farPalms.length);
  const pc = new THREE.InstancedMesh(crowns[0], frondM, farPalms.length);
  farPalms.forEach(([x, y], k) => { const h = 10 + Rn() * 8;
    pt.setMatrixAt(k, m4.compose(V3(x, y, G0), q.identity(), V3(1, 1, h)));
    pc.setMatrixAt(k, m4.compose(V3(x, y, G0 + h), q.setFromEuler(e.set(0, 0, Rn() * 6)), V3(1.1, 1.1, 1.1))); });
  pt.castShadow = pc.castShadow = true; group.add(pt, pc);
  return group;
}
