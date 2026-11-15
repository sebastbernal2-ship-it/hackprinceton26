// node --test modeling/tests  (pure helpers of modeling/fio_3d.js: path finding, follow logic, action queue / state machine, pose)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const F = createRequire(import.meta.url)('../fio_3d.js');
const { makeGrid, findPath, nearestFree, lineFree, standPoint, followGoal, cameraInside, wrapText, createBrain, poseFor } = F;

// a 10 x 10 m room with a wall across x = 5 (y from 0 to 7, so there is a 3 m doorway at the top) and a 1 m table at (2, 8)
const room = (extra = () => false) => makeGrid({ x0: 0, y0: 0, x1: 10, y1: 10, cell: 0.25,
  blocked: (x, y) => x < 0.3 || y < 0.3 || x > 9.7 || y > 9.7 || (Math.abs(x - 5) < 0.2 && y < 7) || (Math.abs(x - 2) < 0.5 && Math.abs(y - 8) < 0.5) || extra(x, y) });
const walkable = (g, path) => path.every((p, i) => i === 0 || lineFree(g, path[i - 1], p));

test('findPath goes around the wall through the doorway and never crosses a blocked cell', () => {
  const g = room(), r = findPath(g, { x: 2, y: 2 }, { x: 8, y: 2 });
  assert.ok(r && r.exact);
  assert.ok(walkable(g, r.path));
  assert.ok(r.path.some((p) => p.y > 6.5), 'passes the gap at the top');
  assert.deepEqual([r.path[0].x, r.path[0].y], [2, 2]);
  assert.ok(Math.hypot(r.goal.x - 8, r.goal.y - 2) < 0.01);
});

test('findPath is a straight line (two points) when nothing is in the way', () => {
  const r = findPath(room(), { x: 1, y: 1 }, { x: 4, y: 4 });
  assert.equal(r.path.length, 2);
});

test('a blocked goal is moved to the nearest free spot; an enclosed goal has no path', () => {
  const g = room(), r = findPath(g, { x: 2, y: 2 }, { x: 2, y: 8 });      // inside the table
  assert.ok(r && !r.exact && g.freeAt(r.goal.x, r.goal.y));
  assert.ok(Math.hypot(r.goal.x - 2, r.goal.y - 8) < 1.3);
  const boxed = room((x, y) => Math.abs(x - 8) > 0.8 && Math.abs(x - 8) < 1.3 && Math.abs(y - 8) < 1.3 || Math.abs(y - 8) > 0.8 && Math.abs(y - 8) < 1.3 && Math.abs(x - 8) < 1.3);
  assert.equal(findPath(boxed, { x: 2, y: 2 }, { x: 8, y: 8 }, { goalR: 0.3 }), null);
});

test('nearestFree and standPoint stay on free cells, close to what they were asked for', () => {
  const g = room(), n = nearestFree(g, 2, 8, 1.5);
  assert.ok(g.freeAt(n.x, n.y));
  const sp = standPoint(g, { x: 2, y: 8 }, { x: 2, y: 2 }, { minR: 0.5, maxR: 2 });
  assert.ok(g.freeAt(sp.x, sp.y));
  const d = Math.hypot(sp.x - 2, sp.y - 8);
  assert.ok(d >= 0.5 && d <= 2.01);
  assert.ok(sp.y < 8, 'the side of the table he comes from');
  assert.equal(standPoint(room(() => true), { x: 5, y: 5 }, { x: 1, y: 1 }), null);
});

test('the grid asks about a cell once and only for cells the search touches', () => {
  let asked = 0;
  const g = makeGrid({ x0: 0, y0: 0, x1: 100, y1: 100, cell: 0.25, blocked: () => { asked++; return false; } });
  findPath(g, { x: 1, y: 1 }, { x: 3, y: 1 });
  const first = asked; assert.ok(first < 2000, `asked ${first}`);
  findPath(g, { x: 1, y: 1 }, { x: 3, y: 1 });
  assert.ok(asked - first < 30, 'answers are remembered');
});

