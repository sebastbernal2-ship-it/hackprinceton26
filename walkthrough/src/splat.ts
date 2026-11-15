// Splat scenes (ported from the user's Deja-View web/src/viewer/world.ts): Spark loading, one pass over the
// splats for the floor, bounds and a voxel collider, and a spawn. Camera-room / generated-world / video /
// palette logic was dropped.

import * as THREE from 'three';
import { SplatMesh, isMobile, isOculus } from '@sparkjsdev/spark';
import { estimateFloor, expandBounds, robustBounds, unionBounds, type Bounds } from './analysis.ts';
import { DEFAULT_BODY, findFreeSpot, type Body, type GroundOptions } from './physics.ts';
import { VoxelGrid } from './voxels.ts';

export interface LoadProgress {
  stage: string;
  /** 0..1, or null when unknown. */
  fraction: number | null;
}

export interface LoadOptions {
  /** Force LoD on/off (default: by splat count and device). */
  lod?: boolean;
  onProgress?: (p: LoadProgress) => void;
}

/** Splat count above which Spark builds a level-of-detail tree for this device. */
export function lodThreshold(): number {
  // a Quest holds 72 Hz with ~500-750k splats: bigger worlds get a level-of-detail tree there
  if (isOculus()) return 800_000;
  if (isMobile()) return 1_200_000;
  return 3_500_000;
}

export async function loadSplatMesh(url: string, opts: LoadOptions = {}): Promise<SplatMesh> {
  const lod = opts.lod;
  const report = opts.onProgress ?? (() => undefined);
  let downloaded = false;
  const mesh = new SplatMesh({
    url,
    // keep the full-resolution splats next to the LoD tree: the analysis reads them
    lod: lod === false ? undefined : true,
    nonLod: true,
    lodAbove: lod === true ? 0 : lodThreshold(),
    onProgress: (e: ProgressEvent) => {
      if (e.lengthComputable && e.total > 0) {
        const f = e.loaded / e.total;
        if (f >= 0.999 && !downloaded) {
          downloaded = true;
          // big worlds get a level-of-detail tree on headsets and phones, built on this device
          const bytesPerSplat = /\.ply(\?|$)/i.test(url) ? 60 : 15;
          const lodLikely = lod !== false && (lod === true || e.total / bytesPerSplat > lodThreshold());
          report({ stage: lodLikely ? 'Building levels of detail' : 'Decoding splats', fraction: null });
        } else if (!downloaded) {
          report({ stage: 'Downloading world', fraction: f });
        }
      } else if (!downloaded) {
        report({ stage: 'Downloading world', fraction: null });
      }
    },
  });
  await mesh.initialized;
  return mesh;
}


export function splatCount(mesh: SplatMesh): number {
  const p = mesh.packedSplats;
  if (p && p.numSplats > 0) return p.numSplats;
  if (p?.lodSplats) return p.lodSplats.numSplats;
  return mesh.extSplats?.numSplats ?? mesh.numSplats ?? 0;
}

type SplatCb = (i: number, c: THREE.Vector3, s: THREE.Vector3, q: THREE.Quaternion, o: number, col: THREE.Color) => void;

function forEachSourceSplat(mesh: SplatMesh, cb: SplatCb): void {
  const p = mesh.packedSplats;
  if (p && p.numSplats > 0) p.forEachSplat(cb);
  else if (p?.lodSplats) p.lodSplats.forEachSplat(cb);
  else mesh.forEachSplat(cb);
}

export interface Samples {
  /** xyz of opaque, not-huge splat centres in the content frame. */
  pos: Float32Array;
  count: number;
  /** Per-sample weight for the floor histogram (flat, horizontal splats count more). */
  weight: Float32Array;
  total: number;
}

/**
 * Reads every splat once through Spark's forEachSplat and keeps what the analysis needs.
 * `toContent` maps splat file coordinates into the content frame (viewer frame before the floor
 * shift). Splats with low opacity or a huge extent (background shells) are skipped.
 */
