
export type RoomKind = "dining" | "kitchen" | "freezer" | "other";

export type RoomRect = {
  id: string;
  label: string;
  kind: RoomKind;
  x: number;
  z: number;
  w: number;
  d: number;
  absorbed: boolean;
};

export type Point2 = { x: number; z: number };

export type RoomPolygon = {
  id: string;
  label: string;
  kind: RoomKind;
  points: Point2[];
  absorbed: boolean;
};

export type FloorplanFrame = {
  href: string;
  originX: number;
  originZ: number;
  widthM: number;
  depthM: number;
};

export type FloorLayout = {
  width: number;
  depth: number;
  height: number;
  thickness: number;
  rooms: RoomRect[];
  tiles: { x: number; z: number; w: number; d: number }[];
  shell: WallRect[];
  polygons?: RoomPolygon[];
  /** Untouched polygons from the floorplan, used to restore the freezer. */
  basePolygons?: RoomPolygon[];
  floorplan?: FloorplanFrame;
  /** Display = world * scale + offset, so an unlocked mesh lines up with the plan. */
  meshHref?: string;
  meshFormat?: string;
  meshAlign?: { scale: number; x: number; z: number };
  /** Cumulative dining-wall shift, in meters. Positive grows the dining room. */
  wallShift?: number;
  /** The shared dining and kitchen wall has been taken down. */
  openedWall?: boolean;
  freezerRemoved: boolean;
  /** plan: Gemini polygons. scan: sweep boxes. pending: neither has arrived. */
  source: "plan" | "scan" | "pending";
  measuredKey: string;
  geometryKey?: string;
};

export type WallRole = "shell" | "divider" | "freezer";

export type WallRect = {
  x: number;
  z: number;
  w: number;
  d: number;
  role: WallRole;
};

export type WallSegment = {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  role: WallRole;
};

export type MeasuredRoom = {
  id: string;
  label: string;
  min: { x: number; z: number };
  max: { x: number; z: number };
  floor: number;
};

const NEIGHBOR = 0.45;

export function roomKind(label: string): RoomKind {
  const text = label.toLowerCase();
  if (/freezer|cooler|walk-in|cold room|^fre\b/.test(text)) return "freezer";
  if (/kitchen/.test(text)) return "kitchen";
  if (/dining|living/.test(text)) return "dining";
  return "other";
}

export function displayLabel(label: string): string {
  return label.replace(/^main\s+/i, "").replace(/\s+room$/i, "");
}

export function buildLayout(squareFeet: number): FloorLayout {
  void squareFeet;
  return {
    width: 1,
    depth: 1,
    height: 3.05,
    thickness: 0.12,
    rooms: [],
    tiles: [],
    shell: [],
    freezerRemoved: false,
    source: "pending",
    measuredKey: "",
  };
}

export function buildLayoutFromScan(measured: MeasuredRoom[], sweeps: { x: number; z: number }[]): FloorLayout {
  const usable = measured.filter((entry) => {
    const w = entry.max.x - entry.min.x;
    const d = entry.max.z - entry.min.z;
    return w > 0.6 && d > 0.6 && Number.isFinite(w) && Number.isFinite(d);
  });
  const points = sweeps.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.z));
  const floor = pickFloor(usable);
  const onFloor = usable.filter((entry) => entry.floor === floor);
  if (onFloor.length === 0 && points.length < 3) return buildLayout(0);

  let minX = Infinity;
  let minZ = Infinity;
  for (const entry of onFloor) {
    minX = Math.min(minX, entry.min.x);
    minZ = Math.min(minZ, entry.min.z);
  }
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minZ = Math.min(minZ, point.z);
  }

  const rooms: RoomRect[] = onFloor.map((entry) => ({
    id: entry.id,
    label: entry.label || "Room",
    kind: roomKind(entry.label || ""),
    x: round(entry.min.x - minX),
    z: round(entry.min.z - minZ),
    w: round(entry.max.x - entry.min.x),
    d: round(entry.max.z - entry.min.z),
    absorbed: false,
  }));
  const walked = points.map((point) => ({ x: point.x - minX, z: point.z - minZ }));
  const plate = footprint(walked, rooms);

  return finish({
    width: 0,
    depth: 0,
    height: 3.05,
    thickness: 0.12,
    rooms,
    tiles: plate.tiles,
    shell: plate.shell,
    freezerRemoved: false,
    source: "scan",
    measuredKey: `${rooms.map((entry) => `${entry.id}:${entry.w}:${entry.d}`).join("|")}#${plate.tiles.length}`,
  });
}

