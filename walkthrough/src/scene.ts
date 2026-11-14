// Loads a scene bundle from a URL (or the built-in demo) into one shape the viewer drives:
// a root to add to the three.js scene, a CollisionWorld, bounds, a spawn, and the reality-check tint.
//   .glb/.gltf/.obj  mesh scene (e.g. Matterport-derived), collision through three-mesh-bvh
//   .ply/.spz/.splat/.ksplat/.sog  splat scene through Spark, collision through a voxel grid (from Deja-View)
// Meshes flagged captured:false (glTF extras) or named *inferred*/*imagined* are the inferred surfaces.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { SplatMesh, dyno } from '@sparkjsdev/spark';
import type { Bounds } from './analysis.ts';
import { colliderFromObject } from './collider.ts';
import { buildDemoRoom } from './demo.ts';
import type { GroundOptions } from './physics.ts';
import { DEFAULT_BODY, findFreeSpot, type Body } from './physics.ts';
import { analyseSplats, loadSplatMesh, type LoadProgress } from './splat.ts';
import type { CollisionWorld } from './voxels.ts';

export interface SceneOptions {
  url: string | null; // null: demo
  imaginedUrl?: string | null; // splat scenes: a second splat file holding the inferred part
  floorY?: number;
  scale?: number;
  flip?: boolean;
  onProgress?: (p: LoadProgress) => void;
}

export interface LoadedScene {
  kind: 'demo' | 'mesh' | 'splat';
  label: string;
  root: THREE.Object3D;
  world: CollisionWorld;
  bounds: Bounds;
  walkBounds: Bounds;
  ground: GroundOptions;
  body: Body;
  spawn: { x: number; y: number; z: number; yaw: number };
  lit: boolean; // meshes need lights; splats do not
  /** Distance from a room-metre point to the nearest scanned surface (meshes only). */
  distanceToSurface: ((x: number, y: number, z: number) => number) | null;
  /** 'inferred' when the point is within `tol` m of an inferred surface, 'captured' when there is geometry but none of it inferred, null when unknown. */
  surfaceAt: (x: number, y: number, z: number) => 'captured' | 'inferred' | null;
  /** The reality-check tint. */
  reality: { available: boolean; count: number; unit: string; on: boolean; set(on: boolean): void };
  stats: string;
}

const MESH_EXT = /\.(glb|gltf|obj)$/i;
const IMAGINED_NAME = /inferred|imagined/i;
const INFERRED_TINT = new THREE.Color(0x8c5cff);

export const isMeshUrl = (url: string): boolean => MESH_EXT.test(ext(url));
const ext = (url: string) => url.split(/[?#]/)[0];

function isInferred(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) {
    if (p.userData?.captured === false || IMAGINED_NAME.test(p.name)) return true;
  }
  return false;
}

function tinted(m: THREE.Material): THREE.Material {
  const c = m.clone() as THREE.MeshStandardMaterial;
  if (c.color) {
    const l = c.color.r * 0.299 + c.color.g * 0.587 + c.color.b * 0.114;
    c.color.setRGB(l, l, l).lerp(INFERRED_TINT, 0.6);
  }
  if ('emissive' in c) (c as THREE.MeshStandardMaterial).emissive = INFERRED_TINT.clone().multiplyScalar(0.12);
  c.map = null;
  c.transparent = true;
  c.opacity = 0.82;
  return c;
}

async function loadMeshObject(url: string, onProgress?: (p: LoadProgress) => void): Promise<THREE.Object3D> {
  const prog = onProgress ? (e: ProgressEvent) => onProgress({ stage: 'Downloading scene', fraction: e.lengthComputable && e.total ? e.loaded / e.total : null }) : undefined;
  if (/\.obj$/i.test(ext(url))) return new OBJLoader().loadAsync(url, prog);
  return (await new GLTFLoader().loadAsync(url, prog)).scene;
}

function meshScene(object: THREE.Object3D, kind: 'demo' | 'mesh', label: string, floorOverride: number | undefined): LoadedScene {
  const root = new THREE.Group();
  root.add(object);
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const floorY = floorOverride ?? box.min.y;
  root.position.y = -floorY;
  root.updateMatrixWorld(true);

  const inferred: THREE.Mesh[] = [];
  object.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && isInferred(m)) inferred.push(m);
  });
  const world = colliderFromObject(root);
  if (!world) throw new Error('This scene has no mesh geometry to walk on.');
  const inferredCollider = inferred.length ? colliderFromObject(root, (m) => inferred.includes(m)) : null;
  const capturedCollider = inferred.length ? colliderFromObject(root, (m) => !inferred.includes(m)) : world;

  const b = new THREE.Box3().setFromObject(root);
  const bounds: Bounds = { min: [b.min.x, 0, b.min.z], max: [b.max.x, b.max.y, b.max.z] };
  const ground: GroundOptions = { floorY: 0, snap: 0.07, maxDrop: 4, maxClimb: 0.35 };
  // spawn near the middle of the captured geometry, on a spot the body fits
  const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
  const roomy: Body = { radius: 0.42, step: 0.6, height: 2.0 };
  let free = findFreeSpot(world, cx, cz, 0, roomy, ground, 4, 0.05);
  if (!free.found) free = findFreeSpot(world, cx, cz, 0, DEFAULT_BODY, ground, 8, 0.05);
  const walkBounds: Bounds = { min: [b.min.x - 0.1, 0, b.min.z - 0.1], max: [b.max.x + 0.1, b.max.y, b.max.z + 0.1] };

  // reality tint: swap the material of inferred meshes
  const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const tints = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  for (const m of inferred) {
    originals.set(m, m.material);
    tints.set(m, Array.isArray(m.material) ? m.material.map(tinted) : tinted(m.material));
  }
  const reality: LoadedScene['reality'] = {
    available: inferred.length > 0, count: inferred.length, unit: 'meshes', on: false,
    set(on) {
      reality.on = on;
      for (const m of inferred) m.material = (on ? tints : originals).get(m)!;
    },
  };
  reality.set(inferred.length > 0);

  const nearInferred = 0.35;
  return {
    kind, label, root, world, bounds, walkBounds, ground, body: DEFAULT_BODY,
    spawn: { x: free.x, y: free.y, z: free.z, yaw: kind === 'demo' ? Math.PI / 2 : 0 },
    lit: true,
    distanceToSurface: (x, y, z) => world.distanceTo(x, y, z),
    surfaceAt: (x, y, z) => {
      if (inferredCollider && inferredCollider.distanceTo(x, y, z, nearInferred) <= nearInferred) return 'inferred';
      return capturedCollider && capturedCollider.distanceTo(x, y, z, nearInferred) <= nearInferred ? 'captured' : null;
    },
    reality,
    stats: `${inferred.length ? `${inferred.length} of ` : ''}${countMeshes(object)} meshes${inferred.length ? ' marked inferred' : ''}, floor y=${floorY.toFixed(2)}${floorOverride === undefined ? ' (lowest point)' : ''}`,
  };
}

