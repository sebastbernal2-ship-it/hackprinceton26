// Headless-Chrome screenshots over CDP: waits for document.title === 'READY'.
// usage: node Code/expansion/a_parametric/shoot.mjs [case:view ...]   (server on 127.0.0.1:8101 serving the repo root)
import {spawn} from 'node:child_process';
import {writeFileSync, mkdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8101;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
let shots = process.argv.slice(2);
if (!shots.length) shots = ['main:aerial', 'main:backyard', 'main:interior', 'main:front', 'main:plan', 'side:aerial'];
mkdirSync(join(HERE, 'shots'), {recursive: true});

var shotNo = 0;
for (const s of shots) await shootOne(s);
process.exit(0);


async function shootOne(s) {
const DBG = 9400 + Math.floor(Math.random() * 500) + (shotNo++);
const chrome = spawn(CHROME, ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars',
  `--remote-debugging-port=${DBG}`, `--user-data-dir=${join(tmpdir(), 'chrome_a_parametric_cdp_' + process.pid + '_' + Date.now())}`, '--window-size=1600,900',
  'about:blank'], {stdio: 'ignore'});
const sleep = ms => new Promise(r => setTimeout(r, ms));
let targets;
for (let i = 0; i < 240; i++) { try { targets = await (await fetch(`http://127.0.0.1:${DBG}/json`)).json(); break; } catch { await sleep(250); } }
const page = targets.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, {once: true}));
let id = 0; const waiters = new Map();
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data);
  if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled' && process.env.VERBOSE) console.log('  console:', m.params.args.map(a => a.value).join(' '));
  if (m.method === 'Runtime.exceptionThrown') console.log('  EXCEPTION:', JSON.stringify(m.params.exceptionDetails).slice(0, 600)); });
const send = (method, params = {}) => new Promise(r => { const k = ++id; waiters.set(k, r); ws.send(JSON.stringify({id: k, method, params})); });
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', {width: 1600, height: 900, deviceScaleFactor: 1, mobile: false});
  const [c, v] = s.split(':');
  const t0 = Date.now();
  await send('Page.navigate', {url: `http://127.0.0.1:${PORT}/Code/expansion/a_parametric/index.html?case=${c}&view=${v}`});
  let ok = false;
  for (let i = 0; i < 600; i++) {
    await sleep(500);
    const r = await send('Runtime.evaluate', {expression: 'document.title'});
    if (r.result && r.result.result && r.result.result.value === 'READY') { ok = true; break; }
  }
  await sleep(300);
  const shot = await send('Page.captureScreenshot', {format: 'png'});
  const out = join(HERE, 'shots', `${c}_${v}.png`);
  writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  console.log(out, ok ? 'READY' : 'TIMEOUT', ((Date.now() - t0) / 1000).toFixed(1) + 's');

  ws.close();
  spawn('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], {stdio: 'ignore'}); await sleep(1500);
}
