/**
 * Matterport skybox faces -> a cube around the viewer. The ONE place the face orientation lives.
 *
 * Verified by viewing seams of site 1018657 pano 31rektfumzzds6ifdwem7w9ac (see docs/spikes/walk/):
 *  - f1..f4 are the horizontal ring turning RIGHT: f1 front, f2 right, f3 back, f4 left
 *    (f1's right edge continues into f2's left edge; f4's right edge into f1's left edge).
 *  - f0 (ceiling) is seen looking up with the front (f1) at its bottom edge; left stays left.
 *  - f5 (floor) is seen looking down with the front (f1) at its top edge; left stays left.
 *
 * Coordinates: three.js, y-up, in the pano's LOCAL frame where the front face (f1) is -z.
 * The pano's rotation quaternion (model space, z-up) then turns that frame into the world (see modelQuatToThree).
 */

export type V3 = readonly [number, number, number];

export type FaceSpec = {
  /** Matterport face index (fN.jpg) */
  index: number;
  name: "up" | "front" | "right" | "back" | "left" | "down";
  /** unit vector from the viewer to the face centre */
  dir: V3;
  /** the image's "up" (top edge direction) as seen from inside */
  up: V3;
  /** the image's "right" as seen from inside */
  right: V3;
};

export const FACES: readonly FaceSpec[] = [
  { index: 0, name: "up", dir: [0, 1, 0], up: [0, 0, 1], right: [1, 0, 0] },
  { index: 1, name: "front", dir: [0, 0, -1], up: [0, 1, 0], right: [1, 0, 0] },
  { index: 2, name: "right", dir: [1, 0, 0], up: [0, 1, 0], right: [0, 0, 1] },
  { index: 3, name: "back", dir: [0, 0, 1], up: [0, 1, 0], right: [-1, 0, 0] },
  { index: 4, name: "left", dir: [-1, 0, 0], up: [0, 1, 0], right: [0, 0, -1] },
  { index: 5, name: "down", dir: [0, -1, 0], up: [0, 0, -1], right: [1, 0, 0] },
];

/** The four side faces in ring order, turning right. */
export const RING = [1, 2, 3, 4] as const;
export type SideFace = (typeof RING)[number];

/** Side face to the left / right of a side face. */
export function ringNeighbours(face: SideFace): { left: SideFace; right: SideFace } {
  const i = RING.indexOf(face);
  return { left: RING[(i + 3) % 4], right: RING[(i + 1) % 4] };
}

export const opposite = (face: SideFace): SideFace => RING[(RING.indexOf(face) + 2) % 4];

/**
 * Which edge of the up (f0) / down (f5) face touches a given side face.
 * up: bottom=f1, right=f2, top=f3, left=f4. down: top=f1, right=f2, bottom=f3, left=f4.
 */
export function capEdgeTouching(cap: 0 | 5, side: SideFace): "top" | "bottom" | "left" | "right" {
  if (side === 2) return "right";
  if (side === 4) return "left";
  if (cap === 0) return side === 1 ? "bottom" : "top";
  return side === 1 ? "top" : "bottom";
}

/**
 * Model space is z-up (Matterport), three.js is y-up. A model point (x, y, z) is three (x, z, -y),
 * a proper rotation, so a model quaternion maps component-wise the same way.
 */
export const modelToThree = (p: { x: number; y: number; z: number }): V3 => [p.x, p.z, -p.y];
export const threeToModel = (v: V3): { x: number; y: number; z: number } => ({ x: v[0], y: -v[2], z: v[1] });
export function modelQuatToThree(q: { x: number; y: number; z: number; w: number } | undefined): [number, number, number, number] {
  if (!q) return [0, 0, 0, 1];
  return [q.x, q.z, -q.y, q.w];
}

/**
 * Calibration of the cube against model positions, verified in the browser on site 1018657 (docs/spikes/walk):
 * with the rotation applied as is and the cube turned -90 deg about up, a pano with identity rotation has its front
 * face (f1) toward model +x. Checked both ways between panos gaf0r0h2 and 9khpb0gw (4 m apart, rotations 66 deg
 * apart): the floor ring toward each lands where the other camera stood (behind the bar / by the Pepsi fridge).
 * Mutable only so the dev calibration hook (window.__orient) can try alternatives.
 */
export const ORIENT = { conjugate: false, offsetDeg: -90 };

/** Quaternion [x, y, z, w] that turns the local cube frame (front = -z) into the three.js world for a pano. */
export function cubeQuat(rotation?: { x: number; y: number; z: number; w: number }): [number, number, number, number] {
  const [x, y, z, w] = modelQuatToThree(rotation);
  const q: [number, number, number, number] = ORIENT.conjugate ? [-x, -y, -z, w] : [x, y, z, w];
  const h = (ORIENT.offsetDeg * Math.PI) / 360;
  const [oy, ow] = [Math.sin(h), Math.cos(h)];
  // offset (about world y) * q
  return [ow * q[0] + oy * q[2], ow * q[1] + oy * q[3], ow * q[2] - oy * q[0], ow * q[3] - oy * q[1]];
}

/**
 * Yaw (radians, three.js convention: 0 looks down -z, positive turns left) of a horizontal direction.
 * Used for headings, hotspot bearings and the minimap cone.
 */
export const yawOf = (dx: number, dz: number): number => Math.atan2(-dx, -dz);

/** Rotate a three.js vector by a quaternion [x, y, z, w]. */
export function rotate(q: readonly [number, number, number, number], v: V3): V3 {
  const [qx, qy, qz, qw] = q;
  const [vx, vy, vz] = v;
  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [vx + qw * tx + (qy * tz - qz * ty), vy + qw * ty + (qz * tx - qx * tz), vz + qw * tz + (qx * ty - qy * tx)];
}

/**
 * The side face (1-4) whose centre is closest to a world-space view yaw, for a pano with the given rotation.
 * This is "the face the user is looking at", edited first by Imagine.
 */
export function faceForYaw(yaw: number, rotation?: { x: number; y: number; z: number; w: number }): SideFace {
  const q = cubeQuat(rotation);
  let best: SideFace = 1;
  let bestDot = -Infinity;
  const look: V3 = [-Math.sin(yaw), 0, -Math.cos(yaw)];
  for (const f of RING) {
    const d = rotate(q, FACES[f].dir);
    const dot = d[0] * look[0] + d[2] * look[2];
    if (dot > bestDot) {
      bestDot = dot;
      best = f;
    }
  }
  return best;
}