const isFree = (g) => (x, y) => g.freeAt(x, y);
test('followGoal: stays put inside the comfortable band, closes in when far, backs off when too close', () => {
  const g = room(), player = { x: 3, y: 3 }, base = { player, yaw: 0, moving: false };
  assert.equal(followGoal({ ...base, fio: { x: 5.4, y: 3.8 } }, { isFree: isFree(g) }), null);      // ~2.4 m: fine
  const far = followGoal({ ...base, fio: { x: 9, y: 9 } }, { isFree: isFree(g) });
  assert.ok(far); assert.ok(Math.abs(Math.hypot(far.x - 3, far.y - 3) - 2.6) < 0.8);
  const close = followGoal({ ...base, fio: { x: 3.4, y: 3.2 } }, { isFree: isFree(g) });
  assert.ok(close); assert.ok(Math.hypot(close.x - 3, close.y - 3) > 1.5);
});

test('followGoal: never straight ahead of a walking player, never into a wall, and keeps to the side he is on', () => {
  const g = room(), player = { x: 3, y: 3 };
  const goal = followGoal({ player, yaw: 0, moving: true, fio: { x: 4.2, y: 3 } }, { isFree: isFree(g) });
  assert.ok(goal);
  const rel = Math.atan2(goal.y - 3, goal.x - 3);
  assert.ok(Math.abs(rel) > 0.8, `slot ${rel.toFixed(2)} rad is out of the walking line`);
  const left = followGoal({ player, yaw: 0, moving: false, fio: { x: 3.1, y: 3.6 } }, { isFree: isFree(g) });
  assert.ok(left.y > 3, 'stays on his own side');
  // everything around is a wall except one slot: it picks that one
  const only = followGoal({ player, yaw: 0, moving: false, fio: { x: 9, y: 9 } }, { isFree: (x, y) => Math.hypot(x - (3 + 2.4 * Math.cos(-2 * Math.PI * 70 / 360)), y - (3 + 2.4 * Math.sin(-2 * Math.PI * 70 / 360))) < 0.2 });
  assert.ok(only);
  assert.equal(followGoal({ player, yaw: 0, moving: false, fio: { x: 9, y: 9 } }, { isFree: () => false }), null);
});

test('cameraInside only when the eye is within the body column', () => {
  assert.equal(cameraInside({ x: 1, y: 1, z: 1.6 }, { x: 1.1, y: 1, z: 0 }), false);     // above his hat
  assert.equal(cameraInside({ x: 1, y: 1, z: 0.8 }, { x: 1.1, y: 1, z: 0 }), true);
  assert.equal(cameraInside({ x: 2, y: 1, z: 0.8 }, { x: 1.1, y: 1, z: 0 }), false);
});

test('wrapText wraps and truncates to six lines', () => {
  assert.deepEqual(wrapText('one two three four', 9), ['one two', 'three', 'four']);
  assert.ok(wrapText('word '.repeat(200), 20).length <= 6);
  assert.ok(wrapText('word '.repeat(200), 20).at(-1).endsWith('...'));
});

const run = (b, secs, dt = 1 / 30) => { for (let t = 0; t < secs; t += dt) b.update(dt); };

test('brain: actions run strictly in order and resolve their promises', async () => {
  const b = createBrain(), log = [];
  const ps = [
    b.enqueue({ type: 'walk', path: [{ x: 0, y: 0 }, { x: 3, y: 0 }], speed: 1.5, onEnd: () => log.push('walk') }),
    b.enqueue({ type: 'anim', name: 'wave', dur: 0.5, events: [{ at: 0.5, fn: () => log.push('event') }], onEnd: () => log.push('wave') }),
    b.enqueue({ type: 'call', fn: () => log.push('call') }),
    b.enqueue({ type: 'wait', dur: 0.3, onEnd: () => log.push('wait') }),
  ];
  run(b, 8); await Promise.all(ps);                                   // every promise resolved
  assert.deepEqual(log, ['walk', 'event', 'wave', 'call', 'wait']);
  assert.ok(Math.abs(b.x - 3) < 0.15 && Math.abs(b.y) < 0.05);
  assert.equal(b.state, 'idle');
});

