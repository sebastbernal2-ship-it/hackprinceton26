"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import {
  diningCenter,
  displayLabel,
  findKitchen,
  hitsWall,
  layoutWalls,
  roomAtPoint,
  roomFocus,
  wallSegments,
  type FloorLayout,
  type RoomPolygon,
  type RoomRect,
} from "../lib/floor-layout";
import { makeFurniture } from "../lib/furniture-mesh";
import { labelsMatch } from "../lib/layout-fit";
import type { StagedPiece } from "../lib/tour-scene";

type ViewMode = "dollhouse" | "inside" | "floorplan";

type ForegroundTourProps = {
  title: string;
  detail?: string;
  squareFeet: number;
  layout: FloorLayout;
  pieces: StagedPiece[];
};

function floorColor(entry: RoomRect): number {
  const label = entry.label.toLowerCase();
  if (entry.kind === "freezer" && !entry.absorbed) return 0x243028;
  if (entry.kind === "kitchen" || entry.absorbed) return 0x45403b;
  if (entry.kind === "dining") return 0x6a5140;
  if (/bath|restroom|toilet/.test(label)) return 0x3c4650;
  if (/bar/.test(label)) return 0x5a4034;
  if (/office/.test(label)) return 0x4a453c;
  if (/front|entry|foyer/.test(label)) return 0x5c564e;
  if (/stor/.test(label)) return 0x3a3834;
  return 0x4e4944;
}

const WALL: Record<string, number> = {
  shell: 0xe7e0d4,
  divider: 0xf7f3ec,
  freezer: 0xd9512c,
};

