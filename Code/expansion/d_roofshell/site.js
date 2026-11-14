// Site: ground (lawn / soil / paving painted into one canvas + tiled detail), fences, hedges, trees, neighbours.
import * as THREE from '../../vendor/three.module.min.js';
import { makeNoise, rng, grassDetailTex, concreteTex, leafTex, fenceTex } from './tex.js';
import { Batch, WallFrame, abox, V3 } from './geom.js';
import { H, FOOT, PORCH } from './house.js';

export const SITE = { x0: -34, x1: 30, y0: -32, y1: 32, px: 2048, street: 14.15, sidewalk: [11.0, 12.5], fenceX: 10.8, northY: 16.6, southY: -21.6, rearX: -24 };
const DRIVE = { x0: -1.2, x1: 14.15, y0: 5.55, y1: 8.55 };

function paintGround(addRect) {
  const N = SITE.px, W = SITE.x1 - SITE.x0, Hh = SITE.y1 - SITE.y0, s = N / W;
  const X = x => (x - SITE.x0) * s, Y = y => (SITE.y1 - y) * s;
  const c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d');
  // lawn colour field
  const img = g.createImageData(N, N), d = img.data, n1 = makeNoise(101, 32), n2 = makeNoise(103, 128), n3 = makeNoise(107, 512), R = rng(5);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = n1(i / 96, j / 96), b = n2(i / 20, j / 20), e = n3(i / 3, j / 3);
    const dry = Math.max(0, a - 0.62) * 2.2;
    const t = 0.55 * b + 0.45 * e;
    let r = 86 + 30 * t, gg = 104 + 26 * t, bb = 58 + 12 * t;
    r += dry * 38; gg += dry * 16; bb += dry * 14;
    const k = (j * N + i) * 4, jit = (R() - 0.5) * 16;
    d[k] = r + jit; d[k + 1] = gg + jit; d[k + 2] = bb + jit * 0.6; d[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const mask = document.createElement('canvas'); mask.width = mask.height = N / 2; const m = mask.getContext('2d');
  m.fillStyle = '#fff'; m.fillRect(0, 0, N / 2, N / 2); m.scale(0.5, 0.5);
  const rect = (ctx, x0, x1, y0, y1) => ctx.fillRect(X(x0), Y(y1), (x1 - x0) * s, (y1 - y0) * s);
  const polyPath = (ctx, P) => { ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))); ctx.closePath(); };
  // planting beds (mulch/soil) around the foundations
  const beds = [[-13.07, -6.85, -6.75, -5.85], [-13.8, -13.07, -5.85, 4.98], [-13.07, 2.9, 4.98, 5.55], [4.45, 5.5, -6.2, -0.75], [4.45, 5.5, 0.95, 5.55]];
  const soil = (ctx) => { ctx.fillStyle = '#5d4a39'; for (const b of beds) rect(ctx, ...b); };
  soil(g); m.fillStyle = '#000'; for (const b of beds) rect(m, ...b);
  if (addRect) { g.fillStyle = '#5d4a39'; rect(g, addRect.x0 - 0.7, addRect.x1 + 0.7, addRect.y0 - 0.7, addRect.y1 + 0.7); m.fillStyle = '#000'; rect(m, addRect.x0 - 0.7, addRect.x1 + 0.7, addRect.y0 - 0.7, addRect.y1 + 0.7); }
  // mulch speckle
  const Rs = rng(9); g.fillStyle = 'rgba(40,28,18,0.5)';
  for (const b of beds) for (let k = 0; k < (b[1] - b[0]) * (b[3] - b[2]) * 120; k++) g.fillRect(X(b[0] + Rs() * (b[1] - b[0])), Y(b[2] + Rs() * (b[3] - b[2])), 2, 2);
  // paving
  const conc = (x0, x1, y0, y1, joint, dir) => {
    g.fillStyle = '#c4c0b7'; rect(g, x0, x1, y0, y1); m.fillStyle = '#808080'; rect(m, x0, x1, y0, y1);
    g.strokeStyle = 'rgba(70,66,60,0.55)'; g.lineWidth = 1.4;
    if (dir === 'x') for (let x = x0 + joint; x < x1 - 0.1; x += joint) { g.beginPath(); g.moveTo(X(x), Y(y0)); g.lineTo(X(x), Y(y1)); g.stroke(); }
    else for (let y = y0 + joint; y < y1 - 0.1; y += joint) { g.beginPath(); g.moveTo(X(x0), Y(y)); g.lineTo(X(x1), Y(y)); g.stroke(); }
    g.strokeStyle = 'rgba(60,56,50,0.35)'; g.lineWidth = 1; g.strokeRect(X(x0), Y(y1), (x1 - x0) * s, (y1 - y0) * s);
  };
  conc(DRIVE.x0, DRIVE.x1, DRIVE.y0, DRIVE.y1, 3.0, 'x');
  g.strokeStyle = 'rgba(70,66,60,0.5)'; g.beginPath(); g.moveTo(X(DRIVE.x0), Y((DRIVE.y0 + DRIVE.y1) / 2)); g.lineTo(X(DRIVE.x1), Y((DRIVE.y0 + DRIVE.y1) / 2)); g.stroke();
  conc(5.25, SITE.sidewalk[0], -0.7, 0.85, 1.5, 'x');                 // front walk
  conc(SITE.sidewalk[0], SITE.sidewalk[1], SITE.y0, SITE.y1, 1.5, 'y'); // public sidewalk
  conc(-12.6, 4.45, -7.75, -6.85, 1.5, 'x');                            // south side walk
  conc(-18.2, -13.07, -4.6, -0.2, 1.0, 'x');                            // rear patio
  // tyre stains on the driveway
  g.fillStyle = 'rgba(80,76,70,0.10)'; rect(g, DRIVE.x0 + 1, DRIVE.x1, DRIVE.y0 + 0.55, DRIVE.y0 + 1.0); rect(g, DRIVE.x0 + 1, DRIVE.x1, DRIVE.y1 - 1.0, DRIVE.y1 - 0.55);
  // curb + street
  g.fillStyle = '#b9b5ad'; rect(g, SITE.street - 0.15, SITE.street + 0.05, SITE.y0, SITE.y1);
  const Ra = rng(77);
  g.fillStyle = '#4a4b4c'; rect(g, SITE.street + 0.05, SITE.x1, SITE.y0, SITE.y1);
  for (let k = 0; k < 40000; k++) { const v = 50 + Ra() * 40; g.fillStyle = `rgba(${v},${v},${v + 2},0.5)`; g.fillRect(X(SITE.street + Ra() * (SITE.x1 - SITE.street)), Ra() * N, 2, 2); }
  m.fillStyle = '#404040'; rect(m, SITE.street - 0.15, SITE.x1, SITE.y0, SITE.y1);
  // contact / ambient occlusion around building masses
  const ao = document.createElement('canvas'); ao.width = ao.height = N; const a = ao.getContext('2d');
  a.fillStyle = '#fff'; a.fillRect(0, 0, N, N); a.filter = `blur(${Math.round(0.35 * s)}px)`; a.fillStyle = '#000';
  polyPath(a, FOOT); a.fill(); polyPath(a, PORCH); a.fill();
  if (addRect) rect(a, addRect.x0, addRect.x1, addRect.y0, addRect.y1);
  a.fillRect(X(SITE.rearX - 0.15), Y(SITE.northY), 0.3 * s, (SITE.northY - SITE.southY) * s);
  g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.55; g.drawImage(ao, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
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

function blob(geo, seed, amp, freq) {
  const p = geo.attributes.position, n3 = makeNoise(seed, 64), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); const len = v.length() || 1;
    const k = 1 + amp * (n3(v.x * freq + 10, v.y * freq + v.z * freq * 0.7 + 10) - 0.5) * 2;
    v.multiplyScalar(k); p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals(); return geo;
}

