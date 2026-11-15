import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CHAIR, chairSlots } from "@/lib/three-d/chair-place";
import { fitModel } from "@/lib/three-d/layout-map";
import { blockHeight, planToThree, type FurnitureInput, type Placed } from "@/lib/three-d/furniture-place";

/**
 * The owner's furniture inside the pano scene: real-scale GLBs (one load per URL, then clones) or plain blocks for
 * types without a model, each with a soft contact shadow, drawn after the cubes with the depth test on among
 * themselves. Cube faces are transparent with the depth test off, so these are transparent too and sorted after them
 * by renderOrder. Client only.
 */
const ORDER_SHADOW = 2;
const ORDER_PIECE = 2.5;

type Node = { root: THREE.Group; sig: string; mats: THREE.Material[]; shadow: THREE.MeshBasicMaterial };

export class FurnitureLayer {
  readonly group = new THREE.Group();
  private nodes = new Map<string, Node>();
  private templates = new Map<string, Promise<THREE.Object3D | null>>();
  private loader = new GLTFLoader();
  private shadowGeo = new THREE.PlaneGeometry(1, 1);
  private shadowTex: THREE.CanvasTexture;
  private blockGeo = new THREE.BoxGeometry(1, 1, 1);
  private chairGeo = chairGeometry();
  private opacity = 1;
  private grid: THREE.Group | null = null;
  private disposed = false;

