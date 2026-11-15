"use client";
/* Spike page (app/lab/3d): reads the SDK handle ref in click handlers built during render. Not on the product path. */
/* eslint-disable react-hooks/refs */

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Spike: self-hosted Matterport Web Component (Bundle SDK, Scene API).
 * Assets live in public/matterport (copied from node_modules/@matterport/webcomponent/built-bundle).
 * Everything is also exposed on window.__lab so it can be driven from DevTools.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Sdk = any;
type Vec3 = { x: number; y: number; z: number };

const GLB_URL = "/models/sheen-chair.glb";
// Resolved against the page URL, so it must be root-absolute on nested routes.
const ASSET_BASE = "/matterport";

type RoomInfo = { id: string; label: string; min: Vec3; max: Vec3; size: Vec3; center: Vec3 };

/** the lab's controls (not a window global: those are development only) */
let labApi: any = null;

export function Lab3D({ siteId, modelId, sdkKey }: { siteId: string; modelId: string; sdkKey: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sdkRef = useRef<Sdk>(null);
  const objRef = useRef<{ node: any; control: any; sceneObject: any } | null>(null);
  const pointerRef = useRef<{ position: Vec3; normal: Vec3; object: string; floorIndex?: number } | null>(null);
  const [status, setStatus] = useState("loading web component");
  const [log, setLog] = useState<string[]>([]);
  const [fps, setFps] = useState(0);
  const [views, setViews] = useState<{ id: string; name: string; type: string; active: boolean }[]>([]);
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [shot, setShot] = useState<string | null>(null);

  const say = useCallback((m: string) => {
    console.info(`[lab3d] ${m}`);
    setLog((l) => [...l.slice(-13), m]);
  }, []);

  // rough FPS of the page's main thread (the viewer renders on it)
  useEffect(() => {
    let n = 0;
    let t0 = performance.now();
    let raf = 0;
    const tick = () => {
      n++;
      const t = performance.now();
      if (t - t0 >= 1000) {
        const v = Math.round((n * 1000) / (t - t0));
        setFps(v);
        if (process.env.NODE_ENV !== "production") (window as any).__labFps = v;
        n = 0;
        t0 = t;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const subs: { cancel(): void }[] = [];
    const viewObjs = new Map<string, any>();
    (async () => {
      try {
        // @ts-expect-error the package "exports" map hides its types.d.ts
        await import("@matterport/webcomponent");
        if (cancelled || !hostRef.current) return;
        const el = document.createElement("matterport-viewer") as HTMLElement & { playingPromise: Promise<Sdk> };
        el.setAttribute("m", modelId);
        el.setAttribute("application-key", sdkKey);
        el.setAttribute("asset-base", ASSET_BASE);
        el.setAttribute("qs", "1");
        el.setAttribute("play", "1");
        el.style.cssText = "display:block;width:100%;height:100%";
        hostRef.current.replaceChildren(el);
        setStatus("connecting");
        const t0 = performance.now();
        const sdk = await el.playingPromise;
        if (cancelled) return;
        sdkRef.current = sdk;
        setStatus("playing");
        say(`playing after ${Math.round(performance.now() - t0)} ms`);
        const model = await sdk.Model.getData();
        say(`model ${model.sid}, ${model.sweeps?.length ?? "?"} sweeps`);

        subs.push(
          sdk.Pointer.intersection.subscribe((i: any) => {
            pointerRef.current = { position: { ...i.position }, normal: { ...i.normal }, object: i.object, floorIndex: i.floorIndex };
          }),
        );
        subs.push(
          sdk.View.views.subscribe({
            onCollectionUpdated(c: Record<string, any>) {
              viewObjs.clear();
              for (const v of Object.values(c)) viewObjs.set(v.id, v);
              setViews(Object.values(c).map((v: any) => ({ id: v.id, name: v.name, type: v.type, active: v.active })));
            },
          }),
        );
        subs.push(
          sdk.Room.data.subscribe({
            onCollectionUpdated(c: Record<string, any>) {
              setRooms(
                Object.values(c).map((r: any) => ({
                  id: r.id,
                  label: r.label,
                  min: { ...r.bounds.min },
                  max: { ...r.bounds.max },
                  size: { ...r.size },
                  center: { ...r.center },
                })),
              );
            },
          }),
        );

        const snapshotViews = () => [...viewObjs.values()].map((v) => ({ id: v.id, name: v.name, type: v.type, active: v.active }));
        const api = {
          sdk,
          el,
          pointer: () => pointerRef.current,
          obj: () => objRef.current,
          views: snapshotViews,
          async setView(type: string) {
            const v = [...viewObjs.values()].find((x) => x.type === type);
            if (!v) throw new Error(`no view of type ${type}`);
            await v.setActive(false);
            setViews(snapshotViews());
            say(`view active: ${v.name} (${v.type})`);
            return { id: v.id, name: v.name, type: v.type };
          },
          /** world point under a screen position (px inside the viewer) */
          floorAt(x: number, y: number) {
            return sdk.Renderer.getWorldPositionData({ x, y });
          },
          async place(position: Vec3) {
            if (objRef.current) objRef.current.sceneObject.stop();
            const [sceneObject] = await sdk.Scene.createObjects(1);
            sceneObject.addNode().addComponent("mp.lights");
            const node = sceneObject.addNode();
            node.addComponent(sdk.Scene.Component.GLTF_LOADER, { url: GLB_URL });
            node.position.set(position.x, position.y, position.z);
            const control = sceneObject.addNode().addComponent(sdk.Scene.Component.TRANSFORM_CONTROLS);
            sceneObject.start();
            objRef.current = { node, control, sceneObject };
            say(`placed GLB at ${fmt(position)}`);
            return true;
          },
          gizmo(mode: "translate" | "rotate" | "off") {
            const o = objRef.current;
            if (!o) throw new Error("place an object first");
            const c = o.control.inputs;
            // 0.1.47 has no `visible` input (the .d.ts lists one; inputs is non-extensible and throws). Hide by clearing selection.
            if (mode === "off") {
              c.selection = null;
              return;
            }
            c.selection = o.node;
            c.mode = mode;
            // translate on the floor plane (X/Z only); rotate about Y only
            c.showX = mode === "translate";
            c.showZ = mode === "translate";
            c.showY = mode === "rotate";
            say(`gizmo ${mode}`);
          },
          transform() {
            const o = objRef.current;
            if (!o) return null;
            const p = o.node.position;
            const r = o.node.quaternion;
            return { position: { x: p.x, y: p.y, z: p.z }, quaternion: { x: r.x, y: r.y, z: r.z, w: r.w } };
          },
          async measure(a: Vec3, b: Vec3, label: string) {
            const [m] = await sdk.Measurements.add({ points: [a, b], label });
            say(`measurement ${label}: ${m?.totalLength?.toFixed?.(2)} m`);
            return { id: m?.id, totalLength: m?.totalLength, label: m?.label };
          },
          async screenshot(width = 1920, height = 1080) {
            const data: string = await sdk.Renderer.takeScreenShot({ width, height }, { mattertags: false, sweeps: false });
            setShot(data);
            say(`screenshot ${width}x${height}, ${Math.round(data.length / 1024)} kB base64`);
            return data;
          },
        };
        labApi = api;
        // a DevTools handle, development only
        if (process.env.NODE_ENV !== "production") (window as any).__lab = api;
      } catch (err) {
        console.error("[lab3d] failed", err);
        setStatus(`error: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
    return () => {
      cancelled = true;
      subs.forEach((s) => s.cancel());
    };
  }, [modelId, sdkKey, say]);

  const lab = () => labApi;
  const run = (f: () => Promise<unknown> | unknown) => () =>
    void Promise.resolve()
      .then(f)
      .catch((e) => say(`error: ${e instanceof Error ? e.message : String(e)}`));

  const placeInFront = async () => {
    const host = hostRef.current!;
    const hit = await lab().floorAt(host.clientWidth / 2, host.clientHeight * 0.75);
    const p = hit?.position ?? pointerRef.current?.position;
    if (!p) throw new Error("no floor hit");
    await lab().place(p);
  };

  const measureRoom = async () => {
    const pose = await sdkRef.current.Camera.getPose();
    const r = rooms.find((x) => inside(pose.position, x)) ?? rooms[0];
    if (!r) throw new Error("no rooms");
    const y = r.min.y + 0.05;
    await lab().measure({ x: r.min.x, y, z: r.center.z }, { x: r.max.x, y, z: r.center.z }, "Room width");
  };

  const btn = "rounded-sm border border-neutral-600 px-2 py-1 text-xs hover:bg-neutral-800 disabled:opacity-40";
  const ready = status === "playing";
  return (
    <div className="grid h-dvh grid-cols-[1fr_22rem] bg-neutral-950 text-neutral-100">
      <div ref={hostRef} id="lab-viewer" className="relative h-dvh min-w-0" />
      <aside className="flex h-dvh flex-col gap-3 overflow-y-auto border-l border-neutral-700 p-3 text-xs">
        <div>
          <p className="font-semibold">
            Lab 3D · site {siteId} · model {modelId}
          </p>
          <p data-testid="status">
            status: {status} · {fps} fps
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button className={btn} disabled={!ready} onClick={run(() => lab().setView("viewtype.defurnish"))}>Defurnished</button>
          <button className={btn} disabled={!ready} onClick={run(() => lab().setView("viewtype.layeredbase"))}>Scanned</button>
          <button className={btn} disabled={!ready} onClick={run(placeInFront)}>Place chair</button>
          <button className={btn} disabled={!ready} onClick={run(() => lab().gizmo("translate"))}>Move</button>
          <button className={btn} disabled={!ready} onClick={run(() => lab().gizmo("rotate"))}>Rotate</button>
          <button className={btn} disabled={!ready} onClick={run(() => lab().gizmo("off"))}>Gizmo off</button>
          <button className={btn} disabled={!ready} onClick={run(measureRoom)}>Measure room</button>
          <button className={btn} disabled={!ready} onClick={run(() => lab().screenshot())}>Screenshot</button>
        </div>
        <div>
          <p className="font-semibold">Views</p>
          {views.map((v) => (
            <p key={v.id}>
              {v.active ? "● " : "○ "}
              {v.name} <span className="text-neutral-400">{v.type}</span>
            </p>
          ))}
        </div>
        <div>
          <p className="font-semibold">Rooms ({rooms.length})</p>
          {rooms.map((r) => (
            <p key={r.id}>
              {r.label || r.id}: {r.size.x.toFixed(1)} × {r.size.z.toFixed(1)} m, ceiling {r.size.y.toFixed(2)} m
            </p>
          ))}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {shot ? <img src={shot} alt="Renderer.takeScreenShot output" className="w-full border border-neutral-700" /> : null}
        <pre className="whitespace-pre-wrap text-[0.6875rem] text-neutral-300">{log.join("\n")}</pre>
      </aside>
    </div>
  );
}

function fmt(p: Vec3) {
  return `${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}`;
}
function inside(p: Vec3, r: RoomInfo) {
  return p.x >= r.min.x && p.x <= r.max.x && p.z >= r.min.z && p.z <= r.max.z && p.y >= r.min.y && p.y <= r.max.y;
}
