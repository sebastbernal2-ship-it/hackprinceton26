// Geometry helpers for d_roofshell: batched meshes, oriented quads, wall slabs with openings, boxes in wall frames.
import * as THREE from '../../vendor/three.module.min.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
export { V3 };

// Collects non-indexed triangles per material and merges them into one mesh per material.
export class Batch {
  constructor() { this.parts = new Map(); }
  _get(mat) { if (!this.parts.has(mat)) this.parts.set(mat, { p: [], n: [], uv: [] }); return this.parts.get(mat); }
  addGeometry(geo, mat, matrix) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (matrix) { g = g.clone(); g.applyMatrix4(matrix); }
    if (!g.attributes.normal) g.computeVertexNormals();
    const P = this._get(mat), pa = g.attributes.position.array, na = g.attributes.normal.array;
    const ua = g.attributes.uv ? g.attributes.uv.array : null;
    for (let i = 0; i < pa.length; i++) { P.p.push(pa[i]); P.n.push(na[i]); }
    const nv = pa.length / 3;
    for (let i = 0; i < nv; i++) { P.uv.push(ua ? ua[i * 2] : 0, ua ? ua[i * 2 + 1] : 0); }
  }
  // triangle with explicit uvs, auto-oriented so its normal points along `want`
  tri(mat, a, b, c, ua, ub, uc, want) {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (n.lengthSq() < 1e-14) return;
    if (want && n.dot(want) < 0) { [b, c] = [c, b]; [ub, uc] = [uc, ub]; n.negate(); }
    n.normalize();
    const P = this._get(mat);
    for (const [v, u] of [[a, ua], [b, ub], [c, uc]]) { P.p.push(v.x, v.y, v.z); P.n.push(n.x, n.y, n.z); P.uv.push(u[0], u[1]); }
  }
  quad(mat, a, b, c, d, uvs, want) {
    uvs = uvs || [[0, 0], [1, 0], [1, 1], [0, 1]];
    this.tri(mat, a, b, c, uvs[0], uvs[1], uvs[2], want); this.tri(mat, a, c, d, uvs[0], uvs[2], uvs[3], want);
  }
  // planar polygon (3D points, convex or not) triangulated in its own 2D frame
  poly(mat, pts3, frame, want, holes3 = []) {
    const { o, u, v } = frame;
    const to2 = p => new THREE.Vector2(p.clone().sub(o).dot(u), p.clone().sub(o).dot(v));
    const c2 = pts3.map(to2), h2 = holes3.map(h => h.map(to2));
    const tris = THREE.ShapeUtils.triangulateShape(c2, h2);
    const all3 = pts3.concat(...holes3), all2 = c2.concat(...h2);
    for (const t of tris) this.tri(mat, all3[t[0]], all3[t[1]], all3[t[2]], [all2[t[0]].x, all2[t[0]].y], [all2[t[1]].x, all2[t[1]].y], [all2[t[2]].x, all2[t[2]].y], want);
  }
  build(group, opts = {}) {
    for (const [mat, P] of this.parts) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(P.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(P.uv, 2));
      const m = new THREE.Mesh(g, mat);
      m.castShadow = opts.cast !== false && !mat.userData.noCast; m.receiveShadow = opts.receive !== false;
      group.add(m);
    }
    this.parts.clear();
  }
}