export default function ForegroundTour({ title, detail, squareFeet, layout, pieces }: ForegroundTourProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef(layout);
  const piecesRef = useRef(pieces);
  const viewRef = useRef<ViewMode>("dollhouse");
  const enterRef = useRef<string | null>(null);
  const [view, setView] = useState<ViewMode>("dollhouse");
  layoutRef.current = layout;
  piecesRef.current = pieces;
  viewRef.current = view;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x141413);
    const canvas = renderer.domElement;
    canvas.className = "h-full w-full touch-none";
    mount.appendChild(canvas);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x141413, 48, 160);
    const content = new THREE.Group();
    scene.add(content);
    scene.add(new THREE.HemisphereLight(0xfff8ee, 0x2a241e, 1.15));
    const sun = new THREE.DirectionalLight(0xfff3e2, 1.45);
    sun.position.set(14, 22, 10);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xd7e0ea, 0.35);
    fill.position.set(-10, 8, -6);
    scene.add(fill);

    const persp = new THREE.PerspectiveCamera(52, 1, 0.08, 200);
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    const ceiling = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.06, 1),
      new THREE.MeshStandardMaterial({ color: 0xd9d3c7, roughness: 1 }),
    );
    ceiling.visible = false;
    scene.add(ceiling);

    const shown: FloorLayout = structuredClone(layoutRef.current);
    const player = { ...diningCenter(shown), yaw: -Math.PI / 2, pitch: -0.08 };
    const keys = new Set<string>();
    let orbitYaw = -0.55;
    let orbitPitch = 0.72;
    let orbitDist = 1.15;
    let planZoom = 1;
    let dragging = false;
    let moved = false;
    let lastX = 0;
    let lastY = 0;
    let builtView: ViewMode | null = null;
    let previous = performance.now();
    let frameId = 0;

    function resize() {
      const width = mount!.clientWidth || 1;
      const height = mount!.clientHeight || 1;
      renderer.setSize(width, height, false);
      persp.aspect = width / height;
      persp.updateProjectionMatrix();
    }

    let floorTex: THREE.Texture | null = null;
    let floorHref = "";
    let texStamp = 0;
    let builtTex = -1;
    let meshHref = "";
    const reference = new THREE.Group();
    scene.add(reference);

    let structureDirty = false;
    let builtPieces = "";
    let motion: { from: FloorLayout; to: FloorLayout; toKey: string; started: number } | null = null;

    function changedEnough() {
      const target = layoutRef.current;
      if (piecesRef.current.map((piece) => piece.id).join("|") !== builtPieces) return true;
      if (structureDirty) {
        structureDirty = false;
        return true;
      }
      if (viewRef.current !== builtView) return true;
      if (texStamp !== builtTex) return true;
      if ((shown.geometryKey || "") !== (target.geometryKey || "")) return true;
      if (shown.rooms.length !== target.rooms.length) return true;
      return shown.rooms.some((entry, index) => {
        const next = target.rooms[index];
        return (
          !next ||
          entry.id !== next.id ||
          entry.absorbed !== next.absorbed ||
          Math.abs(entry.w - next.w) > 0.004 ||
          Math.abs(entry.d - next.d) > 0.004 ||
          Math.abs(entry.x - next.x) > 0.004 ||
          Math.abs(entry.z - next.z) > 0.004
        );
      });
    }

    function ensureAssets() {
      const href = layoutRef.current.floorplan?.href || "";
      if (href && href !== floorHref) {
        floorHref = href;
        new THREE.TextureLoader().load(href, (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          floorTex = texture;
          texStamp += 1;
        });
      }
      const nextMesh = layoutRef.current.meshHref || "";
      if (!nextMesh || nextMesh === meshHref) return;
      meshHref = nextMesh;
      const format = layoutRef.current.meshFormat || "";
      const loader = format === "gltf" ? new GLTFLoader() : new OBJLoader();
      loader.load(nextMesh, (loaded) => {
        const object = loaded instanceof THREE.Object3D ? loaded : loaded.scene;
        object.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          const source = child.geometry.getAttribute("position");
          if (source) {
            child.geometry = child.geometry.clone();
            const position = child.geometry.getAttribute("position");
            for (let index = 0; index < position.count; index += 1) {
              const across = position.getY(index);
              position.setY(index, position.getZ(index));
              position.setZ(index, across);
            }
            position.needsUpdate = true;
            child.geometry.computeVertexNormals();
          }
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          for (const material of materials) {
            material.transparent = true;
            material.opacity = 0.18;
            material.depthWrite = false;
            material.side = THREE.DoubleSide;
          }
        });
        reference.clear();
        reference.add(object);
        texStamp += 1;
      });
    }

    function rebuild() {
      disposeObject(content);
      content.clear();
      builtTex = texStamp;
      builtPieces = piecesRef.current.map((piece) => piece.id).join("|");
      const align = shown.meshAlign;
      reference.scale.setScalar(align?.scale || 1);
      reference.position.set(align?.x || 0, 0, align?.z || 0);
      const pad = 0.45;
      addBox(content, -pad, -0.12, -pad, shown.width + pad * 2, 0.08, shown.depth + pad * 2, 0x171614);
      let draw = shown;
      let from: FloorLayout | null = null;
      let progress = 1;
      if (!motion) canvas.dataset.motion = "settled";
      if (motion) {
        progress = Math.min(1, (performance.now() - motion.started) / 1600);
        canvas.dataset.motion = "playing";
        from = motion.from;
        draw = motion.to;
        if (progress >= 1) {
          Object.assign(shown, structuredClone(motion.to));
          motion = null;
          from = null;
          draw = shown;
          progress = 1;
          canvas.dataset.motion = "settled";
        }
      }
      if (draw.polygons?.length) {
        drawPlan(content, draw, floorTex, viewRef.current !== "inside", from, easeOut(progress), viewRef.current);
        drawFurniture(content, draw, piecesRef.current);
        ceiling.scale.set(Math.max(draw.width - 0.24, 0.1), 1, Math.max(draw.depth - 0.24, 0.1));
        ceiling.position.set(draw.width / 2, draw.height + 0.03, draw.depth / 2);
        builtView = viewRef.current;
        return;
      }
      for (const tile of shown.tiles) {
        addBox(content, tile.x, 0.01, tile.z, tile.w, 0.04, tile.d, 0x6a5140);
      }
      for (const entry of shown.rooms) {
        if (entry.d < 0.18 || entry.w < 0.18) continue;
        addBox(content, entry.x + 0.02, 0.02, entry.z + 0.02, entry.w - 0.04, 0.05, entry.d - 0.04, floorColor(entry));
        if (viewRef.current !== "inside" && !entry.absorbed && entry.w > 1.1 && entry.d > 1.1) {
          const sprite = makeLabel(displayLabel(entry.label));
          sprite.position.set(entry.x + entry.w / 2, shown.height * 0.72, entry.z + entry.d / 2);
          const scale = labelWidth(Math.max(entry.w, entry.d), viewRef.current);
          sprite.scale.set(scale, scale * (280 / 1024), 1);
          content.add(sprite);
        }
      }
      drawFurniture(content, shown, piecesRef.current);
      for (const wall of layoutWalls(shown)) {
        addBox(content, wall.x, 0.05, wall.z, wall.w, shown.height, wall.d, WALL[wall.role]);
      }
      ceiling.scale.set(Math.max(shown.width - 0.24, 0.1), 1, Math.max(shown.depth - 0.24, 0.1));
      ceiling.position.set(shown.width / 2, shown.height + 0.03, shown.depth / 2);
      builtView = viewRef.current;
    }

    function lerpLayout(delta: number) {
      const target = layoutRef.current;
      const same =
        (shown.geometryKey || "") === (target.geometryKey || "") &&
        shown.rooms.length === target.rooms.length &&
        shown.rooms.every((entry, index) => entry.id === target.rooms[index].id);
      if (!same) {
        if (!motion || motion.toKey !== (target.geometryKey || "")) {
          motion = {
            from: structuredClone(shown),
            to: structuredClone(target),
            toKey: target.geometryKey || "",
            started: performance.now(),
          };
        }
        structureDirty = true;
        return;
      }
      const blend = 1 - Math.pow(0.0015, delta);
      shown.width += (target.width - shown.width) * blend;
      shown.depth += (target.depth - shown.depth) * blend;
      shown.freezerRemoved = target.freezerRemoved;
      shown.rooms.forEach((entry, index) => {
        const next = target.rooms[index];
        entry.absorbed = next.absorbed;
        entry.label = next.label;
        entry.kind = next.kind;
        entry.x += (next.x - entry.x) * blend;
        entry.z += (next.z - entry.z) * blend;
        entry.w += (next.w - entry.w) * blend;
        entry.d += (next.d - entry.d) * blend;
      });
    }

    function stepPlayer(delta: number) {
      let forward = 0;
      let strafe = 0;
      if (keys.has("w") || keys.has("arrowup")) forward += 1;
      if (keys.has("s") || keys.has("arrowdown")) forward -= 1;
      if (keys.has("d") || keys.has("arrowright")) strafe += 1;
      if (keys.has("a") || keys.has("arrowleft")) strafe -= 1;
      if (forward === 0 && strafe === 0) return;
      const speed = (keys.has("shift") ? 6.2 : 3.4) * delta;
      const sin = Math.sin(player.yaw);
      const cos = Math.cos(player.yaw);
      const dx = (-sin * forward + cos * strafe) * speed;
      const dz = (-cos * forward - sin * strafe) * speed;
      const radius = 0.32;
      const solid = layoutRef.current;
      if (!hitsWall(solid, player.x + dx, player.z, radius)) player.x += dx;
      if (!hitsWall(solid, player.x, player.z + dz, radius)) player.z += dz;
    }

    function enterRoom(id: string) {
      const kitchen = findKitchen(shown);
      const resolved = !id || id === "dining" ? (shown.rooms.find((entry) => entry.kind === "dining" && !entry.absorbed)?.id ?? "") : id;
      const spot = roomFocus(shown, resolved) ?? diningCenter(shown);
      if (id && id !== "dining" && !roomFocus(shown, resolved)) return;
      player.x = spot.x;
      player.z = spot.z;
      const focus = kitchen && kitchen.id !== resolved ? roomFocus(shown, kitchen.id) : null;
      if (focus) {
        player.yaw = Math.atan2(-(focus.x - player.x), -(focus.z - player.z));
      }
      player.pitch = -0.05;
      viewRef.current = "inside";
      setView("inside");
    }

    function raycastRoom(camera: THREE.Camera): string | null {
      const box = canvas.getBoundingClientRect();
      const pointer = new THREE.Vector2(((lastX - box.left) / box.width) * 2 - 1, -((lastY - box.top) / box.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(pointer, camera);
      if (Math.abs(ray.ray.direction.y) < 1e-4) return null;
      const distance = (0.05 - ray.ray.origin.y) / ray.ray.direction.y;
      if (distance < 0) return null;
      const point = ray.ray.origin.clone().addScaledVector(ray.ray.direction, distance);
      return roomAtPoint(shown, point.x, point.z);
    }

    function render(now: number) {
      if (enterRef.current) {
        const id = enterRef.current;
        enterRef.current = null;
        enterRoom(id);
      }
      const delta = Math.min(0.05, (now - previous) / 1000);
      previous = now;
      ensureAssets();
      lerpLayout(delta);
      ceiling.visible = viewRef.current === "inside";
      if (viewRef.current === "inside") {
        stepPlayer(delta);
        if (hitsWall(layoutRef.current, player.x, player.z, 0.28)) {
          const home = diningCenter(shown);
          player.x = home.x;
          player.z = home.z;
        }
      }
      if (changedEnough()) rebuild();

      const cx = shown.width / 2;
      const cz = shown.depth / 2;
      if (viewRef.current === "inside") {
        persp.position.set(player.x, 1.62, player.z);
        persp.rotation.order = "YXZ";
        persp.rotation.y = player.yaw;
        persp.rotation.x = player.pitch;
        persp.rotation.z = 0;
        renderer.render(scene, persp);
      } else if (viewRef.current === "floorplan") {
        const span = Math.max(shown.width, shown.depth) * 0.62 * planZoom;
        const aspect = persp.aspect || 1;
        ortho.left = -span * aspect;
        ortho.right = span * aspect;
        ortho.top = span;
        ortho.bottom = -span;
        ortho.near = 0.1;
        ortho.far = 80;
        ortho.position.set(cx, 40, cz);
        ortho.up.set(0, 0, -1);
        ortho.lookAt(cx, 0, cz);
        ortho.updateProjectionMatrix();
        renderer.render(scene, ortho);
      } else {
        const dist = Math.max(shown.width, shown.depth) * orbitDist;
        const horizontal = Math.cos(orbitPitch) * dist;
        persp.position.set(
          cx + Math.sin(orbitYaw) * horizontal,
          Math.sin(orbitPitch) * dist + 1.2,
          cz + Math.cos(orbitYaw) * horizontal,
        );
        persp.lookAt(cx, 0.7, cz);
        renderer.render(scene, persp);
      }
      frameId = requestAnimationFrame(render);
    }

    function onPointerDown(event: PointerEvent) {
      if (event.button !== 0) return;
      dragging = true;
      moved = false;
      lastX = event.clientX;
      lastY = event.clientY;
    }
    function onPointerMove(event: PointerEvent) {
      if (!dragging) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      lastX = event.clientX;
      lastY = event.clientY;
      if (viewRef.current === "inside") {
        player.yaw -= dx * 0.005;
        player.pitch = Math.max(-1.05, Math.min(0.65, player.pitch - dy * 0.004));
      } else if (viewRef.current === "dollhouse") {
        orbitYaw -= dx * 0.005;
        orbitPitch = Math.max(0.28, Math.min(1.25, orbitPitch + dy * 0.004));
      }
    }
    function onPointerUp() {
      if (dragging && !moved && viewRef.current !== "inside") {
        enterRoom(raycastRoom(viewRef.current === "floorplan" ? ortho : persp) ?? "dining");
      }
      dragging = false;
    }
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const step = Math.exp(event.deltaY * 0.001);
      if (viewRef.current === "floorplan") planZoom = Math.max(0.55, Math.min(2.4, planZoom * step));
      else orbitDist = Math.max(0.72, Math.min(2.15, orbitDist * step));
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      keys.add(event.key.toLowerCase());
    }
    function onKeyUp(event: KeyboardEvent) {
      keys.delete(event.key.toLowerCase());
    }

    resize();
    rebuild();
    frameId = requestAnimationFrame(render);
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      disposeObject(content);
      reference.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          const material = child.material;
          if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
          else material.dispose();
        }
      });
      floorTex?.dispose();
      ceiling.geometry.dispose();
      (ceiling.material as THREE.Material).dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, [enterRef]);

  const dining = layout.rooms.find((entry) => entry.kind === "dining");
  const number = new Intl.NumberFormat("en-US");

  return (
    <div
      className="absolute inset-0 bg-[#141413] text-background"
      data-freezer={layout.freezerRemoved ? "gone" : layout.rooms.some((entry) => entry.kind === "freezer") ? "present" : "none"}
      data-dining-width={dining ? dining.w.toFixed(2) : ""}
      data-dining-depth={dining ? dining.d.toFixed(2) : ""}
      data-wall-shift={(layout.wallShift ?? 0).toFixed(2)}
      data-rooms={layout.rooms
        .filter((entry) => !entry.absorbed)
        .map((entry) => entry.label)
        .join(" | ")}
    >
      <div ref={mountRef} className="absolute inset-0" />
      <p className="pointer-events-none absolute left-5 top-16 z-20 text-sm text-background/55">
        {title}
        {detail ? ` · ${detail}` : ""} · {number.format(squareFeet)} sq ft
      </p>
      <div className="pointer-events-none absolute bottom-5 left-5 right-5 z-20 flex items-end justify-between gap-4">
        <div className="pointer-events-auto ml-10 flex items-center rounded-full bg-[#ece7dd] p-1 text-foreground shadow-[0_10px_30px_rgb(0_0_0/0.28)]">
          {(
            [
              ["dollhouse", "Dollhouse"],
              ["inside", "Inside"],
              ["floorplan", "Floorplan"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                if (mode === "inside") {
                  enterRef.current = layout.rooms.find((entry) => entry.kind === "dining" && !entry.absorbed)?.id ?? "";
                }
                setView(mode);
              }}
              aria-pressed={view === mode}
              className={`rounded-full px-3.5 py-2 text-sm font-medium tracking-tight ${
                view === mode ? "bg-background text-foreground" : "text-foreground/65 hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="hidden text-sm text-background/70 sm:block">
          {view === "inside"
            ? "Drag to look · WASD to walk"
            : view === "floorplan"
              ? "Click a room to walk inside"
              : "Drag to orbit · click a room to walk inside"}
        </p>
      </div>
    </div>
  );
}

function drawPlan(
  group: THREE.Group,
  layout: FloorLayout,
  texture: THREE.Texture | null,
  showLabels: boolean,
  previous: FloorLayout | null,
  progress: number,
  view: ViewMode,
) {
  const frame = layout.floorplan;
  if (frame && texture && frame.widthM > 0.1 && frame.depthM > 0.1) {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(frame.widthM, frame.depthM),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 1 }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(frame.originX + frame.widthM / 2, 0.02, frame.originZ + frame.depthM / 2);
    group.add(plane);
  }
  const edited = layout.freezerRemoved || Math.abs(layout.wallShift ?? 0) > 0.05;
  for (const poly of layout.polygons ?? []) {
    const cover = poly.absorbed && poly.kind === "freezer";
    if (poly.absorbed && !cover) continue;
    const painted = cover ? { ...poly, kind: "kitchen" as const, absorbed: true } : poly;
    const strong = !texture || (edited && (painted.kind === "kitchen" || painted.kind === "dining" || cover));
    addPolygonFloor(group, painted, strong ? 0.94 : 0.34, cover ? 0.05 : 0.04);
    if (!showLabels || poly.absorbed || poly.points.length < 3) continue;
    const box = poly.points.reduce(
      (span, point) => ({
        minX: Math.min(span.minX, point.x),
        maxX: Math.max(span.maxX, point.x),
        minZ: Math.min(span.minZ, point.z),
        maxZ: Math.max(span.maxZ, point.z),
      }),
      { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
    );
    if (box.maxX - box.minX < 1.1 || box.maxZ - box.minZ < 1.1) continue;
    const sprite = makeLabel(displayLabel(poly.label));
    const center = poly.points.reduce((sum, point) => ({ x: sum.x + point.x, z: sum.z + point.z }), { x: 0, z: 0 });
    sprite.position.set(center.x / poly.points.length, layout.height * 0.78, center.z / poly.points.length);
    const scale = labelWidth(Math.max(box.maxX - box.minX, box.maxZ - box.minZ), view);
    sprite.scale.set(scale, scale * (280 / 1024), 1);
    group.add(sprite);
  }
  drawWalls(group, previous && progress < 1 ? previous : null, layout, progress);
}

function drawFurniture(group: THREE.Group, layout: FloorLayout, pieces: StagedPiece[]) {
  const used = new Map<string, number>();
  for (const piece of pieces) {
    const spot = furnitureSpot(layout, piece.room || "");
    if (!spot) continue;
    const count = used.get(spot.id) ?? 0;
    used.set(spot.id, count + 1);
    const width = piece.width || 1;
    const depth = piece.depth || 1;
    const x = spot.x + (count % 3) * (width + 0.35);
    const z = spot.z + Math.floor(count / 3) * (depth + 0.35);
    const model = makeFurniture(piece.kind, width, depth);
    model.position.set(x, 0.02, z);
    group.add(model);
  }
}

function furnitureSpot(layout: FloorLayout, room: string): { id: string; x: number; z: number } | null {
  const poly = (layout.polygons ?? []).find((entry) => !entry.absorbed && labelsMatch(entry.label, room));
  if (poly && poly.points.length >= 3) {
    const center = poly.points.reduce((sum, point) => ({ x: sum.x + point.x, z: sum.z + point.z }), { x: 0, z: 0 });
    return { id: poly.id, x: center.x / poly.points.length, z: center.z / poly.points.length };
  }
  const rect = layout.rooms.find((entry) => !entry.absorbed && (room ? labelsMatch(entry.label, room) : entry.kind === "dining"));
  if (!rect) return null;
  return { id: rect.id, x: rect.x + rect.w / 2, z: rect.z + rect.d / 2 };
}

function addPolygonFloor(group: THREE.Group, poly: RoomPolygon, opacity: number, y: number) {
  if (poly.points.length < 3) return;
  const shape = new THREE.Shape(poly.points.map((point) => new THREE.Vector2(point.x, -point.z)));
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: floorColor({
        id: poly.id,
        label: poly.label,
        kind: poly.kind,
        x: 0,
        z: 0,
        w: 1,
        d: 1,
        absorbed: poly.absorbed,
      }),
      roughness: 1,
      transparent: opacity < 0.99,
      opacity,
    }),
  );
  mesh.position.y = y;
  group.add(mesh);
}

function drawWalls(group: THREE.Group, previous: FloorLayout | null, next: FloorLayout, progress: number) {
  const upcoming = wallSegments(next);
  if (!previous) {
    for (const segment of upcoming) addSegment(group, segment, next.height, next.thickness, WALL[segment.role], 1);
    return;
  }
  const before = wallSegments(previous);
  const claimed = new Set<number>();
  for (const segment of before) {
    const match = upcoming.findIndex((candidate, index) => !claimed.has(index) && sameWall(segment, candidate));
    if (match >= 0) {
      claimed.add(match);
      addSegment(group, slideWall(segment, upcoming[match], progress), next.height, next.thickness, WALL[upcoming[match].role], 1);
      continue;
    }
    const height = next.height * (1 - progress);
    if (height < 0.05) continue;
    addSegment(group, segment, height, next.thickness, 0xd9512c, 1 - progress * 0.35);
  }
  upcoming.forEach((segment, index) => {
    if (claimed.has(index)) return;
    addSegment(group, segment, next.height * progress, next.thickness, WALL[segment.role], progress);
  });
}

function sameWall(
  left: { x1: number; z1: number; x2: number; z2: number },
  right: { x1: number; z1: number; x2: number; z2: number },
) {
  const leftSpan = Math.hypot(left.x2 - left.x1, left.z2 - left.z1) || 1;
  const rightSpan = Math.hypot(right.x2 - right.x1, right.z2 - right.z1) || 1;
  const dot = Math.abs(
    ((left.x2 - left.x1) / leftSpan) * ((right.x2 - right.x1) / rightSpan) +
      ((left.z2 - left.z1) / leftSpan) * ((right.z2 - right.z1) / rightSpan),
  );
  const distance = Math.hypot((left.x1 + left.x2) / 2 - (right.x1 + right.x2) / 2, (left.z1 + left.z2) / 2 - (right.z1 + right.z2) / 2);
  return dot > 0.85 && distance < 2.4 && Math.abs(leftSpan - rightSpan) < Math.max(leftSpan, rightSpan) * 0.6;
}

function slideWall(
  from: { x1: number; z1: number; x2: number; z2: number },
  to: { x1: number; z1: number; x2: number; z2: number },
  progress: number,
) {
  const flip = (from.x2 - from.x1) * (to.x2 - to.x1) + (from.z2 - from.z1) * (to.z2 - to.z1) < 0;
  const x2 = flip ? to.x1 : to.x2;
  const z2 = flip ? to.z1 : to.z2;
  const x1 = flip ? to.x2 : to.x1;
  const z1 = flip ? to.z2 : to.z1;
  return {
    x1: from.x1 + (x1 - from.x1) * progress,
    z1: from.z1 + (z1 - from.z1) * progress,
    x2: from.x2 + (x2 - from.x2) * progress,
    z2: from.z2 + (z2 - from.z2) * progress,
  };
}

function easeOut(value: number) {
  return 1 - (1 - value) ** 3;
}

function labelWidth(span: number, view: ViewMode) {
  const cap = view === "floorplan" ? 12 : 9;
  return Math.min(Math.max(span, 4.4) * 1.2, cap);
}
function addSegment(
  group: THREE.Group,
  segment: { x1: number; z1: number; x2: number; z2: number },
  height: number,
  thickness: number,
  color: number,
  opacity = 1,
) {
  const dx = segment.x2 - segment.x1;
  const dz = segment.z2 - segment.z1;
  const length = Math.hypot(dx, dz);
  if (length < 0.05 || height < 0.04) return;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(length, height, Math.max(thickness, 0.08)),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.86,
      transparent: opacity < 0.98,
      opacity,
    }),
  );
  mesh.position.set((segment.x1 + segment.x2) / 2, height / 2, (segment.z1 + segment.z2) / 2);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(dx / length, 0, dz / length));
  group.add(mesh);
}

function addBox(group: THREE.Group, x: number, y: number, z: number, w: number, h: number, d: number, color: number) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(w, 0.01), Math.max(h, 0.01), Math.max(d, 0.01)),
    new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 }),
  );
  mesh.position.set(x + w / 2, y + h / 2, z + d / 2);
  group.add(mesh);
}

function makeLabel(text: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 280;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.Sprite();
  context.fillStyle = "rgba(244,241,234,0.94)";
  context.beginPath();
  context.roundRect(20, 34, 984, 212, 106);
  context.fill();
  context.fillStyle = "#1b1a17";
  context.textAlign = "center";
  context.textBaseline = "middle";
  let size = 112;
  context.font = `600 ${size}px sans-serif`;
  while (context.measureText(text).width > 920 && size > 68) {
    size -= 6;
    context.font = `600 ${size}px sans-serif`;
  }
  context.fillText(text, canvas.width / 2, canvas.height / 2 + 6);
  const material = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas),
    transparent: true,
    depthTest: false,
  });
  return new THREE.Sprite(material);
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const material = child.material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material.dispose();
    }
    if (child instanceof THREE.Sprite) {
      child.material.map?.dispose();
      child.material.dispose();
    }
  });
}
