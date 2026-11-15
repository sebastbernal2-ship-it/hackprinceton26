// Dark-void check for walk.html. Usage: node nogaps_check.mjs <port> <model> <tag> <0|1|2>  (0 raw, 1 clear the space, 2 shell only);
// serves walk.html itself (see tests in notes); then: python nogaps_count.py <outdir> [luma-threshold]. Needs playwright-core and chromium with software GL.
import { chromium } from '/tmp/pw/node_modules/playwright-core/index.mjs';
import fs from 'fs';
const [,, port, sid, tag, doClear] = process.argv;
const out = `${process.env.HOME}/nogaps_out/${sid}_${tag}`; fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: '/snap/bin/chromium', args: ['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 800, height: 450 } });
p.on('pageerror', e => console.log('PAGEERR', e.message));
p.on('console', m => { if (m.type()==='error') console.log('CONSOLE', m.text().slice(0,200)); });
await p.goto(`http://127.0.0.1:${port}/walk.html?model=${sid}`);
await p.waitForFunction(() => window.walk && document.getElementById('status').textContent.startsWith('Ready') || (window.walk && /Walking/.test(document.getElementById('status').textContent)), null, { timeout: 240000 });
await p.waitForTimeout(6000);
await p.evaluate(() => document.getElementById('offer')?.classList.remove('open'));
const spots = await p.evaluate(() => {
  const w = window.walk, bb = w.bbox; const pts = [];
  const xs = w.pieces.length ? 0 : 0;
  const g = [];
  const b0 = w.meta.bbox;
  for (let x = b0[0][0] + 0.5; x < b0[1][0]; x += 0.5) for (let y = b0[0][1] + 0.5; y < b0[1][1]; y += 0.5) {
    const z = w.groundAt(x, y, b0[0][2] + 1.2, b0[0][2] - 0.5); if (isFinite(z)) g.push([x, y, z]); }
  // farthest point sampling from the centroid
  const c = g.reduce((a, q) => [a[0] + q[0] / g.length, a[1] + q[1] / g.length], [0, 0]);
  let first = g.reduce((a, q) => Math.hypot(q[0] - c[0], q[1] - c[1]) < Math.hypot(a[0] - c[0], a[1] - c[1]) ? q : a);
  const sel = [first];
  while (sel.length < 3) { let best = null, bd = -1; for (const q of g) { const d = Math.min(...sel.map(s => Math.hypot(s[0] - q[0], s[1] - q[1]))); if (d > bd) { bd = d; best = q; } } sel.push(best); }
  return sel;
});
console.log('spots', JSON.stringify(spots));
if (doClear === '2') { const r = await p.evaluate(async () => { const t = performance.now(); await window.walk.setShell(true); return performance.now() - t; }); console.log('shell ms', r); await p.waitForTimeout(500); }
if (doClear === '1') {
  await p.evaluate(() => window.walk.clearSpace());
  await p.waitForFunction(() => !window.walk.clearing && window.walk.lastClear, null, { timeout: 120000 });
  await p.waitForTimeout(1500); console.log(JSON.stringify(await p.evaluate(() => ({s: window.walk.shell, L: window.walk.lastClear && {n: window.walk.lastClear.n}}))));
  await p.evaluate(() => { document.getElementById('clearInfo')?.classList.remove('open'); });
  await p.screenshot({ path: `${out}/card.png` });
  await p.evaluate(() => { document.getElementById('clearInfo')?.classList.remove('open'); });
}
await p.addStyleTag({ content: '#hud,#cross,#panel,#status,#hint,#offer,#clearInfo,#ai,#cat,#edits{display:none!important}' });
let k = 0;
for (let si = 0; si < spots.length; si++) {
  for (let h = 0; h < 12; h++) {
    await p.evaluate(([s, h]) => { const w = window.walk; w.feet.set(s[0], s[1], s[2]); w.eye.set(s[0], s[1], s[2] + 1.6); w.setView(h * Math.PI / 6, -0.05 + (h % 3 - 1) * 0.25); }, [spots[si], h]);
    await p.waitForTimeout(350);
    await p.screenshot({ path: `${out}/s${si}_h${String(h).padStart(2,'0')}.png` }); k++;
  }
}
console.log('shots', k);
await b.close();