export function findKitchen(layout: FloorLayout): RoomRect | null {
  return largest(layout.rooms.filter((entry) => entry.kind === "kitchen"));
}

export function layoutWalls(layout: FloorLayout): WallRect[] {
  const rooms = layout.rooms.filter((entry) => !entry.absorbed && entry.w > 0.3 && entry.d > 0.3);
  const walls: WallRect[] = [...layout.shell];
  const thickness = layout.thickness;

  for (const entry of rooms) {
    const edges = [
      { axis: "z" as const, at: entry.z, from: entry.x, to: entry.x + entry.w },
      { axis: "z" as const, at: entry.z + entry.d, from: entry.x, to: entry.x + entry.w },
      { axis: "x" as const, at: entry.x, from: entry.z, to: entry.z + entry.d },
      { axis: "x" as const, at: entry.x + entry.w, from: entry.z, to: entry.z + entry.d },
    ];

    for (const edge of edges) {
      const shared = sharedSpans(entry, edge, rooms);
      const cuts = mergeIntervals(shared.map((span) => [span.from, span.to]));
      for (const [from, to] of subtractInterval(edge.from, edge.to, cuts)) {
        pushWall(walls, edge.axis, edge.at, from, to, thickness, "shell", false);
      }
      for (const span of shared) {
        if (entry.id >= span.otherId) continue;
        if (opensIntoKitchen(entry, span)) continue;
        const role = entry.kind === "freezer" || span.kind === "freezer" ? "freezer" : "divider";
        const solid = role === "freezer" && !entry.absorbed && !span.absorbed;
        pushWall(walls, edge.axis, edge.at, span.from, span.to, thickness, solid ? "freezer" : "divider", !solid);
      }
    }
  }

  return walls;
}

export function hitsWall(layout: FloorLayout, x: number, z: number, radius: number): boolean {
  if (layout.polygons?.length) return hitsPolygon(layout, x, z, radius);
  if (!insideAny(layout, x, z)) return true;
  for (const wall of layoutWalls(layout)) {
    const nearestX = Math.max(wall.x, Math.min(x, wall.x + wall.w));
    const nearestZ = Math.max(wall.z, Math.min(z, wall.z + wall.d));
    const dx = x - nearestX;
    const dz = z - nearestZ;
    if (dx * dx + dz * dz < radius * radius) return true;
  }
  return false;
}

function room(layout: FloorLayout, id: string): RoomRect | null {
  return layout.rooms.find((entry) => entry.id === id) ?? null;
}

function findDining(layout: FloorLayout): RoomRect | null {
  return largest(layout.rooms.filter((entry) => entry.kind === "dining"));
}

export function diningCenter(layout: FloorLayout): { x: number; z: number } {
  const diningPoly = largestPolygon(layout.polygons?.filter((entry) => entry.kind === "dining" && !entry.absorbed) ?? []);
  if (diningPoly) return interiorPoint(diningPoly.points);
  const dining = findDining(layout);
  if (dining) return { x: dining.x + dining.w / 2, z: dining.z + dining.d / 2 };
  const tile = layout.tiles.reduce<(typeof layout.tiles)[number] | null>((best, entry) => {
    if (!best || entry.w * entry.d > best.w * best.d) return entry;
    return best;
  }, null);
  if (tile) return { x: tile.x + tile.w / 2, z: tile.z + tile.d / 2 };
  return { x: layout.width / 2, z: layout.depth / 2 };
}

function pickFloor(rooms: MeasuredRoom[]): number {
  const area = new Map<number, number>();
  for (const entry of rooms) {
    const size = (entry.max.x - entry.min.x) * (entry.max.z - entry.min.z);
    area.set(entry.floor, (area.get(entry.floor) ?? 0) + size);
  }
  let best = rooms[0]?.floor ?? 0;
  let bestArea = -1;
  for (const [floor, size] of area) {
    const hasNamed = rooms.some(
      (entry) => entry.floor === floor && (roomKind(entry.label) === "dining" || roomKind(entry.label) === "kitchen"),
    );
    const score = size + (hasNamed ? 1_000_000 : 0);
    if (score > bestArea) {
      best = floor;
      bestArea = score;
    }
  }
  return best;
}

