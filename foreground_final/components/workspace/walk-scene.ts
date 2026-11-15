/* eslint-disable @typescript-eslint/no-explicit-any */
import { itemRect, type Item, type Pt } from "@/lib/layout";
import { fitModel, planToScene, rotationFromYaw, sceneToPlan, yawFromRotation, type PlanFrame, type SceneVec } from "@/lib/three-d/layout-map";

/** The Matterport Web Component's SDK (Bundle SDK, Scene API). Typed loosely: the package's "exports" map hides its types. */
export type Sdk = any;

/** Resolved against the page URL, so root-absolute (the spike at /lab/3d proved the nested-route case). */
const ASSET_BASE = "/matterport";
export const VIEWER_TIMEOUT_MS = 30_000;

/**
 * Mounts <matterport-viewer> in host and resolves with its SDK once it is playing.
 * Matterport's own bottom-left chrome (guided tour, floor plan, dollhouse, help) is turned off with its URL params.
 */
export async function mountViewer(host: HTMLElement, opts: { modelId: string; sdkKey: string; signal?: AbortSignal }): Promise<{ el: HTMLElement; sdk: Sdk }> {
  // @ts-expect-error the package "exports" map hides its types.d.ts
  await import("@matterport/webcomponent");
  const el = document.createElement("matterport-viewer") as HTMLElement & { playingPromise: Promise<Sdk> };
  el.setAttribute("m", opts.modelId);
  el.setAttribute("application-key", opts.sdkKey);
  el.setAttribute("asset-base", ASSET_BASE);
  el.setAttribute("play", "1");
  for (const [k, v] of Object.entries({ qs: "1", hl: "0", help: "0", title: "0", brand: "0", dh: "0", gt: "0", f: "0", fp: "0", search: "0", vr: "0", nt: "0" })) el.setAttribute(k, v);
  el.style.cssText = "display:block;position:absolute;inset:0;width:100%;height:100%";
  host.replaceChildren(el);
  // unmounted (or a dev double-mount) before it was playing: take it down now, not when it finishes loading
  opts.signal?.addEventListener("abort", () => el.remove(), { once: true });
  const sdk = await Promise.race([
    el.playingPromise,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error("viewer timed out")), VIEWER_TIMEOUT_MS)),
  ]);
  return { el, sdk };
}

/* ---------------------------------------------------------------------------------------------------------- */

export type Move = { id: string; x: number; y: number; rotation: Item["rotation"] };
type Room = { min: SceneVec; max: SceneVec };

/**
 * The layout's furniture in the scan: one scene object (one light rig, one gizmo) holding one GLB node per layout item.
 * Positions are written to nodes from the plan with the footprint's inverse transform; a gizmo drag is read back
 * from the node and reported as a plan position and yaw.
 */
export class LayoutObjects {
  private sceneObject: any = null;
  private nodes = new Map<string, any>();
  private control: any = null;
  private key = "";
  private items = new Map<string, Item>();
  private selected: string | null = null;
  private lastSaved = new Map<string, string>();
  private disposed = false;
  private building = Promise.resolve();

  constructor(
    private sdk: Sdk,
    private frame: PlanFrame,
    private rooms: () => Room[],
    private fallbackFloorY: () => number,
  ) {}

  /** Floor height under a scene x/z: the containing room's floor, else the nearest room's. */
  floorY(x: number, z: number): number {
    const rooms = this.rooms();
    if (!rooms.length) return this.fallbackFloorY();
    const inside = rooms.find((r) => x >= r.min.x && x <= r.max.x && z >= r.min.z && z <= r.max.z);
    if (inside) return inside.min.y;
    const dist = (r: Room) => Math.hypot(Math.max(r.min.x - x, 0, x - r.max.x), Math.max(r.min.z - z, 0, z - r.max.z));
    return rooms.reduce((a, b) => (dist(b) < dist(a) ? b : a)).min.y;
  }

  private pose(item: Item) {
    const p = planToScene(this.frame, [item.x, item.y], 0);
    p.y = this.floorY(p.x, p.z);
    return { p, yaw: yawFromRotation(item.rotation) };
  }

  private put(node: any, item: Item) {
    const { p, yaw } = this.pose(item);
    node.position.set(p.x, p.y, p.z);
    node.quaternion.setFromAxisAngle({ x: 0, y: 1, z: 0 }, yaw);
  }

  /** Make the scene match these items (already capped by the caller). */
  sync(items: Item[]): Promise<void> {
    this.building = this.building.then(() => this.apply(items)).catch(() => undefined);
    return this.building;
  }