// Wall frame: a straight wall along footprint edge. p0 (Vector2) start, t unit along wall, n unit outward normal.
export class WallFrame {
  constructor(p0, p1, outward) {
    this.p0 = p0.clone(); this.len = p1.clone().sub(p0).length();
    this.t = p1.clone().sub(p0).normalize(); this.n = outward.clone().normalize();
  }
  P(u, off, z) { return V3(this.p0.x + this.t.x * u + this.n.x * off, this.p0.y + this.t.y * u + this.n.y * off, z); }
  get N3() { return V3(this.n.x, this.n.y, 0); }
  get T3() { return V3(this.t.x, this.t.y, 0); }
  // axis-aligned (in wall frame) box: u range, outward-offset range, z range
  box(batch, mat, u0, u1, o0, o1, z0, z1) {
    const g = new THREE.BoxGeometry(Math.abs(u1 - u0), Math.abs(o1 - o0), Math.abs(z1 - z0));
    // uv in metres for boxes (approximate: scale default 0..1 uvs by size)
    const uv = g.attributes.uv, pos = g.attributes.position, nrm = g.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
      const a = nx > 0.5 ? pos.getY(i) : pos.getX(i), b = (nx > 0.5 || ny > 0.5) ? pos.getZ(i) : pos.getY(i);
      uv.setXY(i, a, b);
    }
    const m = new THREE.Matrix4();
    const basis = new THREE.Matrix4().makeBasis(this.T3, V3(-this.t.y, this.t.x, 0), V3(0, 0, 1));
    // local y axis = left of t; our offset axis is n = +-left
    const left = V3(-this.t.y, this.t.x, 0), sign = left.dot(this.N3) > 0 ? 1 : -1;
    const c = this.P((u0 + u1) / 2, (o0 + o1) / 2, (z0 + z1) / 2);
    m.copy(basis).setPosition(c);
    batch.addGeometry(g, mat, m);
  }
  // wall slab between outer face (off=0) and inner face (off=-thick) with outline (u,z) polygon and rectangular holes
  slab(batch, outerMat, innerMat, outline, holes, thick, edgeMat) {
    const n3 = this.N3, f = { o: this.P(0, 0, 0), u: this.T3, v: V3(0, 0, 1) };
    const fi = { o: this.P(0, -thick, 0), u: this.T3, v: V3(0, 0, 1) };
    const out = outline.map(([u, z]) => this.P(u, 0, z));
    const inn = outline.map(([u, z]) => this.P(u, -thick, z));
    const hrect = h => [[h.u0, h.z0], [h.u1, h.z0], [h.u1, h.z1], [h.u0, h.z1]];
    const hout = holes.map(h => hrect(h).map(([u, z]) => this.P(u, 0, z)));
    const hin = holes.map(h => hrect(h).map(([u, z]) => this.P(u, -thick, z)));
    batch.poly(outerMat, out, f, n3, hout);
    if (innerMat) batch.poly(innerMat, inn, fi, n3.clone().negate(), hin);
    const em = edgeMat || outerMat;
    // outline edges (top/bottom/ends) facing away from the polygon interior
    const cu = outline.reduce((a, p) => a + p[0], 0) / outline.length, cz = outline.reduce((a, p) => a + p[1], 0) / outline.length;
    for (let i = 0; i < outline.length; i++) {
      const j = (i + 1) % outline.length, a = outline[i], b = outline[j];
      const du = b[0] - a[0], dz = b[1] - a[1];
      let nu = dz, nz = -du; if ((a[0] - cu) * nu + (a[1] - cz) * nz < 0) { nu = -nu; nz = -nz; }
      const want = this.T3.multiplyScalar(nu).add(V3(0, 0, nz));
      const L = Math.hypot(du, dz);
      batch.quad(em, out[i], out[j], inn[j], inn[i], [[0, 0], [L, 0], [L, thick], [0, thick]], want);
    }
    // hole reveals facing into the hole
    holes.forEach((h, k) => {
      const ho = hout[k], hi = hin[k], cuh = (h.u0 + h.u1) / 2, czh = (h.z0 + h.z1) / 2;
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4, a = hrect(h)[i], b = hrect(h)[j];
        const mu = (a[0] + b[0]) / 2 - cuh, mz = (a[1] + b[1]) / 2 - czh;
        const want = this.T3.multiplyScalar(-Math.sign(mu) * (Math.abs(mu) > 1e-6 ? 1 : 0)).add(V3(0, 0, -Math.sign(mz) * (Math.abs(mz) > 1e-6 ? 1 : 0)));
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        batch.quad(h.revealMat || em, ho[i], ho[j], hi[j], hi[i], [[0, 0], [L, 0], [L, thick], [0, thick]], want);
      }
    });
  }
}

// a "board" (rectangular bar) running between two 3D points along its top-outer edge, hanging down by h and
// extending inward (direction `inward`, horizontal) by w.  Used for fascia and rake boards.
export function board(batch, mat, a, b, h, w, inward, outwardDir) {
  const dn = V3(0, 0, -h), di = inward.clone().multiplyScalar(w);
  const a1 = a.clone().add(dn), b1 = b.clone().add(dn), a2 = a.clone().add(di), b2 = b.clone().add(di), a3 = a2.clone().add(dn), b3 = b2.clone().add(dn);
  const L = a.distanceTo(b);
  const uv = [[0, 0], [L, 0], [L, h], [0, h]];
  batch.quad(mat, a, b, b1, a1, uv, outwardDir);               // outer face
  batch.quad(mat, a1, b1, b3, a3, uv, V3(0, 0, -1));           // bottom
  batch.quad(mat, a, b, b2, a2, uv, V3(0, 0, 1));              // top
  batch.quad(mat, a, a1, a3, a2, uv, b.clone().sub(a).negate()); // ends
  batch.quad(mat, b, b1, b3, b2, uv, b.clone().sub(a));
}

// generic box between min/max in world axes
export function abox(batch, mat, x0, x1, y0, y1, z0, z1) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  const uv = g.attributes.uv, pos = g.attributes.position, nrm = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
    uv.setXY(i, nx > 0.5 ? pos.getY(i) : pos.getX(i), (nx > 0.5 || ny > 0.5) ? pos.getZ(i) : pos.getY(i));
  }
  batch.addGeometry(g, mat, new THREE.Matrix4().makeTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
}
