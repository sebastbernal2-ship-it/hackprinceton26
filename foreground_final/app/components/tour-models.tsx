"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import type { MpSdk } from "@matterport/sdk";
import * as THREE from "three";
import { makeFurniture } from "../lib/furniture-mesh";
import type { StagedPiece } from "../lib/tour-scene";

type SdkPose = Parameters<MpSdk["Conversion"]["worldToScreen"]>[1];

type Convention = { yaw: number; pitch: number; transpose: boolean; view: boolean };

const CONVENTIONS: Convention[] = [
  { yaw: 1, pitch: 1, transpose: false, view: true },
  { yaw: -1, pitch: 1, transpose: false, view: true },
  { yaw: 1, pitch: -1, transpose: false, view: true },
  { yaw: -1, pitch: -1, transpose: false, view: true },
  { yaw: 1, pitch: 1, transpose: true, view: true },
  { yaw: -1, pitch: 1, transpose: true, view: true },
  { yaw: 1, pitch: -1, transpose: true, view: true },
  { yaw: -1, pitch: -1, transpose: true, view: true },
  { yaw: 1, pitch: 1, transpose: false, view: false },
  { yaw: 1, pitch: 1, transpose: true, view: false },
];

export default function TourModels({
  sdk,
  pieces,
  selectedId = null,
  onPieceSelect,
  onPieceMove,
  canStand,
  onPieceRemove,
}: {
  sdk: MpSdk | null;
  pieces: StagedPiece[];
  /** the picked object (outlined) and the callbacks for picking and dragging objects, as in the Imagine tour */
  selectedId?: string | null;
  onPieceSelect?: (id: string | null) => void;
  onPieceMove?: (id: string, offset: { dx: number; dz: number }) => void;
  /** may this object stand at (x, z) in the scan's world? the same rules as the Imagine tour */
  canStand?: (id: string, x: number, z: number) => boolean;
  onPieceRemove?: (id: string) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const handlesRef = useRef<HTMLDivElement>(null);
  const piecesRef = useRef(pieces);
  const selectedRef = useRef(selectedId);
  const callbacks = useRef({ onPieceSelect, onPieceMove, canStand, onPieceRemove });
  useLayoutEffect(() => {
    piecesRef.current = pieces;
    selectedRef.current = selectedId;
    callbacks.current = { onPieceSelect, onPieceMove, canStand, onPieceRemove };
  });

  useEffect(() => {
    const mount = mountRef.current;
    const handleLayer = handlesRef.current;
    if (!mount || !handleLayer || !sdk) return;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.className = "pointer-events-none h-full w-full";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff8ee, 0x3a332c, 1.35));
    const sun = new THREE.DirectionalLight(0xfff3e4, 1.25);
    sun.position.set(6, 10, 4);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 400);
    const content = new THREE.Group();
    scene.add(content);

    const euler = new THREE.Euler(0, 0, 0, "YXZ");
    const sample = new THREE.Vector3();
    const projected = new THREE.Vector3();
    let convention = CONVENTIONS[0];
    let locked = false;
    let poseNow: SdkPose | null = null;
    let built = "";
    let frameId = 0;

    function resize() {
      const width = mount!.clientWidth || 1;
      const height = mount!.clientHeight || 1;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
    }

    function apply(next: Convention) {
      if (!poseNow) return;
      const pose = poseNow;
      if (next.view) {
        camera.matrixAutoUpdate = true;
        camera.position.set(pose.position.x, pose.position.y, pose.position.z);
        euler.set(
          THREE.MathUtils.degToRad(pose.rotation.x) * next.pitch,
          THREE.MathUtils.degToRad(pose.rotation.y) * next.yaw,
          0,
        );
        camera.quaternion.setFromEuler(euler);
        camera.updateMatrixWorld(true);
      } else {
        camera.matrixAutoUpdate = false;
        camera.matrix.identity();
        camera.matrixWorld.identity();
        camera.matrixWorldInverse.identity();
      }
      const values = Array.from(pose.projection);
      if (values.length !== 16) return;
      if (next.transpose) {
        const flipped = values.slice();
        for (let column = 0; column < 4; column += 1) {
          for (let row = 0; row < 4; row += 1) flipped[column * 4 + row] = values[row * 4 + column];
        }
        camera.projectionMatrix.fromArray(flipped);
      } else {
        camera.projectionMatrix.fromArray(values);
      }
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    }

    function projectError() {
      if (!poseNow) return Infinity;
      const width = mount!.clientWidth || 1;
      const height = mount!.clientHeight || 1;
      const yaw = THREE.MathUtils.degToRad(poseNow.rotation.y);
      let best = Infinity;
      for (const sign of [1, -1]) {
        sample.set(
          poseNow.position.x + sign * -Math.sin(yaw) * 2,
          poseNow.position.y - 0.4,
          poseNow.position.z + sign * -Math.cos(yaw) * 2,
        );
        const official = sdk!.Conversion.worldToScreen(sample, poseNow, { w: width, h: height });
        if (!Number.isFinite(official.x) || official.z <= 0) continue;
        projected.copy(sample).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
        const x = (projected.x * 0.5 + 0.5) * width;
        const y = (-projected.y * 0.5 + 0.5) * height;
        best = Math.min(best, Math.hypot(x - official.x, y - official.y));
      }
      return best;
    }

    function syncPose() {
      if (!poseNow) return;
      if (!locked) {
        let best = convention;
        let bestError = Infinity;
        for (const candidate of CONVENTIONS) {
          apply(candidate);
          const error = projectError();
          if (error < bestError) {
            best = candidate;
            bestError = error;
          }
        }
        convention = best;
        if (bestError < 24) locked = true;
        renderer.domElement.dataset.cameraError = Number.isFinite(bestError) ? bestError.toFixed(1) : "";
      }
      apply(convention);
    }

    function syncPieces() {
      const key = piecesRef.current
        .map((piece) => `${piece.id}:${piece.position.x.toFixed(2)}:${piece.position.y.toFixed(2)}:${piece.position.z.toFixed(2)}:${piece.yaw ?? 0}:${piece.offset?.dx ?? 0}:${piece.offset?.dz ?? 0}:${piece.turn ?? 0}`)
        .join("|") + `#${selectedRef.current ?? ""}`;
      if (carry) return; // the dragged model is moved by hand until release
      if (key === built) return;
      built = key;
      disposeGroup(content);
      content.clear();
      for (const piece of piecesRef.current) {
        const model = makeFurniture(piece.kind, piece.width, piece.depth, piece.custom);
        model.position.set(piece.position.x + (piece.offset?.dx ?? 0), piece.position.y, piece.position.z + (piece.offset?.dz ?? 0));
        model.rotation.y = (piece.yaw ?? 0) + (piece.turn ?? 0);
        model.userData.pieceId = piece.id;
        if (piece.id === selectedRef.current) {
          const reach = Math.max(piece.width ?? 1, piece.depth ?? 1) * 0.62;
          const outline = new THREE.Mesh(
            new THREE.RingGeometry(reach, reach + 0.07, 48),
            new THREE.MeshBasicMaterial({ color: 0xd9512c, side: THREE.DoubleSide }),
          );
          outline.rotation.x = -Math.PI / 2;
          outline.position.y = 0.03;
          model.add(outline);
        }
        content.add(model);
      }
    }

    // ---- dragging: an invisible grab handle sits over each object (the Matterport iframe swallows pointer events)
    const handles = new Map<string, HTMLDivElement>();
    const box = new THREE.Box3();
    const corner = new THREE.Vector3();
    let carry: { id: string; model: THREE.Object3D; grab: THREE.Vector3; base: THREE.Vector3; offset: { dx: number; dz: number }; moved: boolean } | null = null;

    function toScreen(point: THREE.Vector3) {
      const width = mount!.clientWidth || 1;
      const height = mount!.clientHeight || 1;
      corner.copy(point).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
      return { x: (corner.x * 0.5 + 0.5) * width, y: (-corner.y * 0.5 + 0.5) * height, z: corner.z };
    }

    /** Where the pointer's ray meets the floor plane at height y (works for either camera convention). */
    function floorHit(clientX: number, clientY: number, y: number): THREE.Vector3 | null {
      const rect = mount!.getBoundingClientRect();
      const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
      const near = new THREE.Vector3(nx, ny, -1).unproject(camera);
      const far = new THREE.Vector3(nx, ny, 1).unproject(camera);
      const dir = far.sub(near);
      if (Math.abs(dir.y) < 1e-6) return null;
      const t = (y - near.y) / dir.y;
      if (t < 0) return null;
      return near.addScaledVector(dir, t);
    }

    function handleFor(id: string) {
      let el = handles.get(id);
      if (el) return el;
      el = document.createElement("div");
      el.className = "absolute cursor-grab rounded-xl pointer-events-auto touch-none";
      el.setAttribute("aria-label", "Drag to move");
      // a small minus tag at the object's top corner: click it to take the object out
      const minus = document.createElement("button");
      minus.type = "button";
      minus.setAttribute("aria-label", "Remove this object");
      minus.className =
        "absolute -right-2.5 -top-2.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#f4f1ea] bg-[#d9512c] text-[#f4f1ea] shadow-sm";
      minus.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 5h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
      minus.addEventListener("pointerdown", (event) => event.stopPropagation());
      minus.addEventListener("click", (event) => {
        event.stopPropagation();
        callbacks.current.onPieceRemove?.(id);
      });
      el.appendChild(minus);
      el.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        const model = content.children.find((child) => child.userData.pieceId === id);
        const piece = piecesRef.current.find((entry) => entry.id === id);
        if (!model || !piece) return;
        const grab = floorHit(event.clientX, event.clientY, model.position.y);
        if (!grab) return;
        event.preventDefault();
        el!.setPointerCapture(event.pointerId);
        el!.style.cursor = "grabbing";
        carry = { id, model, grab, base: model.position.clone(), offset: { dx: piece.offset?.dx ?? 0, dz: piece.offset?.dz ?? 0 }, moved: false };
        callbacks.current.onPieceSelect?.(id);
      });
      el.addEventListener("pointermove", (event) => {
        if (!carry || carry.id !== id) return;
        const hit = floorHit(event.clientX, event.clientY, carry.base.y);
        if (!hit) return;
        carry.moved = true;
        const ok = callbacks.current.canStand ?? (() => true);
        const tx = carry.base.x + hit.x - carry.grab.x;
        const tz = carry.base.z + hit.z - carry.grab.z;
        const cx = carry.model.position.x;
        const cz = carry.model.position.z;
        if (ok(id, tx, tz)) carry.model.position.set(tx, carry.base.y, tz);
        else if (ok(id, tx, cz)) carry.model.position.set(tx, carry.base.y, cz);
        else if (ok(id, cx, tz)) carry.model.position.set(cx, carry.base.y, tz);
      });
      const release = () => {
        if (!carry || carry.id !== id) return;
        const done = carry;
        carry = null;
        el!.style.cursor = "";
        if (done.moved) {
          callbacks.current.onPieceMove?.(id, {
            dx: done.offset.dx + done.model.position.x - done.base.x,
            dz: done.offset.dz + done.model.position.z - done.base.z,
          });
        }
      };
      el.addEventListener("pointerup", release);
      el.addEventListener("pointercancel", release);
      handleLayer!.appendChild(el);
      handles.set(id, el);
      return el;
    }

    /** Keeps each grab handle over its object's on-screen footprint. */
    function syncHandles() {
      const seen = new Set<string>();
      for (const model of content.children) {
        const id = model.userData.pieceId as string | undefined;
        if (!id) continue;
        seen.add(id);
        const el = handleFor(id);
        box.setFromObject(model);
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let visible = true;
        for (const x of [box.min.x, box.max.x]) {
          for (const y of [box.min.y, Math.min(box.max.y, box.min.y + 1.6)]) {
            for (const z of [box.min.z, box.max.z]) {
              const s = toScreen(corner.set(x, y, z).clone());
              if (!(s.z > -1 && s.z < 1)) visible = false;
              minX = Math.min(minX, s.x);
              minY = Math.min(minY, s.y);
              maxX = Math.max(maxX, s.x);
              maxY = Math.max(maxY, s.y);
            }
          }
        }
        const width = maxX - minX;
        const height = maxY - minY;
        if (!visible || !Number.isFinite(width) || width < 4 || width > 4000 || height > 4000) {
          el.style.display = "none";
          continue;
        }
        el.style.display = "block";
        // the minus tag shows on the picked object only, as in the Imagine tour
        const minus = el.querySelector("button");
        if (minus) minus.style.display = selectedRef.current === id ? "flex" : "none";
        el.style.left = `${minX}px`;
        el.style.top = `${minY}px`;
        el.style.width = `${width}px`;
        el.style.height = `${height}px`;
      }
      for (const [id, el] of handles) {
        if (seen.has(id)) continue;
        el.remove();
        handles.delete(id);
      }
    }

    function frame() {
      resize();
      syncPose();
      syncPieces();
      if (poseNow) {
        renderer.render(scene, camera);
        syncHandles();
      }
      frameId = requestAnimationFrame(frame);
    }

    const subscription = sdk.Camera.pose.subscribe((pose) => {
      poseNow = pose;
    });
    resize();
    frameId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(frameId);
      subscription.cancel();
      disposeGroup(content);
      renderer.dispose();
      renderer.domElement.remove();
      for (const el of handles.values()) el.remove();
      handles.clear();
    };
  }, [sdk]);

  useEffect(() => {
    if (!sdk) return;
    const ids = pieces.flatMap((piece) => (piece.tagId ? [piece.tagId] : []));
    if (ids.length) void sdk.Tag.remove(...ids).catch(() => {});
  }, [sdk, pieces]);

  return (
    <>
      <div ref={mountRef} className="pointer-events-none absolute inset-0 z-[12]" />
      <div ref={handlesRef} className="pointer-events-none absolute inset-0 z-[13] overflow-hidden" />
    </>
  );
}

function disposeGroup(group: THREE.Group) {
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const material = child.material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material.dispose();
  });
}