function finish(layout: FloorLayout): FloorLayout {
  let maxX = 0;
  let maxZ = 0;
  for (const entry of [...layout.rooms, ...layout.tiles]) {
    maxX = Math.max(maxX, entry.x + entry.w);
    maxZ = Math.max(maxZ, entry.z + entry.d);
  }
  for (const poly of layout.polygons ?? []) {
    if (poly.absorbed) continue;
    for (const point of poly.points) {
      maxX = Math.max(maxX, point.x);
      maxZ = Math.max(maxZ, point.z);
    }
  }
  if (layout.floorplan) {
    maxX = Math.max(maxX, layout.floorplan.originX + layout.floorplan.widthM);
    maxZ = Math.max(maxZ, layout.floorplan.originZ + layout.floorplan.depthM);
  }
  return { ...layout, width: round(Math.max(maxX, 1)), depth: round(Math.max(maxZ, 1)) };
}

function largest(rooms: RoomRect[]): RoomRect | null {
  return rooms.reduce<RoomRect | null>((best, entry) => {
    if (!best || entry.w * entry.d > best.w * best.d) return entry;
    return best;
  }, null);
}

function insideAny(layout: FloorLayout, x: number, z: number): boolean {
  const inTile = layout.tiles.some((tile) => x >= tile.x + 0.05 && x <= tile.x + tile.w - 0.05 && z >= tile.z + 0.05 && z <= tile.z + tile.d - 0.05);
  if (inTile) return true;
  return layout.rooms.some(
    (entry) => x >= entry.x + 0.05 && x <= entry.x + entry.w - 0.05 && z >= entry.z + 0.05 && z <= entry.z + entry.d - 0.05,
  );
}

function footprint(points: { x: number; z: number }[], rooms: RoomRect[]): { tiles: FloorLayout["tiles"]; shell: WallRect[] } {
  const step = 0.85;
  const radius = 1.25;
  let maxX = 0;
  let maxZ = 0;
  for (const point of points) {
    maxX = Math.max(maxX, point.x);
    maxZ = Math.max(maxZ, point.z);
  }
  for (const entry of rooms) {
    maxX = Math.max(maxX, entry.x + entry.w);
    maxZ = Math.max(maxZ, entry.z + entry.d);
  }
  const cols = Math.max(1, Math.ceil(maxX / step) + 1);
  const rows = Math.max(1, Math.ceil(maxZ / step) + 1);
  const occupied: boolean[] = Array.from({ length: cols * rows }, () => false);
  const mark = (col: number, row: number) => {
    if (col < 0 || row < 0 || col >= cols || row >= rows) return;
    occupied[row * cols + col] = true;
  };
  const reach = Math.ceil(radius / step);
  for (const point of points) {
    const col = Math.floor(point.x / step);
    const row = Math.floor(point.z / step);
    for (let dz = -reach; dz <= reach; dz += 1) {
      for (let dx = -reach; dx <= reach; dx += 1) {
        if (dx * dx + dz * dz > reach * reach) continue;
        mark(col + dx, row + dz);
      }
    }
  }
  for (const entry of rooms) {
    const c0 = Math.floor(entry.x / step);
    const c1 = Math.floor((entry.x + entry.w) / step);
    const r0 = Math.floor(entry.z / step);
    const r1 = Math.floor((entry.z + entry.d) / step);
    for (let row = r0; row <= r1; row += 1) {
      for (let col = c0; col <= c1; col += 1) mark(col, row);
    }
  }

  const tiles: FloorLayout["tiles"] = [];
  for (let row = 0; row < rows; row += 1) {
    let col = 0;
    while (col < cols) {
      if (!occupied[row * cols + col]) {
        col += 1;
        continue;
      }
      let end = col;
      while (end < cols && occupied[row * cols + end]) end += 1;
      tiles.push({ x: round(col * step), z: round(row * step), w: round((end - col) * step), d: round(step) });
      col = end;
    }
  }

  const edges = new Map<string, [number, number][]>();
  const addEdge = (axis: "x" | "z", at: number, from: number, to: number) => {
    const key = `${axis}:${round(at)}`;
    const list = edges.get(key) ?? [];
    list.push([from, to]);
    edges.set(key, list);
  };
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (!occupied[row * cols + col]) continue;
      const x = col * step;
      const z = row * step;
      if (row === 0 || !occupied[(row - 1) * cols + col]) addEdge("z", z, x, x + step);
      if (row === rows - 1 || !occupied[(row + 1) * cols + col]) addEdge("z", z + step, x, x + step);
      if (col === 0 || !occupied[row * cols + col - 1]) addEdge("x", x, z, z + step);
      if (col === cols - 1 || !occupied[row * cols + col + 1]) addEdge("x", x + step, z, z + step);
    }
  }

  const shell: WallRect[] = [];
  const thickness = 0.12;
  for (const [key, spans] of edges) {
    const [axis, atText] = key.split(":");
    const at = Number(atText);
    for (const [from, to] of mergeIntervals(spans)) {
      pushWall(shell, axis === "x" ? "x" : "z", at, from, to, thickness, "shell", false);
    }
  }
  return { tiles, shell };
}

