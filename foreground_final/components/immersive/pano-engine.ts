import * as THREE from "three";
import { FACES, ORIENT, cubeQuat, modelToThree, yawOf } from "@/lib/immersive/cube";
import { bestAligned, neighbours, pickByDirection, type Neighbour, type WalkPano } from "@/lib/immersive/walk";
import { EYE_M, visibleFurniture, type FurnitureInput } from "@/lib/three-d/furniture-place";
import { FurnitureLayer } from "./furniture-layer";
import { TextureStore } from "./texture-store";

/**
 * The immersive walk, imperative three.js. One renderer, two pano cubes (current + incoming) and floor rings.
 * Look: drag / touch / keys with inertia; zoom: wheel / pinch (FOV clamp). Move: glide (dolly + cross-fade + FOV squeeze).
 * Faces change with a circular wipe (mode switch) or a per-face fade (imagined faces streaming in).
 * React owns the overlays; this owns the GPU. Client only.
 */

export type FaceUrls = readonly string[];
export type Resolve = (panoId: string) => FaceUrls;

export type EngineOptions = {
  panos: WalkPano[];
  startId: string;
  resolve: Resolve;
  reducedMotion: boolean;
  onPano: (id: string, neighbours: Neighbour[]) => void;
  /** called every rendered frame the view moved; keep it cheap (direct DOM writes) */
  onView: (yaw: number, pitch: number, fov: number) => void;
  onLoading?: (loading: boolean) => void;
  onBlocked?: (message: string) => void;
};

export type GlideStat = { ms: number; frames: number; fps: number };