export function collectSamples(mesh: SplatMesh, toContent: THREE.Matrix4, hugeLimit = 0.6, minOpacity = 0.35): Samples {
  const total = splatCount(mesh);
  const e = toContent.elements;
  const scale = Math.cbrt(Math.abs(toContent.determinant())) || 1;
  // world-space up expressed in file coordinates, for the "is this splat horizontal" test
  const ux = e[1] / scale, uy = e[5] / scale, uz = e[9] / scale;
  let cap = Math.max(1024, total);
  let pos = new Float32Array(cap * 3);
  let weight = new Float32Array(cap);
  let n = 0;
  forEachSourceSplat(mesh, (i, c, s, q, o, col) => {
    const x = e[0] * c.x + e[4] * c.y + e[8] * c.z + e[12];
    const y = e[1] * c.x + e[5] * c.y + e[9] * c.z + e[13];
    const z = e[2] * c.x + e[6] * c.y + e[10] * c.z + e[14];
    const sx = s.x, sy = s.y, sz = s.z;
    const smax = Math.max(sx, sy, sz) * scale;
    if (o < minOpacity || smax > hugeLimit || !Number.isFinite(x + y + z)) return;
    if (n >= cap) {
      cap *= 2;
      const p2 = new Float32Array(cap * 3);
      p2.set(pos);
      pos = p2;
      const w2 = new Float32Array(cap);
      w2.set(weight);
      weight = w2;
    }
    pos[n * 3] = x;
    pos[n * 3 + 1] = y;
    pos[n * 3 + 2] = z;
    // smallest axis of the gaussian = its normal when it is a flat disc
    let w = 1;
    const smin = Math.min(sx, sy, sz);
    const smid = sx + sy + sz - smin - Math.max(sx, sy, sz);
    if (smin < 0.4 * smid) {
      const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
      let nx: number, ny: number, nz: number;
      if (smin === sx) { nx = 1 - 2 * (qy * qy + qz * qz); ny = 2 * (qx * qy + qw * qz); nz = 2 * (qx * qz - qw * qy); }
      else if (smin === sy) { nx = 2 * (qx * qy - qw * qz); ny = 1 - 2 * (qx * qx + qz * qz); nz = 2 * (qy * qz + qw * qx); }
      else { nx = 2 * (qx * qz + qw * qy); ny = 2 * (qy * qz - qw * qx); nz = 1 - 2 * (qx * qx + qy * qy); }
      const up = Math.abs(nx * ux + ny * uy + nz * uz);
      if (up > 0.85) w = 3;
    }
    weight[n] = w;
    n++;
  });
  return { pos, count: n, weight, total };
}

export interface SplatAnalysis {
  floorY: number;
  floorEstimated: boolean;
  /** Final frame (floor at 0). */
  bounds: Bounds;
  walkBounds: Bounds;
  grid: VoxelGrid;
  spawn: { x: number; y: number; z: number; yaw: number };
  splats: number;
  solid: number;
  timings: Record<string, number>;
}

/**
 * Floor, bounds, voxel collider and spawn for a loaded splat world. `toContent` maps the splat file into the
 * content frame (scene transform plus any flip); the returned floorY is what the content group must be shifted
 * down by so the floor sits at y = 0 (room metres, where finding anchors live).
 */
export async function analyseSplats(mesh: SplatMesh, toContent: THREE.Matrix4, opts: { floorY?: number; body?: Body } = {}): Promise<SplatAnalysis> {
  const body = opts.body ?? DEFAULT_BODY;
  const timings: Record<string, number> = {};
  let t0 = performance.now();
  const samples = collectSamples(mesh, toContent);
  timings.samples = performance.now() - t0;
  if (samples.count < 50) throw new Error('This splat file has almost no solid splats to stand on.');

  t0 = performance.now();
  const preBounds = robustBounds(samples.pos, samples.count, 0.02, 0.98)!;
  const ys = new Float32Array(samples.count);
  for (let i = 0; i < samples.count; i++) ys[i] = samples.pos[i * 3 + 1];
  let floorY = opts.floorY ?? NaN;
  let floorEstimated = false;
  if (!Number.isFinite(floorY)) {
    const est = estimateFloor(ys, { weights: samples.weight.subarray(0, samples.count) });
    floorY = est?.y ?? preBounds.min[1];
    floorEstimated = true;
  }
  timings.floor = performance.now() - t0;
  for (let i = 0; i < samples.count; i++) samples.pos[i * 3 + 1] -= floorY;

  const bounds = robustBounds(samples.pos, samples.count, 0.01, 0.99)!;
  const outer = robustBounds(samples.pos, samples.count, 0.003, 0.997)!;
  const fb = expandBounds(outer, [0.6, 0.6, 0.6]);
  t0 = performance.now();
  const extent = Math.max(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2]);
  const grid = new VoxelGrid(extent > 80 ? 0.25 : extent > 35 ? 0.15 : 0.1);
  for (let i = 0; i < samples.count; i++) {
    const x = samples.pos[i * 3], y = samples.pos[i * 3 + 1], z = samples.pos[i * 3 + 2];
    if (x < fb.min[0] || x > fb.max[0] || y < fb.min[1] || y > fb.max[1] || z < fb.min[2] || z > fb.max[2]) continue;
    grid.add(x, y, z);
  }
  grid.finalize(0);
  timings.voxels = performance.now() - t0;

  // spawn: near the middle of the captured volume, on a spot the body fits
  const ground: GroundOptions = { floorY: 0, snap: 0.07, maxDrop: 4, maxClimb: 0.35 };
  const cx = (bounds.min[0] + bounds.max[0]) / 2, cz = (bounds.min[2] + bounds.max[2]) / 2;
  const roomy: Body = { radius: 0.42, step: 0.6, height: 2.0 };
  let free = findFreeSpot(grid, cx, cz, 0, roomy, ground, 3, 0.05);
  if (!free.found) free = findFreeSpot(grid, cx, cz, 0, body, ground, 5, 0.05);
  const around: Bounds = { min: [free.x - 1.5, free.y, free.z - 1.5], max: [free.x + 1.5, free.y + 2.2, free.z + 1.5] };
  const walkBounds = unionBounds(expandBounds(bounds, [0.2, 0, 0.2]), around);
  return {
    floorY, floorEstimated, bounds: unionBounds(bounds, around), walkBounds, grid,
    spawn: { x: free.x, y: free.y, z: free.z, yaw: 0 },
    splats: samples.total, solid: samples.count, timings,
  };
}