type Edge = { axis: "x" | "z"; at: number; from: number; to: number };

type Shared = { otherId: string; kind: RoomKind; absorbed: boolean; from: number; to: number };

function sharedSpans(entry: RoomRect, edge: Edge, rooms: RoomRect[]): Shared[] {
  const spans: Shared[] = [];
  for (const other of rooms) {
    if (other.id === entry.id) continue;
    if (edge.axis === "x") {
      const touches = Math.abs(other.x - edge.at) < NEIGHBOR || Math.abs(other.x + other.w - edge.at) < NEIGHBOR;
      if (!touches) continue;
      const from = Math.max(edge.from, other.z);
      const to = Math.min(edge.to, other.z + other.d);
      if (to - from > 0.35) spans.push({ otherId: other.id, kind: other.kind, absorbed: other.absorbed, from, to });
    } else {
      const touches = Math.abs(other.z - edge.at) < NEIGHBOR || Math.abs(other.z + other.d - edge.at) < NEIGHBOR;
      if (!touches) continue;
      const from = Math.max(edge.from, other.x);
      const to = Math.min(edge.to, other.x + other.w);
      if (to - from > 0.35) spans.push({ otherId: other.id, kind: other.kind, absorbed: other.absorbed, from, to });
    }
  }
  return spans;
}

function opensIntoKitchen(entry: RoomRect, span: Shared): boolean {
  const freezerSide = entry.kind === "freezer" || span.kind === "freezer";
  const kitchenSide = entry.kind === "kitchen" || span.kind === "kitchen";
  return freezerSide && kitchenSide && (entry.absorbed || span.absorbed);
}

function mergeIntervals(spans: [number, number][]): [number, number][] {
  const sorted = spans.filter(([from, to]) => to - from > 0.05).sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [from, to] of sorted) {
    const last = merged[merged.length - 1];
    if (last && from <= last[1] + 0.08) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }
  return merged;
}

