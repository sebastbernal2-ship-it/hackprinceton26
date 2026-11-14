"use client";

import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { MpSdk } from "@matterport/sdk";
import * as THREE from "three";
import { makeFurniture } from "../lib/furniture-mesh";
import type { StagedPiece, Vec3 } from "../lib/tour-scene";

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

const HEIGHT: Record<string, number> = { table: 0.8, chair: 0.95, sofa: 0.85, counter: 0.95, wall: 2.1 };

export default function TourModels({
  sdk,
  pieces,
  onPiecesChange,
}: {
  sdk: MpSdk | null;
  pieces: StagedPiece[];
  onPiecesChange: (next: StagedPiece[] | ((current: StagedPiece[]) => StagedPiece[])) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const piecesRef = useRef(pieces);
  const dragId = useRef<string | null>(null);
  const moveTicket = useRef(0);
  const handles = useRef(new Map<string, HTMLButtonElement>());
  piecesRef.current = pieces;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !sdk) return;

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
      if (!pose.projection || pose.projection.length !== 16) return;
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
      const piecesNow = piecesRef.current;
      const live = new Set(piecesNow.map((piece) => piece.id));
      for (const child of [...content.children]) {
        if (live.has(String(child.userData.pieceId))) continue;
        disposeObject(child);
        content.remove(child);
      }
      for (const piece of piecesNow) {
        const signature = `${piece.kind}:${piece.label}:${piece.width ?? ""}:${piece.depth ?? ""}`;
        let model = content.children.find((child) => child.userData.pieceId === piece.id);
        if (!model || model.userData.signature !== signature) {
          if (model) {
            disposeObject(model);
            content.remove(model);
          }
          model = makeFurniture(piece.kind, piece.width, piece.depth, piece.label);
          model.userData.pieceId = piece.id;
          model.userData.signature = signature;
          content.add(model);
        }
        const lifted = dragId.current === piece.id ? 0.08 : 0;
        model.position.set(piece.position.x, piece.position.y + lifted, piece.position.z);
        model.rotation.y = piece.yaw ?? 0;
      }
    }

    function placeHandles() {
      if (!poseNow) return;
      const size = { w: mount!.clientWidth || 1, h: mount!.clientHeight || 1 };
      const seen = new Set<string>();
      for (const piece of piecesRef.current) {
        seen.add(piece.id);
        const handle = handles.current.get(piece.id);
        if (!handle) continue;
        const box = screenBox(sdk!, piece, poseNow, size);
        if (!box) {
          handle.style.display = "none";
          continue;
        }
        handle.style.display = "block";
        handle.style.transform = `translate(${box.left}px, ${box.top}px)`;
        handle.style.width = `${box.width}px`;
        handle.style.height = `${box.height}px`;
      }
      for (const [id, handle] of handles.current) {
        if (!seen.has(id)) handle.style.display = "none";
      }
    }

    function frame() {
      resize();
      syncPose();
      syncPieces();
      placeHandles();
      if (poseNow) renderer.render(scene, camera);
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
    };
  }, [sdk]);

  useEffect(() => {
    if (!sdk) return;
    const ids = pieces.flatMap((piece) => (piece.tagId ? [piece.tagId] : []));
    if (ids.length) void sdk.Tag.remove(...ids).catch(() => {});
  }, [sdk, pieces]);

  async function movePiece(id: string, clientX: number, clientY: number) {
    const mount = mountRef.current;
    if (!sdk || !mount) return;
    const ticket = ++moveTicket.current;
    const frame = mount.parentElement?.querySelector("iframe") ?? mount;
    const box = frame.getBoundingClientRect();
    const screen = { x: clientX - box.left, y: clientY - box.top };
    const landed = await surfaceAt(sdk, screen);
    if (ticket !== moveTicket.current || dragId.current !== id || !landed) return;
    onPiecesChange((current) => current.map((piece) => (piece.id === id ? { ...piece, position: landed } : piece)));
  }

  function grab(id: string, event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragId.current = id;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // The drag still follows the cursor if capture is unavailable.
    }
  }

  function drag(id: string, event: ReactPointerEvent<HTMLButtonElement>) {
    if (dragId.current !== id) return;
    void movePiece(id, event.clientX, event.clientY);
  }

  function release(id: string) {
    if (dragId.current === id) dragId.current = null;
  }

  return (
    <div ref={mountRef} className="pointer-events-none absolute inset-0 z-[12]">
      {pieces.map((piece) => (
        <button
          key={piece.id}
          type="button"
          aria-label={`Drag ${piece.label}`}
          ref={(node) => {
            if (node) handles.current.set(piece.id, node);
            else handles.current.delete(piece.id);
          }}
          onPointerDown={(event) => grab(piece.id, event)}
          onPointerMove={(event) => drag(piece.id, event)}
          onPointerUp={() => release(piece.id)}
          onPointerCancel={() => release(piece.id)}
          className="pointer-events-auto absolute left-0 top-0 cursor-grab rounded-md bg-transparent hover:bg-white/10 active:cursor-grabbing"
        />
      ))}
    </div>
  );
}

async function surfaceAt(sdk: MpSdk, screen: { x: number; y: number }): Promise<Vec3 | null> {
  const shifts = [0, 20, 48, 90, 140];
  for (const down of shifts) {
    const hit = await sdk.Renderer.getWorldPositionData({ x: screen.x, y: screen.y + down });
    if (hit.position) return { x: hit.position.x, y: hit.position.y, z: hit.position.z };
  }
  for (const across of [-36, 36]) {
    const hit = await sdk.Renderer.getWorldPositionData({ x: screen.x + across, y: screen.y });
    if (hit.position) return { x: hit.position.x, y: hit.position.y, z: hit.position.z };
  }
  return null;
}

function screenBox(sdk: MpSdk, piece: StagedPiece, pose: SdkPose, size: { w: number; h: number }) {
  const halfW = (piece.width || 0.5) / 2;
  const halfD = (piece.depth || 0.5) / 2;
  const yaw = piece.yaw ?? 0;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const height = /kitchen|island|booth/.test(piece.label.toLowerCase()) ? 1.9 : HEIGHT[piece.kind] || 0.9;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let visible = false;
  for (const across of [-halfW, halfW]) {
    for (const along of [-halfD, halfD]) {
      for (const up of [0, height]) {
        const screen = sdk.Conversion.worldToScreen(
          {
            x: piece.position.x + across * cos - along * sin,
            y: piece.position.y + up,
            z: piece.position.z + across * sin + along * cos,
          },
          pose,
          size,
        );
        if (!Number.isFinite(screen.x) || screen.z <= 0) continue;
        visible = true;
        minX = Math.min(minX, screen.x);
        minY = Math.min(minY, screen.y);
        maxX = Math.max(maxX, screen.x);
        maxY = Math.max(maxY, screen.y);
      }
    }
  }
  if (!visible) return null;
  const pad = 12;
  const left = minX - pad;
  const top = minY - pad;
  return {
    left,
    top,
    width: Math.max(48, maxX - minX + pad * 2),
    height: Math.max(48, maxY - minY + pad * 2),
  };
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const material = child.material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material.dispose();
  });
}

function disposeGroup(group: THREE.Group) {
  for (const child of [...group.children]) disposeObject(child);
}