test('brain: walking takes about length / speed seconds and turns toward where he goes', () => {
  const b = createBrain(); b.heading = Math.PI;                       // starts facing away
  let done = false; b.enqueue({ type: 'walk', path: [{ x: 0, y: 0 }, { x: 4.5, y: 0 }], speed: 1.5 }).then(() => { done = true; });
  let t = 0; while (b.cur || b.queue.length) { b.update(1 / 30); t += 1 / 30; assert.ok(t < 10); }
  assert.ok(t > 3 && t < 4.6, `took ${t.toFixed(2)} s`);
  assert.ok(Math.abs(b.heading) < 0.2);
  assert.ok(b.gait > 3);
});

test('brain: state is carry while holding a piece, walk otherwise', () => {
  const b = createBrain();
  b.enqueue({ type: 'walk', path: [{ x: 0, y: 0 }, { x: 5, y: 0 }], speed: 1.5 }); run(b, 1);
  assert.equal(b.state, 'walk');
  b.carry = { piece: 1 }; run(b, 0.1);
  assert.equal(b.state, 'carry');
});

test('brain: fast mode finishes every action immediately, in order, firing events and hooks', async () => {
  const b = createBrain({ fast: true }), log = [];
  const ps = [
    b.enqueue({ type: 'walk', path: [{ x: 0, y: 0 }, { x: 9, y: 9 }], onEnd: () => log.push('walked') }),
    b.enqueue({ type: 'anim', name: 'place', events: [{ at: 0.3, fn: () => log.push('released') }], onEnd: () => log.push('placed') }),
    b.enqueue({ type: 'face', x: 0, y: 9 }),
  ];
  await Promise.all(ps);
  assert.deepEqual(log, ['walked', 'released', 'placed']);
  assert.deepEqual([b.x, b.y], [9, 9]);
  assert.ok(Math.abs(b.heading - Math.PI) < 1e-9 || Math.abs(b.heading + Math.PI) < 1e-9 || Math.abs(b.heading - Math.atan2(0, -9)) < 1e-9);
  assert.equal(b.busy(), false);
});

test('brain: skipAll completes a running sequence at once', async () => {
  const b = createBrain(), log = [];
  b.enqueue({ type: 'walk', path: [{ x: 0, y: 0 }, { x: 20, y: 0 }], speed: 1.5 }).then(() => log.push('a'));
  b.enqueue({ type: 'anim', name: 'point', dur: 2 }).then(() => log.push('b'));
  run(b, 1); assert.equal(log.length, 0);
  b.skipAll(); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(log, ['a', 'b']);
  assert.equal(b.x, 20);
});

test('brain: reduced motion teleports along walks and keeps animations to short holds', async () => {
  const b = createBrain({ reduced: true }); let t = 0;
  const p = b.enqueue({ type: 'walk', path: [{ x: 0, y: 0 }, { x: 30, y: 0 }], speed: 1.5 }); b.update(1 / 30);
  assert.equal(b.x, 30); await p;
  b.enqueue({ type: 'anim', name: 'magnify', dur: 2.4 });
  while (b.cur || b.queue.length) { b.update(1 / 30); t += 1 / 30; assert.ok(t < 2); }
  assert.ok(t <= 0.6, `hold ${t.toFixed(2)} s`);
});

test('brain: a follow walk is interrupted by a real action; followTo refuses while busy', () => {
  const b = createBrain();
  assert.ok(b.followTo([{ x: 0, y: 0 }, { x: 10, y: 0 }], 2)); run(b, 1);
  assert.ok(b.x > 1 && b.cur.follow && !b.busy());
  b.enqueue({ type: 'anim', name: 'wave', dur: 1 });
  run(b, 0.1); assert.equal(b.state, 'wave');
  assert.equal(b.followTo([{ x: 0, y: 0 }, { x: 1, y: 0 }], 2), false);
  const x = b.x; run(b, 2); assert.equal(b.x, x, 'the follow walk is gone');
});

