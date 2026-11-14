// Site walkthrough viewer. ?scene=<url>&findings=<url> (optional &imagined=<splat url>, &floorY=, &scale=, &flip=1).
// With no scene it runs the built-in DEMO room. Desktop walk with collision, WebXR, finding pins, reality tint.

import * as THREE from 'three';
import { SparkRenderer } from '@sparkjsdev/spark';
import { DesktopControls } from './controls.ts';
import { DEMO_FINDINGS } from './demo.ts';
import { describeFinding, parseFindings, SEVERITY_COLOR, SEVERITY_LABEL, surfaceOf, WORDING, type DefectFinding, type Severity } from './findings.ts';
import { findFreeSpot } from './physics.ts';
import { PinLayer, type Pin } from './pins.ts';
import { Player } from './player.ts';
import { isMeshUrl, loadScene, type LoadedScene } from './scene.ts';
import { XrSystem } from './xr.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
const sceneUrl = params.get('scene');
const findingsUrl = params.get('findings');
const num = (k: string) => { const v = params.get(k); return v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined; };

function fail(message: string): void {
  $('loading').classList.add('error');
  $('loadText').textContent = message;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json();
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

async function main(): Promise<void> {
  // ---- renderer ----
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x14161d, 1);
  $('stage').append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.03, 900);
  const rig = new THREE.Group();
  rig.add(camera);
  scene.add(rig);
  if (!sceneUrl || !isMeshUrl(sceneUrl)) scene.add(new SparkRenderer({ renderer }));

  // ---- scene + findings ----
  const status = $('status');
  let loaded: LoadedScene;
  try {
    loaded = await loadScene({
      url: sceneUrl && sceneUrl !== 'demo' ? sceneUrl : null,
      imaginedUrl: params.get('imagined'),
      floorY: num('floorY'),
      scale: num('scale'),
      flip: params.get('flip') === '1',
      onProgress: (p) => { $('loadText').textContent = p.fraction === null ? `${p.stage}...` : `${p.stage}: ${Math.round(p.fraction * 100)}%`; },
    });
  } catch (e) {
    return fail(`Could not load the scene${sceneUrl ? ` from ${sceneUrl}` : ''}: ${(e as Error).message}`);
  }
  scene.add(loaded.root);
  if (loaded.lit) {
    scene.add(new THREE.HemisphereLight(0xffffff, 0x6b6558, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(3, 8, 4);
    scene.add(sun);
  }

  let rawFindings: unknown = null;
  let findingsNote = '';
  if (findingsUrl) {
    try { rawFindings = await fetchJson(findingsUrl); } catch (e) { findingsNote = `Findings not loaded: ${(e as Error).message}`; }
  } else if (loaded.kind === 'demo') rawFindings = DEMO_FINDINGS;
  else findingsNote = 'No findings URL given (add &findings=<url>), so there are no pins.';
  const parsed = rawFindings ? parseFindings(rawFindings) : { findings: [], rejected: [], label: null };
  const isDemo = loaded.kind === 'demo' || /^DEMO|SYNTHETIC/i.test(parsed.label ?? '');

  // ---- pins ----
  const pins = new PinLayer();
  scene.add(pins.group);
  const byId = new Map<string, Pin>();
  const surfaceFor = new Map<string, { surface: Pin['surface']; floating: boolean }>();
  for (const f of parsed.findings) {
    const a = f.anchor;
    const measured = a ? loaded.surfaceAt(a.x, a.y, a.z) : null;
    const dist = a && loaded.distanceToSurface ? loaded.distanceToSurface(a.x, a.y, a.z) : 0;
    const floating = !!a && dist > 0.6;
    const surface = surfaceOf(f, measured);
    surfaceFor.set(f.id, { surface, floating });
    const pin = pins.add(f, surface, floating);
    if (pin) byId.set(f.id, pin);
  }

  // ---- walker ----
  const player = new Player();
  player.body = { ...loaded.body };
  player.place(loaded.spawn.x, loaded.spawn.y, loaded.spawn.z, loaded.spawn.yaw);
  const env = () => ({ world: loaded.world, ground: loaded.ground, walkBounds: loaded.walkBounds, margin: 0.5 });
  const controls = new DesktopControls(renderer.domElement);

  // ---- UI ----
  document.title = isDemo ? 'Site walkthrough (DEMO)' : 'Site walkthrough';
  if (isDemo) { const b = $('badge'); b.hidden = false; b.textContent = 'DEMO: synthetic room and findings'; }
  const rejectedNote = parsed.rejected.length ? `${parsed.rejected.length} finding(s) rejected as invalid: ${parsed.rejected.map((r) => `${r.id ?? `#${r.index}`} (${r.reason})`).join('; ')}.` : '';
  status.textContent = `${loaded.label} | ${loaded.stats} | ${pins.pins.length} pinned of ${parsed.findings.length} findings.${findingsNote ? ' ' + findingsNote : ''}${rejectedNote ? ' ' + rejectedNote : ''}`;
  status.title = status.textContent;

  const card = $('card');
  let selected: Pin | null = null;
  let selectedFinding: DefectFinding | null = null;
  function showCard(f: DefectFinding): void {
    const { surface, floating } = surfaceFor.get(f.id)!;
    const d = describeFinding(f, surface, floating);
    card.replaceChildren();
    const close = el('button', 'close', '×');
    close.setAttribute('aria-label', 'Close');
    close.onclick = () => select(null);
    card.append(close, el('h2', undefined, d.title));
    const badges = el('div', 'badges');
    for (const b of d.badges) badges.append(el('span', 'badge', b));
    card.append(badges, el('p', 'notice', d.notice));
    if (d.warning) card.append(el('p', 'warn', d.warning));
    if (!f.anchor) card.append(el('p', 'warn', WORDING.noAnchor));
    const dl = el('dl');
    for (const r of d.rows) {
      dl.append(el('dt', r.label === WORDING.verify ? 'verify' : undefined, r.label), el('dd', undefined, r.text));
    }
    card.append(dl);
    card.hidden = false;
  }
  function select(pin: Pin | null, f: DefectFinding | null = pin?.finding ?? null): void {
    selected = pin;
    selectedFinding = f;
    pins.select(pin);
    if (f) showCard(f); else card.hidden = true;
    for (const b of $('list').querySelectorAll<HTMLElement>('button')) b.setAttribute('aria-current', String(b.dataset.id === f?.id));
  }

  const list = $('list');
  list.append(el('h3', undefined, `Findings (${parsed.findings.length})`));
  for (const f of parsed.findings) {
    const { surface } = surfaceFor.get(f.id)!;
    const b = el('button');
    b.dataset.id = f.id;
    const dot = el('span', surface === 'inferred' ? 'dot inferred' : 'dot');
    dot.style.background = SEVERITY_COLOR[f.severity];
    const t = el('span');
    t.append(document.createTextNode(f.title), el('small', undefined, `${SEVERITY_LABEL[f.severity]}${f.anchor ? '' : ' | no 3D position'}`));
    b.append(dot, t);
    b.onclick = () => { const p = byId.get(f.id) ?? null; select(p, f); if (p) goTo(p); };
    list.append(b);
  }
  if (!parsed.findings.length) list.append(el('p', undefined, findingsNote || 'No findings.'));
  if (rejectedNote) list.append(el('p', 'warn', rejectedNote));
  $('listToggle').onclick = () => { list.hidden = !list.hidden; };

  // legend
  const legend = $('legend');
  const row = (swatch: HTMLElement, text: string) => { const r = el('div', 'row'); r.append(swatch, el('span', undefined, text)); legend.append(r); };
  const sq = (css: string) => { const s = el('span', 'sq'); s.style.cssText = css; return s; };
  const sw = (color: string) => { const s = el('span', 'sw'); s.style.background = color; return s; };
  row(sq('background:#cfc7b8'), 'Captured surface (as scanned)');
  row(sq('background:#8c5cff;opacity:.8'), loaded.reality.available ? `Inferred surface, tinted (${loaded.reality.count} ${loaded.reality.unit})` : 'Inferred surface (none marked in this scene file)');
  for (const s of ['high', 'medium', 'low', 'unknown'] as Severity[]) row(sw(SEVERITY_COLOR[s]), `Pin: ${SEVERITY_LABEL[s].toLowerCase()}`);
  const dashed = el('span', 'sw'); dashed.style.cssText = 'background:transparent;border:2px dashed #8c5cff';
  row(dashed, 'Pin on an inferred surface: not evidence');
  legend.append(el('div', 'note', `Pins are candidates for an on-site inspector. ${WORDING.confidence}`));

  const realityBtn = $('reality') as HTMLButtonElement;
  if (loaded.reality.available) {
    realityBtn.hidden = false;
    const sync = () => { realityBtn.textContent = `Reality check: ${loaded.reality.on ? 'on' : 'off'}`; realityBtn.setAttribute('aria-pressed', String(loaded.reality.on)); };
    realityBtn.onclick = () => { loaded.reality.set(!loaded.reality.on); sync(); };
    sync();
  }

  // ---- go to a pin: stand 1.6 m from it on a free spot and face it ----
  function goTo(pin: Pin): void {
    const p = pin.position;
    let best: { x: number; y: number; z: number } | null = null;
    for (let k = 0; k < 16 && !best; k++) {
      const a = (k / 16) * Math.PI * 2;
      for (const r of [1.6, 1.1, 2.2]) {
        const f = findFreeSpot(loaded.world, p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, 0, player.body, loaded.ground, 0, 0.05);
        const inside = f.found && f.x >= loaded.walkBounds.min[0] && f.x <= loaded.walkBounds.max[0] && f.z >= loaded.walkBounds.min[2] && f.z <= loaded.walkBounds.max[2];
        if (inside) { best = f; break; }
      }
    }
    // nowhere to stand (e.g. the pin is in an inferred part nobody can walk into): just face it from here
    if (!best) best = { x: player.pos.x, y: player.pos.y, z: player.pos.z };
    const dx = p.x - best.x, dz = p.z - best.z, dy = p.y - (best.y + player.eyeHeight);
    player.place(best.x, best.y, best.z, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
  }

  // ---- input ----
  const ray = new THREE.Raycaster();
  function pickScreen(cx: number, cy: number, locked: boolean): Pin | null {
    const ndc = locked ? new THREE.Vector2(0, 0) : new THREE.Vector2((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
    camera.updateMatrixWorld();
    ray.setFromCamera(ndc, camera);
    return pins.pick(ray.ray.origin, ray.ray.direction);
  }
  controls.enabled = true;
  controls.onClick = (x, y, locked) => {
    const pin = pickScreen(x, y, locked);
    if (pin) return select(pin);
    if (!locked && !card.contains(document.activeElement)) controls.lock();
  };
  controls.onLockChange = (locked) => { $('crosshair').hidden = !locked; $('hint').classList.toggle('hidden', locked); };
  controls.onKey = (code) => {
    if (code === 'Escape') select(null);
    if (code === 'KeyF') { player.setFly(!player.fly); }
    if (code === 'KeyR') player.place(loaded.spawn.x, loaded.spawn.y, loaded.spawn.z, loaded.spawn.yaw);
    if (code === 'KeyL') list.hidden = !list.hidden;
  };

  // ---- XR ----
  const xr = new XrSystem({
    renderer, scene, camera, rig,
    world: () => loaded.world,
    body: loaded.body,
    ground: () => loaded.ground,
    walkBounds: () => loaded.walkBounds,
    spawn: () => loaded.spawn,
    pickRay(origin, dir, commit) {
      const pin = pins.pick(origin, dir);
      if (pin && commit) {
        select(pin);
        const d = describeFinding(pin.finding, pin.surface, surfaceFor.get(pin.finding.id)!.floating);
        xr.card.show([
          { text: d.title, bold: true },
          { text: d.badges.join(' | '), color: '#a0a7b6' },
          { text: d.notice, color: '#a0a7b6' },
          ...(d.warning ? [{ text: d.warning, color: '#b69cff' }] : []),
          ...d.rows.flatMap((r) => [{ text: r.label.toUpperCase(), color: r.label === WORDING.verify ? '#f5a524' : '#a0a7b6' }, { text: r.text }]),
        ]);
        const head = camera.getWorldPosition(new THREE.Vector3());
        xr.card.mesh.position.copy(pin.position).lerp(head, 0.35);
        xr.card.mesh.position.y = Math.max(pin.position.y, 1.2);
        xr.card.mesh.lookAt(head);
      }
      return !!pin;
    },
    onEnter() { controls.enabled = false; controls.releaseLock(); $('hint').classList.add('hidden'); },
    onExit(pose) { controls.enabled = true; player.place(pose.x, pose.y, pose.z, pose.yaw); rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0); },
  });
  void xr.probe().then((ok) => {
    const vr = $('vr');
    vr.hidden = !ok;
    vr.onclick = () => (xr.presenting ? xr.exit() : void xr.enter().catch((e) => { status.textContent = `Could not start VR: ${(e as Error).message}`; }));
  });

  // ---- loop ----
  let last = performance.now();
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;
    if (xr.presenting) xr.update(dt);
    else {
      const look = controls.consumeLook();
      player.look(look.x, look.y);
      player.update(dt, controls.read(), env());
      rig.position.set(player.pos.x, player.pos.y, player.pos.z);
      rig.rotation.set(0, player.yaw, 0);
      camera.position.set(0, player.eyeY - player.pos.y, 0);
      camera.rotation.set(player.pitch, 0, 0, 'YXZ');
    }
    pins.update(camera);
    renderer.render(scene, camera);
  });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  $('loading').classList.add('done');
  $('title').textContent = isDemo ? 'Site walkthrough (DEMO)' : 'Site walkthrough';
  // handle for tests and tools
  (window as unknown as { __walk: unknown }).__walk = {
    kind: loaded.kind,
    pins: pins.pins.map((p) => ({ id: p.finding.id, surface: p.surface, floating: p.floating })),
    select: (id: string) => { const p = byId.get(id) ?? null; select(p, p?.finding ?? parsed.findings.find((f) => f.id === id) ?? null); },
    goTo: (id: string) => { const p = byId.get(id); if (p) goTo(p); },
    player, xr: xr.debug, selected: () => selectedFinding?.id ?? selected?.finding.id ?? null,
  };
}

main().catch((e) => fail(`Viewer failed: ${(e as Error).message}`));
