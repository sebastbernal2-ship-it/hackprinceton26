// Fio the inspector as a little physical being inside walk.html's Three.js scene (Z-up world, metres).
// UMD: window.Fio3D in the browser, module.exports under node (node:test, modeling/tests/fio_3d.test.mjs).
//
// Pure part (no THREE, no DOM): path finding on a lazily evaluated floor grid, follow-distance logic, the action queue /
// animation state machine ("brain") and the procedural pose function. The scene part (init) builds ~700 flat-shaded
// triangles of hard hat, hi-vis vest, moustache and clipboard, animates them from poseFor() each frame, and wires the
// walk's command layer (fio_commands.js) so that every executed step also drives Fio: he walks to the spot, picks the
// piece up, sets it down with a pop, points, looks through a magnifier, shakes his head.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Fio3D = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const wrapA = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  const HEIGHT = 1.1;                    // m, hat included
  const WALK = 1.5, RUN = 3.2;           // m/s
  const ANIM = { wave: 1.5, pickup: 0.75, place: 1.1, point: 1.8, magnify: 2.4, shake: 1.5, cheer: 1.5, nod: 0.9 };

  // ------------------------------------------------------------------ floor grid + path finding
  /** A lazily evaluated grid: blocked(x, y) is asked only for the cells a search actually touches (and remembered). */
  function makeGrid({ x0, y0, x1, y1, cell = 0.2, blocked }) {
    const nx = Math.max(1, Math.ceil((x1 - x0) / cell) + 1), ny = Math.max(1, Math.ceil((y1 - y0) / cell) + 1);
    const cells = new Uint8Array(nx * ny);          // 0 unknown, 1 free, 2 blocked
    const free = (i, j) => {
      if (i < 0 || j < 0 || i >= nx || j >= ny) return false;
      const k = j * nx + i; let c = cells[k];
      if (!c) { c = blocked(x0 + i * cell, y0 + j * cell) ? 2 : 1; cells[k] = c; }
      return c === 1;
    };
    const cellOf = (x, y) => [Math.round((x - x0) / cell), Math.round((y - y0) / cell)];
    return { x0, y0, cell, nx, ny, cells, free, cellOf, pt: (i, j) => ({ x: x0 + i * cell, y: y0 + j * cell }),
             freeAt: (x, y) => { const [i, j] = cellOf(x, y); return free(i, j); } };
  }

  /** The free cell nearest (x, y) within maxR metres, or null. */
  function nearestFree(g, x, y, maxR = 1.5) {
    const [ci, cj] = g.cellOf(x, y), R = Math.ceil(maxR / g.cell);
    let best = null, bd = Infinity;
    for (let r = 0; r <= R; r++) {
      for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r || !g.free(i, j)) continue;
        const p = g.pt(i, j), d = Math.hypot(p.x - x, p.y - y);
        if (d < bd && d <= maxR) { bd = d; best = p; }
      }
      if (best && bd <= r * g.cell) break;           // nothing in a bigger ring can be closer
    }
    return best;
  }

  /** Is the straight segment a-b over free cells (sampled every half cell)? */
  function lineFree(g, a, b) {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (g.cell * 0.5)));
    for (let k = 0; k <= n; k++) if (!g.freeAt(a.x + (b.x - a.x) * k / n, a.y + (b.y - a.y) * k / n)) return false;
    return true;
  }

  function smoothPath(g, pts) {
    if (pts.length < 3) return pts;
    const out = [pts[0]]; let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !lineFree(g, pts[i], pts[j])) j--;
      out.push(pts[j]); i = j;
    }
    return out;
  }

  /** A* over free cells (8 neighbours, no corner cutting), then string-pulled. Returns {path, goal, exact} or null.
   *  A blocked start / goal is moved to the nearest free cell (startR / goalR metres); exact says the goal itself was free. */
  function findPath(g, from, to, opt = {}) {
    const s = nearestFree(g, from.x, from.y, opt.startR ?? 1.0), e = nearestFree(g, to.x, to.y, opt.goalR ?? 2.0);
    if (!s || !e) return null;
    const exact = g.freeAt(to.x, to.y);
    const [si, sj] = g.cellOf(s.x, s.y), [ei, ej] = g.cellOf(e.x, e.y), W = g.nx;
    const key = (i, j) => j * W + i, gs = new Map(), came = new Map(), closed = new Set(), heap = [];
    const h = (i, j) => { const dx = Math.abs(i - ei), dy = Math.abs(j - ej); return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy); };
    const push = (n) => { heap.push(n); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p].f <= heap[k].f) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { let l = 2 * k + 1, r = l + 1, m = k;
      if (l < heap.length && heap[l].f < heap[m].f) m = l; if (r < heap.length && heap[r].f < heap[m].f) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    gs.set(key(si, sj), 0); push({ i: si, j: sj, f: h(si, sj) });
    let nodes = 0, found = false;
    while (heap.length && nodes++ < (opt.maxNodes ?? 8000)) {
      const { i, j } = pop(), k = key(i, j);
      if (closed.has(k)) continue; closed.add(k);
      if (i === ei && j === ej) { found = true; break; }
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (!g.free(ni, nj) || (di && dj && !(g.free(i + di, j) && g.free(i, j + dj)))) continue;
        const nk = key(ni, nj), cost = gs.get(k) + (di && dj ? Math.SQRT2 : 1);
        if (cost < (gs.get(nk) ?? Infinity)) { gs.set(nk, cost); came.set(nk, k); push({ i: ni, j: nj, f: cost + h(ni, nj) }); }
      }
    }
    if (!found) return null;
    const cellsPath = []; let k = key(ei, ej);
    while (k !== undefined) { cellsPath.push(g.pt(k % W, Math.floor(k / W))); k = came.get(k); }
    cellsPath.reverse();
    const pts = [{ x: from.x, y: from.y }, ...cellsPath.slice(1, -1)];
    const last = exact && dist(e, to) < g.cell * 1.01 ? { x: to.x, y: to.y } : e;
    pts.push(last);
    return { path: smoothPath(g, pts), goal: last, exact };
  }

  /** Where to stand to work on something at `target`: the free spot closest to `from` on the smallest ring around it. */
  function standPoint(g, target, from, o = {}) {
    const minR = o.minR ?? 0.5, maxR = o.maxR ?? 2.0, step = o.step ?? 0.15, n = o.n ?? 24;
    for (let r = minR; r <= maxR + 1e-9; r += step) {
      let best = null, bd = Infinity;
      for (let k = 0; k < n; k++) {
        const a = k * TAU / n, p = { x: target.x + Math.cos(a) * r, y: target.y + Math.sin(a) * r };
        if (!g.freeAt(p.x, p.y)) continue;
        const d = dist(p, from); if (d < bd) { bd = d; best = p; }
      }
      if (best) return best;
    }
    return null;
  }

  // ------------------------------------------------------------------ follow logic
  /** Where Fio should go to stay near the player without being in the way, or null to stay put.
   *  s: {fio:{x,y}, player:{x,y}, yaw (rad, the way the player faces), moving}. o: {near, far, polite, isFree(x, y)}.
   *  He keeps a polite distance beside / just ahead of the player (inside the view), never straight ahead of a walking player. */
  function followGoal(s, o = {}) {
    const near = o.near ?? 1.2, far = o.far ?? 4.0, polite = o.polite ?? 2.6, isFree = o.isFree || (() => true);
    const dx = s.fio.x - s.player.x, dy = s.fio.y - s.player.y, d = Math.hypot(dx, dy);
    const ang = wrapA(Math.atan2(dy, dx) - s.yaw);
    const inWay = !!s.moving && d < 1.8 && Math.abs(ang) < 0.6;
    if (!(d < near || d > far || inWay)) return null;
    const pref = d > far ? -1 : (ang >= 0 ? 1 : -1);             // keep to the side he is on; a far one joins on the right
    const degs = s.moving ? [75, 110, 140, 50, 170] : [40, 70, 110, 150, 180];
    const angles = degs.flatMap((k) => [pref * k, -pref * k]).map((k) => k * Math.PI / 180);
    for (const r of [polite, polite * 1.25, polite * 0.8, near + 0.2])
      for (const a of angles) {
        const p = { x: s.player.x + Math.cos(s.yaw + a) * r, y: s.player.y + Math.sin(s.yaw + a) * r };
        if (isFree(p.x, p.y)) return p;
      }
    return null;
  }

  /** The camera is inside Fio (so he should not be drawn). */
  function cameraInside(eye, fio, r = 0.4) {
    return Math.hypot(eye.x - fio.x, eye.y - fio.y) < r && eye.z > fio.z - 0.05 && eye.z < fio.z + HEIGHT + 0.15;
  }

  function wrapText(text, max = 26) {
    const lines = []; let cur = '';
    for (const w of String(text).split(/\s+/).filter(Boolean)) {
      if (cur && (cur + ' ' + w).length > max) { lines.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w;
    }
    if (cur) lines.push(cur);
    return lines.length > 6 ? [...lines.slice(0, 5), lines[5].replace(/\s*\S*$/, '') + '...'] : lines;
  }

  // ------------------------------------------------------------------ brain: action queue + animation state machine
  /**
   * Fio's body as a state machine with an action queue. Actions (all enqueue() calls return a promise that resolves when the
   * action has finished):
   *   {type:'walk', path:[{x,y}...], speed}      walk along the path (state walk, or carry while holding a piece)
   *   {type:'face', x, y}                        turn to look at a point
   *   {type:'anim', name, dur, face?, events?}   wave | pickup | place | point | magnify | shake | cheer | nod; events: [{at: 0..1, fn}]
   *   {type:'wait', dur}   {type:'call', fn}
   * Any action may carry onStart(brain) / onEnd(brain). In fast mode every action completes instantly; with reduced motion
   * walks are teleports and animations are short holds. A 'follow' walk is interruptible: enqueueing anything else drops it.
   */
  function createBrain(opt = {}) {
    const b = { x: 0, y: 0, heading: 0, state: 'idle', stateT: 0, clock: 0, gait: 0, speed: 0, carry: null, thinking: false,
                reduced: !!opt.reduced, fast: !!opt.fast, cur: null, queue: [], aim: null, turnRate: 7 };

    const finish = (a) => { if (a.onEnd) a.onEnd(b); if (a._res) a._res(); if (b.cur === a) b.cur = null; };
    const settle = (a) => {                                    // complete an action without playing it
      if (a === b.cur) { /* started */ } else if (a.onStart) a.onStart(b);
      if (a.type === 'walk' && a.path && a.path.length) { const p = a.path[a.path.length - 1]; b.x = p.x; b.y = p.y; }
      else if (a.type === 'face') b.heading = Math.atan2(a.y - b.y, a.x - b.x);
      else if (a.type === 'anim') { if (a.face) b.heading = Math.atan2(a.face.y - b.y, a.face.x - b.x); for (const ev of a.events || []) if (!ev.done) { ev.done = true; ev.fn(b); } }
      else if (a.type === 'call') a.fn(b);
      b.speed = 0; finish(a);
    };
    const begin = (a) => {
      b.cur = a; a._t = 0; a._i = 0; a._wd = 0;
      if (a.onStart) a.onStart(b);
      if (a.type === 'walk') {
        a.speed = a.speed || WALK; let len = 0, p = { x: b.x, y: b.y };
        for (const q of a.path) { len += dist(p, q); p = q; }
        a._max = len / a.speed * 2.5 + 3;
        if (!a.path.length) a.type = 'wait', a.dur = 0;
      } else if (a.type === 'anim') a.dur = b.reduced ? Math.min(a.dur ?? ANIM[a.name] ?? 1, 0.45) : (a.dur ?? ANIM[a.name] ?? 1);
      else if (a.type === 'call') { a.fn(b); finish(a); }
    };
    const turnTo = (ang, dt, rate) => { b.heading = wrapA(b.heading + clamp(wrapA(ang - b.heading), -rate * dt, rate * dt)); };

    b.enqueue = (a) => {
      if (b.cur && b.cur.follow && !a.follow) { const c = b.cur; b.cur = null; if (c.onEnd) c.onEnd(b, true); }
      if (!a.follow) b.queue = b.queue.filter((q) => !q.follow);
      const p = new Promise((res) => { a._res = res; });
      b.queue.push(a);
      if (b.fast || (b.reduced && a.type === 'walk')) { if (b.fast) b.skipAll(); else if (!b.cur && b.queue[0] === a) { b.queue.shift(); settle(a); } }
      return p;
    };
    b.skipAll = () => {
      if (b.cur) settle(b.cur);
      while (b.queue.length) settle(b.queue.shift());
    };
    b.busy = () => !!(b.cur && !b.cur.follow) || b.queue.some((q) => !q.follow);
    b.followTo = (path, speed, onEnd) => {
      if (b.busy()) return false;
      if (!path || path.length < 2) return false;
      if (b.reduced || b.fast) { const p = path[path.length - 1]; b.x = p.x; b.y = p.y; if (onEnd) onEnd(b); return true; }
      if (b.cur && b.cur.follow) { const c = b.cur; b.cur = null; b.queue = []; if (c.onEnd) c.onEnd(b, true); }
      b.queue = [{ type: 'walk', path: path.slice(), speed, follow: true, onEnd: (bb, dropped) => { if (!dropped && onEnd) onEnd(bb); } }];
      return true;
    };
    b.teleport = (x, y, heading) => { b.skipAll(); b.queue = []; if (b.cur) b.cur = null; b.x = x; b.y = y; if (heading != null) b.heading = heading; b.speed = 0; };
    b.clearQueue = () => { b.queue = []; if (b.cur) { const c = b.cur; b.cur = null; if (c._res) c._res(); if (c.onEnd) c.onEnd(b, true); } };

    b.update = (dt) => {
      b.clock += dt; b.stateT += dt;
      if (!b.cur && b.queue.length) begin(b.queue.shift());
      const a = b.cur;
      if (!a) { b.speed = Math.max(0, b.speed - dt * 8); setState(b.thinking ? 'think' : 'idle'); return; }
      a._t += dt;
      if (a.type === 'walk') {
        setState(b.carry ? 'carry' : 'walk');
        if (b.reduced && !a.follow) { settle(a); return; }
        while (a._i < a.path.length && Math.hypot(a.path[a._i].x - b.x, a.path[a._i].y - b.y) < 0.12) a._i++;
        if (a._i < a.path.length) {
          const q = a.path[a._i], d = Math.hypot(q.x - b.x, q.y - b.y);
          const want = Math.atan2(q.y - b.y, q.x - b.x), diff = Math.abs(wrapA(want - b.heading));
          turnTo(want, dt, b.turnRate * 1.4);
          const v = a.speed * clamp(diff > 0.9 ? 0 : 1 - diff / 1.2, 0, 1);       // turn first, then go
          b.speed += (v - b.speed) * Math.min(1, dt * 8);
          const step = Math.min(d, b.speed * dt);
          b.x += (q.x - b.x) / d * step; b.y += (q.y - b.y) / d * step;
        }
        b.gait += b.speed * dt * 5.2;
        if (a._sx === undefined || a._t - a._st > 0.8) {                  // pressed against something (the scene pushes him out): give up the waypoint
          if (a._sx !== undefined && Math.hypot(b.x - a._sx, b.y - a._sy) < 0.08 && b.speed > 0.5) a._i = a.path.length;
          a._sx = b.x; a._sy = b.y; a._st = a._t;
        }
        if (a._i >= a.path.length || a._t > a._max) { if (a._i < a.path.length) { const p = a.path[a.path.length - 1]; b.x = p.x; b.y = p.y; } b.speed = 0; finish(a); }
      } else if (a.type === 'face') {
        setState('idle'); b.speed = 0;
        const want = Math.atan2(a.y - b.y, a.x - b.x); turnTo(want, dt, b.turnRate);
        if (Math.abs(wrapA(want - b.heading)) < 0.05 || a._t > 1.2) finish(a);
      } else if (a.type === 'anim') {
        setState(a.name); b.speed = 0;
        if (a.face) turnTo(Math.atan2(a.face.y - b.y, a.face.x - b.x), dt, b.turnRate);
        const ph = a._t / Math.max(0.001, a.dur);
        for (const ev of a.events || []) if (!ev.done && ph >= ev.at) { ev.done = true; ev.fn(b); }
        if (a._t >= a.dur) { for (const ev of a.events || []) if (!ev.done) { ev.done = true; ev.fn(b); } finish(a); }
      } else if (a.type === 'wait') {
        setState(b.thinking ? 'think' : 'idle'); b.speed = 0; if (a._t >= (a.dur || 0)) finish(a);
      }
    };
    function setState(s) { if (b.state !== s) { b.state = s; b.stateT = 0; } }
    b.phase = () => (b.cur && b.cur.type === 'anim' ? clamp(b.cur._t / Math.max(0.001, b.cur.dur), 0, 1) : 0);
    return b;
  }

  // ------------------------------------------------------------------ pose: joint angles from the state (pure)
  const arm = (sw = 0.1, ab = 0.12, el = 0.1) => ({ sw, ab, el });
  const mixArm = (a, b, t) => ({ sw: lerp(a.sw, b.sw, t), ab: lerp(a.ab, b.ab, t), el: lerp(a.el, b.el, t) });

  /**
   * s: {state, t (seconds in the state), clock, gait, speed, reduced, bearing (angle of the thing he looks at, relative to his
   * body, or null), phase (0..1 within an anim), dur, aimPitch}. Returns joint angles in radians / metres:
   * swing is forward-positive, ab is outward-positive, el bends the forearm forward.
   */
  function poseFor(s) {
    const R = !!s.reduced, clock = s.clock || 0, t = s.t || 0, ph = s.phase || 0;
    const wob = R ? 0 : 1;
    const blinkPhase = clock % 3.7, blink = blinkPhase < 0.13 ? 0.08 : 1;
    const look = s.bearing == null ? 0 : clamp(s.bearing, -1.1, 1.1);
    const p = { bob: 0, crouch: 0, hop: 0, lean: 0, roll: 0, breath: wob * Math.sin(clock * 2.2) * 0.012,
                headYaw: look * 0.8, headPitch: 0, eyeOpen: blink, eyeSize: 1, smile: 0.35, legL: 0, legR: 0,
                armL: arm(0.88, -0.28, 1.15), armR: arm(0.1 + wob * Math.sin(clock * 1.7) * 0.04, 0.14, 0.12),
                clip: 0, mag: false, hold: false };
    const env = (dur) => (dur ? Math.min(smooth(t / 0.22), smooth((dur - t) / 0.22)) : 1);
    const dur = s.dur || 1;
    switch (s.state) {
      case 'idle': {
        const cyc = clock % 9, check = !R && cyc > 3.4 && cyc < 5.2 ? Math.sin((cyc - 3.4) / 1.8 * Math.PI) : 0;
        p.clip = check; p.armL = arm(0.88 + 0.5 * check, -0.28, 1.15 + 0.3 * check);
        p.headPitch = 0.42 * check;
        if (!R && cyc >= 5.2 && cyc < 7.6) p.headYaw = 0.75 * Math.sin((cyc - 5.2) / 2.4 * Math.PI * 1.5);
        if (check) p.headYaw *= 1 - check * 0.7;
        break;
      }
      case 'walk': case 'carry': {
        const sp = clamp((s.speed || 0) / WALK, 0, 2.2), g = s.gait || 0, sw = Math.sin(g) * 0.7 * Math.min(1, sp);
        p.legL = sw; p.legR = -sw; p.bob = R ? 0 : Math.abs(Math.sin(g)) * 0.022 * Math.min(1, sp);
        p.lean = 0.05 + 0.04 * sp; p.roll = R ? 0 : Math.sin(g) * 0.03 * Math.min(1, sp);
        p.armR = arm(-sw * 0.9, 0.14, 0.15 + Math.max(0, sw) * 0.3);
        p.armL = arm(0.88 - sw * 0.1, -0.28, 1.15);
        if (s.state === 'carry') { p.hold = true; p.armL = arm(1.08, -0.2, 0.95); p.armR = arm(1.08, 0.2, 0.95); p.lean = -0.03; p.headPitch = -0.05; }
        p.headYaw = 0;
        break;
      }
      case 'wave': {
        const e = env(dur);
        p.armR = mixArm(p.armR, arm(0.3, 2.45, 0.35 + wob * Math.sin(t * 13) * 0.55), e);
        p.roll = 0.08 * e * wob; p.smile = 1; p.headPitch = -0.1 * e;
        break;
      }
      case 'pickup': {
        const k = Math.sin(ph * Math.PI), up = smooth((ph - 0.5) * 2);
        p.lean = 0.45 * k; p.crouch = 0.07 * k;
        p.armL = arm(lerp(0.4 + 0.9 * k, 1.08, up), lerp(-0.2, -0.2, up), lerp(0.6, 0.95, up));
        p.armR = arm(lerp(0.4 + 0.9 * k, 1.08, up), 0.2, lerp(0.6, 0.95, up));
        p.hold = ph > 0.5; p.headPitch = 0.25 * k; p.headYaw = 0;
        break;
      }
      case 'place': {
        const k = Math.sin(clamp(ph / 0.9, 0, 1) * Math.PI), rel = smooth((ph - 0.3) / 0.25);
        p.lean = 0.35 * k; p.crouch = 0.04 * k;
        p.armL = arm(1.08 + 0.35 * rel, -0.18, 0.95 - 0.6 * rel);
        p.armR = arm(1.08 + 0.35 * rel, 0.18, 0.95 - 0.6 * rel);
        p.hold = ph < 0.33; p.headPitch = 0.12 * k; p.smile = rel; p.headYaw = 0;
        break;
      }
      case 'point': {
        const e = env(dur);
        p.armR = mixArm(p.armR, arm(1.45 + (s.aimPitch || 0), 0.12, 0.04), e);
        p.headYaw = look * 0.8 * e; p.smile = 0.8;
        break;
      }
      case 'magnify': case 'think': {
        const e = s.state === 'think' ? smooth(t / 0.3) : env(dur), sweep = wob * Math.sin(t * 1.5);
        p.armR = mixArm(p.armR, arm(1.5, 0.08, 0.25), e);
        p.mag = e > 0.02; p.lean = 0.07 * e; p.headPitch = 0.12 * e; p.headYaw = sweep * 0.7 * e + (R ? 0.3 * e : 0); p.eyeSize = 1 + 0.35 * e; p.smile = 0.15;
        p.roll = sweep * 0.05;
        break;
      }
      case 'shake': {
        const e = env(dur);
        p.headYaw = wob * Math.sin(t * 15) * 0.6 * e + (R ? 0.45 * e : 0); p.headPitch = 0.18 * e; p.lean = -0.05 * e;
        p.armR = mixArm(p.armR, arm(0.5, 0.85, 1.25), e); p.smile = -0.4; p.eyeSize = 1 - 0.1 * e;
        break;
      }
      case 'cheer': {
        const e = env(dur);
        p.hop = wob * Math.abs(Math.sin(ph * Math.PI * 4)) * 0.1 * e;
        p.armR = mixArm(p.armR, arm(0.2, 2.6, 0.3 + wob * Math.sin(t * 16) * 0.3), e);
        p.armL = mixArm(p.armL, arm(0.2, -2.6, 0.3 + wob * Math.sin(t * 16 + 1) * 0.3), e); p.smile = 1; p.headPitch = -0.15 * e; p.clip = 0;
        break;
      }
      case 'nod': {
        const e = env(dur);
        p.headPitch = wob * Math.sin(t * 9) * 0.28 * e + (R ? 0.2 * e : 0); p.smile = 0.8;
        break;
      }
    }
    return p;
  }

  // ------------------------------------------------------------------ the scene part
  const COLORS = { hat: 0xd9512c, hatDark: 0xb53f20, vest: 0x8fa65a, vestDark: 0x71853f, shirt: 0xece7dd, stripe: 0xf4f1ea, skin: 0xf1d9bd, skinDark: 0xdcb690,
                   ink: 0x1b1a17, pants: 0x3a4655, boot: 0x5a3a24, board: 0xa9794f, paper: 0xf4f1ea, cheek: 0xe69a7e, glass: 0xbfe3f2, metal: 0x6b7078 };

  function init(api) {
    const T = api.THREE, scene = api.scene, camera = api.camera, feet = api.feet, eye = api.eye;
    const doc = typeof document !== 'undefined' ? document : null;
    const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } };
    const reduced = () => !!(mq && mq.matches) || /[?&]fioreduced=1/.test(typeof location !== 'undefined' ? location.search : '');

    // ---- materials: flat-shaded, unlit scene, so Fio carries his own light (one fixed key light + sky/ground tint)
    const glow = { value: 0 };
    const matCache = new Map();
    const mat = (hex, o = {}) => {
      const key = hex + ':' + (o.unlit ? 1 : 0);
      if (matCache.has(key)) return matCache.get(key);
      const m = new T.ShaderMaterial({
        uniforms: { uColor: { value: new T.Color(hex) }, uUnlit: { value: o.unlit ? 1 : 0 }, uGlow: glow },
        vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: `uniform vec3 uColor; uniform float uUnlit; uniform float uGlow; varying vec3 vW;
          void main(){ vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
            float key = max(dot(n, normalize(vec3(0.35, -0.5, 0.8))), 0.0), fill = 0.5 + 0.5 * n.z;
            float s = mix(0.5 + 0.38 * key + 0.17 * fill, 1.08, uUnlit);
            vec3 c = uColor * s + vec3(0.9, 0.95, 1.0) * uGlow * 0.22;
            gl_FragColor = vec4(c, 1.0);
            #include <colorspace_fragment>
          }`,
      });
      matCache.set(key, m); return m;
    };

    // ---- the character: one hierarchy of rigid meshes, no skinning
    const geo = {
      cyl: (r0, r1, h, n, open) => new T.CylinderGeometry(r0, r1, h, n, 1, !!open).rotateX(Math.PI / 2),    // axis along Z
      sph: (r, w, h) => new T.SphereGeometry(r, w, h),
      box: (x, y, z) => new T.BoxGeometry(x, y, z),
    };
    const root = new T.Group(), hop = new T.Group(); root.add(hop);
    let tris = 0;
    const mesh = (parent, g, m, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
      const o = new T.Mesh(g, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.raycast = () => {}; parent.add(o);
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3; return o;
    };
    const grp = (parent, x = 0, y = 0, z = 0) => { const g = new T.Group(); g.position.set(x, y, z); parent.add(g); return g; };

    const rig = { legs: [], arms: [] };
    for (const side of [1, -1]) {                                                       // legs + boots
      const hip = grp(hop, 0, side * 0.075, 0.30);
      mesh(hip, geo.cyl(0.04, 0.036, 0.24, 6, true), mat(COLORS.pants), 0, 0, -0.12);
      mesh(hip, geo.box(0.13, 0.085, 0.075), mat(COLORS.boot), 0.025, 0, -0.262);
      mesh(hip, geo.box(0.05, 0.08, 0.02), mat(COLORS.ink), 0.075, 0, -0.30);
      rig.legs.push(hip);
    }
    const torso = grp(hop, 0, 0, 0.30); rig.torso = torso;                              // vest, collar, reflective stripes
    const tg = (r0, r1, h, open) => geo.cyl(r0, r1, h, 8, open).rotateZ(Math.PI / 8).scale(0.9, 1.05, 1);
    const body = mesh(torso, tg(0.125, 0.152, 0.36), mat(COLORS.vest), 0, 0, 0.18);
    mesh(torso, tg(0.152, 0.158, 0.03, true), mat(COLORS.vestDark), 0, 0, 0.012);
    mesh(torso, tg(0.1442, 0.1475, 0.034, true), mat(COLORS.stripe, { unlit: true }), 0, 0, 0.12);
    mesh(torso, tg(0.1342, 0.1375, 0.034, true), mat(COLORS.stripe, { unlit: true }), 0, 0, 0.215);
    for (const sy of [1, -1]) mesh(torso, geo.box(0.012, 0.03, 0.27), mat(COLORS.stripe, { unlit: true }), 0.128, sy * 0.055, 0.195).rotation.y = -0.1;
    mesh(torso, geo.cyl(0.08, 0.098, 0.04, 8, true), mat(COLORS.shirt), 0, 0, 0.365);
    rig.body = body;
    const makeArm = (side) => {
      const sh = grp(torso, 0, side * 0.158, 0.335), out = grp(sh), sw = grp(out);
      mesh(sh, geo.sph(0.042, 5, 3), mat(COLORS.vest));
      mesh(sw, geo.cyl(0.032, 0.029, 0.115, 6, true), mat(COLORS.vest), 0, 0, -0.055);
      const el = grp(sw, 0, 0, -0.11);
      mesh(el, geo.cyl(0.028, 0.026, 0.1, 6, true), mat(COLORS.shirt), 0, 0, -0.05);
      const hand = grp(el, 0, 0, -0.11);
      mesh(hand, geo.sph(0.036, 5, 3), mat(COLORS.skin));
      return { sh, out, sw, el, hand, side };
    };
    rig.armL = makeArm(1); rig.armR = makeArm(-1);

    // clipboard (left hand): in the torso frame it hovers where the hand is, lifts toward his face while he checks it
    const clip = grp(torso, 0.2, 0.085, 0.23); rig.clip = clip;
    mesh(clip, geo.box(0.014, 0.135, 0.18), mat(COLORS.board), 0, 0, 0);
    mesh(clip, geo.box(0.006, 0.11, 0.15), mat(COLORS.paper), -0.009, 0, -0.005);
    mesh(clip, geo.box(0.012, 0.05, 0.022), mat(COLORS.metal), 0.003, 0, 0.09);
    for (const z of [0.03, -0.01, -0.05]) mesh(clip, geo.box(0.004, 0.08, 0.008), mat(COLORS.ink), -0.013, 0, z);
    clip.rotation.set(0, -0.15, 0);

    // magnifier: held out in front of his right shoulder (in the torso frame, where the raised right hand is)
    const magnifier = grp(torso, 0.3, -0.12, 0.36); rig.mag = magnifier;
    mesh(magnifier, geo.box(0.1, 0.014, 0.014), mat(COLORS.metal), -0.085, 0, -0.03).rotation.y = -0.4;
    const ring = new T.Mesh(new T.RingGeometry(0.056, 0.078, 12), mat(COLORS.ink)); ring.rotation.y = Math.PI / 2; ring.raycast = () => {}; magnifier.add(ring); tris += 24;
    const ring2 = ring.clone(); ring2.rotation.y = -Math.PI / 2; magnifier.add(ring2); tris += 24;
    const glass = new T.Mesh(new T.CircleGeometry(0.058, 12), new T.MeshBasicMaterial({ color: COLORS.glass, transparent: true, opacity: 0.4, depthWrite: false, side: T.DoubleSide }));
    glass.rotation.y = Math.PI / 2; glass.raycast = () => {}; magnifier.add(glass); tris += 12;
    magnifier.visible = false;

    // the piece he carries (a mini replica) sits in front of his chest
    rig.holder = grp(torso, 0.255, 0, 0.2);

    // head: face looks along +X
    const neck = grp(torso, 0, 0, 0.385), head = grp(neck, 0, 0, 0.158); rig.neck = neck; rig.head = head;
    mesh(head, geo.sph(0.158, 10, 7), mat(COLORS.skin));
    const onHead = (az, el, r = 0.158) => [Math.cos(el) * Math.cos(az) * r, Math.cos(el) * Math.sin(az) * r, Math.sin(el) * r];
    rig.eyes = [1, -1].map((s) => {
      const [x, y, z] = onHead(s * 0.36, 0.0, 0.15), e = mesh(head, geo.sph(0.028, 5, 3), mat(COLORS.ink), x, y, z, 0.7, 1, 1.15);
      mesh(head, geo.sph(0.007, 3, 2), mat(COLORS.stripe, { unlit: true }), x + 0.017, y + s * -0.005, z + 0.014);
      return e;
    });
    for (const s of [1, -1]) {
      const [cx, cy, cz] = onHead(s * 0.62, -0.2, 0.152); mesh(head, geo.sph(0.026, 4, 2), mat(COLORS.cheek), cx, cy, cz, 0.4, 1, 0.8);
      const [ex, ey, ez] = onHead(s * 1.5, -0.05, 0.155); mesh(head, geo.sph(0.03, 4, 3), mat(COLORS.skinDark), ex, ey, ez, 0.6, 0.5, 1);
      const [mx, my, mz] = onHead(s * 0.13, -0.2, 0.163), m = mesh(head, geo.sph(0.024, 5, 3), mat(COLORS.ink), mx, my, mz, 0.9, 1.9, 0.75);
      m.rotation.x = -s * 0.5;                                                                              // the moustache droops to each side
    }
    const [nx, ny, nz] = onHead(0, -0.07, 0.165); mesh(head, geo.sph(0.03, 5, 3), mat(COLORS.skinDark), nx, ny, nz);
    const [mox, moy, moz] = onHead(0, -0.34, 0.155); rig.mouth = mesh(head, geo.box(0.008, 0.045, 0.012), mat(COLORS.ink), mox, moy, moz);
    // hard hat: dome, brim with a visor, ridge, badge
    const hat = grp(head, 0, 0, 0.075);
    mesh(hat, new T.SphereGeometry(0.166, 10, 4, 0, TAU, 0, Math.PI / 2).rotateX(Math.PI / 2), mat(COLORS.hat), 0, 0, 0.0);
    mesh(hat, geo.cyl(0.19, 0.19, 0.02, 10), mat(COLORS.hatDark), 0, 0, 0.0, 1, 1, 1);
    mesh(hat, geo.box(0.07, 0.17, 0.012), mat(COLORS.hatDark), 0.2, 0, -0.002);                         // front visor
    mesh(hat, geo.box(0.17, 0.034, 0.03), mat(COLORS.hat), 0, 0, 0.162);                                 // ridge
    mesh(hat, geo.box(0.012, 0.07, 0.045), mat(COLORS.stripe, { unlit: true }), 0.158, 0, 0.065);      // badge
    rig.hat = hat;

    root.visible = false; scene.add(root);
    const tri = Math.round(tris);

    // hitbox for hover / click (invisible; Raycaster ignores `visible`)
    const hit = new T.Mesh(new T.CylinderGeometry(0.26, 0.26, 1.18, 8).rotateX(Math.PI / 2), new T.MeshBasicMaterial({ visible: false }));
    hit.position.z = 0.59; root.add(hit);

    // blob shadow
    const shadowTex = (() => { const c = doc.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
      g.addColorStop(0, 'rgba(0,0,0,0.9)'); g.addColorStop(0.55, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
      return new T.CanvasTexture(c); })();
    const shadow = new T.Mesh(new T.PlaneGeometry(0.62, 0.62), new T.MeshBasicMaterial({ color: 0x000000, alphaMap: shadowTex, transparent: true, opacity: 0.55,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    shadow.raycast = () => {}; shadow.renderOrder = 1; scene.add(shadow); shadow.visible = false;

    // ---- speech bubble billboard
    const bub = { canvas: doc.createElement('canvas'), until: 0, text: '' };
    bub.sprite = new T.Sprite(new T.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false }));
    bub.sprite.center.set(0.5, 0); bub.sprite.renderOrder = 30; bub.sprite.visible = false; bub.sprite.raycast = () => {}; scene.add(bub.sprite);
    const drawBubble = (text) => {
      const c = bub.canvas, x = c.getContext('2d'), lines = text === '...' ? ['...'] : wrapText(text, 28), fs = 30, lh = 38, pad = 18;
      x.font = `600 ${fs}px system-ui, sans-serif`;
      const w = Math.min(560, Math.max(70, ...lines.map((l) => x.measureText(l).width)) + pad * 2), h = lines.length * lh + pad * 1.4, tail = 22;
      c.width = Math.ceil(w) + 8; c.height = Math.ceil(h + tail) + 8;
      x.font = `600 ${fs}px system-ui, sans-serif`; x.textBaseline = 'top';
      x.fillStyle = '#ffffff'; x.strokeStyle = '#1b1a17'; x.lineWidth = 4; x.lineJoin = 'round';
      const X = 4, Y = 4, r = 18; x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r);
      x.lineTo(X + w / 2 + 14, Y + h); x.lineTo(X + w / 2, Y + h + tail); x.lineTo(X + w / 2 - 10, Y + h); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); x.fill(); x.stroke();
      x.fillStyle = '#1b1a17'; lines.forEach((l, i) => x.fillText(l, X + pad, Y + pad * 0.7 + i * lh));
      if (bub.tex) bub.tex.dispose();                                    // the canvas changed size: a fresh texture, not a sub-image update
      bub.tex = new T.CanvasTexture(c); bub.tex.colorSpace = T.SRGBColorSpace; bub.sprite.material.map = bub.tex; bub.sprite.material.needsUpdate = true;
      bub.aspect = c.height / c.width; bub.px = c.width;
    };
    const speak = (text, secs, mirror) => {
      if (!text) { bub.until = 0; bub.sprite.visible = false; return; }
      text = String(text); text = text.length > 150 ? text.slice(0, 147) + '...' : text;
      if (text !== bub.text) { drawBubble(text); bub.text = text; }
      bub.until = clock + (secs ?? Math.min(9, Math.max(3.5, text.length * 0.07)));
      if (mirror && api.log) api.log('sys', `Fio: ${text}`);
    };

    // ---- state
    const brain = createBrain({ reduced: reduced(), fast: lsGet('fio3d-fast') === '1' });
    const probe = { x: 0, y: 0, z: 0 };
    let clock = 0, hidden = lsGet('fio3d-hidden') === '1', ready = false, z = 0, skipping = false, lastWave = -99, farT = 0, followT = 0;
    let followGoalPt = null, grid = null, gridAt = -99, hovered = false, mouse = { x: 0, y: 0, on: false }, run = null;
    const reducedNow = () => { brain.reduced = reduced(); return brain.reduced; };

    const gz = (x, y, ref) => api.groundAt(x, y, ref + 0.5, ref - 1.2);
    const blockedAt = (x, y, ref) => {
      const g = gz(x, y, ref); if (!isFinite(g) || Math.abs(g - ref) > 0.55) return true;
      probe.x = x; probe.y = y; probe.z = g; api.pushOut(probe);
      return Math.hypot(probe.x - x, probe.y - y) > 0.03;
    };
    function navGrid(cx, cy, R = 9) {
      if (grid && clock - gridAt < 1.2 && Math.abs(cx - grid.cx) < 3 && Math.abs(cy - grid.cy) < 3) return grid;
      const ref = z; grid = makeGrid({ x0: cx - R, y0: cy - R, x1: cx + R, y1: cy + R, cell: 0.25, blocked: (x, y) => blockedAt(x, y, ref) });
      grid.cx = cx; grid.cy = cy; gridAt = clock; return grid;
    }
    const freshGrid = () => { grid = null; };
    const routeTo = (to, from = brain) => {
      const g = navGrid((from.x + to.x) / 2, (from.y + to.y) / 2, Math.max(9, dist(from, to) / 2 + 4));
      return findPath(g, { x: from.x, y: from.y }, to, { goalR: 2.5 });
    };

    const placeFio = (x, y, heading) => {
      brain.teleport(x, y, heading); const g = gz(x, y, feet.z); z = isFinite(g) ? g : feet.z; freshGrid();
    };
    const slotNearPlayer = (angDeg = -40, r = 1.7) => {
      const yaw = api.getYaw(), g = navGrid(feet.x, feet.y);
      const p = followGoal({ fio: { x: feet.x + Math.cos(yaw + angDeg * Math.PI / 180) * r, y: feet.y + Math.sin(yaw + angDeg * Math.PI / 180) * r }, player: feet, yaw, moving: false }, { isFree: (x, y) => g.freeAt(x, y), near: 99 });
      return p || nearestFree(g, feet.x + Math.cos(yaw) * 1.2, feet.y + Math.sin(yaw) * 1.2, 2) || { x: feet.x + 0.9, y: feet.y };
    };
    const callFio = (quiet) => {
      if (!ready) return;
      if (hidden) setHidden(false);
      if (performing) skipping = true;
      brain.skipAll(); brain.clearQueue(); brain.carry = null; carryMini(null); freshGrid();   // calling him ends whatever he was performing
      const p = slotNearPlayer(-30, 2.8);
      placeFio(p.x, p.y, Math.atan2(feet.y - p.y, feet.x - p.x));
      lastWave = clock; brain.enqueue({ type: 'anim', name: 'wave' });
      if (!quiet) speak('Here I am!', 2.5);
    };
    function setHidden(v) {
      hidden = v; lsSet('fio3d-hidden', v ? '1' : '0'); root.visible = !v && ready; shadow.visible = root.visible;
      if (v) { brain.clearQueue(); bub.sprite.visible = false; }
      if (hideBtn) hideBtn.textContent = v ? 'Show Fio' : 'Hide Fio';
      if (doc) for (const id of ['fioMascot', 'fioBubble']) { const el = doc.getElementById(id); if (el) el.style.display = v ? '' : 'none'; }
    }
    const active = () => ready && !hidden;

    // ---- mini replicas + fly / pop effects
    let carryObj = null;
    const miniOf = (pc) => {
      const g = new T.Group();
      try {
        const ud = pc.mesh.userData; pc.mesh.userData = {};                      // Object3D.clone() JSON-copies userData, and userData.piece points back at the piece
        let inner; try { inner = pc.mesh.clone(true); } finally { pc.mesh.userData = ud; }
        inner.visible = true;
        const zmid = ((pc.zmin ?? 0) + (pc.zmax ?? 0.8)) / 2, h = Math.max(0.05, (pc.zmax ?? 0.8) - (pc.zmin ?? 0));
        inner.position.z += -zmid; g.add(inner);
        const size = Math.max(pc.size ? Math.max(pc.size[0], pc.size[1]) : 0.5, h);
        g.scale.setScalar(clamp(0.36 / size, 0.04, 0.5));
      } catch (e) { inst.__miniErr = String(e.stack || e).slice(0, 300); g.add(new T.Mesh(geo.box(1, 1, 1), mat(COLORS.hat))); g.scale.setScalar(0.25); }
      g.traverse((o) => { o.raycast = () => {}; if (o.userData) o.userData = {}; });
      return g;
    };
    function carryMini(obj) {
      if (carryObj) { rig.holder.remove(carryObj); }
      carryObj = obj; if (obj) { obj.position.set(0, 0, 0); obj.rotation.set(0, 0, 0); rig.holder.add(obj); }
    }
    const fx = [];                                          // {t, dur, update(k), done()}
    const addFx = (dur, update, done) => fx.push({ t: 0, dur, update, done });
    const ringMat = new T.MeshBasicMaterial({ color: COLORS.stripe, transparent: true, opacity: 0.8, depthWrite: false, side: T.DoubleSide });
    const dustMat = new T.MeshBasicMaterial({ color: COLORS.hat });
    function popAt(x, y, zz) {
      const r = new T.Mesh(new T.RingGeometry(0.85, 1, 20), ringMat.clone()); r.position.set(x, y, zz + 0.03); r.raycast = () => {}; scene.add(r);
      const bits = Array.from({ length: 7 }, (_, i) => { const m = new T.Mesh(geo.box(0.04, 0.04, 0.04), dustMat); m.raycast = () => {}; scene.add(m); return { m, a: i * TAU / 7, v: 0.9 + (i % 3) * 0.3 }; });
      addFx(reducedNow() ? 0.2 : 0.6, (k) => {
        r.scale.setScalar(0.15 + k * 0.7); r.material.opacity = 0.8 * (1 - k);
        for (const b of bits) { const d = k * b.v * 0.6; b.m.position.set(x + Math.cos(b.a) * d, y + Math.sin(b.a) * d, zz + 0.08 + b.v * 0.5 * k - 1.6 * k * k * 0.5); b.m.rotation.z = k * 6; b.m.scale.setScalar(1 - k); }
      }, () => { scene.remove(r); r.geometry.dispose(); r.material.dispose(); for (const b of bits) scene.remove(b.m); });
    }
    const hiddenPieces = new Map();                         // pc -> [{o, v}]
    const stageHide = (pc) => {
      if (hiddenPieces.has(pc)) return;
      const rec = []; for (const o of pc.pivot.children) if (o.visible) { rec.push(o); o.visible = false; }
      hiddenPieces.set(pc, rec);
    };
    const stageShow = (pc) => {
      const rec = hiddenPieces.get(pc); if (!rec) return; hiddenPieces.delete(pc);
      for (const o of rec) o.visible = true;
      if (pc.outline) { pc.outline.visible = true; setTimeout(() => { if (pc !== api.getTarget() && pc !== api.getCarried()) pc.outline.visible = false; }, 1500); }
    };
    function reveal(pc) {                                    // set the piece down at its real pose, with a pop
      api.applyPose(pc); stageShow(pc);
      const p = api.posOf(pc), zz = pc.floor_z + pc.dz;
      popAt(p.x, p.y, Number.isFinite(zz) ? zz : z);
      if (!reducedNow()) { pc.anim = 'fio'; addFx(0.38, (k) => { const s = k < 0.5 ? lerp(0.7, 1.12, smooth(k * 2)) : lerp(1.12, 1, smooth((k - 0.5) * 2)); pc.pivot.scale.set(s, s, s * (2 - s)); }, () => { pc.anim = null; if (!pc.deleted) pc.pivot.scale.set(1, 1, 1); }); }
    }
    function release(pc, mini) {                             // the carried mini flies from his hands to the spot, then the piece appears
      const p = api.posOf(pc), from = new T.Vector3(); mini.getWorldPosition(from);
      const to = new T.Vector3(p.x, p.y, (pc.floor_z + pc.dz) + (((pc.zmax ?? 0.8) - (pc.zmin ?? 0)) * 0.5) * mini.scale.x);
      if (carryObj === mini) { rig.holder.remove(mini); carryObj = null; }
      scene.add(mini); mini.position.copy(from); mini.rotation.set(0, 0, 0);
      const arc = 0.25 + dist(from, to) * 0.1;
      addFx(reducedNow() ? 0.05 : 0.34, (k) => { mini.position.set(lerp(from.x, to.x, k), lerp(from.y, to.y, k), lerp(from.z, to.z, k) + Math.sin(k * Math.PI) * arc); mini.rotation.z = k * 3; },
        () => { scene.remove(mini); reveal(pc); });
    }

    // ---- choreography primitives (each returns a promise)
    const E = (a) => { const p = brain.enqueue(a); if (skipping) brain.skipAll(); return p; };     // after Skip every step finishes at once
    const standNear = (p, minR = 0.55, maxR = 2.2, from = brain) => { const g = navGrid((from.x + p.x) / 2, (from.y + p.y) / 2, Math.max(9, dist(from, p) / 2 + 4)); return standPoint(g, p, from, { minR, maxR }); };
    function walkTo(p, speed) {
      if (!p) return Promise.resolve();
      const r = routeTo(p); if (!r) { return Promise.resolve(); }
      return E({ type: 'walk', path: r.path, speed: speed || (dist(brain, p) > 6 ? 2.6 : 1.9) });
    }
    const lookAtPoint = (p) => E({ type: 'face', x: p.x, y: p.y });
    const doAnim = (name, o = {}) => E({ type: 'anim', name, ...o });
    async function pointAt(p, zz, secs) { brain.aim = { x: p.x, y: p.y, z: zz ?? z + 0.5 }; await doAnim('point', { dur: secs, face: p }); }
    const livePieces = () => api.pieces.filter((pc) => !pc.deleted);
    function pose(pc) { return { x: pc.cx + pc.tx, y: pc.cy + pc.ty, dz: pc.dz, yaw: pc.dyaw, deleted: pc.deleted }; }

    async function bringTo(pc, o = {}) {                      // carry a mini of pc to where it belongs and set it down
      const mini = miniOf(pc), p = api.posOf(pc);
      if (o.pickAt) { const s = standNear(o.pickAt); if (s) { await walkTo(s); await lookAtPoint(o.pickAt); } }
      await doAnim('pickup', { face: o.pickAt, events: [{ at: 0.5, fn: () => { if (o.onPick) o.onPick(); brain.carry = true; carryMini(mini); } }] });
      const stand = standNear(p, 0.5 + (pc.rxy || 0.3) * 0.6, 2.4);
      if (stand) await walkTo(stand);
      await lookAtPoint(p);
      await doAnim('place', { face: p, events: [{ at: 0.3, fn: () => { brain.carry = null; release(pc, mini); } }] });
    }

    // ---- the command layer hook: run(c) executes the command; Fio performs it around the call
    let performing = false, staging = null;                                       // while a command runs: pieces that were not there before are kept hidden
    async function runCommand(c, doRun) {
      if (!active() || brain.fast) return doRun();
      const sess = { base: new Set(api.pieces), snap: new Map(api.pieces.map((pc) => [pc, pose(pc)])) };
      staging = sess; skipping = false; performing = true; showSkip(true);
      let reply;
      try {
        if (c.op === 'describe') { speak('Let me have a look around...', 2.5); await doAnim('magnify', { dur: 2.2 }); }
        else if (['remove', 'move', 'rotate', 'nudge'].includes(c.op) && api.match) {
          const m = api.match(c.what) || [];
          if (m[0] && !skipping) { const p = api.posOf(m[0]); speak(`The ${m[0].label.replace(/\s*\d+$/, '').toLowerCase()}, on my way.`, 2.2); const s = standNear(p, 0.5 + (m[0].rxy || 0.3) * 0.6, 2.4); await walkTo(s); await pointAt(p, z + 0.5, 1.0); }
        } else if (c.op === 'design') { speak('Let me measure the floor first...', 3); await doAnim('magnify', { dur: 1.6 }); }
        reply = await doRun();
      } catch (e) { staging = null; showSkip(false); skipping = false; performing = false; finalize(sess); throw e; }
      staging = null;
      try { await afterRun(c, sess, reply); } catch (e) { console.warn('fio3d choreography', e); finalize(sess); }
      showSkip(false); skipping = false; performing = false;
      return reply;
    }
    function finalize(sess) {                                  // make sure nothing stays staged
      for (const pc of [...hiddenPieces.keys()]) { api.applyPose(pc); stageShow(pc); }
      carryMini(null); brain.carry = null;
    }
    async function afterRun(c, sess, reply) {
      for (const pc of [...hiddenPieces.keys()]) if (!api.pieces.includes(pc)) hiddenPieces.delete(pc);   // rolled back: did not fit
      const added = api.pieces.filter((pc) => !sess.base.has(pc) && !pc.deleted);
      const moved = [...sess.snap].filter(([pc, o]) => { const n = pose(pc); return !pc.deleted && !o.deleted && (Math.abs(n.x - o.x) > 0.01 || Math.abs(n.y - o.y) > 0.01 || Math.abs(n.yaw - o.yaw) > 0.01 || Math.abs(n.dz - o.dz) > 0.01); });
      // pieces that were rolled back (did not fit) are gone from api.pieces; added ones that remain are hidden by update() until set down
      for (const pc of added) stageHide(pc);
      const failed = /^(I could not|I do not|There is nothing|The room is already|The 3D catalogue|I did not)/.test(reply || '');
      if (c.op === 'design' || c.op === 'add') {
        let tableN = 0;
        for (const pc of added) {
          if (skipping) { api.applyPose(pc); stageShow(pc); continue; }
          const isTable = /table|sofa|bar|cabinet/i.test(`${pc.category || ''} ${pc.label}`);
          if (c.op === 'design' && isTable) { tableN++; speak(`Two-top number ${tableN}, with two chairs.`, 2.4, true); }
          else if (c.op === 'add' && pc === added[0]) speak(`${pc.label}, coming up!`, 2.4, true);
          await bringTo(pc, { pickAt: null });
        }
        if (!skipping && added.length) await doAnim('cheer');
        else if (!added.length) { await doAnim('shake'); }
      } else if (['move', 'nudge', 'rotate'].includes(c.op)) {
        for (const [pc, o] of moved) {
          if (skipping) continue;
          const old = { x: o.x, y: o.y };
          // until he picks it up it stays where it was
          pc.__fioOld = o; oldVisual.add(pc);
          await bringTo(pc, { pickAt: old, onPick: () => { oldVisual.delete(pc); stageHide(pc); } });
        }
        for (const pc of oldVisual) { oldVisual.delete(pc); api.applyPose(pc); }
        if (!moved.length) await doAnim('shake'); else await doAnim('nod');
      } else if (c.op === 'remove') {
        if (failed) await doAnim('shake'); else await doAnim('nod');
      }
      finalize(sess);
    }
    const oldVisual = new Set();

    // clearing: he runs a sweep through the room while the pieces vanish as he passes
    const origClear = api.sceneTools && api.sceneTools.clear_room;
    if (origClear) api.sceneTools.clear_room = async function () {
      if (!active() || brain.fast) return origClear.apply(this, arguments);
      if (!staging) skipping = false;
      const list = api.pieces.filter(api.onLevel).sort((a, b) => api.distTo(a) - api.distTo(b));
      if (!list.length) return origClear.apply(this, arguments);
      for (const pc of list) { api.pushUndo(pc); pc.outline.visible = false; }
      // greedy tour: nearest remaining piece, taking everything within r of it in one stop; few stops so the sweep stays short
      let r = 1.3, stops;
      const tourOf = (rad) => { const rest = list.slice(), out = []; let at = { x: brain.x, y: brain.y };
        while (rest.length) { rest.sort((a, b) => dist(api.posOf(a), at) - dist(api.posOf(b), at)); const first = rest[0], fp = api.posOf(first), grp2 = rest.filter((q) => dist(api.posOf(q), fp) < rad);
          for (const q of grp2) rest.splice(rest.indexOf(q), 1); out.push({ at: fp, pcs: grp2 }); at = fp; }
        return out; };
      stops = tourOf(r); while (stops.length > 12 && r < 8) { r *= 1.4; stops = tourOf(r); }
      speak('Sweeping the room clear!', 3, true);
      const jobs = [];
      for (let i = 0; i < stops.length; i++) {
        if (skipping) { jobs.push(api.shrinkOut(stops.slice(i).flatMap((s) => s.pcs))); break; }
        const st = stops[i], s = standNear(st.at, 0.5 + (st.pcs[0].rxy || 0.3) * 0.5, 2.4);
        await walkTo(s, 3.0);
        if (!skipping) { jobs.push(api.shrinkOut(st.pcs)); await doAnim('point', { dur: 0.5, face: st.at }); } else jobs.push(api.shrinkOut(st.pcs));
      }
      await Promise.all(jobs);
      return `cleared ${list.length} pieces`;
    };

    // ---- the mascot hook: walk.html's mascot(state, text) drives the bubble and the quick gestures
    function say(st, text) {
      if (!active()) return;
      if (staging) { if (text != null) speak(text, 3); return; }                     // a command is being performed: the choreography does the talking and gesturing
      if (st === 'think') { brain.thinking = true; thinkSince = clock; if (text != null) speak(text, 30); return; }
      brain.thinking = false;
      if (text != null) speak(text);
      if (!brain.busy()) {
        if (st === 'shake') doAnim('shake'); else if (st === 'cheer') doAnim('cheer');
        else if (st === 'point') { const yaw = api.getYaw(); pointAt({ x: feet.x + Math.cos(yaw) * 2.5, y: feet.y + Math.sin(yaw) * 2.5 }, z + 0.9, 1.6); }
      }
    }
    let thinkSince = 0;

    // ---- UI: Call / Hide / Fast / Skip, hover label, click to ask
    let hideBtn = null, skipBtn = null, fastBtn = null, tag = null;
    const showSkip = (v) => { if (skipBtn) skipBtn.style.display = v ? '' : 'none'; };
    if (doc) {
      const panel = doc.getElementById('panel');
      const mk = (txt, title, fn) => { const b = doc.createElement('button'); b.textContent = txt; b.title = title; b.onclick = fn; return b; };
      if (panel) {
        const callBtn = mk('Call Fio (F)', 'Fio comes and stands next to you', () => callFio());
        hideBtn = mk(hidden ? 'Show Fio' : 'Hide Fio', 'Show or hide the 3D Fio', () => { setHidden(!hidden); if (!hidden) callFio(true); });
        fastBtn = mk('', 'Fast: Fio skips the walking and carrying and applies commands at once', () => { brain.fast = !brain.fast; lsSet('fio3d-fast', brain.fast ? '1' : '0'); if (brain.fast) { skipping = true; brain.skipAll(); } fastBtn.textContent = brain.fast ? 'Fio: fast' : 'Fio: animated'; });
        fastBtn.textContent = brain.fast ? 'Fio: fast' : 'Fio: animated';
        skipBtn = mk('Skip Fio', 'Finish what Fio is doing right now', () => { skipping = true; brain.skipAll(); }); skipBtn.style.display = 'none';
        const first = panel.firstChild; for (const b of [skipBtn, callBtn, hideBtn, fastBtn]) panel.insertBefore(b, first);
        panel.insertBefore(doc.createTextNode(' '), first);
      }
      tag = doc.createElement('div'); tag.id = 'fio3dTag'; tag.textContent = 'Fio, your inspector';
      tag.style.cssText = 'position:fixed;left:0;top:0;transform:translate(-50%,-100%);background:#000b;color:#fff;padding:3px 9px;border-radius:6px;font:12px system-ui,sans-serif;pointer-events:none;opacity:0;transition:opacity .12s;white-space:nowrap;z-index:7';
      doc.body.appendChild(tag);
      addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.on = e.target === api.canvas; }, true);
      addEventListener('keydown', (e) => {
        if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.code !== 'KeyF') return;
        if (e.target && e.target.closest && e.target.closest('input, textarea')) return;
        callFio();
      });
      addEventListener('mousedown', (e) => {                    // capture phase: a click on Fio opens the Ask Fio bar instead of grabbing furniture
        if (e.button !== 0 || !active()) return;
        if (e.target !== api.canvas) return;
        if (hover()) { e.stopImmediatePropagation(); e.preventDefault(); greet(); api.openAsk(); }
      }, true);
    }
    function greet() { if (!brain.busy() && clock - lastWave > 3) { lastWave = clock; faceTo(feet); doAnim('wave'); } }
    function faceTo(p) { if (!brain.busy()) lookAtPoint(p); }

    const ray = new T.Raycaster(), ndc = new T.Vector2(), dirV = new T.Vector3(), headV = new T.Vector3();
    function hover() {
      if (!active() || !root.visible || (api.getMode && api.getMode() !== 'walk')) return false;
      const locked = doc && doc.pointerLockElement === api.canvas;
      if (!locked && !mouse.on) return false;
      if (locked) { camera.getWorldDirection(dirV); ray.set(camera.position, dirV); }
      else { ndc.set(mouse.x / innerWidth * 2 - 1, -(mouse.y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); dirV.copy(ray.ray.direction); }
      ray.far = 7; const h = ray.intersectObject(hit, false)[0];
      if (!h) return false;
      return h.distance < api.rayStatic(camera.position, dirV, 7);
    }

    // ---- per-frame update (call from the render loop, before renderer.render)
    function update(dt) {
      clock += dt;
      if (!ready) return;
      reducedNow();
      // keep staged pieces hidden (new ones) or at their old place (moved ones)
      if (staging) for (const pc of api.pieces) if (!staging.base.has(pc)) stageHide(pc);
      for (const pc of oldVisual) { const o = pc.__fioOld; if (o) { pc.pivot.position.set(o.x, o.y, o.dz); pc.pivot.rotation.z = o.yaw; } }
      for (const pc of hiddenPieces.keys()) if (pc.deleted) { api.applyPose(pc); stageShow(pc); }
      if (!active()) { root.visible = false; shadow.visible = false; bub.sprite.visible = false; if (tag) tag.style.opacity = 0; return; }

      // follow the player at a polite distance (only while he has nothing else to do)
      const pdist = Math.hypot(brain.x - feet.x, brain.y - feet.y), pmoving = api.getMoving ? api.getMoving() : false;
      followT -= dt;
      if (followT <= 0 && !brain.busy()) {
        followT = 0.3;
        const g = navGrid(feet.x, feet.y);
        const goal = followGoal({ fio: brain, player: feet, yaw: api.getYaw(), moving: pmoving }, { isFree: (x, y) => g.freeAt(x, y) });
        const walking = brain.cur && brain.cur.follow;
        if (goal && (!walking || !followGoalPt || dist(goal, followGoalPt) > 0.6)) {
          const r = findPath(g, { x: brain.x, y: brain.y }, goal, { goalR: 1.0 });
          if (r && dist(r.goal, brain) > 0.3) {
            followGoalPt = goal;
            const sp = clamp(1.2 + (pdist - 2.0) * 0.8, WALK, pdist > 9 ? 9 : 4.2);
            brain.followTo(r.path, sp, () => { followGoalPt = null; if (dist(brain, feet) < 3.2 && clock - lastWave > 20) { lastWave = clock; brain.enqueue({ type: 'anim', name: 'wave' }); } });
          }
        }
        if (pdist > 25) { callFio(true); }                         // lost him (jumped to another scan spot): bring him along
      }
      if (pdist > 4) farT += dt;
      else if (pdist < 2.4 && farT > 2.5 && !brain.busy()) { farT = 0; lastWave = clock; brain.enqueue({ type: 'anim', name: 'wave' }); }
      else if (pdist < 2.4) farT = 0;

      // look at the player while idle, otherwise at what he is doing
      brain.aimBearing = null;
      if (brain.state === 'idle' || brain.state === 'think' || brain.state === 'wave' || brain.state === 'nod' || brain.state === 'cheer') {
        brain.aimBearing = wrapA(Math.atan2(feet.y - brain.y, feet.x - brain.x) - brain.heading);
        if (Math.abs(brain.aimBearing) > 1.2) { brain.heading = wrapA(brain.heading + clamp(brain.aimBearing, -3 * dt, 3 * dt) * 1.0); }
      }
      brain.update(dt);
      if (brain.thinking && clock - thinkSince > 60) brain.thinking = false;

      // body on the floor: height from the scan, pushed out of walls / furniture, and kept off the player
      probe.x = brain.x; probe.y = brain.y; probe.z = z; api.pushOut(probe);
      const px = probe.x - brain.x, py = probe.y - brain.y;
      if (px * px + py * py < 0.25) { brain.x = probe.x; brain.y = probe.y; }
      const dx = brain.x - feet.x, dy = brain.y - feet.y, dd = Math.hypot(dx, dy);
      if (dd < 0.5 && dd > 1e-4) { brain.x = feet.x + dx / dd * 0.5; brain.y = feet.y + dy / dd * 0.5; }
      const g = gz(brain.x, brain.y, z);
      if (isFinite(g)) z = Math.abs(g - z) > 0.6 || reducedNow() ? g : z + (g - z) * Math.min(1, dt * 14);

      // pose -> joints
      const bearing = brain.aimBearing;
      let aimPitch = 0, bear2 = bearing;
      if (brain.state === 'point' && brain.aim) { bear2 = wrapA(Math.atan2(brain.aim.y - brain.y, brain.aim.x - brain.x) - brain.heading); aimPitch = clamp(Math.atan2(brain.aim.z - (z + 0.65), Math.max(0.3, Math.hypot(brain.aim.x - brain.x, brain.aim.y - brain.y))), -0.6, 0.7); }
      const P = poseFor({ state: brain.state, t: brain.stateT, clock, gait: brain.gait, speed: brain.speed, reduced: brain.reduced, bearing: bear2,
                          phase: brain.phase(), dur: brain.cur && brain.cur.type === 'anim' ? brain.cur.dur : 1, aimPitch });
      apply(P);
      root.position.set(brain.x, brain.y, z); root.rotation.z = brain.heading;
      shadow.position.set(brain.x, brain.y, z + 0.012); shadow.scale.setScalar(1 - P.hop * 2);
      const inside = cameraInside({ x: eye.x, y: eye.y, z: eye.z }, { x: brain.x, y: brain.y, z });
      const showing = !inside && (!api.getMode || api.getMode() === 'walk');
      root.visible = showing; shadow.visible = showing;

      // effects
      for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t += dt; const k = clamp(f.t / f.dur, 0, 1); f.update(k); if (k >= 1) { fx.splice(i, 1); f.done && f.done(); } }

      // speech bubble: follows him, keeps a readable size at any distance
      if (bub.until > clock && showing && bub.text) {
        const d = Math.hypot(camera.position.x - brain.x, camera.position.y - brain.y, camera.position.z - z), w = bub.px * 0.0017 * clamp(d / 2.2, 0.8, 2.6);
        bub.sprite.visible = true; bub.sprite.position.set(brain.x, brain.y, z + HEIGHT + 0.08 + P.hop); bub.sprite.scale.set(w, w * bub.aspect, 1);
      } else bub.sprite.visible = false;

      // hover label
      hovered = hover(); glow.value = hovered ? 1 : 0;
      if (tag) {
        tag.style.opacity = hovered ? 1 : 0;
        if (hovered) { headV.set(brain.x, brain.y, z + (bub.sprite.visible ? -0.04 : HEIGHT + 0.12)); headV.project(camera);
          tag.style.transform = `translate(-50%,${bub.sprite.visible ? '0' : '-100%'})`; tag.style.left = ((headV.x + 1) / 2 * innerWidth) + 'px'; tag.style.top = ((1 - headV.y) / 2 * innerHeight + (bub.sprite.visible ? 6 : 0)) + 'px'; }
        if (doc && api.canvas) api.canvas.style.cursor = hovered && doc.pointerLockElement !== api.canvas ? 'pointer' : '';
      }
    }

    function apply(P) {
      const legs = rig.legs; legs[0].rotation.y = -P.legL; legs[1].rotation.y = -P.legR;
      hop.position.z = P.hop; rig.torso.position.z = 0.30 - P.crouch + P.bob;
      rig.torso.rotation.set(P.roll, P.lean, 0); rig.body.scale.set(1, 1, 1 + P.breath);
      for (const [a, s] of [[rig.armL, P.armL], [rig.armR, P.armR]]) { a.out.rotation.x = a.side * s.ab; a.sw.rotation.y = -s.sw; a.el.rotation.y = -s.el; }
      rig.neck.rotation.set(0, P.headPitch, P.headYaw);
      rig.head.scale.set(1, 1, 1);
      for (const e of rig.eyes) e.scale.set(0.7, P.eyeSize, 1.15 * P.eyeOpen * P.eyeSize);
      rig.mouth.visible = P.smile > 0.2 || P.smile < -0.2; rig.mouth.scale.set(1, 0.4 + Math.abs(P.smile), 0.5 + P.smile * 0.8);
      // clipboard: held in the left hand unless he is carrying / waving; lifted toward his face while he checks it
      const showClip = !P.hold && P.armL.ab < 1 && P.armL.ab > -1.5;
      rig.clip.visible = showClip; rig.clip.position.set(0.2 - P.clip * 0.02, 0.085, 0.23 + P.clip * 0.12); rig.clip.rotation.set(0, -0.15 - P.clip * 0.7, 0);
      rig.mag.visible = P.mag; rig.mag.rotation.z = P.headYaw * 0.35; rig.holder.visible = P.hold || !!carryObj;
      rig.holder.position.set(0.255, 0, 0.2 + P.crouch * 0);
    }

    let inst;
    // ---- start: stand near the player's start spot, face the player, wave
    function start() {
      ready = true; z = feet.z;
      const p = slotNearPlayer(-26, 3.0);
      placeFio(p.x, p.y, Math.atan2(feet.y - p.y, feet.x - p.x));
      root.visible = !hidden; shadow.visible = !hidden; setHidden(hidden);
      if (!hidden) { setTimeout(() => { if (active() && !brain.busy()) { lastWave = clock; brain.enqueue({ type: 'anim', name: 'wave' }); speak('Hi! I am Fio, your inspector. Press F to call me.', 4.5); } }, 900); }
    }
    start();

    inst = { miniOf, update, say, runCommand, callFio, setHidden, brain, root, rig, mat, triangles: tri, speak, popAt, routeTo, navGrid, walkTo, doAnim, pointAt,
                   get hidden() { return hidden; }, get ready() { return ready; }, get hovered() { return hovered; }, get skipping() { return skipping; },
                   get staged() { return hiddenPieces.size; }, setFast(v) { brain.fast = !!v; }, setReduced(v) { brain.reduced = !!v; }, bubbleText: () => (bub.sprite.visible ? bub.text : '') };
    if (typeof window !== 'undefined') window.fio3d = inst;
    return inst;
  }

  return { HEIGHT, WALK, RUN, ANIM, makeGrid, nearestFree, lineFree, smoothPath, findPath, standPoint, followGoal, cameraInside, wrapText, createBrain, poseFor, init };
});