test('brain: a walk that cannot make progress (pressed against a wall) gives up instead of hanging', () => {
  const b = createBrain();
  let ended = false; b.enqueue({ type: 'walk', path: [{ x: 0, y: 0 }, { x: 5, y: 0 }], speed: 1.5, onEnd: () => { ended = true; } });
  for (let t = 0; t < 6 && !ended; t += 1 / 30) { b.update(1 / 30); b.x = Math.min(b.x, 1); }   // the scene keeps pushing him back
  assert.ok(ended);
});

test('brain: thinking shows the think state while idle, and goes away', () => {
  const b = createBrain(); b.thinking = true; run(b, 0.2); assert.equal(b.state, 'think');
  b.thinking = false; run(b, 0.2); assert.equal(b.state, 'idle');
});

const base = { clock: 1, t: 1, gait: 0, speed: 0, phase: 0, dur: 2 };
test('poseFor: walking swings the legs in opposition and bobs; standing does neither', () => {
  const a = poseFor({ ...base, state: 'walk', speed: 1.5, gait: Math.PI / 2 }), b = poseFor({ ...base, state: 'walk', speed: 1.5, gait: -Math.PI / 2 });
  assert.ok(a.legL > 0.4 && a.legR < -0.4); assert.ok(b.legL < -0.4 && b.legR > 0.4);
  assert.ok(a.bob > 0.01);
  const idle = poseFor({ ...base, state: 'idle' });
  assert.equal(idle.legL, 0); assert.equal(idle.bob, 0); assert.equal(idle.mag, false);
});

test('poseFor: reduced motion has no bob, sway, breathing or shaking', () => {
  const w = poseFor({ ...base, state: 'walk', speed: 1.5, gait: 1, reduced: true });
  assert.equal(w.bob, 0); assert.equal(w.roll, 0);
  assert.equal(poseFor({ ...base, state: 'idle', reduced: true }).breath, 0);
  const s1 = poseFor({ ...base, state: 'shake', t: 0.5, reduced: true }), s2 = poseFor({ ...base, state: 'shake', t: 0.6, reduced: true });
  assert.equal(s1.headYaw, s2.headYaw);
  const c = poseFor({ ...base, state: 'cheer', t: 0.5, phase: 0.1, reduced: true }); assert.equal(c.hop, 0);
});

test('poseFor: the gestures are readable (point extends the arm, wave raises it, magnify shows the lens, carry holds)', () => {
  assert.ok(poseFor({ ...base, state: 'point', t: 1 }).armR.sw > 1.3);
  assert.ok(poseFor({ ...base, state: 'wave', t: 1 }).armR.ab > 2);
  assert.equal(poseFor({ ...base, state: 'magnify', t: 1 }).mag, true);
  assert.equal(poseFor({ ...base, state: 'think', t: 1 }).mag, true);
  assert.equal(poseFor({ ...base, state: 'carry', speed: 1.5 }).hold, true);
  const sh = [0.1, 0.2, 0.3, 0.4].map((t) => poseFor({ ...base, state: 'shake', t }).headYaw);
  assert.ok(Math.max(...sh) - Math.min(...sh) > 0.5, 'the head shakes');
  assert.equal(poseFor({ ...base, state: 'idle', clock: 4.3 }).clip > 0.5, true, 'checks the clipboard');
  assert.equal(poseFor({ ...base, state: 'idle', clock: 0.3 }).clip, 0);
});

test('poseFor: eyes blink briefly and open again', () => {
  assert.ok(poseFor({ ...base, state: 'idle', clock: 3.75 }).eyeOpen < 0.2);
  assert.equal(poseFor({ ...base, state: 'idle', clock: 1.5 }).eyeOpen, 1);
});

test('he is about 1.1 m tall', () => { assert.equal(F.HEIGHT, 1.1); });