function subtractInterval(from: number, to: number, cuts: [number, number][]): [number, number][] {
  let cursor = from;
  const open: [number, number][] = [];
  for (const [cutFrom, cutTo] of cuts) {
    const start = Math.max(cutFrom, from);
    const end = Math.min(cutTo, to);
    if (end <= start) continue;
    if (start - cursor > 0.08) open.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (to - cursor > 0.08) open.push([cursor, to]);
  return open;
}

function pushWall(
  walls: WallRect[],
  axis: "x" | "z",
  at: number,
  from: number,
  to: number,
  thickness: number,
  role: WallRole,
  door: boolean,
) {
  for (const [start, end] of door ? withDoor(from, to) : [[from, to] as [number, number]]) {
    if (end - start < 0.08) continue;
    if (axis === "x") walls.push({ x: at - thickness / 2, z: start, w: thickness, d: end - start, role });
    else walls.push({ x: start, z: at - thickness / 2, w: end - start, d: thickness, role });
  }
}

function withDoor(from: number, to: number): [number, number][] {
  const length = to - from;
  if (length < 1.2) return [[from, to]];
  const gap = Math.min(1.1, length * 0.42);
  const mid = (from + to) / 2;
  const pieces: [number, number][] = [
    [from, mid - gap / 2],
    [mid + gap / 2, to],
  ];
  return pieces.filter(([start, end]) => end - start > 0.08);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export type PlanRoomPixels = { label: string; pixels: [number, number][] };

export type PlanImage = {
  href: string;
  originX: number;
  originY: number;
  width: number;
  height: number;
  resolution: number;
};

/** Converts Gemini's pixel polygons into a measured plan, scaled only when the image is the whole building. */
export function layoutFromPlan(input: {
  modelId: string;
  squareFeet: number;
  rooms: PlanRoomPixels[];
  image: PlanImage;
  meshHref?: string;
  meshFormat?: string;
}): FloorLayout {
  const resolution = input.image.resolution > 0 ? input.image.resolution : 100;
  const image = { ...input.image, resolution };
  const normalized = input.rooms.every((room) =>
    room.pixels.every(([x, y]) => x >= 0 && y >= 0 && x <= 1.5 && y <= 1.5),
  );
  let polygons: RoomPolygon[] = input.rooms
    .map((room, index) => ({
      id: polygonId(room.label, index),
      label: room.label.trim() || "Room",
      kind: roomKind(room.label),
      points: simplify(pixelsToMeters(room.pixels, image, normalized)),
      absorbed: false,
    }))
    .filter((room) => room.points.length >= 3 && Math.abs(shoelace(room.points)) > 0.4);

  if (polygons.length === 0) return buildLayout(input.squareFeet);

  const areaSqft = polygons.reduce((sum, room) => sum + Math.abs(shoelace(room.points)), 0) * 10.76391041671;
  let scale = 1;
  if (input.squareFeet > 400 && areaSqft > input.squareFeet * 1.8) {
    scale = Math.sqrt(input.squareFeet / areaSqft);
  }

  const frame = {
    originX: image.originX,
    originZ: image.originY,
    widthM: image.width / resolution,
    depthM: image.height / resolution,
  };
  const cloud = polygons.flatMap((room) => room.points);
  const centroid = {
    x: cloud.reduce((sum, point) => sum + point.x, 0) / cloud.length,
    z: cloud.reduce((sum, point) => sum + point.z, 0) / cloud.length,
  };
  if (scale !== 1) {
    polygons = polygons.map((room) => ({ ...room, points: room.points.map((point) => scaleAbout(point, centroid, scale)) }));
    frame.originX = scaleAbout({ x: frame.originX, z: frame.originZ }, centroid, scale).x;
    frame.originZ = scaleAbout({ x: image.originX, z: image.originY }, centroid, scale).z;
    frame.widthM *= scale;
    frame.depthM *= scale;
  }

  let minX = frame.originX;
  let minZ = frame.originZ;
  for (const room of polygons) {
    for (const point of room.points) {
      minX = Math.min(minX, point.x);
      minZ = Math.min(minZ, point.z);
    }
  }
  const translate = { x: -minX, z: -minZ };
  polygons = polygons.map((room) => ({
    ...room,
    points: room.points.map((point) => ({ x: point.x + translate.x, z: point.z + translate.z })),
  }));
  frame.originX += translate.x;
  frame.originZ += translate.z;

  const align = {
    scale,
    x: centroid.x * (1 - scale) + translate.x,
    z: centroid.z * (1 - scale) + translate.z,
  };

  return commitPlan({
    width: 1,
    depth: 1,
    height: 3.05,
    thickness: 0.12,
    rooms: [],
    tiles: [],
    shell: [],
    polygons,
    basePolygons: polygons.map(clonePoly),
    floorplan: { href: image.href, ...frame },
    meshHref: input.meshHref,
    meshFormat: input.meshFormat,
    meshAlign: align,
    wallShift: 0,
    freezerRemoved: false,
    source: "plan",
    measuredKey: `plan:${input.modelId}:${polygons.map((room) => room.label).join("|")}`,
  });
}

export function roomFocus(layout: FloorLayout, id: string): Point2 | null {
  const poly = layout.polygons?.find((entry) => entry.id === id && !entry.absorbed);
  if (poly) return interiorPoint(poly.points);
  const rect = room(layout, id);
  if (!rect || rect.absorbed || rect.w < 0.3 || rect.d < 0.3) return null;
  return { x: rect.x + rect.w / 2, z: rect.z + rect.d / 2 };
}

export function roomAtPoint(layout: FloorLayout, x: number, z: number): string | null {
  if (layout.polygons?.length) {
    for (const poly of layout.polygons) {
      if (poly.absorbed) continue;
      if (pointInPolygon(poly.points, x, z)) return poly.id;
    }
    return null;
  }
  for (const entry of layout.rooms) {
    if (entry.absorbed || entry.w < 0.2 || entry.d < 0.2) continue;
    if (x >= entry.x && x <= entry.x + entry.w && z >= entry.z && z <= entry.z + entry.d) return entry.id;
  }
  return null;
}

export function wallSegments(layout: FloorLayout): WallSegment[] {
  const rooms = (layout.polygons ?? []).filter((entry) => !entry.absorbed && entry.points.length >= 3);
  const segments: WallSegment[] = [];
  for (const entry of rooms) {
    for (let index = 0; index < entry.points.length; index += 1) {
      const start = entry.points[index];
      const end = entry.points[(index + 1) % entry.points.length];
      const length = Math.hypot(end.x - start.x, end.z - start.z);
      if (length < 0.08) continue;
      const shared = rooms.find(
        (other) =>
          other.id !== entry.id &&
          other.points.some((_, edge) => edgesOverlap(start, end, other.points[edge], other.points[(edge + 1) % other.points.length])),
      );
      if (shared && entry.id > shared.id) continue;
      if (
        layout.openedWall &&
        shared &&
        ((entry.kind === "dining" && shared.kind === "kitchen") || (entry.kind === "kitchen" && shared.kind === "dining"))
      ) {
        continue;
      }
      const role: WallRole =
        !shared ? "shell" : entry.kind === "freezer" || shared.kind === "freezer" ? "freezer" : "divider";
      const solid = role !== "divider";
      for (const [from, to] of solid ? [[0, 1]] : doorParams(length)) {
        segments.push({
          x1: start.x + (end.x - start.x) * from,
          z1: start.z + (end.z - start.z) * from,
          x2: start.x + (end.x - start.x) * to,
          z2: start.z + (end.z - start.z) * to,
          role,
        });
      }
    }
  }
  return segments;
}

function commitPlan(layout: FloorLayout): FloorLayout {
  const rooms = layout.polygons ? rectsFromPolygons(layout.polygons) : layout.rooms;
  const finished = finish({ ...layout, rooms });
  return { ...finished, geometryKey: geometryKeyOf(finished) };
}

function rectsFromPolygons(polygons: RoomPolygon[]): RoomRect[] {
  return polygons.map((poly) => {
    const box = bounds(poly.points);
    return {
      id: poly.id,
      label: poly.label,
      kind: poly.kind,
      x: box.minX,
      z: box.minZ,
      w: Math.max(box.maxX - box.minX, 0),
      d: Math.max(box.maxZ - box.minZ, 0),
      absorbed: poly.absorbed,
    };
  });
}

function hitsPolygon(layout: FloorLayout, x: number, z: number, radius: number): boolean {
  const walkable = layout.polygons ?? [];
  const inside = walkable.some((poly) => pointInPolygon(poly.points, x, z) || ringDistance(poly.points, x, z) < 0.28);
  if (!inside) return true;
  return wallSegments(layout).some((segment) => segmentDistance(x, z, segment) < radius);
}

function pixelsToMeters(pixels: [number, number][], image: PlanImage, normalized: boolean): Point2[] {
  return pixels.map(([px, py]) => ({
    x: image.originX + (normalized ? px * image.width : px) / image.resolution,
    z: image.originY + (normalized ? py * image.height : py) / image.resolution,
  }));
}

function edgesOverlap(a1: Point2, a2: Point2, b1: Point2, b2: Point2): boolean {
  const distances = [pointSegDist(a1, b1, b2), pointSegDist(a2, b1, b2), pointSegDist(b1, a1, a2), pointSegDist(b2, a1, a2)];
  return distances.filter((distance) => distance < 0.55).length >= 2;
}

function pointSegDist(point: Point2, start: Point2, end: Point2): number {
  return segmentDistance(point.x, point.z, { x1: start.x, z1: start.z, x2: end.x, z2: end.z, role: "shell" });
}

function segmentDistance(x: number, z: number, segment: WallSegment): number {
  const dx = segment.x2 - segment.x1;
  const dz = segment.z2 - segment.z1;
  const length = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((x - segment.x1) * dx + (z - segment.z1) * dz) / length));
  return Math.hypot(x - (segment.x1 + dx * t), z - (segment.z1 + dz * t));
}

