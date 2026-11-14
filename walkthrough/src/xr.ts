// WebXR path, trimmed from Deja-View's xr.ts: local-floor session, a rig that locomotion moves, left-stick
// smooth walking relative to the head with collision, right-stick snap turn and teleport arc, and the right
// trigger to pick a finding pin (its card appears on a panel in front of the pin). Wrist menu, video
// transport, arrival card, world switching and comfort/foveation extras were dropped.
// NOT verified on a headset: this build was only type-checked and run on the desktop path.

import * as THREE from 'three';
import type { Bounds } from './analysis.ts';
import { damp, GRAVITY, groundHeight, slideMove, softBoundary, type Body, type GroundOptions, type P3 } from './physics.ts';
import { DEFAULT_ARC, traceArc, type ArcResult, type LandingRules } from './teleport.ts';
import type { CollisionWorld } from './voxels.ts';
import { makeControllerModel, PointerRay, TeleportVisual } from './xr-ui.ts';

export interface XrHost {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  rig: THREE.Group;
  world(): CollisionWorld;
  body: Body;
  ground(): GroundOptions;
  walkBounds(): Bounds | null;
  spawn(): { x: number; y: number; z: number; yaw: number };
  /** Ray from the right controller: return true when it hit a pin (so the pointer shows a cursor). */
  pickRay(origin: THREE.Vector3, dir: THREE.Vector3, commit: boolean): boolean;
  onEnter(): void;
  onExit(pose: { x: number; y: number; z: number; yaw: number }): void;
}

interface Hand {
  handedness: XRHandedness;
  ray: THREE.Group;
  grip: THREE.Group;
  model: THREE.Group;
  pointer: PointerRay;
  source: XRInputSource | null;
  prev: boolean[];
}

const SNAP = THREE.MathUtils.degToRad(30);
const MOVE_SPEED = 1.5;

function stick(gp: Gamepad): [number, number] {
  return gp.axes.length >= 4 ? [gp.axes[2], gp.axes[3]] : [gp.axes[0] ?? 0, gp.axes[1] ?? 0];
}

/** A flat canvas panel that shows text in the headset. */
export class XrCard {
  readonly mesh: THREE.Mesh;
  private canvas = document.createElement('canvas');
  private tex: THREE.CanvasTexture;
  constructor() {
    this.canvas.width = 1024;
    this.canvas.height = 1024;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, toneMapped: false }));
    this.mesh.renderOrder = 1100;
    this.mesh.visible = false;
  }
  show(lines: { text: string; bold?: boolean; color?: string }[]): void {
    const g = this.canvas.getContext('2d')!;
    g.clearRect(0, 0, 1024, 1024);
    g.fillStyle = 'rgba(16,18,24,0.94)';
    g.beginPath(); g.roundRect(0, 0, 1024, 1024, 40); g.fill();
    let y = 70;
    for (const l of lines) {
      g.font = `${l.bold ? 'bold ' : ''}${l.bold ? 44 : 34}px system-ui, sans-serif`;
      g.fillStyle = l.color ?? '#f2f4f8';
      for (const row of wrap(g, l.text, 940)) {
        if (y > 1000) break;
        g.fillText(row, 42, y);
        y += l.bold ? 54 : 44;
      }
      y += 12;
    }
    this.tex.needsUpdate = true;
    this.mesh.visible = true;
  }
  hide(): void { this.mesh.visible = false; }
}