export function buildSite(M, addRect) {
  const group = new THREE.Group();
  const { tex, mask } = paintGround(addRect);
  const gdet = grassDetailTex(), cdet = concreteTex();
  const gmat = groundMaterial(tex, mask, gdet, cdet);
  const gw = SITE.x1 - SITE.x0, gh = SITE.y1 - SITE.y0;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), gmat);
  ground.position.set((SITE.x0 + SITE.x1) / 2, (SITE.y0 + SITE.y1) / 2, H.GRADE); ground.receiveShadow = true;
  group.add(ground);
  // far ground: neighbouring lawns + continuing street
  const farTex = gdet.clone(); farTex.repeat.set(400, 400); farTex.needsUpdate = true;
  const far = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshStandardMaterial({ color: 0x6f7d4e, roughness: 1, map: farTex }));
  far.position.set(0, 0, H.GRADE - 0.03); far.receiveShadow = true; group.add(far);
  const street = new THREE.Mesh(new THREE.PlaneGeometry(16, 1600), new THREE.MeshStandardMaterial({ color: 0x4a4b4c, roughness: 0.95 }));
  street.position.set(SITE.street + 8.05, 0, H.GRADE - 0.015); street.receiveShadow = true; group.add(street);
  const sw = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1600), new THREE.MeshStandardMaterial({ color: 0xc4c0b7, roughness: 0.95 }));
  sw.position.set((SITE.sidewalk[0] + SITE.sidewalk[1]) / 2, 0, H.GRADE - 0.02); group.add(sw);

  const B = new Batch();
  // white picket fence along the street (drone photos), gaps for the walk and the driveway
  const pick = new THREE.BoxGeometry(0.02, 0.075, 1.0); const pts = [];
  for (let y = SITE.southY; y <= SITE.northY; y += 0.135) { if ((y > -0.8 && y < 0.95) || (y > DRIVE.y0 - 0.05 && y < DRIVE.y1 + 0.05)) continue; pts.push(y); }
  const inst = new THREE.InstancedMesh(pick, M.trim, pts.length);
  pts.forEach((y, i) => inst.setMatrixAt(i, new THREE.Matrix4().makeTranslation(SITE.fenceX, y, H.GRADE + 0.5)));
  inst.castShadow = inst.receiveShadow = true; group.add(inst);
  const pg = new THREE.ConeGeometry(0.053, 0.08, 4); pg.rotateX(Math.PI / 2); pg.rotateZ(Math.PI / 4); pg.scale(0.35, 1, 1);
  const inst2 = new THREE.InstancedMesh(pg, M.trim, pts.length);
  pts.forEach((y, i) => inst2.setMatrixAt(i, new THREE.Matrix4().makeTranslation(SITE.fenceX, y, H.GRADE + 1.04)));
  group.add(inst2);
  for (const [y0, y1] of [[SITE.southY, -0.8], [0.95, DRIVE.y0 - 0.05], [DRIVE.y1 + 0.05, SITE.northY]]) {
    for (const z of [0.25, 0.8]) abox(B, M.trim, SITE.fenceX - 0.06, SITE.fenceX - 0.01, y0, y1, H.GRADE + z, H.GRADE + z + 0.07);
    for (const y of [y0, y1]) abox(B, M.trim, SITE.fenceX - 0.05, SITE.fenceX + 0.05, y - 0.05, y + 0.05, H.GRADE, H.GRADE + 1.15);
  }
  // rear wood fence
  const fm = new THREE.MeshStandardMaterial({ map: fenceTex(), roughness: 0.9 }); fm.map.repeat.set(0.5, 1);
  const fl = SITE.northY - SITE.southY;
  const fgeo = new THREE.BoxGeometry(0.04, fl, 1.8); const uv = fgeo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * fl);
  const fence = new THREE.Mesh(fgeo, fm); fence.position.set(SITE.rearX, (SITE.northY + SITE.southY) / 2, H.GRADE + 0.9); fence.castShadow = fence.receiveShadow = true; group.add(fence);
  for (let y = SITE.southY; y <= SITE.northY + 0.01; y += 2.4) abox(B, M.post, SITE.rearX + 0.02, SITE.rearX + 0.11, y - 0.045, y + 0.045, H.GRADE, H.GRADE + 1.85);

  // hedges
  const leafA = new THREE.MeshStandardMaterial({ map: leafTex([58, 86, 44]), roughness: 0.95 });
  const leafB = new THREE.MeshStandardMaterial({ map: leafTex([44, 70, 40]), roughness: 0.95 });
  const leafC = new THREE.MeshStandardMaterial({ map: leafTex([34, 54, 32]), roughness: 0.95 });
  const hedge = (x0, x1, y0, y1, h, mat, seed) => {
    const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, h, Math.max(2, Math.round((x1 - x0) * 3)), Math.max(2, Math.round((y1 - y0) * 3)), 4);
    const p = geo.attributes.position, nz = makeNoise(seed, 64);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = (nz((x + x0) * 2.1, (y + y0) * 2.1 + z * 2) - 0.5) * 0.12;
      const rx = Math.sign(x) * (Math.abs(x) > (x1 - x0) / 2 - 1e-3 ? k : 0), ry = Math.sign(y) * (Math.abs(y) > (y1 - y0) / 2 - 1e-3 ? k : 0);
      p.setXYZ(i, x + rx, y + ry, z + (z > h / 2 - 1e-3 ? k : 0));
    }
    geo.computeVertexNormals();
    const uvh = geo.attributes.uv, nh = geo.attributes.normal; for (let i = 0; i < uvh.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const top = Math.abs(nh.getZ(i)) > 0.7; uvh.setXY(i, (Math.abs(nh.getX(i)) > Math.abs(nh.getY(i)) ? y : x) * 1.6, (top ? (Math.abs(nh.getX(i)) > 0.5 ? x : y) : z) * 1.6); }
    const mm = new THREE.Mesh(geo, mat); mm.position.set((x0 + x1) / 2, (y0 + y1) / 2, H.GRADE + h / 2); mm.castShadow = mm.receiveShadow = true; group.add(mm);
  };
  hedge(9.7, 10.55, SITE.southY, -1.6, 1.3, leafB, 3); hedge(9.7, 10.55, 1.9, DRIVE.y0 - 0.4, 1.3, leafB, 4);
  hedge(SITE.rearX + 0.2, SITE.fenceX - 0.3, SITE.northY - 0.4, SITE.northY + 0.4, 0.95, leafA, 5);
  hedge(SITE.rearX + 0.2, SITE.fenceX - 0.3, SITE.southY - 0.4, SITE.southY + 0.4, 0.95, leafA, 6);
  // foundation shrubs
  const shrub = (x, y, r, mat, seed) => { const g = blob(new THREE.IcosahedronGeometry(r, 3), seed, 0.22, 2.2); g.scale(1, 1, 0.8); const mm = new THREE.Mesh(g, mat); mm.position.set(x, y, H.GRADE + r * 0.6); mm.castShadow = mm.receiveShadow = true; group.add(mm); };
  const Rs = rng(31);
  for (const [x, y] of [[4.95, -5.6], [4.95, -3.9], [4.95, -2.2], [5.0, 2.3], [5.0, 3.9], [-13.45, -4.8], [-13.45, 2.2], [-11, 5.25], [-8.4, 5.25], [-0.6, 5.25], [1.6, 5.25]]) shrub(x, y, 0.4 + Rs() * 0.25, Rs() > 0.5 ? leafA : leafB, Math.floor(Rs() * 1000));
  if (addRect) for (const [x, y] of [[addRect.x0 - 0.45, addRect.y1 - 0.5], [addRect.x1 + 0.45, addRect.y1 - 0.4], [addRect.x0 - 0.45, addRect.y0 + 0.7]]) shrub(x, y, 0.42, leafA, 77);
  // trees: Italian cypresses (as on the drone photos) + canopy trees
  const trunkM = new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 1 });
  const cypress = (x, y, h, r) => {
    const pts = []; for (let k = 0; k <= 16; k++) { const t = k / 16; pts.push(new THREE.Vector2(r * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.7) * (1 - t * 0.35) + 0.01, t * h)); }
    const g = new THREE.LatheGeometry(pts, 14); g.rotateX(Math.PI / 2); blob(g, Math.floor(x * 13 + y), 0.12, 1.4);
    const uvc = g.attributes.uv; for (let i = 0; i < uvc.count; i++) uvc.setXY(i, uvc.getX(i) * 4, uvc.getY(i) * h / 1.5);
    const mm = new THREE.Mesh(g, leafC); mm.position.set(x, y, H.GRADE + 0.3); mm.castShadow = mm.receiveShadow = true; group.add(mm);
  };
  cypress(7.0, -9.2, 10.5, 0.85); cypress(7.9, -10.1, 9.2, 0.8); cypress(-18.5, 11.0, 8, 0.75);
  const tree = (x, y, h, r, mat, seed) => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, h * 0.55, 8).rotateX(Math.PI / 2), trunkM); t.position.set(x, y, H.GRADE + h * 0.27); t.castShadow = true; group.add(t);
    const R2 = rng(seed);
    for (let k = 0; k < 7; k++) {
      const g = blob(new THREE.IcosahedronGeometry(r * (0.55 + R2() * 0.3), 3), seed + k, 0.25, 1.1);
      const uvb = g.attributes.uv; for (let i = 0; i < uvb.count; i++) uvb.setXY(i, uvb.getX(i) * 6, uvb.getY(i) * 3);
      const mm = new THREE.Mesh(g, mat); mm.position.set(x + (R2() - 0.5) * r * 1.1, y + (R2() - 0.5) * r * 1.1, H.GRADE + h * 0.62 + (R2() - 0.3) * r * 0.6);
      mm.castShadow = mm.receiveShadow = true; group.add(mm);
    }
  };
  tree(13.3, 10.5, 9, 3.6, leafB, 400); tree(-20.5, -7.5, 7.5, 2.8, leafA, 500); tree(13.3, -14, 8, 3.2, leafB, 600);

  B.build(group);
  return group;
}