function ringDistance(points: Point2[], x: number, z: number): number {
  let best = Infinity;
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    best = Math.min(best, pointSegDist({ x, z }, start, end));
  }
  return best;
}

function doorParams(length: number): [number, number][] {
  if (length < 1.35) return [[0, 1]];
  const gap = Math.min(1.35, length * 0.46) / length;
  return [
    [0, 0.5 - gap / 2],
    [0.5 + gap / 2, 1],
  ].filter(([start, end]) => (end - start) * length > 0.08) as [number, number][];
}

function scaleAbout(point: Point2, center: Point2, scale: number): Point2 {
  return { x: center.x + (point.x - center.x) * scale, z: center.z + (point.z - center.z) * scale };
}

function simplify(points: Point2[]): Point2[] {
  if (points.length <= 28) return points;
  const kept = [points[0]];
  for (const point of points.slice(1)) {
    const last = kept[kept.length - 1];
    if (Math.hypot(point.x - last.x, point.z - last.z) >= 0.15) kept.push(point);
  }
  return kept.length >= 3 ? kept : points;
}

function geometryKeyOf(layout: FloorLayout): string {
  const body = (layout.polygons ?? [])
    .map((poly) => `${poly.id}:${poly.absorbed ? 1 : 0}:${poly.points.map((point) => `${point.x.toFixed(2)},${point.z.toFixed(2)}`).join(";")}`)
    .join("|");
  return `${layout.openedWall ? "open" : "shut"}|${body}`;
}

