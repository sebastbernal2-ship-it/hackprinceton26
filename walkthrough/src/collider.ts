// Collider mesh (ported from Deja-View's collider.ts; now built from a loaded object) accelerated with three-mesh-bvh, exposed as a CollisionWorld.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBVH } from 'three-mesh-bvh';
import type { CollisionWorld, Penetration } from './voxels.ts';

export class MeshCollider implements CollisionWorld {
  readonly bvh: MeshBVH;
  readonly geometry: THREE.BufferGeometry;
  private ray = new THREE.Ray();
  private seg = new THREE.Line3();
  private box = new THREE.Box3();
  private tp = new THREE.Vector3();
  private sp = new THREE.Vector3();
  private hit = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };
  groundRadius = 0.12;

  constructor(geometry: THREE.BufferGeometry) {
    this.geometry = geometry;
    this.bvh = new MeshBVH(geometry);
  }

  groundAt(x: number, z: number, maxY: number, minY: number): number | null {
    this.ray.origin.set(x, maxY, z);
    this.ray.direction.set(0, -1, 0);
    const hit = this.bvh.raycastFirst(this.ray, THREE.DoubleSide, 0, maxY - minY);
    if (!hit) return null;
    const n = hit.face?.normal;
    if (n && Math.abs(n.y) < 0.6) return null;
    return hit.point.y;
  }

  penetration(x: number, z: number, r: number, y0: number, y1: number, out: Penetration): boolean {
    const half = Math.max(0, (y1 - y0) / 2 - r);
    const cy = (y0 + y1) / 2;
    this.seg.start.set(x, cy - half, z);
    this.seg.end.set(x, cy + half, z);
    this.box.min.set(x - r, y0, z - r);
    this.box.max.set(x + r, y1, z + r);
    out.depth = 0;
    let found = false;
    const tp = this.tp, sp = this.sp;
    this.bvh.shapecast({
      intersectsBounds: (b) => b.intersectsBox(this.box),
      intersectsTriangle: (tri) => {
        tri.closestPointToSegment(this.seg, tp, sp);
        const dx = sp.x - tp.x, dz = sp.z - tp.z;
        const dh = Math.hypot(dx, dz);
        if (dh >= r || Math.abs(sp.y - tp.y) > r) return false;
        const depth = r - dh;
        if (depth > out.depth) {
          out.depth = depth;
          if (dh > 1e-6) {
            out.x = dx / dh;
            out.z = dz / dh;
          } else {
            const n = new THREE.Vector3();
            tri.getNormal(n);
            const l = Math.hypot(n.x, n.z) || 1;
            out.x = n.x / l;
            out.z = n.z / l;
          }
          found = true;
        }
        return false;
      },
    });
    return found;
  }

  /** Distance from a point to the nearest triangle (Infinity when there is none within `max`). */
  distanceTo(x: number, y: number, z: number, max = 10): number {
    const res = this.bvh.closestPointToPoint(new THREE.Vector3(x, y, z), this.hit, 0, max);
    return res ? res.distance : Infinity;
  }

  solidAt(x: number, y: number, z: number): boolean {
    const res = this.bvh.closestPointToPoint(new THREE.Vector3(x, y, z), this.hit, 0, 0.06);
    return !!res && res.distance < 0.06;
  }
}

/** Collider from every mesh under `root` (world matrices baked in; call root.updateMatrixWorld(true) first). */
export function colliderFromObject(root: THREE.Object3D, filter: (m: THREE.Mesh) => boolean = () => true): MeshCollider | null {
  const parts: THREE.BufferGeometry[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry?.attributes.position || !filter(m)) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', m.geometry.attributes.position.clone());
    if (m.geometry.index) g.setIndex(m.geometry.index.clone());
    g.applyMatrix4(m.matrixWorld);
    parts.push(g.index ? g.toNonIndexed() : g);
  });
  if (!parts.length) return null;
  const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
  return merged ? new MeshCollider(merged) : null;
}
