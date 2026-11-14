// Headless-Chrome screenshot driver (CDP over the built-in WebSocket of Node >= 22).
// Waits until the page sets document.title = 'READY', then captures 1600x900.
// usage (repo root, static server on :8104 already running):
//   node Code/expansion/d_roofshell/render_shots.mjs main:aerial main:backyard ... side:aerial
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8104, DBG = 9334 + Math.floor(Math.random() * 500);
const jobs = process.argv.slice(2).length ? process.argv.slice(2) : ['main:aerial', 'main:backyard', 'main:interior', 'main:front', 'main:plan', 'side:aerial'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

const prof = join(tmpdir(), 'd_roofshell_chrome_' + DBG);
const ch = spawn(CHROME, ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--remote-debugging-port=${DBG}`,
  `--user-data-dir=${prof}`, '--window-size=1600,900', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
let ver;
for (let i = 0; i < 60 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${DBG}/json/version`)).json(); } catch { await sleep(500); } }
const targets = await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json();
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0; const pend = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown') console.log('EXC', JSON.stringify(m.params.exceptionDetails).slice(0, 400)); else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') console.log('ERR', JSON.stringify(m.params.args).slice(0, 300)); });
const send = (method, params = {}) => new Promise(r => { const k = ++id; pend.set(k, r); ws.send(JSON.stringify({ id: k, method, params })); });
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
mkdirSync(join(HERE, 'shots'), { recursive: true });
for (const j of jobs) {
  const [c, v] = j.split(':');
  const t0 = Date.now();
  await send('Page.navigate', { url: `http://localhost:${PORT}/Code/expansion/d_roofshell/index.html?case=${c}&view=${v}` });
  let ok = false;
  for (let i = 0; i < 360; i++) { await sleep(500); const r = await send('Runtime.evaluate', { expression: 'document.title' }); if (r.result?.result?.value === 'READY') { ok = true; break; } }
  await sleep(300);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const out = join(HERE, 'shots', `${c}_${v}.png`);
  writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  console.log(`${j}: ${ok ? 'READY' : 'TIMEOUT'} in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${out}`);
}
ws.close(); ch.kill();