// simple neighbour massing reusing the house vocabulary (stucco box + hip-ish gable roof)
export function neighbours(M) {
  const group = new THREE.Group(), B = new Batch();
  const mk = (x0, x1, y0, y1, h, roofMat, wallMat, ridgeAlongX) => {
    abox(B, wallMat, x0, x1, y0, y1, H.GRADE, h);
    // windows as dark recessed panes
    const wins = (wf, L, zs) => { for (let u = 1.4; u < L - 1.4; u += 3.1) for (const z of zs) { wf.box(B, M.trim, u - 0.08, u + 0.98, 0.0, 0.03, z + 0.2, z + 1.55); wf.box(B, M.glassN, u, u + 0.9, 0.0, 0.04, z + 0.28, z + 1.47); } };
    const fr = [[v(x0, y0), v(x1, y0), v(0, -1)], [v(x1, y0), v(x1, y1), v(1, 0)], [v(x1, y1), v(x0, y1), v(0, 1)], [v(x0, y1), v(x0, y0), v(-1, 0)]];
    const zs = h > 4 ? [0.6, 3.5] : [0.6];
    for (const [a, b, n] of fr) { const wf = new WallFrame(a, b, n); wins(wf, wf.len, zs); }
    // hip roof: 4 planes
    const ov = 0.4, p = 0.42, X0 = x0 - ov, X1 = x1 + ov, Y0 = y0 - ov, Y1 = y1 + ov, ze = h - ov * p + 0.15;
    const hw = Math.min(X1 - X0, Y1 - Y0) / 2, zr = ze + hw * p;
    let r0, r1;
    if (ridgeAlongX) { r0 = V3(X0 + hw, (Y0 + Y1) / 2, zr); r1 = V3(X1 - hw, (Y0 + Y1) / 2, zr); } else { r0 = V3((X0 + X1) / 2, Y0 + hw, zr); r1 = V3((X0 + X1) / 2, Y1 - hw, zr); }
    const c = [V3(X0, Y0, ze), V3(X1, Y0, ze), V3(X1, Y1, ze), V3(X0, Y1, ze)];
    const up = V3(0, 0, 1);
    if (ridgeAlongX) {
      B.quad(roofMat, c[0], c[1], r1, r0, null, V3(0, -1, 2)); B.quad(roofMat, c[2], c[3], r0, r1, null, V3(0, 1, 2));
      B.tri(roofMat, c[1], c[2], r1, [0, 0], [1, 0], [0.5, 1], V3(1, 0, 2)); B.tri(roofMat, c[3], c[0], r0, [0, 0], [1, 0], [0.5, 1], V3(-1, 0, 2));
    } else {
      B.quad(roofMat, c[1], c[2], r1, r0, null, V3(1, 0, 2)); B.quad(roofMat, c[3], c[0], r0, r1, null, V3(-1, 0, 2));
      B.tri(roofMat, c[0], c[1], r0, [0, 0], [1, 0], [0.5, 1], V3(0, -1, 2)); B.tri(roofMat, c[2], c[3], r1, [0, 0], [1, 0], [0.5, 1], V3(0, 1, 2));
    }
    B.quad(M.soffit, c[0], c[1], c[2], c[3], null, V3(0, 0, -1));
  };
  const v = (x, y) => new THREE.Vector2(x, y);
  mk(-7, 15, 19.5, 31, 6.6, M.roofN1, M.wallN1, true);      // two-storey apartment block to the north (drone)
  mk(-14, 2, -31, -22.5, 3.2, M.roofN2, M.wallN2, true);    // craftsman bungalow to the south (dark roof on drone)
  mk(-44, -30, -9, 6, 3.3, M.roofN1, M.wallN3, false);      // rear neighbour
  mk(-38, -27, 13, 24, 3.3, M.roofN2, M.wallN2, false);
  // the rest of the block: a loose grid of bungalows / small apartment buildings so the horizon is not a void
  const R = rng(909), roofs = [M.roofN1, M.roofN2, M.roofN1, M.roofN3], walls = [M.wallN1, M.wallN2, M.wallN3];
  const treePos = [];
  for (let gx = -120; gx <= 120; gx += 18) for (let gy = -140; gy <= 140; gy += 15) {
    const x = gx + (R() - 0.5) * 4, y = gy + (R() - 0.5) * 3;
    if (x > -50 && x < 32 && y > -36 && y < 36) continue;        // our block, handled above
    if (x > 9 && x < 34) continue;                                // street corridor
    const w = 8 + R() * 5, d = 10 + R() * 6, tall = R() < 0.12;
    mk(x, x + w, y, y + d, tall ? 6.4 : 3.1, roofs[Math.floor(R() * 4)], walls[Math.floor(R() * 3)], R() < 0.5);
    for (let k = 0; k < 2; k++) if (R() < 0.8) treePos.push([x + R() * 18 - 3, y + (R() < 0.5 ? -2 : d + 1.5), 3 + R() * 3.5]);
  }
  for (const [x, y, r] of [[-26, -15, 4], [-29, 9, 4.5], [20, 25, 3.5], [24, -26, 4], [-45, 20, 4.5], [5, -33, 3.5], [-24, 30, 4]]) treePos.push([x, y, r]);
  // instanced canopy trees (several blobs each)
  const cg = blob(new THREE.IcosahedronGeometry(1, 2), 4242, 0.28, 1.4);
  const cuv = cg.attributes.uv; for (let i = 0; i < cuv.count; i++) cuv.setXY(i, cuv.getX(i) * 4, cuv.getY(i) * 2);
  const lm = new THREE.MeshStandardMaterial({ map: leafTex([56, 82, 44]), roughness: 0.95 });
  const inst = new THREE.InstancedMesh(cg, lm, treePos.length * 4), tr = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.22, 1, 6).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5a4636 }), treePos.length);
  let ii = 0; const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  treePos.forEach(([x, y, r], k) => {
    const h = r * 1.6;
    tr.setMatrixAt(k, m4.compose(V3(x, y, H.GRADE + h * 0.3), q.identity(), V3(1, 1, h * 0.6)));
    for (let j = 0; j < 4; j++) {
      const s = r * (0.55 + R() * 0.3); e.set(R() * 6, R() * 6, R() * 6);
      inst.setMatrixAt(ii++, m4.compose(V3(x + (R() - 0.5) * r, y + (R() - 0.5) * r, H.GRADE + h * 0.7 + (R() - 0.3) * r * 0.5), q.setFromEuler(e), V3(s, s, s * 0.85)));
    }
  });
  inst.castShadow = inst.receiveShadow = true; tr.castShadow = true;
  group.add(inst, tr);
  B.build(group);
  return group;
}