function wrap(g: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of text.split(/\s+/)) {
    const t = line ? `${line} ${w}` : w;
    if (g.measureText(t).width > width && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

export class XrSystem {
  supported = false;
  presenting = false;
  readonly card = new XrCard();
  private session: XRSession | null = null;
  private hands: Hand[] = [];
  private teleport = new TeleportVisual();
  private select = { left: false, right: false };
  private vel = new THREE.Vector2();
  private vy = 0;
  private snapArmed = true;
  private aiming = false;
  private lastArc: ArcResult | null = null;
  private fade: { phase: 'out' | 'in'; t: number; target: { x: number; z: number; y: number } | null } | null = null;
  private headWorld = new THREE.Vector3();
  private headLocal = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private lastPose = { x: 0, y: 0, z: 0, yaw: 0 };
  private placePending = 0;
  private triggerPrev = false;
  readonly debug = { aiming: false, valid: false, reason: '', snapTurns: 0, teleports: 0, moved: 0, picks: 0 };

  constructor(private host: XrHost) {
    const { renderer } = host;
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local-floor');
    host.scene.add(this.teleport.group, this.card.mesh);
    for (let i = 0; i < 2; i++) {
      const ray = renderer.xr.getController(i);
      const grip = renderer.xr.getControllerGrip(i);
      const hand: Hand = { handedness: 'none', ray, grip, model: new THREE.Group(), pointer: new PointerRay(), source: null, prev: [] };
      ray.add(hand.pointer.mesh, hand.pointer.dot);
      ray.visible = grip.visible = false;
      ray.addEventListener('connected', (e: { data?: XRInputSource }) => {
        const src = e.data ?? null;
        hand.source = src;
        hand.handedness = src?.handedness ?? 'none';
        grip.remove(hand.model);
        hand.model = makeControllerModel(hand.handedness === 'left' ? 'left' : 'right');
        hand.model.visible = !src?.hand;
        grip.add(hand.model);
        ray.visible = grip.visible = !!src;
        hand.pointer.mesh.visible = hand.handedness !== 'left';
      });
      ray.addEventListener('disconnected', () => { hand.source = null; ray.visible = grip.visible = false; });
      host.rig.add(ray, grip);
      this.hands.push(hand);
    }
  }

  async probe(): Promise<boolean> {
    try {
      this.supported = !!navigator.xr && (await navigator.xr.isSessionSupported('immersive-vr'));
    } catch {
      this.supported = false;
    }
    return this.supported;
  }

  async enter(): Promise<void> {
    if (!navigator.xr || this.session) return;
    const { renderer, rig, camera } = this.host;
    const session = await navigator.xr.requestSession('immersive-vr', { requiredFeatures: ['local-floor'], optionalFeatures: ['bounded-floor', 'hand-tracking'] });
    this.session = session;
    session.addEventListener('end', this.onEnd);
    session.addEventListener('selectstart', this.onSelect);
    session.addEventListener('selectend', this.onSelect);
    const s = this.host.spawn();
    rig.position.set(s.x, s.y, s.z);
    rig.rotation.set(0, s.yaw, 0);
    camera.position.set(0, 0, 0);
    camera.rotation.set(0, 0, 0);
    rig.updateMatrixWorld(true);
    await renderer.xr.setSession(session);
    this.presenting = true;
    this.placePending = 2;
    this.host.onEnter();
  }

  exit(): void { void this.session?.end(); }

  private onSelect = (e: XRInputSourceEvent) => {
    this.select[e.inputSource.handedness === 'left' ? 'left' : 'right'] = e.type === 'selectstart';
  };

  private onEnd = () => {
    const { camera } = this.host;
    this.session?.removeEventListener('selectstart', this.onSelect);
    this.session?.removeEventListener('selectend', this.onSelect);
    this.session = null;
    this.presenting = false;
    this.teleport.hide();
    this.card.hide();
    const pose = { ...this.lastPose };
    camera.position.set(0, 0, 0);
    camera.quaternion.identity();
    camera.updateMatrixWorld();
    this.host.onExit(pose);
  };

  private updateHead(): void {
    const { camera, rig } = this.host;
    rig.updateMatrixWorld();
    this.headLocal.copy(camera.position);
    this.headWorld.copy(this.headLocal).applyMatrix4(rig.matrixWorld);
    const d = this.tmp.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const yaw = rig.rotation.y + Math.atan2(-d.x, -d.z);
    const p = this.lastPose;
    p.x = this.headWorld.x; p.y = rig.position.y; p.z = this.headWorld.z;
    p.yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  }

  /** Puts the rig so the head stands over (x, z), feet at y. */
  placeHead(x: number, y: number, z: number): void {
    const { rig, camera } = this.host;
    rig.updateMatrixWorld();
    const off = this.tmp.copy(camera.position).applyQuaternion(rig.getWorldQuaternion(new THREE.Quaternion()));
    rig.position.set(x - off.x, y, z - off.z);
    rig.updateMatrixWorld();
    this.vel.set(0, 0);
    this.vy = 0;
  }

  update(dt: number): void {
    if (!this.presenting || !this.session) return;
    dt = Math.min(dt, 0.05);
    const { rig } = this.host;
    const world = this.host.world();
    const ground = this.host.ground();
    if (this.placePending > 0 && --this.placePending === 0) {
      const s = this.host.spawn();
      this.placeHead(s.x, s.y, s.z);
    }
    this.updateHead();

    let left: Gamepad | null = null, right: Gamepad | null = null;
    let rightHand: Hand | null = null;
    for (const h of this.hands) {
      const gp = h.source?.gamepad;
      if (!h.source || !gp) continue;
      if (h.handedness === 'left') left = gp;
      else { right = gp; rightHand = h; }
    }

    // ---- smooth locomotion (left stick, relative to the head direction) ----
    let mx = 0, mz = 0;
    if (left && !this.fade) {
      const [x, y] = stick(left);
      const m = Math.hypot(x, y);
      if (m > 0.15) {
        const s = Math.min(1, (m - 0.15) / 0.85);
        const yaw = this.lastPose.yaw;
        const f = (-y / m) * s, r = (x / m) * s;
        mx = (-Math.sin(yaw) * f + Math.cos(yaw) * r) * MOVE_SPEED;
        mz = (-Math.cos(yaw) * f - Math.sin(yaw) * r) * MOVE_SPEED;
      }
    }
    const k = damp(mx || mz ? 8 : 12, dt);
    this.vel.x += (mx - this.vel.x) * k;
    this.vel.y += (mz - this.vel.y) * k;
    const head = this.headWorld;
    const feet: P3 = { x: head.x, y: rig.position.y, z: head.z };
    const body: Body = { ...this.host.body, height: Math.max(1.0, Math.min(2.2, this.headLocal.y + 0.08)) };
    const v3: P3 = { x: this.vel.x, y: 0, z: this.vel.y };
    const wb = this.host.walkBounds();
    if (wb) softBoundary(feet, v3, wb, 0.5);
    this.vel.set(v3.x, v3.z);
    if (Math.abs(this.vel.x) + Math.abs(this.vel.y) > 1e-4) {
      const ox = feet.x, oz = feet.z;
      slideMove(world, feet, this.vel.x * dt, this.vel.y * dt, body);
      rig.position.x += feet.x - ox;
      rig.position.z += feet.z - oz;
      this.debug.moved += Math.hypot(feet.x - ox, feet.z - oz);
    }

    // ---- floor following ----
    let fy = rig.position.y;
    const g = groundHeight(world, feet.x, feet.z, fy, body, ground);
    if (g >= fy) { fy += (g - fy) * damp(12, dt); if (g - fy < 0.002) fy = g; this.vy = 0; }
    else { this.vy -= GRAVITY * dt; fy = Math.max(g, fy + this.vy * dt); if (fy === g) this.vy = 0; }
    rig.position.y = fy;
    feet.y = fy;

    // ---- right stick: snap turn and teleport ----
    if (right && rightHand && !this.fade) {
      const [x, y] = stick(right);
      if (!this.aiming) {
        if (this.snapArmed && Math.abs(x) > 0.65 && Math.abs(x) > Math.abs(y)) { this.snapArmed = false; this.snapTurn(x > 0 ? -SNAP : SNAP); }
        else if (Math.abs(x) < 0.35) this.snapArmed = true;
        if (y < -0.6 && Math.abs(x) < 0.6) this.aiming = true;
      }
      if (this.aiming) {
        if (y > -0.3) {
          this.aiming = false;
          const arc = this.lastArc;
          if (arc?.valid && arc.end) { this.fade = { phase: 'out', t: 0, target: { x: arc.end.x, y: arc.end.y, z: arc.end.z } }; this.debug.teleports++; }
          this.teleport.hide();
          this.lastArc = null;
        } else this.aimArc(rightHand, feet, body, ground, wb, dt);
      }
    } else if (this.aiming) { this.aiming = false; this.teleport.hide(); }
    this.debug.aiming = this.aiming;

    // ---- right trigger: pick a pin (rising edge), the ray shows a cursor when it is on one ----
    if (rightHand && !this.aiming) {
      rightHand.ray.updateMatrixWorld();
      const o = new THREE.Vector3().setFromMatrixPosition(rightHand.ray.matrixWorld);
      const d = new THREE.Vector3(0, 0, -1).transformDirection(rightHand.ray.matrixWorld);
      const trigger = (!!right && !!right.buttons[0]?.pressed) || this.select.right;
      const edge = trigger && !this.triggerPrev;
      this.triggerPrev = trigger;
      const on = this.host.pickRay(o, d, edge);
      if (edge && on) this.debug.picks++;
      rightHand.pointer.setLength(on ? 1.5 : 1.2, on);
      rightHand.pointer.setPressed(trigger && on);
    }

    // ---- teleport fade ----
    if (this.fade) {
      const f = this.fade;
      f.t += dt;
      if (f.phase === 'out' && f.t >= 0.1) { if (f.target) this.placeHead(f.target.x, f.target.y, f.target.z); this.fade = { phase: 'in', t: 0, target: null }; }
      else if (f.phase === 'in' && f.t >= 0.22) this.fade = null;
    }
  }

  private snapTurn(delta: number): void {
    const { rig } = this.host;
    this.updateHead();
    const before = this.headWorld.clone();
    rig.rotation.y += delta;
    rig.updateMatrixWorld();
    const after = this.tmp.copy(this.headLocal).applyMatrix4(rig.matrixWorld);
    rig.position.x += before.x - after.x;
    rig.position.z += before.z - after.z;
    rig.updateMatrixWorld();
    this.debug.snapTurns++;
  }

  private aimArc(hand: Hand, feet: P3, body: Body, ground: GroundOptions, wb: Bounds | null, dt: number): void {
    hand.ray.updateMatrixWorld();
    const origin = new THREE.Vector3().setFromMatrixPosition(hand.ray.matrixWorld);
    const dir = new THREE.Vector3(0, 0, -1).transformDirection(hand.ray.matrixWorld);
    const rules: LandingRules = { body, ground, bounds: wb ?? undefined, maxRise: 1.2, flatTolerance: 0.18, maxDistance: 9 };
    const arc = traceArc(this.host.world(), origin, dir, feet, rules, DEFAULT_ARC);
    this.lastArc = arc;
    this.debug.valid = arc.valid;
    this.debug.reason = arc.reason;
    this.teleport.show(arc.points, arc.end, arc.valid, dt);
  }
}
