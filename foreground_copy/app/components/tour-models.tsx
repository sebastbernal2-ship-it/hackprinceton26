"use client";

import { useEffect, useRef } from "react";
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
}: {
  sdk: MpSdk | null;
  pieces: StagedPiece[];
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const piecesRef = useRef(pieces);
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
        .map((piece) => `${piece.id}:${piece.position.x.toFixed(2)}:${piece.position.y.toFixed(2)}:${piece.position.z.toFixed(2)}:${piece.yaw ?? 0}`)
        .join("|");
      if (key === built) return;
      built = key;
      disposeGroup(content);
      content.clear();
      for (const piece of piecesRef.current) {
        const model = makeFurniture(piece.kind, piece.width, piece.depth);
        model.position.set(piece.position.x, piece.position.y, piece.position.z);
        model.rotation.y = piece.yaw ?? 0;
        content.add(model);
      }
    }

    function frame() {
      resize();
      syncPose();
      syncPieces();
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

  return <div ref={mountRef} className="pointer-events-none absolute inset-0 z-[12]" />;
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
