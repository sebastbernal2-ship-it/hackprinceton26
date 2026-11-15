#!/usr/bin/env node
// Render a 256x256 studio preview PNG for every catalogue asset's GLB (3/4 isometric, soft shadow).
//   node tools/render-asset-thumbs.cjs [--api http://127.0.0.1:8000] [--out data/derived/asset-thumbs] [--force] [--only id,id]
// Needs playwright-core (PW_DIR, default /tmp/pw/node_modules) and a Chromium (CHROMIUM, default /snap/bin/chromium).
const http = require("http"), fs = require("fs"), path = require("path");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = path.resolve(__dirname, "..");
const API = arg("--api", process.env.API_URL || "http://127.0.0.1:8000");
const OUT = path.resolve(arg("--out", process.env.ASSET_THUMB_DIR || path.join(ROOT, "data/derived/asset-thumbs")));
const FORCE = process.argv.includes("--force");
const ONLY = (arg("--only", "") || "").split(",").filter(Boolean);
const SIZE = 256;
let chromium;
try { ({ chromium } = require(path.join(process.env.PW_DIR || "/tmp/pw/node_modules", "playwright-core"))); }
catch { try { ({ chromium } = require("playwright-core")); } catch { console.error("playwright-core not found (set PW_DIR)"); process.exit(2); } }

const PAGE = `<!doctype html><meta charset=utf-8><body style="margin:0">
<script type="module">
import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
const S = ${SIZE};
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
r.setPixelRatio(1); r.setSize(S, S); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
r.toneMapping = THREE.NoToneMapping; document.body.appendChild(r.domElement);
const loader = new GLTFLoader();
window.renderGlb = (b64) => new Promise((ok, bad) => {
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  loader.parse(bin.buffer, '', (g) => {
    const scene = new THREE.Scene();
    const bg = document.createElement('canvas'); bg.width = 2; bg.height = 256; const x = bg.getContext('2d');
    const gr = x.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#f4f5f7'); gr.addColorStop(1, '#d9dde3'); x.fillStyle = gr; x.fillRect(0, 0, 2, 256);
    const t = new THREE.CanvasTexture(bg); t.colorSpace = THREE.SRGBColorSpace; scene.background = t;
    const obj = g.scene; scene.add(obj);
    obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    let box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return bad('empty model');
    const c = box.getCenter(new THREE.Vector3()); obj.position.set(-c.x, -box.min.y, -c.z); obj.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3()), R = size.length();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa0aa, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(-R, R * 1.6, R * 0.8); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); const sc = sun.shadow.camera; sc.left = sc.bottom = -R; sc.right = sc.top = R; sc.near = 0.1; sc.far = R * 6; sun.shadow.radius = 5; sun.shadow.bias = -0.0005;
    scene.add(sun);
    const gnd = new THREE.Mesh(new THREE.PlaneGeometry(R * 8, R * 8), new THREE.ShadowMaterial({ opacity: 0.28 })); gnd.rotation.x = -Math.PI / 2; gnd.receiveShadow = true; scene.add(gnd);
    const dir = new THREE.Vector3(1, 0.85, 1.15).normalize(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, R * 20);
    const mid = size.clone().multiplyScalar(0.5); cam.position.copy(mid).addScaledVector(dir, R * 5); cam.lookAt(mid); cam.updateMatrixWorld(true);
    const inv = cam.matrixWorldInverse; let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9;
    const bb = new THREE.Box3().setFromObject(obj);
    for (const px of [bb.min.x, bb.max.x]) for (const py of [bb.min.y, bb.max.y]) for (const pz of [bb.min.z, bb.max.z]) {
      const v = new THREE.Vector3(px, py, pz).applyMatrix4(inv); mnx = Math.min(mnx, v.x); mxx = Math.max(mxx, v.x); mny = Math.min(mny, v.y); mxy = Math.max(mxy, v.y); }
    const half = Math.max(mxx - mnx, mxy - mny) / 2 * 1.14, cx = (mnx + mxx) / 2, cy = (mny + mxy) / 2;
    cam.left = cx - half; cam.right = cx + half; cam.bottom = cy - half; cam.top = cy + half; cam.updateProjectionMatrix();
    r.render(scene, cam);
    scene.traverse(o => { if (o.geometry) o.geometry.dispose(); }); t.dispose(); ok(true);
  }, bad);
});
window.ready = true;
</script>`;

(async () => {
  const srv = http.createServer((q, s) => {
    const u = decodeURIComponent(q.url.split("?")[0]);
    if (u === "/") { s.setHeader("content-type", "text/html"); return s.end(PAGE); }
    const f = path.join(ROOT, "modeling", u);
    if (u.startsWith("/vendor/") && !u.includes("..") && fs.existsSync(f)) { s.setHeader("content-type", "text/javascript"); return fs.createReadStream(f).pipe(s); }
    s.statusCode = 404; s.end();
  }).listen(0, "127.0.0.1");
  await new Promise(r => srv.once("listening", r));
  const list = await (await fetch(API + "/api/assets")).json();
  fs.mkdirSync(OUT, { recursive: true });
  const todo = list.filter(a => (!ONLY.length || ONLY.includes(a.assetId)) && (FORCE || !fs.existsSync(path.join(OUT, a.assetId + ".png"))));
  console.log(`${list.length} assets, ${todo.length} to render -> ${OUT}`);
  if (!todo.length) return srv.close();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/snap/bin/chromium", args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
  page.on("pageerror", e => console.error("page error:", e.message));
  await page.goto(`http://127.0.0.1:${srv.address().port}/`); await page.waitForFunction("window.ready === true");
  let n = 0, bad = 0;
  for (const a of todo) {
    n++;
    try {
      const res = await fetch(`${API}/api/assets/${encodeURIComponent(a.assetId)}/model`);
      if (!res.ok) throw new Error("model HTTP " + res.status);
      const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
      await page.evaluate(b => window.renderGlb(b), b64);
      const png = await page.locator("canvas").screenshot({ type: "png" });
      const tmp = path.join(OUT, a.assetId + ".png.tmp"); fs.writeFileSync(tmp, png); fs.renameSync(tmp, path.join(OUT, a.assetId + ".png"));
      console.log(`[${n}/${todo.length}] ${a.assetId}`);
    } catch (e) { bad++; console.error(`[${n}/${todo.length}] ${a.assetId} FAILED: ${String(e.message || e).slice(0, 120)}`); }
  }
  await browser.close(); srv.close();
  console.log(`done: ${todo.length - bad} rendered, ${bad} failed`); process.exit(bad ? 1 : 0);
})();