function polygonId(label: string, index: number): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "room";
  return `${base}-${index}`;
}

function clonePoly(poly: RoomPolygon): RoomPolygon {
  return { ...poly, points: poly.points.map((point) => ({ ...point })) };
}

function largestPolygon(rooms: RoomPolygon[]): RoomPolygon | null {
  return rooms.reduce<RoomPolygon | null>((best, entry) => {
    if (!best || Math.abs(shoelace(entry.points)) > Math.abs(shoelace(best.points))) return entry;
    return best;
  }, null);
}

function bounds(points: Point2[]) {
  return points.reduce(
    (box, point) => ({
      minX: Math.min(box.minX, point.x),
      minZ: Math.min(box.minZ, point.z),
      maxX: Math.max(box.maxX, point.x),
      maxZ: Math.max(box.maxZ, point.z),
    }),
    { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity },
  );
}

function interiorPoint(points: Point2[]): Point2 {
  if (points.length === 0) return { x: 0, z: 0 };
  const center = centroid(points);
  if (pointInPolygon(points, center.x, center.z)) return center;
  const box = bounds(points);
  const mid = { x: (box.minX + box.maxX) / 2, z: (box.minZ + box.maxZ) / 2 };
  if (pointInPolygon(points, mid.x, mid.z)) return mid;
  return points[0];
}

function centroid(points: Point2[]): Point2 {
  const sum = points.reduce((total, point) => ({ x: total.x + point.x, z: total.z + point.z }), { x: 0, z: 0 });
  return { x: sum.x / points.length, z: sum.z / points.length };
}

function shoelace(points: Point2[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    area += points[index].x * next.z - next.x * points[index].z;
  }
  return area / 2;
}

function pointInPolygon(points: Point2[], x: number, z: number): boolean {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const current = points[index];
    const prior = points[previous];
    const crosses = current.z > z !== prior.z > z;
    if (crosses && x < ((prior.x - current.x) * (z - current.z)) / (prior.z - current.z || 1e-9) + current.x) inside = !inside;
  }
  return inside;
}
