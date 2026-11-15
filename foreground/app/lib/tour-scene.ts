import type { MpSdk } from "@matterport/sdk";
import type { TourKind } from "./tour-agent";

export type Vec3 = { x: number; y: number; z: number };

export type StagedPiece = {
  id: string;
  kind: TourKind;
  label: string;
  tagId: string | null;
  /** Where the pin meets the room. */
  position: Vec3;
  /** Offset from the surface to the pin head, pointing out of the floor or wall. */
  stem: Vec3;
  /** Screen placement for the live ghost overlay, as percentages of the tour viewport. */
  screen: { x: number; y: number };
  /** Concept-layout fields: assumed footprint in meters and the room the piece was staged in. */
  width?: number;
  depth?: number;
  room?: string;
};

function yawRadians(rotationY: number) {
  return (rotationY * Math.PI) / 180;
}

/** Rough point a few meters in front of the camera, slightly below eye height. */
export function pointInFront(pose: { position: Vec3; rotation: { x: number; y: number } }, distance = 2.2): Vec3 {
  const yaw = yawRadians(pose.rotation.y);
  return {
    x: pose.position.x - Math.sin(yaw) * distance,
    y: pose.position.y - 0.35,
    z: pose.position.z - Math.cos(yaw) * distance,
  };
}

export function stemHeight(kind: TourKind) {
  return kind === "wall" ? 1.1 : 0.45;
}

export function uprightStem(kind: TourKind): Vec3 {
  return { x: 0, y: stemHeight(kind), z: 0 };
}

const UP: Vec3 = { x: 0, y: 1, z: 0 };

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(v: Vec3, amount: number): Vec3 {
  return { x: v.x * amount, y: v.y * amount, z: v.z * amount };
}

function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function len(v: Vec3) {
  return Math.hypot(v.x, v.y, v.z);
}

function normalize(v: Vec3): Vec3 | null {
  const length = len(v);
  if (length < 1e-5) return null;
  return scale(v, 1 / length);
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export type SurfacePlacement = { position: Vec3; stem: Vec3 };

/**
 * Drop the pin on the room surface under the cursor.
 * The head is lifted along the surface normal so the disc stays outside the floor and walls.
 */
export async function placeOnSurface(
  sdk: MpSdk,
  screen: { x: number; y: number },
  kind: TourKind,
  cameraPosition?: Vec3,
): Promise<SurfacePlacement | null> {
  const hit = await sdk.Renderer.getWorldPositionData(screen);
  if (!hit.position) return null;

  const sample = 12;
  const [right, down] = await Promise.all([
    sdk.Renderer.getWorldPositionData({ x: screen.x + sample, y: screen.y }),
    sdk.Renderer.getWorldPositionData({ x: screen.x, y: screen.y + sample }),
  ]);

  let normal = UP;
  if (right.position && down.position) {
    const edgeA = sub(right.position, hit.position);
    const edgeB = sub(down.position, hit.position);
    if (len(edgeA) < 0.75 && len(edgeB) < 0.75) {
      const guessed = normalize(cross(edgeA, edgeB));
      if (guessed) normal = guessed;
    }
  }

  if (cameraPosition) {
    const towardCamera = sub(cameraPosition, hit.position);
    if (dot(normal, towardCamera) < 0) normal = scale(normal, -1);
  } else if (normal.y < 0) {
    normal = scale(normal, -1);
  }

  const floorLike = normal.y > 0.65;
  const clearance = kind === "wall" ? 0.34 : floorLike ? 0.28 : 0.22;
  return {
    position: add(hit.position, scale(normal, 0.03)),
    stem: scale(normal, clearance),
  };
}

export function nudge(position: Vec3, poseYaw: number, direction: "left" | "right" | "forward" | "back", meters: number): Vec3 {
  const yaw = yawRadians(poseYaw);
  const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
  const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  const delta =
    direction === "forward"
      ? { x: forward.x * meters, z: forward.z * meters }
      : direction === "back"
        ? { x: -forward.x * meters, z: -forward.z * meters }
        : direction === "right"
          ? { x: right.x * meters, z: right.z * meters }
          : { x: -right.x * meters, z: -right.z * meters };
  return { x: position.x + delta.x, y: position.y, z: position.z + delta.z };
}

export async function readPose(sdk: MpSdk) {
  return new Promise<{
    position: Vec3;
    rotation: { x: number; y: number };
    mode: string;
  }>((resolve) => {
    const timer = setTimeout(() => {
      subscription.cancel();
      resolve({ position: { x: 0, y: 1, z: 0 }, rotation: { x: 0, y: 0 }, mode: "mode.inside" });
    }, 400);
    const subscription = sdk.Camera.pose.subscribe((pose) => {
      clearTimeout(timer);
      subscription.cancel();
      resolve(pose);
    });
  });
}

const TAG_COLOR: Record<TourKind, { r: number; g: number; b: number }> = {
  table: { r: 0.77, g: 0.35, b: 0.17 },
  chair: { r: 0.54, g: 0.42, b: 0.27 },
  sofa: { r: 0.42, g: 0.36, b: 0.29 },
  counter: { r: 0.37, g: 0.43, b: 0.31 },
  wall: { r: 0.29, g: 0.33, b: 0.38 },
};

/** Drop a Matterport tag into the live tour so the change is visible while navigating. */
export async function placeInTour(
  sdk: MpSdk,
  piece: { kind: TourKind; label: string; position: Vec3; stem?: Vec3 },
): Promise<string | null> {
  try {
    const pose = await readPose(sdk);
    if (pose.mode === sdk.Mode.Mode.DOLLHOUSE || pose.mode === sdk.Mode.Mode.FLOORPLAN) {
      await sdk.Mode.moveTo(sdk.Mode.Mode.INSIDE, {
        transition: sdk.Camera.TransitionType.FLY,
      });
    }

    const stem = piece.stem ?? uprightStem(piece.kind);
    const [tagId] = await sdk.Tag.add({
      label: piece.label,
      description: "",
      anchorPosition: piece.position,
      stemVector: stem,
      color: TAG_COLOR[piece.kind],
    });

    try {
      await sdk.Tag.allowAction(tagId, {
        opening: false,
        navigating: false,
        docking: false,
        sharing: false,
      });
      await sdk.Tag.close(tagId);
    } catch {
      // The pin still marks the object if the billboard cannot be silenced.
    }
    return tagId;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function moveInTour(sdk: MpSdk, tagId: string, position: Vec3, stem: Vec3 = { x: 0, y: 0.28, z: 0 }): Promise<void> {
  try {
    await sdk.Tag.editPosition(tagId, {
      anchorPosition: position,
      stemVector: stem,
    });
  } catch (error) {
    console.error(error);
  }
}
