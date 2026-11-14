// Room-extension kit (c_housedna): the single source of the house-DNA addition generator.
// Used by c_housedna/index.html (the standalone viewer) and by Code/editor3d.html (the "Add room" tool).
//
//   import { loadExtensionKit } from './extension.js';
//   const kit = await loadExtensionKit();                    // base = this folder; loads house_dna.json, textures
//   const env = kit.createEnvironment(renderer, scene);      // optional: sky, sun (shadows), hemi fill, PMREM env, fog
//   scene.add(kit.site);                                     // optional: static street/neighbourhood (or build({site:true}))
//   const res = kit.build({ additions: [{ polygon, connect_wall: {a, b}, connect_to_room_label }] });
//   scene.add(res.group);  ...  res.dispose();
//
// build() returns { group, shell, roof, plan, site, additions: [{ group, spec }], specs, cuts, dispose() }.
//   group     : everything (shell + roof + plan overlay + addition groups [+ site when site:true])
//   shell     : the existing house's exterior (siding, windows, porch, chimney, planting, patio)
//   roof      : the hip roof of the house with the additions tied in (valleys), fascia, roof details
//   plan      : section-cut overlay for an orthographic plan view (invisible by default)
//   additions : one group per addition (outer walls, interior, door, windows); spec = dna_rules.makeSpec output
//   cuts      : doorway boxes {o, u, n, s0, s1, d, z1} to cut out of a scan mesh (see inCut()); also applied to the
//               kit's own scan mesh when it was loaded ({scan: true})
// Model frame: x east, y north, z up, metres, finished floor z = 0 (same as plan.json and the MatterPak OBJ).
import * as THREE from '../../vendor/three.module.min.js';
import { makeSpec, rectSides, pointInPoly } from './dna_rules.js';
import * as B from './build.js';
import { buildSite } from './site.js';
import { stuccoTex } from './site_tex.js';

export { makeSpec, rectSides, pointInPoly, THREE };

// is a triangle centroid (x, y, z) inside a doorway cut box (as returned in build().cuts)?
export function inCut(box, cx, cy, cz, zmin = -0.05) {
  const s = (cx - box.o[0]) * box.u[0] + (cy - box.o[1]) * box.u[1], d = (cx - box.o[0]) * box.n[0] + (cy - box.o[1]) * box.n[1];
  return s > box.s0 && s < box.s1 && Math.abs(d) < box.d && cz < box.z1 && cz > zmin;
}