function countMeshes(o: THREE.Object3D): number {
  let n = 0;
  o.traverse((c) => { if ((c as THREE.Mesh).isMesh) n++; });
  return n;
}

/** Wash for the imagined splat file: desaturate and push toward violet (Deja-View's reality check, without the wave). */
function imaginedModifier(amount: ReturnType<typeof dyno.dynoFloat>) {
  const tint = dyno.dynoVec3(new THREE.Vector3(0.55, 0.36, 1.0));
  return dyno.dynoBlock({ gsplat: dyno.Gsplat }, { gsplat: dyno.Gsplat }, ({ gsplat }) => {
    const d = new dyno.Dyno({
      inTypes: { gsplat: dyno.Gsplat, amount: 'float', tint: 'vec3' },
      outTypes: { gsplat: dyno.Gsplat },
      inputs: { gsplat, amount, tint },
      statements: ({ inputs, outputs }) => [
        `${outputs.gsplat} = ${inputs.gsplat};`,
        `vec3 rgb = ${outputs.gsplat}.rgba.rgb;`,
        `float l = dot(rgb, vec3(0.299, 0.587, 0.114));`,
        `vec3 washed = mix(mix(rgb, vec3(l), 0.7), ${inputs.tint} * (0.28 + 0.95 * l), 0.58) * 0.94;`,
        `${outputs.gsplat}.rgba.rgb = mix(rgb, washed, ${inputs.amount});`,
      ],
    });
    return { gsplat: d.outputs.gsplat };
  });
}

async function splatScene(opts: SceneOptions, url: string): Promise<LoadedScene> {
  const content = new THREE.Group();
  const mesh = await loadSplatMesh(url, { onProgress: opts.onProgress });
  if (opts.flip) mesh.rotation.x = Math.PI; // y-down splat files (COLMAP / OpenCV convention)
  if (opts.scale && opts.scale > 0) mesh.scale.setScalar(opts.scale);
  mesh.updateMatrix();
  const toContent = mesh.matrix.clone();
  const a = await analyseSplats(mesh, toContent, { floorY: opts.floorY });
  content.add(mesh);
  content.position.y = -a.floorY;
  let imagined: SplatMesh | null = null;
  const amount = dyno.dynoFloat(1);
  if (opts.imaginedUrl) {
    opts.onProgress?.({ stage: 'Downloading inferred part', fraction: null });
    imagined = await loadSplatMesh(opts.imaginedUrl);
    imagined.rotation.copy(mesh.rotation);
    imagined.scale.copy(mesh.scale);
    imagined.worldModifier = imaginedModifier(amount);
    imagined.updateGenerator();
    content.add(imagined);
  }
  const reality: LoadedScene['reality'] = {
    available: !!imagined, count: imagined ? imagined.numSplats ?? 0 : 0, unit: 'splats', on: !!imagined,
    set(on) {
      reality.on = on;
      amount.value = on ? 1 : 0;
      imagined?.updateGenerator();
    },
  };
  return {
    kind: 'splat', label: url.split('/').pop() ?? url, root: content, world: a.grid, bounds: a.bounds, walkBounds: a.walkBounds,
    ground: { floorY: 0, snap: 0.07, maxDrop: 4, maxClimb: 0.35 }, body: DEFAULT_BODY, spawn: a.spawn, lit: false,
    distanceToSurface: null,
    // a splat scene only knows about inferred surfaces through the separate imagined file, which is not sampled here
    surfaceAt: () => null,
    reality,
    stats: `${a.splats.toLocaleString()} splats (${a.solid.toLocaleString()} solid), floor y=${a.floorY.toFixed(2)}${a.floorEstimated ? ' (estimated)' : ''}, analysis ${Math.round(a.timings.samples + a.timings.floor + a.timings.voxels)} ms`,
  };
}

export async function loadScene(opts: SceneOptions): Promise<LoadedScene> {
  if (!opts.url) return meshScene(buildDemoRoom(), 'demo', 'DEMO room (generated in code)', 0);
  if (isMeshUrl(opts.url)) {
    const obj = await loadMeshObject(opts.url, opts.onProgress);
    if (opts.scale && opts.scale > 0) obj.scale.multiplyScalar(opts.scale);
    return meshScene(obj, 'mesh', opts.url.split('/').pop()!.split('?')[0], opts.floorY);
  }
  return splatScene(opts, opts.url);
}