const CUBE_HALF = 6;
const FOV_MIN = 35;
const FOV_MAX = 95;
const FOV_DEFAULT = 78;
const GLIDE_MS = 600;
const WIPE_MS = 700;
const FADE_MS = 450;
const PITCH_MAX = (85 * Math.PI) / 180;
const KEY_SPEED = 1.7; // rad/s
const TEXTURE_CAP = 48; // 8 panos x 6 faces

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const smooth = (a: number, b: number, t: number) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D mapA;
uniform sampler2D mapB;
uniform float hasA;
uniform float hasB;
uniform float mixAmt;
uniform float opacity;
uniform vec2 wipeC;
uniform float wipeR;
varying vec2 vUv;
void main() {
  vec4 placeholder = vec4(0.10, 0.11, 0.13, 1.0);
  vec4 a = hasA > 0.5 ? texture2D(mapA, vUv) : placeholder;
  vec4 b = hasB > 0.5 ? texture2D(mapB, vUv) : a;
  float m = mixAmt;
  if (wipeR >= 0.0) m = 1.0 - smoothstep(wipeR - 24.0, wipeR, distance(gl_FragCoord.xy, wipeC));
  gl_FragColor = vec4(mix(a.rgb, b.rgb, m), opacity);
  #include <colorspace_fragment>
}`;

type Face = { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; url: string | null; next: string | null };

class PanoCube {
  readonly group = new THREE.Group();
  readonly faces: Face[] = [];
  panoId: string | null = null;

  constructor(geo: THREE.PlaneGeometry, order: number) {
    for (const spec of FACES) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: THREE.FrontSide,
        uniforms: {
          mapA: { value: null },
          mapB: { value: null },
          hasA: { value: 0 },
          hasB: { value: 0 },
          mixAmt: { value: 0 },
          opacity: { value: 1 },
          wipeC: { value: new THREE.Vector2() },
          wipeR: { value: -1 },
        },
      });
      const mesh = new THREE.Mesh(geo, mat);
      // basis (right, up, toward-viewer) puts the photo on the face exactly as seen from inside
      const right = new THREE.Vector3(...spec.right);
      const up = new THREE.Vector3(...spec.up);
      const n = new THREE.Vector3(...spec.dir).negate();
      mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, n));
      mesh.position.set(...spec.dir);
      mesh.renderOrder = order;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.faces.push({ mesh, mat, url: null, next: null });
    }
    this.setHalf(CUBE_HALF);
  }

  place(p: WalkPano) {
    this.panoId = p.id;
    this.group.position.set(...modelToThree(p.position));
    this.group.quaternion.set(...cubeQuat(p.rotation));
  }

  /** a tiny overlap hides seams between faces */
  setHalf(h: number) {
    for (const f of this.faces) {
      const spec = FACES[this.faces.indexOf(f)];
      f.mesh.position.set(spec.dir[0] * h, spec.dir[1] * h, spec.dir[2] * h);
      f.mesh.scale.setScalar(h * 1.003);
    }
  }

  setOrder(order: number) {
    for (const f of this.faces) f.mesh.renderOrder = order;
  }

  setOpacity(o: number) {
    for (const f of this.faces) f.mat.uniforms.opacity.value = o;
  }

  setFace(i: number, url: string, tex: THREE.Texture | undefined) {
    const f = this.faces[i];
    f.url = url;
    f.next = null;
    f.mat.uniforms.mapA.value = tex ?? null;
    f.mat.uniforms.hasA.value = tex ? 1 : 0;
    f.mat.uniforms.hasB.value = 0;
    f.mat.uniforms.mixAmt.value = 0;
    f.mat.uniforms.wipeR.value = -1;
  }

  dispose() {
    for (const f of this.faces) f.mat.dispose();
  }
}

type Tween = { start: number; ms: number; update: (t: number) => void; done?: () => void; key?: string };

export class PanoEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV_DEFAULT, 1, 0.05, 200);
  private geo = new THREE.PlaneGeometry(2, 2);
  private cubeA: PanoCube;
  private cubeB: PanoCube;
  private rings = new THREE.Group();
  private furniture: FurnitureLayer;
  private furnitureInput: FurnitureInput | null = null;
  private gridOn = false;
  private ringGeo = new THREE.RingGeometry(0.2, 0.25, 48);
  private hitGeo = new THREE.CircleGeometry(0.5, 24);
  private cursor: THREE.Mesh;
  private store: TextureStore;
  private raycaster = new THREE.Raycaster();
  private tweens: Tween[] = [];
  private raf = 0;
  private last = 0;
  private dirty = true;
  private disposed = false;
  private resizeObs: ResizeObserver;

  private yaw = 0;
  private pitch = 0;
  private fov = FOV_DEFAULT;
  private fovTarget = FOV_DEFAULT;
  private fovOffset = 0;
  private vYaw = 0;
  /** a steady turn in rad/s, for a slow auto-pan (0 = off) */
  private autoYaw = 0;
  private vPitch = 0;
  private keys = new Set<string>();
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: { x: number; y: number; t: number; moved: number; startX: number; startY: number } | null = null;
  private pinch: { dist: number; fov: number } | null = null;
  private hoverRing: THREE.Object3D | null = null;
  private lastPointer: { x: number; y: number } | null = null;

  private current: WalkPano;
  private near: Neighbour[] = [];
  private gliding = false;
  private gen = 0;
  readonly stats: { glides: GlideStat[]; faceFades: number } = { glides: [], faceFades: 0 };

  constructor(
    private readonly container: HTMLElement,
    private opts: EngineOptions,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x16181c);
    const canvas = this.renderer.domElement;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.touchAction = "none";
    canvas.setAttribute("aria-hidden", "true");
    container.appendChild(canvas);

    this.store = new TextureStore(TEXTURE_CAP, (url) => this.inUse(url));
    this.cubeA = new PanoCube(this.geo, 1);
    this.cubeB = new PanoCube(this.geo, 0);
    this.cubeB.group.visible = false;
    this.camera.rotation.order = "YXZ";
    this.furniture = new FurnitureLayer(() => {
      this.dirty = true;
    });
    this.scene.add(this.cubeB.group, this.cubeA.group, this.furniture.group, this.rings);

    this.cursor = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.2, 40),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthTest: false, depthWrite: false }),
    );
    this.cursor.rotation.x = -Math.PI / 2;
    this.cursor.renderOrder = 4;
    this.cursor.visible = false;
    this.scene.add(this.cursor);

    const start = opts.panos.find((p) => p.id === opts.startId) ?? opts.panos[0];
    this.current = start;
    this.enter(start, true);

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onUp);
    canvas.addEventListener("pointerleave", this.onLeave);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("pointerdown", this.onAnyPointer, true);
    this.raf = requestAnimationFrame(this.frame);
    if (process.env.NODE_ENV !== "production") (window as unknown as { __orient?: unknown }).__orient = { ORIENT, replace: () => { this.cubeA.place(this.current); this.dirty = true; } };
  }

  // ---------- public ----------

  get panoId() {
    return this.current.id;
  }
  get viewYaw() {
    return this.yaw;
  }
  get neighbourList() {
    return this.near;
  }

  /** The neighbour ahead in the view direction (for prefetching), wide cone. */
  ahead(): Neighbour | null {
    return bestAligned(this.near, this.yaw, Math.PI / 2.5);
  }

  setReducedMotion(v: boolean) {
    this.opts.reducedMotion = v;
  }

  /**
   * New face sources (mode switch or imagined faces arriving). With an origin, the change reveals as a circular
   * wipe from that point (client px); without, each changed face fades in on its own as soon as it is decoded.
   */
  setResolver(resolve: Resolve, wipeFrom?: { x: number; y: number } | "pointer") {
    this.opts.resolve = resolve;
    const urls = resolve(this.current.id);
    const changed = urls.map((u, i) => (this.cubeA.faces[i].url !== u && this.cubeA.faces[i].next !== u ? i : -1)).filter((i) => i >= 0);
    this.preloadNeighbours();
    if (!changed.length) return;
    const gen = this.gen;
    const origin = wipeFrom === "pointer" ? this.lastPointer : wipeFrom;
    if (origin && !this.opts.reducedMotion) {
      this.finishTween("wipe");
      for (const i of changed) this.cubeA.faces[i].next = urls[i];
      this.opts.onLoading?.(true);
      void Promise.all(changed.map((i) => this.store.load(urls[i]).catch(() => undefined))).then((texs) => {
        this.opts.onLoading?.(false);
        if (gen !== this.gen || this.disposed) return;
        this.wipe(origin, changed, urls, texs);
      });
      return;
    }
    for (const i of changed) {
      const face = this.cubeA.faces[i];
      face.next = urls[i];
      void this.store.load(urls[i]).then(
        (tex) => {
          if (gen !== this.gen || this.disposed || face.next !== urls[i]) return;
          this.fadeFace(i, urls[i], tex);
        },
        () => {
          if (face.next === urls[i]) face.next = null;
        },
      );
    }
  }

  /** Step to a pano: a glide to a neighbour, a dissolve to anywhere else. */
  async goTo(id: string): Promise<void> {
    if (this.gliding || id === this.current.id) return;
    const target = this.opts.panos.find((p) => p.id === id);
    if (!target) return;
    const n = this.near.find((x) => x.id === id);
    await this.travel(target, n ? "glide" : "dissolve");
  }

  stepForward() {
    const n = bestAligned(this.near, this.yaw);
    if (n) void this.goTo(n.id);
    else this.opts.onBlocked?.("No place to step to in this direction. Turn, or pick a spot on the map.");
  }

  stepBack() {
    const n = bestAligned(this.near, this.yaw + Math.PI);
    if (n) void this.goTo(n.id);
    else this.opts.onBlocked?.("No place to step back to.");
  }

  keyDown(e: KeyboardEvent): boolean {
    const k = e.key;
    if ((k === "ArrowUp" || k === "ArrowDown") && e.shiftKey) {
      this.keys.add(k === "ArrowUp" ? "lookUp" : "lookDown");
      return true;
    }
    if (k === "ArrowLeft" || k === "a" || k === "A") return this.keys.add("left"), true;
    if (k === "ArrowRight" || k === "d" || k === "D") return this.keys.add("right"), true;
    if (k === "PageUp") return this.keys.add("lookUp"), true;
    if (k === "PageDown") return this.keys.add("lookDown"), true;
    if (e.repeat) return k === "ArrowUp" || k === "ArrowDown" || k === "w" || k === "W" || k === "s" || k === "S";
    if (k === "ArrowUp" || k === "w" || k === "W") return this.stepForward(), true;
    if (k === "ArrowDown" || k === "s" || k === "S") return this.stepBack(), true;
    if (k === "+" || k === "=") return this.zoomBy(-8), true;
    if (k === "-" || k === "_") return this.zoomBy(8), true;
    return false;
  }

  keyUp(e: KeyboardEvent) {
    const k = e.key;
    if (k === "ArrowLeft" || k === "a" || k === "A") this.keys.delete("left");
    if (k === "ArrowRight" || k === "d" || k === "D") this.keys.delete("right");
    if (k === "ArrowUp" || k === "PageUp") this.keys.delete("lookUp");
    if (k === "ArrowDown" || k === "PageDown") this.keys.delete("lookDown");
    if (k === "Shift") {
      this.keys.delete("lookUp");
      this.keys.delete("lookDown");
    }
  }

  blur() {
    this.keys.clear();
  }

  /** turn steadily at `radPerSec` (0 stops); any drag still wins while it lasts */
  setAutoYaw(radPerSec: number) {
    this.autoYaw = radPerSec;
  }

  /** for tests and the lab: set the view directly */
  setView(yaw: number, pitch = 0) {
    this.yaw = yaw;
    this.pitch = pitch;
    this.vYaw = this.vPitch = 0;
    this.dirty = true;
  }

  zoomBy(d: number) {
    this.fovTarget = Math.min(FOV_MAX, Math.max(FOV_MIN, this.fovTarget + d));
    this.dirty = true;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    const c = this.renderer.domElement;
    c.removeEventListener("pointerdown", this.onDown);
    c.removeEventListener("pointermove", this.onMove);
    c.removeEventListener("pointerup", this.onUp);
    c.removeEventListener("pointercancel", this.onUp);
    c.removeEventListener("pointerleave", this.onLeave);
    c.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("pointerdown", this.onAnyPointer, true);
    this.clearRings();
    this.furniture.dispose();
    this.cubeA.dispose();
    this.cubeB.dispose();
    this.geo.dispose();
    this.ringGeo.dispose();
    this.hitGeo.dispose();
    this.cursor.geometry.dispose();
    (this.cursor.material as THREE.Material).dispose();
    this.store.dispose();
    this.renderer.dispose();
    c.remove();
  }

  // ---------- furniture ----------

  /** The owner's plan as 3D pieces (null clears). `grid` draws a metre grid and the room outlines for alignment checks. */
  setFurniture(input: FurnitureInput | null, grid = false) {
    this.furnitureInput = input;
    this.gridOn = grid;
    if (this.gliding) return; // arrives with the glide's end
    this.refreshFurniture();
  }

  /** ids of the pieces on stage now (checks and the Room label read it) */
  get furnitureIds() {
    return this.furniture.ids();
  }

  get position() {
    return this.current.position;
  }

  private refreshFurniture(fadeIn = false) {
    const input = this.furnitureInput;
    const pos = this.current.position;
    this.furniture.setGrid(this.gridOn ? input : null, pos.z - EYE_M);
    this.furniture.sync(input ? visibleFurniture(input, pos) : []);
    if (!fadeIn || this.opts.reducedMotion) return this.furniture.setOpacity(1);
    this.furniture.setOpacity(0);
    this.tweens.push({ start: performance.now(), ms: 320, key: "furniture", update: (t) => this.furniture.setOpacity(smooth(0, 1, t)) });
  }

  // ---------- panos ----------

  private inUse(url: string): boolean {
    for (const cube of [this.cubeA, this.cubeB]) for (const f of cube.faces) if (f.url === url || f.next === url) return true;
    return false;
  }

  /** Show a pano in cube A immediately (first load, or after a transition). */
  private enter(p: WalkPano, initial = false) {
    this.current = p;
    this.cubeA.place(p);
    const urls = this.opts.resolve(p.id);
    const gen = ++this.gen;
    urls.forEach((u, i) => {
      const tex = this.store.get(u);
      this.cubeA.setFace(i, u, tex);
      if (!tex) {
        if (initial) this.opts.onLoading?.(true);
        void this.store.load(u).then(
          (t) => {
            if (gen !== this.gen || this.cubeA.faces[i].url !== u) return;
            this.cubeA.setFace(i, u, t);
            this.dirty = true;
            if (initial && this.cubeA.faces.every((f) => f.mat.uniforms.hasA.value === 1)) this.opts.onLoading?.(false);
          },
          () => undefined,
        );
      }
    });
    this.camera.position.copy(this.cubeA.group.position);
    this.near = neighbours(this.opts.panos, p.id);
    this.buildRings();
    this.refreshFurniture();
    this.preloadNeighbours();
    this.dirty = true;
    this.opts.onPano(p.id, this.near);
  }

  private preloadNeighbours() {
    for (const n of this.near) for (const u of this.opts.resolve(n.id)) void this.store.load(u).catch(() => undefined);
  }

  private async travel(target: WalkPano, kind: "glide" | "dissolve") {
    this.gliding = true;
    this.finishTween("wipe");
    this.finishFades();
    const urls = this.opts.resolve(target.id);
    const pending = urls.some((u) => !this.store.get(u));
    if (pending) this.opts.onLoading?.(true);
    const texs = await Promise.all(urls.map((u) => this.store.load(u).catch(() => undefined)));
    if (pending) this.opts.onLoading?.(false);
    if (this.disposed) return;
    const B = this.cubeB;
    B.place(target);
    urls.forEach((u, i) => B.setFace(i, u, texs[i]));
    this.rings.visible = false;
    this.cursor.visible = false;
    // no depth in the cubes, so furniture from the old room would ride through the walls: gone for the glide
    this.furniture.setOpacity(0);

    const from = this.camera.position.clone();
    const to = B.group.position.clone();
    const dist = from.distanceTo(to);
    const finish = () => {
      // swap roles: the incoming cube becomes current
      [this.cubeA, this.cubeB] = [this.cubeB, this.cubeA];
      this.cubeA.setOrder(1);
      this.cubeB.setOrder(0);
      this.cubeA.setOpacity(1);
      this.cubeA.setHalf(CUBE_HALF);
      this.cubeB.group.visible = false;
      this.cubeB.panoId = null;
      for (let i = 0; i < 6; i++) this.cubeB.faces[i].url = this.cubeB.faces[i].next = null;
      this.fovOffset = 0;
      this.rings.visible = true;
      this.gliding = false;
      this.gen++;
      this.current = target;
      this.camera.position.copy(this.cubeA.group.position);
      this.near = neighbours(this.opts.panos, target.id);
      this.buildRings();
      this.refreshFurniture(true);
      this.preloadNeighbours();
      this.dirty = true;
      this.opts.onPano(target.id, this.near);
      // faces that changed while gliding (imagined faces streaming in) fade in now
      this.setResolver(this.opts.resolve);
    };

    if (this.opts.reducedMotion) {
      finish();
      return;
    }
    B.group.visible = true;
    B.setOrder(0);
    this.cubeA.setOrder(1);
    B.setOpacity(1);
    const half = Math.max(CUBE_HALF, dist + 1.5);
    const A = this.cubeA;
    const aPos = A.group.position.clone();
    if (kind === "glide") {
      A.setHalf(half);
      B.setHalf(half);
    } else {
      // dissolve: both cubes centred on the target, plain cross-fade
      this.camera.position.copy(to);
      A.group.position.copy(to);
    }
    const t0 = performance.now();
    let frames = 0;
    await new Promise<void>((resolve) => {
      this.tweens.push({
        start: t0,
        ms: kind === "glide" ? GLIDE_MS : 420,
        update: (t) => {
          frames++;
          if (kind === "glide") {
            this.camera.position.lerpVectors(from, to, ease(t));
            this.fovOffset = -7 * Math.sin(Math.PI * t);
          }
          A.setOpacity(1 - smooth(0.12, 0.88, t));
        },
        done: () => {
          const ms = performance.now() - t0;
          if (kind === "glide") this.stats.glides.push({ ms: Math.round(ms), frames, fps: Math.round((frames / ms) * 1000) });
          A.group.position.copy(aPos);
          finish();
          resolve();
        },
      });
    });
  }

  // ---------- face transitions ----------

  private wipe(origin: { x: number; y: number }, changed: number[], urls: FaceUrls, texs: (THREE.Texture | undefined)[]) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const dpr = this.renderer.getPixelRatio();
    const cx = (origin.x - rect.left) * dpr;
    const cy = (rect.height - (origin.y - rect.top)) * dpr;
    const corners = [
      [0, 0],
      [rect.width * dpr, 0],
      [0, rect.height * dpr],
      [rect.width * dpr, rect.height * dpr],
    ];
    const R = Math.max(...corners.map(([x, y]) => Math.hypot(x - cx, y - cy))) + 30;
    const faces = this.cubeA.faces;
    changed.forEach((i, k) => {
      const u = faces[i].mat.uniforms;
      if (!texs[k]) return;
      u.mapB.value = texs[k];
      u.hasB.value = 1;
    });
    for (const f of faces) {
      f.mat.uniforms.wipeC.value.set(cx, cy);
      f.mat.uniforms.wipeR.value = 0;
    }
    this.tweens.push({
      key: "wipe",
      start: performance.now(),
      ms: WIPE_MS,
      update: (t) => {
        for (const f of faces) f.mat.uniforms.wipeR.value = easeOut(t) * R;
      },
      done: () => {
        changed.forEach((i, k) => {
          if (faces[i].next === urls[i]) this.cubeA.setFace(i, urls[i], texs[k] ?? this.store.get(urls[i]));
        });
        for (const f of faces) f.mat.uniforms.wipeR.value = -1;
      },
    });
  }

  private fadeFace(i: number, url: string, tex: THREE.Texture) {
    const face = this.cubeA.faces[i];
    const u = face.mat.uniforms;
    if (this.opts.reducedMotion || !u.hasA.value) {
      this.cubeA.setFace(i, url, tex);
      this.dirty = true;
      return;
    }
    this.finishTween(`fade${i}`);
    u.mapB.value = tex;
    u.hasB.value = 1;
    u.mixAmt.value = 0;
    this.stats.faceFades++;
    this.tweens.push({
      key: `fade${i}`,
      start: performance.now(),
      ms: FADE_MS,
      update: (t) => (u.mixAmt.value = ease(t)),
      done: () => {
        if (face.next === url) this.cubeA.setFace(i, url, tex);
      },
    });
  }

  private finishTween(key: string) {
    const t = this.tweens.find((x) => x.key === key);
    if (!t) return;
    this.tweens = this.tweens.filter((x) => x !== t);
    t.update(1);
    t.done?.();
  }

  private finishFades() {
    for (let i = 0; i < 6; i++) this.finishTween(`fade${i}`);
  }

  // ---------- rings ----------

  private clearRings() {
    for (const c of [...this.rings.children]) {
      this.rings.remove(c);
      c.traverse((o) => {
        if (o instanceof THREE.Mesh) (o.material as THREE.Material).dispose();
      });
    }
  }

  private buildRings() {
    this.clearRings();
    for (const n of this.near) {
      const p = this.opts.panos.find((x) => x.id === n.id)!;
      const [x, y, z] = modelToThree(p.position);
      const g = new THREE.Group();
      g.position.set(x, y - EYE_M + 0.02, z);
      g.rotation.x = -Math.PI / 2;
      g.userData.panoId = n.id;
      const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false }));
      ring.renderOrder = 3;
      const hit = new THREE.Mesh(this.hitGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false, colorWrite: false }));
      hit.userData.panoId = n.id;
      g.add(ring, hit);
      this.rings.add(g);
    }
  }

  private setHover(g: THREE.Object3D | null) {
    if (g === this.hoverRing) return;
    const style = (o: THREE.Object3D | null, on: boolean) => {
      if (!o) return;
      o.scale.setScalar(on ? 1.25 : 1);
      const ring = o.children[0] as THREE.Mesh;
      (ring.material as THREE.MeshBasicMaterial).opacity = on ? 0.95 : 0.55;
    };
    style(this.hoverRing, false);
    style(g, true);
    this.hoverRing = g;
    this.renderer.domElement.style.cursor = g ? "pointer" : "grab";
    this.dirty = true;
  }

  // ---------- input ----------

  private ndc(e: { clientX: number; clientY: number }) {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private ringAt(e: { clientX: number; clientY: number }): THREE.Object3D | null {
    if (!this.rings.visible) return null;
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const hits = this.raycaster.intersectObjects(this.rings.children, true);
    const h = hits.find((x) => x.object.userData.panoId);
    return h ? h.object.parent : null;
  }

  private floorAt(e: { clientX: number; clientY: number }): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const floorY = this.camera.position.y - EYE_M;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorY);
    const out = new THREE.Vector3();
    const dir = this.raycaster.ray.direction;
    if (dir.y > -0.04) return null;
    return this.raycaster.ray.intersectPlane(plane, out);
  }

  private onAnyPointer = (e: PointerEvent) => {
    this.lastPointer = { x: e.clientX, y: e.clientY };
  };

  private onDown = (e: PointerEvent) => {
    this.renderer.domElement.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.vYaw = this.vPitch = 0;
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), fov: this.fovTarget };
      this.drag = null;
      return;
    }
    this.drag = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, startX: e.clientX, startY: e.clientY };
    this.renderer.domElement.style.cursor = "grabbing";
    this.cursor.visible = false;
  };

  private onMove = (e: PointerEvent) => {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      this.fovTarget = Math.min(FOV_MAX, Math.max(FOV_MIN, (this.pinch.fov * this.pinch.dist) / Math.max(d, 1)));
      this.dirty = true;
      return;
    }
    if (this.drag) {
      const now = performance.now();
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      const h = this.renderer.domElement.clientHeight || 1;
      const k = ((this.camera.fov * Math.PI) / 180) / h;
      // grab the room: dragging right turns the view left
      this.yaw += dx * k;
      this.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, this.pitch + dy * k));
      const dt = Math.max(1, now - this.drag.t) / 1000;
      this.vYaw = 0.7 * this.vYaw + 0.3 * ((dx * k) / dt);
      this.vPitch = 0.7 * this.vPitch + 0.3 * ((dy * k) / dt);
      this.drag.moved += Math.abs(dx) + Math.abs(dy);
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      this.drag.t = now;
      this.dirty = true;
      return;
    }
    if (e.pointerType === "mouse" && !this.gliding) {
      const ring = this.ringAt(e);
      this.setHover(ring);
      const p = ring ? null : this.floorAt(e);
      this.cursor.visible = !!p && p.distanceTo(this.camera.position) < 12;
      if (p) this.cursor.position.copy(p).setY(p.y + 0.01);
      this.dirty = true;
    }
  };

  private onUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pinch) {
      if (this.pointers.size < 2) this.pinch = null;
      return;
    }
    const d = this.drag;
    this.drag = null;
    this.renderer.domElement.style.cursor = this.hoverRing ? "pointer" : "grab";
    if (!d) return;
    // released after a pause: no fling
    if (performance.now() - d.t > 80 || this.opts.reducedMotion) this.vYaw = this.vPitch = 0;
    const isClick = d.moved < 6;
    if (!isClick || this.gliding) return;
    this.vYaw = this.vPitch = 0;
    const ring = this.ringAt(e);
    if (ring) return void this.goTo(ring.userData.panoId as string);
    const p = this.floorAt(e);
    if (!p) return;
    const yaw = yawOf(p.x - this.camera.position.x, p.z - this.camera.position.z);
    const n = pickByDirection(this.near, yaw);
    if (n) void this.goTo(n.id);
    else this.opts.onBlocked?.("No place to step to there.");
  };

  private onLeave = () => {
    this.cursor.visible = false;
    this.setHover(null);
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoomBy(e.deltaY * 0.04);
  };

  // ---------- loop ----------

  private resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, this.last ? (now - this.last) / 1000 : 0.016);
    this.last = now;
    let moving = false;

    // keys: ease into a steady turn
    const turn = (this.keys.has("left") ? 1 : 0) - (this.keys.has("right") ? 1 : 0);
    const tilt = (this.keys.has("lookUp") ? 1 : 0) - (this.keys.has("lookDown") ? 1 : 0);
    if (turn || tilt) {
      const a = this.opts.reducedMotion ? 1 : 1 - Math.exp(-dt * 10);
      this.vYaw += (turn * KEY_SPEED - this.vYaw) * a;
      this.vPitch += (tilt * KEY_SPEED * 0.6 - this.vPitch) * a;
    }
    if (!this.drag) {
      if (this.autoYaw && !this.opts.reducedMotion) {
        this.yaw += this.autoYaw * dt;
        moving = true;
      }
      if (Math.abs(this.vYaw) > 1e-4 || Math.abs(this.vPitch) > 1e-4) {
        this.yaw += this.vYaw * dt;
        this.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, this.pitch + this.vPitch * dt));
        moving = true;
      }
      if (!turn && !tilt) {
        const damp = this.opts.reducedMotion ? 0 : Math.exp(-dt * 5);
        this.vYaw *= damp;
        this.vPitch *= damp;
      }
    }
    if (Math.abs(this.fovTarget - this.fov) > 0.01) {
      this.fov += (this.fovTarget - this.fov) * (this.opts.reducedMotion ? 1 : 1 - Math.exp(-dt * 12));
      moving = true;
    }
    if (this.tweens.length) {
      moving = true;
      const list = this.tweens;
      for (const t of list) {
        const k = t.ms <= 0 || this.opts.reducedMotion ? 1 : Math.min(1, (now - t.start) / t.ms);
        t.update(k);
        if (k >= 1) {
          this.tweens = this.tweens.filter((x) => x !== t);
          t.done?.();
        }
      }
    }
    if (!moving && !this.dirty) return;
    this.dirty = false;
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
    this.camera.fov = this.fov + this.fovOffset;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
    this.opts.onView(this.yaw, this.pitch, this.fov);
  };
}