export async function loadExtensionKit(baseUrl, opts = {}) {
  const base = new URL(baseUrl || './', import.meta.url).href.replace(/[^/]*$/, '');
  const url = u => new URL(u, base).href;
  const getJSON = u => fetch(url(u)).then(r => { if (!r.ok) throw new Error(`${u}: HTTP ${r.status}`); return r.json(); });
  const [dna, plan] = await Promise.all([
    opts.dna ? opts.dna : getJSON('house_dna.json'),
    opts.plan ? opts.plan : (opts.planUrl ? getJSON(opts.planUrl) : null),
  ]);

  // ------------------------------------------------------------------------------------------ materials
  const tl = new THREE.TextureLoader();
  const loadTex = (u, rep) => new Promise(res => tl.load(url(u), t => { t.colorSpace = THREE.SRGBColorSpace; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; res(t); }, undefined, () => res(null)));
  const ex = dna.exterior;
  const M = {
    siding: new THREE.MeshStandardMaterial({ color: new THREE.Color(ex.cladding.colour).lerp(new THREE.Color('#c9d4d6'), 0.35), map: B.sidingTex(), roughness: 0.85 }),
    trim: new THREE.MeshStandardMaterial({ color: '#f3f1ec', roughness: 0.55 }),
    sash: new THREE.MeshStandardMaterial({ color: '#f6f4ef', roughness: 0.5 }),
    fascia: new THREE.MeshStandardMaterial({ color: '#f1efe9', roughness: 0.6 }),
    gutter: new THREE.MeshStandardMaterial({ color: '#e9e7e1', roughness: 0.35, metalness: 0.1 }),
    soffit: new THREE.MeshStandardMaterial({ color: '#ecebe6', roughness: 0.9, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ color: '#27343c', roughness: 0.04, metalness: 0.0, envMapIntensity: 1.6, transparent: true, opacity: 0.38 }),
    glassHouse: new THREE.MeshStandardMaterial({ color: '#1f2a31', roughness: 0.05, metalness: 0.2, envMapIntensity: 1.4 }),
    found: new THREE.MeshStandardMaterial({ color: ex.foundation.colour, map: B.concreteTex('#c9c5bd', false), roughness: 0.95 }),
    vent: new THREE.MeshStandardMaterial({ color: '#2c2c2c', roughness: 0.8 }),
    chimney: new THREE.MeshStandardMaterial({ color: '#a5a39d', map: B.concreteTex('#d0cdc6', false), roughness: 0.95 }),
    grass: new THREE.MeshStandardMaterial({ map: B.grassTex(), roughness: 1 }),
    concrete: new THREE.MeshStandardMaterial({ map: B.concreteTex(), roughness: 0.9 }),
    asphalt: new THREE.MeshStandardMaterial({ map: B.asphaltTex(), roughness: 0.95 }),
    fence: new THREE.MeshStandardMaterial({ map: B.fenceTex(), roughness: 0.9 }),
    shrub: new THREE.MeshStandardMaterial({ color: '#4d6b33', roughness: 1, flatShading: true }),
    shrub2: new THREE.MeshStandardMaterial({ color: '#5f7d3a', roughness: 1, flatShading: true }),
    bark: new THREE.MeshStandardMaterial({ color: '#5a4636', roughness: 1 }),
    mulch: new THREE.MeshStandardMaterial({ map: B.mulchTex(), roughness: 1 }),
    pavers: new THREE.MeshStandardMaterial({ map: B.concreteTex('#b9ab98'), roughness: 0.9 }),
    pochet: new THREE.MeshBasicMaterial({ color: '#2b2b2e' }), planWin: new THREE.MeshBasicMaterial({ color: '#8fd3ff' }), planNew: new THREE.MeshBasicMaterial({ color: '#c0392b' }),
    plate: new THREE.MeshStandardMaterial({ color: '#f4f2ec', roughness: 0.4 }), grille: new THREE.MeshStandardMaterial({ color: '#3a3631', roughness: 0.6, metalness: 0.4 }),
    knob: new THREE.MeshStandardMaterial({ color: '#b08d57', roughness: 0.3, metalness: 0.8 }),
    frontDoor: new THREE.MeshStandardMaterial({ color: '#6b4a2f', roughness: 0.6 }),
  };
  for (const m of Object.values(M)) m.shadowSide = THREE.DoubleSide;
  const shingle = await loadTex(ex.roof.texture || 'assets/roof_shingles.jpg', true);
  // darker, neutral charcoal than the raw drone crop: the sky fill + env light made it read light and blue (A's tone is closer)
  M.roof = new THREE.MeshStandardMaterial({ map: shingle, color: '#b8ab9f', roughness: 0.97, envMapIntensity: 0.35, shadowSide: THREE.DoubleSide });
  const PHOTO = { base: await loadTex('assets/interior/baseboard_c.jpg', true), crown: await loadTex('assets/interior/crown_c.jpg', true), win: await loadTex('assets/interior/window_int_c.png', false) };
  // window photo geometry (b_scanreuse/build_assets.py: 400 px/m rectification of Matterport photo 020)
  const WP = { size: [1.64, 2.2775], open: [0.80, 1.50], marginB: 0.42 };
  const winPhoto = PHOTO.win && new THREE.MeshBasicMaterial({ map: PHOTO.win, color: '#dcdcdc', transparent: true, alphaTest: 0.04, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  // map a trim box's long axis (local x, or y when alongY) in metres onto a photo strip of `rep` metres
  function photoTrim(m, rep, alongY = false) {
    const g = m.geometry, p = g.attributes.position, uv = g.attributes.uv; g.computeBoundingBox(); const bb = g.boundingBox;
    for (let i = 0; i < p.count; i++) uv.setXY(i, ((alongY ? p.getY(i) - bb.min.y : p.getX(i) - bb.min.x)) / rep, (p.getZ(i) - bb.min.z) / (bb.max.z - bb.min.z));
    uv.needsUpdate = true; return m;
  }
  M.acBody = new THREE.MeshStandardMaterial({ color: '#b8bab8', roughness: 0.55, metalness: 0.3 });
  const floorTexCache = {};
  const floorTexture = u => { if (!floorTexCache[u]) { const t = tl.load(url(u)); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; floorTexCache[u] = t; } return floorTexCache[u]; };

  // ------------------------------------------------------------------------------------------ scanned house mesh (optional)
  // The viewer shows the MatterPak mesh of the house (assets/house_mesh.bin); editor3d has its own empty-house mesh and
  // applies build().cuts itself.
  const scan = { group: null, groups: [] };
  if (opts.scan) {
    const meshMeta = await getJSON('assets/house_mesh.json');
    scan.group = new THREE.Group();
    const buf = await fetch(url('assets/house_mesh.bin')).then(r => r.arrayBuffer());
    const nv = meshMeta.nv, ni = meshMeta.ni;
    const pos = new Float32Array(buf, 0, nv * 3), uv = new Float32Array(buf, nv * 12, nv * 2), idx = new Uint32Array(buf, nv * 20, ni);
    const texs = await Promise.all(meshMeta.groups.map(g => loadTex(meshMeta.tex_dir + g.tex)));
    meshMeta.groups.forEach((g, i) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(g.v0 * 3, (g.v0 + g.nv) * 3), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv.subarray(g.v0 * 2, (g.v0 + g.nv) * 2), 2));
      const full = idx.slice(g.i0, g.i0 + g.ni);
      geo.setIndex(new THREE.BufferAttribute(full, 1));
      if (texs[i]) texs[i].flipY = false;
      const mat = new THREE.MeshBasicMaterial({ map: texs[i], toneMapped: false });
      const m = new THREE.Mesh(geo, mat); m.frustumCulled = false;
      scan.group.add(m); scan.groups.push({ geo, full, pos: geo.attributes.position.array });
    });
  }
  // cut the doorways (boxes in wall coords) out of the scan surface
  function cutScan(boxes) {
    for (const g of scan.groups) {
      const P = g.pos, I = g.full, keep = [];
      for (let i = 0; i < I.length; i += 3) {
        let cx = 0, cy = 0, cz = 0;
        for (let k = 0; k < 3; k++) { const v = I[i + k] * 3; cx += P[v]; cy += P[v + 1]; cz += P[v + 2]; }
        cx /= 3; cy /= 3; cz /= 3;
        if (!boxes.some(b => inCut(b, cx, cy, cz))) keep.push(I[i], I[i + 1], I[i + 2]);
      }
      g.geo.setIndex(new THREE.BufferAttribute(new Uint32Array(keep), 1));
    }
  }

  // ------------------------------------------------------------------------------------------ static site (ground etc.)
  const G0 = dna.levels.ground_z, EAVE = ex.roof.eave_z, K = Math.tan(ex.roof.pitch_deg * Math.PI / 180), OV = ex.roof.overhang_m;
  const T_EXT = dna.walls.exterior_thickness;
  const env = dna.envelope_outer;                  // outer face of the existing exterior walls (CCW)
  const ex0 = Math.min(...env.map(p => p[0])), ex1 = Math.max(...env.map(p => p[0])), ey0 = Math.min(...env.map(p => p[1])), ey1 = Math.max(...env.map(p => p[1]));
  const site = new THREE.Group(); site.name = 'site';
  function flat(parent, mat, x0, y0, x1, y1, z, rep) {
    const b = new B.Batch(); const P = (x, y) => new THREE.Vector3(x, y, z);
    b.quad(P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1), [[x0 / rep, y0 / rep], [x1 / rep, y0 / rep], [x1 / rep, y1 / rep], [x0 / rep, y1 / rep]], new THREE.Vector3(0, 0, 1));
    const m = b.mesh(mat, false); parent.add(m); return m;
  }
  const LOT = { x0: -19.5, x1: ex1 + 4.2, y0: ey0 - 6.5, y1: 17.5 };
  // front porch: recessed south edge between two projecting wings (static: derived from the envelope)
  let porch = null;
  env.forEach((a, i) => {
    const b = env[(i + 1) % env.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (Math.abs(a[1] - b[1]) < 0.01 && b[0] > a[0] && L > 2.5) {        // south-facing edge (CCW: west->east on the south side)
      const prev = env[(i - 1 + env.length) % env.length], next = env[(i + 2) % env.length];
      if (prev[1] < a[1] - 0.5 && next[1] < b[1] - 0.5 && (!porch || a[1] > porch.y)) porch = { x0: a[0], x1: b[0], y: a[1], depth: a[1] - Math.max(prev[1], next[1]) };
    }
  });
  // fences (side + back lot lines), vertical boards
  function fence(x0, y0, x1, y1) {
    const L = Math.hypot(x1 - x0, y1 - y0), u = [(x1 - x0) / L, (y1 - y0) / L];
    const Gf = new THREE.Group(); Gf.position.set(x0, y0, 0); Gf.rotation.z = Math.atan2(u[1], u[0]); site.add(Gf);
    const b = new B.Batch(); B.wallFace(b, [0, 0], [1, 0], [0, -1], 0.01, 0, L, G0, G0 + 1.8, [], 1.6, 1.8);
    B.wallFace(b, [0, 0], [1, 0], [0, 1], 0.01, 0, L, G0, G0 + 1.8, [], 1.6, 1.8);
    Gf.add(b.mesh(M.fence));
    for (let s = 0; s <= L; s += 2.4) B.box(Gf, M.bark, s - 0.05, s + 0.05, -0.06, 0.06, G0, G0 + 1.85);
  }
  let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  // neighbourhood (street, sidewalks, parkway palms, planting, neighbours): ported from d_roofshell/site.js, see site.js
  const tileMap = (() => {           // clay barrel tile (Spanish revival neighbours), tile = 1.7 m x 0.85 m like the shingles
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#a86a4a'; g.fillRect(0, 0, 256, 128);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 10; k++) { const x = k * 25.6 + (r % 2) * 12.8, y = r * 32;
      const gr = g.createLinearGradient(x, 0, x + 25.6, 0); gr.addColorStop(0, '#7d4630'); gr.addColorStop(0.5, '#d9997a'); gr.addColorStop(1, '#7d4630');
      g.fillStyle = gr; g.fillRect(x, y, 25.6, 30); g.fillStyle = 'rgba(40,20,10,0.5)'; g.fillRect(x, y + 28, 25.6, 4); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
  const stucco = stuccoTex([238, 236, 232]).map;
  const sctx = { G0, env, ex0, ex1, ey0, ey1, LOT, M, B, porchX: porch ? (porch.x0 + porch.x1) / 2 : -5, porchY: porch ? porch.y - porch.depth - 0.65 : ey0 - 0.6,
    roofMat: M.roof, soffitMat: M.soffit, sidingMap: M.siding.map, stuccoMap: stucco, tileMap,
    buildFences: fs => fs.forEach(f => fence(...f)) };
  site.add(buildSite(sctx));          // also needed when the site is not shown: it provides the shrub factory + leaf materials
  const shrubSpots = [];
  for (let x = ex0 + 0.6; x < ex1 - 0.5; x += 1.3 + rnd()) shrubSpots.push([x, ey0 - 0.75]);
  function shrub(x, y, r) { return sctx.shrub(x, y, r, sctx.leaves[Math.floor(rnd() * sctx.leaves.length)], Math.floor(rnd() * 999)); }
  const houseRects = ex.roof.rects.map(r => ({ x0: r[0] - OV, y0: r[1] - OV, x1: r[2] + OV, y1: r[3] + OV }));

  // ------------------------------------------------------------------------------------------ parametric additions
  // An addition is re-expressed as {a, d, n, width, depth, offset, lo, hi}: a = origin on the connect wall line, d = unit
  // vector along the house wall, n = away from the house; offset/width along d, depth along n. lo..hi = the extent of the
  // house edge (outer envelope) it is attached to, so the room can only slide along that edge.
  function edgeRange(ca, d) {
    let lo = -4, hi = Infinity, found = false;
    env.forEach((p, i) => { const q = env[(i + 1) % env.length];
      const off = pp => Math.abs((pp[0] - p[0]) * (q[1] - p[1]) - (pp[1] - p[1]) * (q[0] - p[0])) / Math.hypot(q[0] - p[0], q[1] - p[1]);
      const cb = [ca[0] + d[0], ca[1] + d[1]];
      if (off(ca) < 0.12 && off(cb) < 0.12) { const t = pp => (pp[0] - ca[0]) * d[0] + (pp[1] - ca[1]) * d[1]; lo = Math.min(t(p), t(q)) + 0.05; hi = Math.max(t(p), t(q)) - 0.05; found = true; } });
    return { lo, hi, found };
  }
  // from an addition {polygon, connect_wall} (test_case.json format)
  function paramsFromAddition(a0) {
    const ca = a0.connect_wall.a, cb = a0.connect_wall.b;
    const width = Math.hypot(cb[0] - ca[0], cb[1] - ca[1]), d = [(cb[0] - ca[0]) / width, (cb[1] - ca[1]) / width];
    const P = a0.polygon, cen = P.reduce((q, p) => [q[0] + p[0] / P.length, q[1] + p[1] / P.length], [0, 0]);
    let n = [-d[1], d[0]]; if ((cen[0] - ca[0]) * n[0] + (cen[1] - ca[1]) * n[1] < 0) n = [-n[0], -n[1]];
    const depth = Math.max(...P.map(p => (p[0] - ca[0]) * n[0] + (p[1] - ca[1]) * n[1]));
    let { lo, hi, found } = edgeRange(ca, d); if (!found) hi = width + 4;
    return { a: ca, d, n, width, depth, offset: 0, lo, hi, label: a0.connect_to_room_label };
  }
  // from a plan wall segment (centreline a->b) on the house outline: room of `width` x `depth` centred at `at` (a point
  // on the wall, default its middle). Returns null when the wall is not on the outer envelope.
  function paramsFromWall(wa, wb, { width = 3.5, depth = 4, at = null } = {}) {
    const L = Math.hypot(wb[0] - wa[0], wb[1] - wa[1]); if (L < 0.2) return null;
    const d = [(wb[0] - wa[0]) / L, (wb[1] - wa[1]) / L];
    if (Math.abs(d[0]) > 0.02 && Math.abs(d[1]) > 0.02) return null;      // the rule engine needs axis-aligned rooms
    const ad = Math.abs(d[0]) > Math.abs(d[1]) ? [Math.sign(d[0]), 0] : [0, Math.sign(d[1])];
    const ca = ad[0] ? [wa[0], (wa[1] + wb[1]) / 2] : [(wa[0] + wb[0]) / 2, wa[1]];
    let n = [-ad[1], ad[0]]; const m = [ca[0] + ad[0] * L / 2, ca[1] + ad[1] * L / 2];
    if (pointInPoly(env, [m[0] + n[0] * 0.5, m[1] + n[1] * 0.5])) n = [-n[0], -n[1]];
    // snap the wall line to the measured envelope: centreline = outer face - half the exterior wall thickness
    let edge = null;
    env.forEach((p, i) => { const q = env[(i + 1) % env.length];
      const along = ad[0] ? Math.abs(p[1] - q[1]) < 0.01 : Math.abs(p[0] - q[0]) < 0.01;
      const dist = ad[0] ? Math.abs(p[1] - (ca[1] + n[1] * T_EXT / 2)) : Math.abs(p[0] - (ca[0] + n[0] * T_EXT / 2));
      const tt = pp => (pp[0] - ca[0]) * ad[0] + (pp[1] - ca[1]) * ad[1];
      if (along && dist < 0.12 && Math.min(tt(p), tt(q)) < L / 2 && Math.max(tt(p), tt(q)) > L / 2 && (!edge || dist < edge.dist)) edge = { p, dist }; });
    if (!edge) return null;
    if (ad[0]) ca[1] = edge.p[1] - n[1] * T_EXT / 2; else ca[0] = edge.p[0] - n[0] * T_EXT / 2;
    const { lo, hi, found } = edgeRange(ca, ad); if (!found) return null;
    const t = at ? (at[0] - ca[0]) * ad[0] + (at[1] - ca[1]) * ad[1] : L / 2;
    const P = { a: ca, d: ad, n, width, depth, offset: t - width / 2, lo, hi };
    clampParams(P); return P;
  }
  function clampParams(P) {
    P.width = Math.max(2, Math.min(P.width, P.hi - P.lo)); P.depth = Math.max(2.2, Math.min(7, P.depth));
    P.offset = Math.max(P.lo, Math.min(P.hi - P.width, P.offset));
    return P;
  }
  // -> {polygon, connect_wall, connect_to_room_label} for makeSpec / build
  function additionFromParams(P, add = {}) {
    clampParams(P);
    const { a, d, n, width, depth, offset } = P;
    const A0 = [a[0] + d[0] * offset, a[1] + d[1] * offset], B1 = [A0[0] + d[0] * width, A0[1] + d[1] * width];
    const r = v => Math.round(v * 1000) / 1000, Q = (p, k) => [r(p[0] + n[0] * k), r(p[1] + n[1] * k)];
    add.polygon = [Q(A0, 0), Q(B1, 0), Q(B1, depth), Q(A0, depth)]; add.connect_wall = { a: Q(A0, 0), b: Q(B1, 0) };
    const mid = [(A0[0] + B1[0]) / 2 - n[0] * 0.3, (A0[1] + B1[1]) / 2 - n[1] * 0.3];
    const room = dna.rooms.find(q => pointInPoly(q.polygon, mid)); if (room) add.connect_to_room_label = room.label;
    else if (!add.connect_to_room_label && P.label) add.connect_to_room_label = P.label;
    return add;
  }

  // ------------------------------------------------------------------------------------------ lighting / sky (optional)
  function createEnvironment(renderer, scene, { fog = true, sky = true } = {}) {
    const group = new THREE.Group(); group.name = 'kit-environment';
    const HORIZON = new THREE.Color('#dfe7ec');
    const prevFog = scene.fog, prevEnv = scene.environment;
    if (fog) scene.fog = new THREE.Fog(HORIZON, 45, 150);
    const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color('#6f9fd0') }, hor: { value: HORIZON } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 hor; varying vec3 vP; void main(){ float t = clamp(vP.z*1.6,0.,1.); gl_FragColor = vec4(mix(hor, top, pow(t,0.7)),1.); }' });
    const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat); skyMesh.name = 'sky'; skyMesh.visible = sky; group.add(skyMesh);
    const pm = new THREE.PMREMGenerator(renderer); const es = new THREE.Scene(); es.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), skyMat.clone()));
    const g = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: '#6b7457' })); g.position.z = -1; es.add(g);
    const envTex = pm.fromScene(es, 0.02).texture; scene.environment = envTex; pm.dispose();
    // lights: LA afternoon sun from the south-west, sky fill
    const sun = new THREE.DirectionalLight('#fff3e2', 2.6);
    sun.position.set(-14, -18, 26); sun.target.position.set(-5, 1, 0); group.add(sun, sun.target);
    sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
    Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 90 });
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    const hemi = new THREE.HemisphereLight('#cfe0f2', '#77705f', 1.15); group.add(hemi);
    scene.add(group);
    return { group, sky: skyMesh, sun, hemi, environment: envTex, horizon: HORIZON,
      dispose() { scene.remove(group); scene.fog = prevFog; scene.environment = prevEnv; envTex.dispose(); skyMesh.geometry.dispose(); skyMat.dispose(); sun.shadow.map && sun.shadow.map.dispose(); } };
  }

  // ------------------------------------------------------------------------------------------ build
  function build({ additions = [], site: withSite = false, roof: withRoof = true, shell: withShell = true, planOverlay = true, scanCut = true } = {}) {
    const group = new THREE.Group(); group.name = 'kit-build';
    const shellG = new THREE.Group(); shellG.name = 'shell'; group.add(shellG);
    const roofGroup = new THREE.Group(); roofGroup.name = 'roof'; shellG.add(roofGroup);
    const specs = additions.map(add => makeSpec(dna, add));
    const geo = specs.map(spec => {
      const R = spec.rect, h = spec.tExt / 2;
      const sh = spec.sides[spec.shared];
      const shL = Math.hypot(sh.p1[0] - sh.p0[0], sh.p1[1] - sh.p0[1]); const shU = [(sh.p1[0] - sh.p0[0]) / shL, (sh.p1[1] - sh.p0[1]) / shL];
      // addition outer extents (for removing the house shell where the new room attaches)
      const AO = { x0: R.x0 - h, x1: R.x1 + h, y0: R.y0 - h, y1: R.y1 + h };
      return { spec, R, t: spec.tExt, h, sh, shL, shU, AO };
    });
    const ownMats = [];
    const ZS = -0.14;                               // siding starts a little below the finished floor

    // ---------------- existing house shell
    const sid = new B.Batch(), fnd = new B.Batch();
    const t = T_EXT;
    env.forEach((a, i) => {
      const b = env[(i + 1) % env.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      const n = [u[1], -u[0]];                        // outward for CCW
      // spans covered by the additions (collinear with their shared faces)
      const cuts = [];
      for (const { spec, R, h, AO } of geo) {
        const fl = { S: ['y', R.y0 + h], N: ['y', R.y1 - h], E: ['x', R.x1 - h], W: ['x', R.x0 + h] }[spec.shared];
        const onLine = fl[0] === 'y' ? (Math.abs(u[1]) < 0.01 && Math.abs(a[1] - fl[1]) < 0.05) : (Math.abs(u[0]) < 0.01 && Math.abs(a[0] - fl[1]) < 0.05);
        if (onLine) {
          const proj = (x, y) => (x - a[0]) * u[0] + (y - a[1]) * u[1];
          const c = [proj(AO.x0, AO.y0), proj(AO.x1, AO.y1), proj(AO.x0, AO.y1), proj(AO.x1, AO.y0)];
          const c0 = Math.max(0, Math.min(...c)), c1 = Math.min(L, Math.max(...c));
          if (c1 > c0) cuts.push({ s0: c0, s1: c1, z0: -5, z1: 50 });
        }
      }
      const inCutS = (s, m) => cuts.some(c => s > c.s0 - m && s < c.s1 + m);
      B.wallFace(sid, a, u, n, 0, 0, L, ZS, EAVE, cuts, 1, 0.96);
      B.wallFace(fnd, a, u, n, -0.015, 0, L, G0 - 0.05, ZS, cuts, 1.5, 1.5);
      // crawlspace vents every ~2.4 m, corner boards
      const Gw = new THREE.Group(); Gw.position.set(a[0], a[1], 0); Gw.rotation.z = Math.atan2(u[1], u[0]); shellG.add(Gw);
      for (let s = 1.2; s < L - 0.6; s += 2.4) if (!inCutS(s, 0.4)) B.box(Gw, M.vent, s - 0.2, s + 0.2, -0.005, -0.0, G0 + 0.12, G0 + 0.3, false);
      if (!cuts.some(c => c.s0 <= 0.05)) B.box(Gw, M.trim, 0, 0.1, -0.025, 0, ZS, EAVE - 0.02);
      if (!cuts.some(c => c.s1 >= L - 0.05)) B.box(Gw, M.trim, L - 0.1, L, -0.025, 0, ZS, EAVE - 0.02);
      B.box(Gw, M.trim, 0, L, -0.02, 0, ZS - 0.02, ZS + 0.06, false);  // water table board
      // measured windows on this edge
      dna.windows.forEach(w => {
        const c = [w.centre[0] + w.outward[0] * w.wall_thickness / 2, w.centre[1] + w.outward[1] * w.wall_thickness / 2];
        const s = (c[0] - a[0]) * u[0] + (c[1] - a[1]) * u[1], d = (c[0] - a[0]) * n[0] + (c[1] - a[1]) * n[1];
        if (Math.abs(d) > 0.12 || s < 0 || s > L) return;
        if (w.outward[0] * n[0] + w.outward[1] * n[1] < 0.9) return;
        if (inCutS(s, 0.3)) return;    // window now faces into an addition
        const unit = Math.min(Math.max(w.width - 0.2, 0.55), 2.2), nUnits = unit > 1.25 ? 2 : 1;
        const sill = Math.max(w.sill, 0.6), head = Math.min(Math.max(w.head, 1.9), 2.1);
        for (let k = 0; k < nUnits; k++) {
          const uw = unit / nUnits, s0 = s - unit / 2 + k * uw;
          const Gx = new THREE.Group(); Gx.position.set(a[0] + n[0] * -t / 2, a[1] + n[1] * -t / 2, 0); Gx.rotation.z = Math.atan2(u[1], u[0]); shellG.add(Gx);
          B.craftsmanWindow(Gx, { ...M, glass: M.glassHouse }, s0 + 0.01, s0 + uw - 0.01, sill, head, t, { ns: -1, casing: 0.1, lites: 3 });
        }
      });
    });
    shellG.add(sid.mesh(M.siding), fnd.mesh(M.found));

    if (porch) {
      const P = porch, zt = -0.05;
      B.box(shellG, M.concrete, P.x0, P.x1, P.y - P.depth - 0.05, P.y, G0, zt);
      for (let k = 1; k <= 2; k++) B.box(shellG, M.concrete, (P.x0 + P.x1) / 2 - 1.1, (P.x0 + P.x1) / 2 + 1.1, P.y - P.depth - 0.05 - k * 0.3, P.y - P.depth - 0.05 - (k - 1) * 0.3, G0, zt - k * (zt - G0) / 3);
      // pergola (white rafters seen in the drone photo)
      for (const x of [P.x0 + 0.15, P.x1 - 0.15]) B.box(shellG, M.trim, x - 0.09, x + 0.09, P.y - P.depth + 0.05, P.y - P.depth + 0.23, zt, 2.55);
      B.box(shellG, M.trim, P.x0, P.x1, P.y - P.depth + 0.07, P.y - P.depth + 0.21, 2.45, 2.7);
      for (let x = P.x0 + 0.1; x <= P.x1 - 0.05; x += 0.45) B.box(shellG, M.trim, x - 0.03, x + 0.03, P.y - P.depth - 0.25, P.y, 2.7, 2.86);
      // porch wall windows: the scan elevation shows a mulled pair either side of the door, but the detector rejects this
      // wall (furniture under the sills) -> filled with the house's window style, centred between door and corners
      for (const sx of [-1, 1]) {
        const cx = (P.x0 + P.x1) / 2 + sx * ((P.x1 - P.x0) / 4 + 0.3), uw = 0.62;
        const Gx = new THREE.Group(); Gx.position.set(P.x0, P.y + t / 2, 0); shellG.add(Gx);
        for (const k of [-1, 0]) B.craftsmanWindow(Gx, { ...M, glass: M.glassHouse }, cx - P.x0 + k * uw + 0.01, cx - P.x0 + (k + 1) * uw - 0.01, dna.window_stats.sill, 2.05, t, { ns: -1, casing: 0.1, lites: 3 });
      }
      // front door (glazed, centred on the porch wall: scan elevation of the dining-room south wall)
      const xc = (P.x0 + P.x1) / 2, y = P.y;
      B.box(shellG, M.trim, xc - 0.62, xc + 0.62, y - 0.03, y + 0.001, 0, 2.2);
      B.box(shellG, M.frontDoor, xc - 0.48, xc + 0.48, y - 0.04, y - 0.02, 0.01, 2.06);
      B.box(shellG, M.glassHouse, xc - 0.36, xc + 0.36, y - 0.045, y - 0.035, 0.95, 1.9);
    }
    // chimney at the measured fireplace
    const fc = ex.fireplace_chimney;
    if (fc) {
      const o = fc.outward, c = [fc.centre[0] + o[0] * 0.3, fc.centre[1] + o[1] * 0.3];
      const top = B.roofHeightAt(houseRects, EAVE, K, fc.centre[0] - o[0] * 0.5, fc.centre[1] - o[1] * 0.5) + 0.9;
      const wx = Math.abs(o[0]) > 0.5 ? 0.3 : 0.55, wy = Math.abs(o[0]) > 0.5 ? 0.55 : 0.3;
      B.box(shellG, M.chimney, c[0] - wx, c[0] + wx, c[1] - wy, c[1] + wy, G0, top);
      B.box(shellG, M.chimney, c[0] - wx - 0.04, c[0] + wx + 0.04, c[1] - wy - 0.04, c[1] + wy + 0.04, top - 0.12, top);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.25, 16), M.vent); cap.rotation.x = Math.PI / 2; cap.position.set(c[0], c[1], top + 0.12); shellG.add(cap);
    }
    // house shrubs; skip spots now covered by an addition
    seed = 777; shrubSpots.forEach(([x, y]) => { if (!porch || x < porch.x0 - 0.3 || x > porch.x1 + 0.3) { const sb = shrub(x, y, 0.45 + rnd() * 0.25);
      if (geo.some(({ AO }) => x > AO.x0 - 0.4 && x < AO.x1 + 0.4 && y > AO.y0 - 0.4 && y < AO.y1 + 0.4)) { sb.parent && sb.parent.remove(sb); sb.geometry.dispose(); } else shellG.add(sb); } });

    // ---------------- roof: existing hip solids + addition hip solids
    const allRects = [...houseRects, ...specs.map(s => s.roof.rect)];
    const rb = new B.Batch(), sbt = new B.Batch();
    allRects.forEach(r => B.hipRoof(rb, sbt, r, EAVE, K));
    roofGroup.add(rb.mesh(M.roof), sbt.mesh(M.soffit, false));
    B.fasciaAndGutter(roofGroup, M, allRects, EAVE, ex.roof.fascia_depth_m);
    roofDetails(roofGroup, houseRects, allRects);

    // ---------------- the additions
    const cuts = [], addOut = [];
    for (const gi of geo) {
      const { spec, R, t, h, sh, shL, shU, AO } = gi;
      const A = new THREE.Group(); A.name = 'addition'; A.userData.spec = spec; group.add(A);
      const paint = new THREE.MeshStandardMaterial({ color: spec.paint, roughness: 0.92, shadowSide: THREE.DoubleSide });
      const trimIn = new THREE.MeshStandardMaterial({ color: spec.trim, roughness: 0.5 });
      const ceilM = new THREE.MeshStandardMaterial({ color: spec.ceilingColour, roughness: 0.95, shadowSide: THREE.DoubleSide });
      const floorM = new THREE.MeshStandardMaterial({ map: floorTexture(spec.floor.tex), roughness: 0.42, envMapIntensity: 0.35 });
      const Min = { ...M, trimIn, glass: M.glass };
      // photographic trim strips from the scan (b_scanreuse baseboard / crown crops, neutralised and tinted with the measured trim)
      const trimBase = new THREE.MeshStandardMaterial({ color: spec.trim, map: PHOTO.base, roughness: 0.5 });
      const trimCrown = new THREE.MeshStandardMaterial({ color: spec.trim, map: PHOTO.crown, roughness: 0.5 });
      const leafPanel = new THREE.MeshStandardMaterial({ color: spec.trim, roughness: 0.6 });
      const fxMat = new THREE.MeshStandardMaterial({ color: '#fffaf0', emissive: '#fff1d6', emissiveIntensity: 0.35 });
      ownMats.push(paint, trimIn, ceilM, floorM, trimBase, trimCrown, leafPanel, fxMat);
      const inner = { x0: R.x0 + h, x1: R.x1 - h, y0: R.y0 + h, y1: R.y1 - h };
      spec.inner = inner;
      // the shared wall face sits on the house's outer face: centreline +- h
      const winBySide = k => spec.windows.filter(w => w.side === k);
      const outB = new B.Batch(), inB = new B.Batch(), fdB = new B.Batch();
      for (const k of ['S', 'E', 'N', 'W']) {
        const s = spec.sides[k]; const L = Math.hypot(s.p1[0] - s.p0[0], s.p1[1] - s.p0[1]); const u = [(s.p1[0] - s.p0[0]) / L, (s.p1[1] - s.p0[1]) / L];
        const n = s.out;
        const holes = winBySide(k).map(w => ({ s0: w.s0, s1: w.s1, z0: w.sill, z1: w.head }));
        if (k === spec.shared) {
          const d = spec.door;
          B.wallFace(inB, s.p0, u, [-n[0], -n[1]], h, h, L - h, 0, spec.ceiling, [{ s0: d.s0, s1: d.s1, z0: -1, z1: d.head }], 1, 1);
          continue;
        }
        // exterior face (siding) runs from corner to corner of the outer outline; inner face (paint) between inner corners
        const sideIsHouseAdjacent = (kk) => kk === spec.shared;
        const prevK = { S: 'W', E: 'S', N: 'E', W: 'N' }[k], nextK = { S: 'E', E: 'N', N: 'W', W: 'S' }[k];
        const sa = sideIsHouseAdjacent(prevK) ? h : -h, sbb = sideIsHouseAdjacent(nextK) ? L - h : L + h;
        B.wallFace(outB, s.p0, u, n, h, sa, sbb, ZS, EAVE, holes, 1, 0.96);
        B.wallFace(fdB, s.p0, u, n, h - 0.015, sa, sbb, G0 - 0.05, ZS, [], 1.5, 1.5);
        B.wallFace(inB, s.p0, u, [-n[0], -n[1]], h, h, L - h, 0, spec.ceiling, holes, 1, 1);
        const Gw = new THREE.Group(); Gw.position.set(s.p0[0], s.p0[1], 0); Gw.rotation.z = Math.atan2(u[1], u[0]); A.add(Gw);
        // local +y = left of u = inward (rect sides are CCW) -> outward = -y -> ns = -1
        // outside: craftsman window geometry; inside: the real bedroom window photographed in the scan (casing, stool, rod,
        // curtains, daylight through the glass), from b_scanreuse, wall keyed out so the measured paint shows around it
        winBySide(k).forEach(w => B.craftsmanWindow(Gw, Min, w.s0, w.s1, w.sill, w.head, t, { ns: -1, hole: true, interior: !winPhoto, casing: 0.1, lites: 3 }));
        if (winPhoto) winBySide(k).forEach((w, i, ws) => {
          const sx = (w.s1 - w.s0) / WP.open[0], sz = (w.head - w.sill) / WP.open[1];
          const c = (w.s0 + w.s1) / 2, half = WP.size[0] * sx / 2;
          // crop the photo so curtains never run past an inner corner or into the neighbouring window's decal
          const prev = ws[i - 1], next = ws[i + 1];
          const lo = Math.max(c - half, h + 0.02, prev ? (prev.s1 + w.s0) / 2 : -9), hi = Math.min(c + half, L - h - 0.02, next ? (w.s1 + next.s0) / 2 : 9);
          const z0 = w.sill - WP.marginB * sz, z1 = z0 + WP.size[1] * sz;
          const U = x => 0.5 + (x - c) / (2 * half);
          const b = new B.Batch(), P = (x, z) => new THREE.Vector3(x, h + 0.008, z);
          b.quad(P(lo, z0), P(hi, z0), P(hi, z1), P(lo, z1), [[1 - U(lo), 0], [1 - U(hi), 0], [1 - U(hi), 1], [1 - U(lo), 1]], new THREE.Vector3(0, 1, 0));
          const m = b.mesh(winPhoto, false); m.renderOrder = 2; Gw.add(m);
        });
        // corner boards, water table, vents
        if (!sideIsHouseAdjacent(nextK)) B.box(Gw, M.trim, L + h - 0.1, L + h + 0.025, -h - 0.025, -h, ZS, EAVE - 0.02);
        if (!sideIsHouseAdjacent(prevK)) B.box(Gw, M.trim, -h - 0.025, -h + 0.1, -h - 0.025, -h, ZS, EAVE - 0.02);
        B.box(Gw, M.trim, sa, sbb, -h - 0.02, -h, ZS - 0.02, ZS + 0.06, false);
        for (let x = 1.0; x < L - 0.6; x += 2.4) B.box(Gw, M.vent, x - 0.2, x + 0.2, -h - 0.016, -h - 0.01, G0 + 0.12, G0 + 0.3, false);
        // baseboard + crown on the inside
        photoTrim(B.box(Gw, trimBase, h, L - h, h, h + 0.018, 0, spec.baseboard, false), 1.55);
      }
      A.add(outB.mesh(M.siding), fdB.mesh(M.found));
      const inMesh = inB.mesh(paint); A.add(inMesh);
      // shared wall: baseboards either side of the door, door jambs, casings, leaf
      {
        const s = sh, L = shL, u = shU, d = spec.door, n = s.out;
        const Gw = new THREE.Group(); Gw.position.set(s.p0[0], s.p0[1], 0); Gw.rotation.z = Math.atan2(u[1], u[0]); A.add(Gw);
        // local +y = inward into the addition (left of CCW edge); the house is at -y
        photoTrim(B.box(Gw, trimBase, h, d.s0 - d.casing, h, h + 0.018, 0, spec.baseboard, false), 1.55);
        photoTrim(B.box(Gw, trimBase, d.s1 + d.casing, L - h, h, h + 0.018, 0, spec.baseboard, false), 1.55);
        const cw = d.casing, jy0 = -h - 0.12, jy1 = h;      // jamb lining runs from the new face into the old wall
        B.box(Gw, trimIn, d.s0 - 0.02, d.s0, jy0, jy1, 0, d.head); B.box(Gw, trimIn, d.s1, d.s1 + 0.02, jy0, jy1, 0, d.head);
        B.box(Gw, trimIn, d.s0 - 0.02, d.s1 + 0.02, jy0, jy1, d.head, d.head + 0.02);
        for (const [y0, y1] of [[h, h + 0.022], [-h - 0.14, -h - 0.118]]) {
          B.box(Gw, trimIn, d.s0 - cw, d.s0, y0, y1, 0, d.head); B.box(Gw, trimIn, d.s1, d.s1 + cw, y0, y1, 0, d.head);
          B.box(Gw, trimIn, d.s0 - cw - 0.012, d.s1 + cw + 0.012, y0, y1 + 0.004, d.head, d.head + cw + 0.03);
          B.box(Gw, trimIn, d.s0 - cw - 0.03, d.s1 + cw + 0.03, y0, y1 + 0.03, d.head + cw + 0.03, d.head + cw + 0.055);
        }
        // threshold strip of floor through the wall
        B.box(Gw, floorM, d.s0, d.s1, jy0, h, -0.02, 0.004, false);
        // door leaf, hinged on the corner side, swung open ~95 deg into the new room against the side wall
        const leaf = B.doorLeaf(trimIn, leafPanel, M.knob, d.width + 0.02, d.head - 0.01);
        const hinge = d.hingeEnd === 0 ? d.s0 : d.s1;
        leaf.position.set(hinge, h + 0.03, 0);
        // open ~105 deg towards the near side wall (the leaf is wider than the corner return, so it stops short of it)
        const maxOpen = Math.asin(Math.min(1, Math.max(0, ((d.hingeEnd === 0 ? d.s0 - h : shL - h - d.s1) - 0.04) / (d.width + 0.02))));
        const ang = Math.PI / 2 + Math.min(0.26, maxOpen);
        leaf.rotation.z = d.hingeEnd === 0 ? ang : -ang;
        if (d.hingeEnd === 1) leaf.scale.x = -1;
        Gw.add(leaf);
        // scan cut: the old exterior wall between the neighbour room and the new room
        cuts.push({ o: s.p0, u, n, s0: d.s0 - 0.01, s1: d.s1 + 0.01, d: 0.3, z1: d.head + 0.015 });
      }
      // floor + ceiling + crown
      {
        const fb = new B.Batch(), cb = new B.Batch(); const z = 0.003, S = spec.floor.size;
        const P = (x, y, zz) => new THREE.Vector3(x, y, zz);
        const uvF = (x, y) => spec.floor.axis === 'x' ? [y / S, x / S] : [x / S, y / S];
        fb.quad(P(inner.x0, inner.y0, z), P(inner.x1, inner.y0, z), P(inner.x1, inner.y1, z), P(inner.x0, inner.y1, z),
          [uvF(inner.x0, inner.y0), uvF(inner.x1, inner.y0), uvF(inner.x1, inner.y1), uvF(inner.x0, inner.y1)], new THREE.Vector3(0, 0, 1));
        cb.quad(P(inner.x0, inner.y0, spec.ceiling), P(inner.x1, inner.y0, spec.ceiling), P(inner.x1, inner.y1, spec.ceiling), P(inner.x0, inner.y1, spec.ceiling),
          [[0, 0], [1, 0], [1, 1], [0, 1]], new THREE.Vector3(0, 0, -1));
        const fm = fb.mesh(floorM, false); fm.name = 'floor'; A.add(fm);
        const cm = cb.mesh(ceilM, false); cm.userData.ceiling = true; A.add(cm);
        if (spec.crown > 0.03) {
          const c = spec.crown, zc = spec.ceiling;
          const cr = new THREE.Group(); cr.userData.ceiling = true; A.add(cr);
          photoTrim(B.box(cr, trimCrown, inner.x0, inner.x1, inner.y0, inner.y0 + 0.02, zc - c, zc, false), 1.55); photoTrim(B.box(cr, trimCrown, inner.x0, inner.x1, inner.y1 - 0.02, inner.y1, zc - c, zc, false), 1.55);
          photoTrim(B.box(cr, trimCrown, inner.x0, inner.x0 + 0.02, inner.y0, inner.y1, zc - c, zc, false), 1.55, true); photoTrim(B.box(cr, trimCrown, inner.x1 - 0.02, inner.x1, inner.y0, inner.y1, zc - c, zc, false), 1.55, true);
          B.box(cr, trimIn, inner.x0, inner.x1, inner.y0, inner.y0 + c * 0.7, zc - 0.02, zc, false); B.box(cr, trimIn, inner.x0, inner.x1, inner.y1 - c * 0.7, inner.y1, zc - 0.02, zc, false);
          B.box(cr, trimIn, inner.x0, inner.x0 + c * 0.7, inner.y0, inner.y1, zc - 0.02, zc, false); B.box(cr, trimIn, inner.x1 - c * 0.7, inner.x1, inner.y0, inner.y1, zc - 0.02, zc, false);
        }
        // ceiling fixture + its light (like the semi-flush fixtures in the scan)
        const cx = (inner.x0 + inner.x1) / 2, cy = (inner.y0 + inner.y1) / 2;
        const fx = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), fxMat);
        fx.position.set(cx, cy, spec.ceiling - 0.01); fx.userData.ceiling = true; A.add(fx);
        const pl = new THREE.PointLight('#ffe9c9', 6, 9, 1.4); pl.position.set(cx, cy, spec.ceiling - 0.35); A.add(pl);
      }
      // shrubs next to the addition's outer walls
      for (const k of ['S', 'E', 'N', 'W']) if (k !== spec.shared) {
        const s = spec.sides[k]; const L = Math.hypot(s.p1[0] - s.p0[0], s.p1[1] - s.p0[1]); const u = [(s.p1[0] - s.p0[0]) / L, (s.p1[1] - s.p0[1]) / L];
        for (let x = 0.5; x < L - 0.3; x += 1.6) shellG.add(shrub(s.p0[0] + u[0] * x + s.out[0] * 0.65, s.p0[1] + u[1] * x + s.out[1] * 0.65, 0.42 + rnd() * 0.2));
      }
      // electrical + HVAC details copied from the scan's rooms: switch by the latch side, outlets, floor register
      {
        const d = spec.door, s = sh, u = shU;
        const Gw = new THREE.Group(); Gw.position.set(s.p0[0], s.p0[1], 0); Gw.rotation.z = Math.atan2(u[1], u[0]); A.add(Gw);
        const latch = d.hingeEnd === 0 ? d.s1 + d.casing + 0.12 : d.s0 - d.casing - 0.12;
        B.box(Gw, M.plate, latch - 0.035, latch + 0.035, h, h + 0.008, 1.17, 1.29, false);
        B.box(Gw, M.plate, (d.s1 + shL) / 2 + 0.6 - 0.035, (d.s1 + shL) / 2 + 0.6 + 0.035, h, h + 0.008, 0.3, 0.41, false);
        for (const k of ['S', 'E', 'N', 'W']) if (k !== spec.shared) {
          const q = spec.sides[k]; const L = Math.hypot(q.p1[0] - q.p0[0], q.p1[1] - q.p0[1]); const uu = [(q.p1[0] - q.p0[0]) / L, (q.p1[1] - q.p0[1]) / L];
          const Gq = new THREE.Group(); Gq.position.set(q.p0[0], q.p0[1], 0); Gq.rotation.z = Math.atan2(uu[1], uu[0]); A.add(Gq);
          const ws = winBySide(k); let x = L * 0.3; if (ws.some(w => x > w.s0 - 0.2 && x < w.s1 + 0.2)) x = L * 0.5;
          if (!ws.some(w => x > w.s0 - 0.2 && x < w.s1 + 0.2)) B.box(Gq, M.plate, x - 0.035, x + 0.035, h, h + 0.008, 0.3, 0.41, false);
          if (ws.length && k === { S: 'N', N: 'S', E: 'W', W: 'E' }[spec.shared]) { const w = ws[0], c = (w.s0 + w.s1) / 2; B.box(Gq, M.grille, c - 0.15, c + 0.15, h + 0.08, h + 0.2, 0.0, 0.006, false); }
        }
      }
      // downspouts at the addition's free corners, mulch bed
      {
        const free = { S: [[R.x0, R.y0], [R.x1, R.y0]], N: [[R.x0, R.y1], [R.x1, R.y1]], E: [[R.x1, R.y0], [R.x1, R.y1]], W: [[R.x0, R.y0], [R.x0, R.y1]] }[{ S: 'N', N: 'S', E: 'W', W: 'E' }[spec.shared]];
        free.forEach(([x, y]) => { const sx = Math.sign(x - (R.x0 + R.x1) / 2), sy = Math.sign(y - (R.y0 + R.y1) / 2);
          const px = x + sx * (h + 0.05), py = y + sy * (h + 0.05);
          B.box(shellG, M.gutter, px - 0.035, px + 0.035, py - 0.035, py + 0.035, G0 + 0.05, EAVE - 0.05);
          B.box(shellG, M.concrete, px - 0.15 + sx * 0.25, px + 0.15 + sx * 0.25, py - 0.15 + sy * 0.25, py + 0.15 + sy * 0.25, G0, G0 + 0.03, false); });
        if (gi === geo[0]) shellG.add(B.flatPoly(B.offsetPoly(env, 0.85), G0 + 0.006, M.mulch, 1.5));
        shellG.add(B.flatPoly(B.offsetPoly([[AO.x0, AO.y0], [AO.x1, AO.y0], [AO.x1, AO.y1], [AO.x0, AO.y1]], 0.85), G0 + 0.007, M.mulch, 1.5));
      }
      addOut.push({ group: A, spec });
    }
    if (!geo.length) shellG.add(B.flatPoly(B.offsetPoly(env, 0.85), G0 + 0.006, M.mulch, 1.5));
    // back patio, unless an addition covers it
    {
      const pat = { x0: ex1 - 4.0, x1: ex1, y0: ey1, y1: ey1 + 3.2 };
      if (!geo.some(({ AO }) => pat.x0 < AO.x1 + 0.3 && pat.x1 > AO.x0 - 0.3 && pat.y0 < AO.y1 && pat.y1 > AO.y0)) {
        flat(shellG, M.pavers, pat.x0, pat.y0, pat.x1, pat.y1, G0 + 0.04, 0.6);
        B.box(shellG, M.concrete, pat.x0, pat.x1, pat.y0, pat.y1, G0, G0 + 0.035, false);
      }
    }
    const planG = planOverlay && plan ? buildPlanOverlay(group, specs) : null;
    if (scanCut && scan.groups.length) cutScan(cuts);
    roofGroup.visible = withRoof; shellG.visible = withShell;
    if (withSite) group.add(site);
    return {
      group, shell: shellG, roof: roofGroup, plan: planG, site: withSite ? site : null, additions: addOut, specs, cuts,
      dispose() {
        if (site.parent === group) group.remove(site);
        if (group.parent) group.parent.remove(group);
        group.traverse(o => o.geometry && o.geometry.dispose());
        ownMats.forEach(m => m.dispose());
      },
    };
  }

  // ------------------------------------------------------------------------------------------ roof details from the drone photo
  // _0830 shows (1) a small Dutch gablet with white rake trim where the main ridge meets its west hip, (2) a rooftop AC
  // condenser on a stand on the south slope, (3) a few plumbing vents. Positions are read off the drone frame.
  function roofDetails(G, houseRects, allRects) {
    const R = houseRects[0], W = R.x1 - R.x0, D = R.y1 - R.y0;
    if (W > D) {
      const yr = (R.y0 + R.y1) / 2, xa = R.x0 + D / 2, zt = EAVE + D / 2 * K, g0 = 1.4, xg = xa - g0, zb = zt - K * g0;
      const rb = new B.Batch(), fb = new B.Batch(), V = (x, y, z) => new THREE.Vector3(x, y, z);
      const uv = p => [p.x / 1.7, (p.y + p.z) / 0.85];
      for (const sgn of [1, -1]) {           // side-slope extensions above the hip face
        const A = V(xg - 0.12, yr, zt), Bp = V(xa, yr, zt), C = V(xg - 0.12, yr + sgn * (g0 + 0.12), zt - K * (g0 + 0.12));
        if (sgn < 0) rb.tri(A, C, Bp, [uv(A), uv(C), uv(Bp)]); else rb.tri(A, Bp, C, [uv(A), uv(Bp), uv(C)]);
      }
      G.add(rb.mesh(M.roof));
      // gable face (louvred vent in white trim) and the white rake boards that read as the "V" on the drone photo
      const A = V(xg, yr, zt), P = V(xg, yr - g0, zb), Q = V(xg, yr + g0, zb);
      fb.tri(A, Q, P, [[0.5, 1], [1, 0], [0, 0]]); G.add(fb.mesh(M.trim));
      const vent = new B.Batch(); const h = (zt - zb) * 0.5;
      vent.tri(V(xg - 0.01, yr, zb + h * 1.3), V(xg - 0.01, yr + h * 0.9, zb + 0.08), V(xg - 0.01, yr - h * 0.9, zb + 0.08), [[0.5, 1], [1, 0], [0, 0]]);
      const vm = vent.mesh(M.vent); vm.geometry.computeVertexNormals(); G.add(vm);
      for (const sgn of [1, -1]) {
        const a = V(xg - 0.13, yr, zt + 0.03), b = V(xg - 0.13, yr + sgn * (g0 + 0.14), zt - K * (g0 + 0.14) + 0.03);
        const len = a.distanceTo(b), m = new THREE.Mesh(new THREE.BoxGeometry(0.05, len, 0.16), M.fascia);
        m.position.copy(a).add(b).multiplyScalar(0.5); m.position.z -= 0.06; m.rotation.x = -sgn * Math.atan(K); m.castShadow = true; G.add(m);
      }
    }
    // AC condenser on a levelled stand
    const ac = [-8.5, -2.8], hs = 0.5;
    const hz = [[-hs, -hs], [hs, -hs], [hs, hs], [-hs, hs]].map(([dx, dy]) => B.roofHeightAt(allRects, EAVE, K, ac[0] + dx, ac[1] + dy));
    const z0 = Math.min(...hz), z1 = Math.max(...hz) + 0.12;
    B.box(G, M.vent, ac[0] - hs, ac[0] + hs, ac[1] - hs, ac[1] + hs, z0 - 0.05, z1);       // solid levelling curb under the unit
    B.box(G, M.acBody, ac[0] - 0.42, ac[0] + 0.42, ac[1] - 0.42, ac[1] + 0.42, z1, z1 + 0.72);
    const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 24), M.grille); fan.rotation.x = Math.PI / 2; fan.position.set(ac[0], ac[1], z1 + 0.73); G.add(fan);
    for (let k = -3; k <= 3; k++) B.box(G, M.grille, ac[0] + 0.425, ac[0] + 0.43, ac[1] - 0.38, ac[1] + 0.38, z1 + 0.1 + (k + 3) * 0.08, z1 + 0.13 + (k + 3) * 0.08, false);
    // plumbing vents / roof jacks
    for (const [x, y] of [[-6.2, -1.6], [-3.4, -2.6], [-10.6, 2.4], [0.6, -1.2], [-1.2, 2.9]]) {
      const z = B.roofHeightAt(allRects, EAVE, K, x, y); if (!isFinite(z)) continue;
      const v = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 10), M.vent); v.rotation.x = Math.PI / 2; v.position.set(x, y, z + 0.1); v.castShadow = true; G.add(v);
    }
  }

  // ------------------------------------------------------------------------------------------ plan overlay (section cut)
  function buildPlanOverlay(parent, specs) {
    const P = new THREE.Group(); P.name = 'plan'; P.visible = false; parent.add(P);
    const z = 2.1;
    const strip = (a, u, s0, s1, t, mat, dz = 0) => {
      if (s1 - s0 < 0.01) return; const Gw = new THREE.Group(); Gw.position.set(a[0], a[1], 0); Gw.rotation.z = Math.atan2(u[1], u[0]); P.add(Gw);
      B.box(Gw, mat, s0, s1, -t / 2, t / 2, z + dz, z + dz + 0.02, false);
    };
    const doors = specs.map(spec => { const sh = spec.sides[spec.shared]; const shL = Math.hypot(sh.p1[0] - sh.p0[0], sh.p1[1] - sh.p0[1]); const shU = [(sh.p1[0] - sh.p0[0]) / shL, (sh.p1[1] - sh.p0[1]) / shL];
      return { dp: [sh.p0[0] + shU[0] * (spec.door.s0 + spec.door.s1) / 2, sh.p0[1] + shU[1] * (spec.door.s0 + spec.door.s1) / 2], width: spec.door.width }; });
    plan.walls.forEach((w, i) => {
      const a = w.a, b = w.b, L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.05) return; const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      const pr = p => (p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1];
      const gaps = dna.doors.filter(d => d.wall === i).map(d => [pr(d.centre) - d.width / 2, pr(d.centre) + d.width / 2]);
      // new doorways in the shared walls
      for (const { dp, width } of doors) {
        const off = Math.abs((dp[0] - a[0]) * -u[1] + (dp[1] - a[1]) * u[0]);
        if (off < 0.1 && pr(dp) > 0 && pr(dp) < L) gaps.push([pr(dp) - width / 2, pr(dp) + width / 2]);
      }
      gaps.sort((p, q) => p[0] - q[0]);
      let s = 0; gaps.forEach(([g0, g1]) => { strip(a, u, s, g0, w.thickness, M.pochet); s = Math.max(s, g1); }); strip(a, u, s, L, w.thickness, M.pochet);
      dna.windows.filter(x => x.wall === i).forEach(x => strip(a, u, pr(x.centre) - x.width / 2, pr(x.centre) + x.width / 2, w.thickness * 0.45, M.planWin, 0.005));
    });
    for (const spec of specs) for (const k of ['S', 'E', 'N', 'W']) if (k !== spec.shared) {
      const q = spec.sides[k]; const L = Math.hypot(q.p1[0] - q.p0[0], q.p1[1] - q.p0[1]); const u = [(q.p1[0] - q.p0[0]) / L, (q.p1[1] - q.p0[1]) / L];
      strip(q.p0, u, -spec.tExt / 2, L + spec.tExt / 2, spec.tExt, M.planNew);
      spec.windows.filter(w => w.side === k).forEach(w => strip(q.p0, u, w.s0, w.s1, spec.tExt * 0.45, M.planWin, 0.005));
    }
    return P;
  }

  return {
    THREE, dna, plan, base, materials: M, site, scanGroup: scan.group,
    bounds: { ex0, ex1, ey0, ey1, ground_z: G0, eave_z: EAVE, envelope: env },
    makeSpec: add => makeSpec(dna, add), paramsFromAddition, paramsFromWall, additionFromParams, clampParams,
    createEnvironment, build, inCut,
  };
}