  constructor(private onChange: () => void) {
    this.group.visible = false;
    this.group.add(new THREE.HemisphereLight(0xffffff, 0x9a9080, 1.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(2, 5, 1.5);
    this.group.add(sun);
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    grad.addColorStop(0, "rgba(0,0,0,0.6)");
    grad.addColorStop(0.6, "rgba(0,0,0,0.25)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    this.shadowTex = new THREE.CanvasTexture(c);
    this.shadowTex.colorSpace = THREE.SRGBColorSpace;
  }

  get count() {
    return this.nodes.size;
  }

  /** The ids of the pieces on stage, for checks. */
  ids(): string[] {
    return [...this.nodes.keys()];
  }

  setOpacity(o: number) {
    this.opacity = o;
    for (const n of this.nodes.values()) this.apply(n);
    this.group.visible = o > 0.01 && (this.nodes.size > 0 || Boolean(this.grid));
  }

  private apply(n: Node) {
    for (const m of n.mats) m.opacity = this.opacity;
    n.shadow.opacity = this.opacity;
  }

  /** Make the scene hold exactly these pieces. Moves are in place; a changed type or size rebuilds. */
  sync(placed: Placed[]) {
    const keep = new Set(placed.map((p) => p.id));
    for (const [id, n] of this.nodes) {
      if (keep.has(id)) continue;
      this.group.remove(n.root);
      this.free(n);
      this.nodes.delete(id);
    }
    for (const p of placed) {
      const sig = `${p.type}:${p.w}x${p.d}`;
      let n = this.nodes.get(p.id);
      if (n && n.sig !== sig) {
        this.group.remove(n.root);
        this.free(n);
        n = undefined;
      }
      if (!n) {
        n = this.build(p, sig);
        this.nodes.set(p.id, n);
        this.group.add(n.root);
      }
      n.root.position.set(...p.position);
      n.root.rotation.y = p.yaw;
    }
    this.group.visible = this.opacity > 0.01 && (this.nodes.size > 0 || Boolean(this.grid));
    this.onChange();
  }

  private build(p: Placed, sig: string): Node {
    const root = new THREE.Group();
    const mats: THREE.Material[] = [];
    const shadowMat = new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false, opacity: this.opacity });
    const shadow = new THREE.Mesh(this.shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(p.w * 1.3, p.d * 1.3, 1);
    shadow.position.y = 0.01;
    shadow.renderOrder = ORDER_SHADOW;
    root.add(shadow);
    const node: Node = { root, sig, mats, shadow: shadowMat };

    if (p.modelled) {
      const fit = fitModel(p);
      const holder = new THREE.Group();
      holder.scale.set(fit.scale.x, fit.scale.y, fit.scale.z);
      holder.position.set(fit.offset.x, fit.offset.y, fit.offset.z);
      root.add(holder);
      void this.template(fit.url).then((tpl) => {
        if (!tpl || this.disposed || this.nodes.get(p.id) !== node) return;
        const clone = tpl.clone(true);
        clone.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const own = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => {
            const c = m.clone();
            c.transparent = true;
            c.opacity = this.opacity;
            c.depthWrite = true;
            mats.push(c);
            return c;
          });
          mesh.material = Array.isArray(mesh.material) ? own : own[0];
          mesh.renderOrder = ORDER_PIECE;
          mesh.frustumCulled = false;
        });
        holder.add(clone);
        this.onChange();
      });
    } else {
      const h = blockHeight(p.type);
      const mat = new THREE.MeshStandardMaterial({ color: 0xc9ced4, roughness: 0.6, metalness: 0.35, transparent: true, opacity: this.opacity });
      mats.push(mat);
      const box = new THREE.Mesh(this.blockGeo, mat);
      box.scale.set(p.w, h, p.d);
      box.position.y = h / 2;
      box.renderOrder = ORDER_PIECE;
      box.frustumCulled = false;
      root.add(box);
    }
    this.addChairs(p, node);
    return node;
  }

  /** chairs round a table, one low-poly mesh each, with the same soft contact shadow as every piece */
  private addChairs(p: Placed, node: Node) {
    const slots = chairSlots(p.type, p.w, p.d);
    if (!slots.length) return;
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a7a68, roughness: 0.75, metalness: 0.05, transparent: true, opacity: this.opacity });
    node.mats.push(mat);
    for (const s of slots) {
      const chair = new THREE.Mesh(this.chairGeo, mat);
      chair.position.set(s.x, 0, s.z);
      chair.rotation.y = s.yaw;
      chair.renderOrder = ORDER_PIECE;
      chair.frustumCulled = false;
      node.root.add(chair);
      const shadow = new THREE.Mesh(this.shadowGeo, node.shadow);
      shadow.rotation.x = -Math.PI / 2;
      shadow.scale.set(CHAIR.seat * 1.5, CHAIR.seat * 1.5, 1);
      shadow.position.set(s.x, 0.01, s.z);
      shadow.renderOrder = ORDER_SHADOW;
      node.root.add(shadow);
    }
  }

  private template(url: string): Promise<THREE.Object3D | null> {
    let t = this.templates.get(url);
    if (!t) {
      t = this.loader.loadAsync(url).then(
        (g) => g.scene,
        () => null,
      );
      this.templates.set(url, t);
    }
    return t;
  }

  private free(n: Node) {
    for (const m of n.mats) m.dispose();
    n.shadow.dispose();
  }

  /** `?grid=1`: a 1 m floor grid and the room outlines through the same transform, to judge alignment by eye. */
  setGrid(input: FurnitureInput | null, floorY: number) {
    if (this.grid) {
      this.group.remove(this.grid);
      this.grid.traverse((o) => {
        const l = o as THREE.LineSegments;
        if (l.isLineSegments) {
          l.geometry.dispose();
          (l.material as THREE.Material).dispose();
        }
      });
      this.grid = null;
    }
    if (!input) return;
    const { frame, rooms } = input;
    const g = new THREE.Group();
    const lines = (pts: number[], color: number) => {
      const geo = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85, depthTest: false });
      const l = new THREE.LineSegments(geo, mat);
      l.renderOrder = 3;
      l.frustumCulled = false;
      g.add(l);
    };
    const y = floorY + 0.02;
    const grid: number[] = [];
    for (let k = 0; k <= Math.ceil(frame.box.w); k++) grid.push(...planToThree(frame, [k, 0], y), ...planToThree(frame, [k, frame.box.d], y));
    for (let k = 0; k <= Math.ceil(frame.box.d); k++) grid.push(...planToThree(frame, [0, k], y), ...planToThree(frame, [frame.box.w, k], y));
    lines(grid, 0x5ec8ff);
    const walls: number[] = [];
    for (const r of rooms) {
      for (let i = 0; i < r.polygon.length; i++) {
        const a = r.polygon[i];
        const b = r.polygon[(i + 1) % r.polygon.length];
        walls.push(a[0], y + 0.01, -a[1], b[0], y + 0.01, -b[1]);
      }
    }
    lines(walls, 0xffd23f);
    this.grid = g;
    this.group.add(g);
    this.group.visible = true;
    this.onChange();
  }

  dispose() {
    this.disposed = true;
    for (const n of this.nodes.values()) this.free(n);
    this.nodes.clear();
    this.setGrid(null, 0);
    this.shadowGeo.dispose();
    this.blockGeo.dispose();
    this.chairGeo.dispose();
    this.shadowTex.dispose();
  }
}

/** One chair in metres, facing +z: four legs, a seat, a back. Merged so a chair is a single draw. */
function chairGeometry(): THREE.BufferGeometry {
  const { seat, seatH, backH, leg } = CHAIR;
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const o = seat / 2 - leg / 2;
  const parts = [
    box(seat, 0.04, seat, 0, seatH - 0.02, 0),
    box(seat, backH - seatH, 0.035, 0, (seatH + backH) / 2, -o - leg / 2 + 0.0175),
    ...[-o, o].flatMap((x) => [-o, o].map((z) => box(leg, seatH - 0.04, leg, x, (seatH - 0.04) / 2, z))),
  ];
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return g;
}