  private async apply(items: Item[]) {
    if (this.disposed) return;
    const key = items.map((i) => `${i.id}:${i.type}:${i.w}x${i.d}`).join("|");
    this.items = new Map(items.map((i) => [i.id, i]));
    if (key === this.key && this.sceneObject) {
      for (const i of items) {
        const sig = `${i.x.toFixed(3)},${i.y.toFixed(3)},${i.rotation}`;
        if (this.lastSaved.get(i.id) !== sig) {
          this.put(this.nodes.get(i.id), i);
          this.lastSaved.set(i.id, sig);
        }
      }
      return;
    }
    this.teardown();
    if (!items.length) {
      this.key = key;
      return;
    }
    const [so] = await this.sdk.Scene.createObjects(1);
    if (this.disposed) return so.stop();
    so.addNode().addComponent("mp.lights");
    for (const i of items) {
      const fit = fitModel(i);
      const node = so.addNode();
      node.addComponent(this.sdk.Scene.Component.GLTF_LOADER, { url: fit.url, localScale: fit.scale, localPosition: fit.offset });
      this.put(node, i);
      this.nodes.set(i.id, node);
      this.lastSaved.set(i.id, `${i.x.toFixed(3)},${i.y.toFixed(3)},${i.rotation}`);
    }
    // not "visible": the 0.1.47 inputs reject it. A null selection hides the gizmo.
    this.control = so.addNode().addComponent(this.sdk.Scene.Component.TRANSFORM_CONTROLS);
    so.start();
    this.sceneObject = so;
    this.key = key;
    if (this.selected && this.nodes.has(this.selected)) this.select(this.selected, this.mode);
  }

  private mode: "translate" | "rotate" = "translate";

  get selectedId() {
    return this.selected;
  }

  select(id: string | null, mode: "translate" | "rotate" = this.mode) {
    this.selected = id;
    this.mode = mode;
    const c = this.control?.inputs;
    if (!c) return;
    const node = id ? this.nodes.get(id) : null;
    c.selection = node ?? null;
    if (!node) return;
    c.mode = mode;
    // slide on the floor only (X/Z), turn about the vertical axis only
    c.showX = mode === "translate";
    c.showZ = mode === "translate";
    c.showY = mode === "rotate";
  }

  /** The item whose footprint (grown by a hand's width) contains this scene point, nearest centre first. */
  pick(point: { x: number; z: number }): string | null {
    const at = sceneToPlan(this.frame, point);
    let best: { id: string; d: number } | null = null;
    for (const it of this.items.values()) {
      if (!this.nodes.has(it.id)) continue;
      const r = itemRect(it);
      const pad = 0.3;
      if (at[0] < r.x - pad || at[0] > r.x + r.w + pad || at[1] < r.y - pad || at[1] > r.y + r.d + pad) continue;
      const d = Math.hypot(at[0] - it.x, at[1] - it.y);
      if (!best || d < best.d) best = { id: it.id, d };
    }
    return best?.id ?? null;
  }

  /** If the selected node was moved or turned, snap it (floor height, quarter turns) and report the plan placement. */
  readSelected(): Move | null {
    const id = this.selected;
    const node = id ? this.nodes.get(id) : null;
    const item = id ? this.items.get(id) : null;
    if (!id || !node || !item) return null;
    const q = node.quaternion;
    const yaw = 2 * Math.atan2(q.y, q.w);
    const rotation = rotationFromYaw(yaw);
    const plan: Pt = sceneToPlan(this.frame, node.position);
    const x = Math.round(plan[0] * 20) / 20;
    const y = Math.round(plan[1] * 20) / 20;
    const sig = `${x.toFixed(3)},${y.toFixed(3)},${rotation}`;
    const moved = Math.abs(plan[0] - item.x) > 0.02 || Math.abs(plan[1] - item.y) > 0.02 || rotation !== item.rotation;
    if (!moved) return null;
    const next = { ...item, x, y, rotation };
    this.items.set(id, next);
    this.lastSaved.set(id, sig);
    this.put(node, next);
    return { id, x, y, rotation };
  }

  private teardown() {
    if (this.sceneObject) {
      try {
        if (this.control) this.control.inputs.selection = null;
        this.sceneObject.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sceneObject = null;
    this.control = null;
    this.nodes.clear();
    this.lastSaved.clear();
    this.key = "";
  }

  dispose() {
    this.disposed = true;
    this.teardown();
  }
}
