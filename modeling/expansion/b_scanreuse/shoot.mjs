// Headless-Chrome screenshots via the DevTools protocol (waits for document.title === 'READY').
// usage: node shoot.mjs [case:view:outname ...]   (static server must serve the repo root on :8102)
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const CH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9302;
const jobs = (process.argv.length > 2 ? process.argv.slice(2) :
  ['main:aerial:main_aerial', 'main:backyard:main_backyard', 'main:interior:main_interior', 'main:front:main_front',
   'main:plan:main_plan', 'side:aerial:side_aerial']).map(s => s.split(':'));
mkdirSync(join(HERE, 'shots'), { recursive: true });

const chrome = spawn(CH, ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmpdir(), 'chrome_b_scanreuse_cdp_' + Date.now())}`, '--window-size=1600,900',
  'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ver;
for (let i = 0; i < 240; i++) { try { ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(250); } }

for (const [cs, view, out] of jobs) {
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (method, params = {}) => new Promise(r => { const k = ++id; pend.set(k, r); ws.send(JSON.stringify({ id: k, method, params })); });
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.enable');
  await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
  const url = `http://localhost:8102/Code/expansion/b_scanreuse/index.html?case=${cs}&view=${view}`;
  const t0 = Date.now();
  await send('Page.navigate', { url });
  let ok = false;
  while (Date.now() - t0 < 180000) {
    const r = await send('Runtime.evaluate', { expression: 'document.title' });
    if (r.result && r.result.result && r.result.result.value === 'READY') { ok = true; break; }
    await sleep(500);
  }
  await sleep(800);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(HERE, 'shots', out + '.png'), Buffer.from(shot.result.data, 'base64'));
  console.log(out, ok ? 'READY' : 'TIMEOUT', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  ws.close();
  await fetch(`http://127.0.0.1:${PORT}/json/close/${t.id}`);
}
chrome.kill();
process.exit(0);
