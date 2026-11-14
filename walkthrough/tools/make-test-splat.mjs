// Writes a tiny synthetic 3DGS .ply of the DEMO box room (plus an optional "inferred" annex part) so the splat
// path can be exercised with no downloads. NOT a capture of anything. Usage:
//   node tools/make-test-splat.mjs <out-dir>
// writes <out-dir>/room.ply (captured room), <out-dir>/annex.ply (inferred part), <out-dir>/findings.json
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2];
if (!out) { console.error('usage: node tools/make-test-splat.mjs <out-dir>'); process.exit(1); }
mkdirSync(out, { recursive: true });
const S = Math.SQRT1_2;
const Q = { z: [0, 0, 0, 1], floor: [S, 0, 0, S], side: [0, S, 0, S] }; // x,y,z,w; flat axis is the splat's z
const c2sh = (c) => (c - 0.5) / 0.28209479;
const logit = (p) => Math.log(p / (1 - p));

function plane(list, [x0, y0, z0], [x1, y1, z1], axis, q, colorFn, step = 0.05) {
  // axis: which two coordinates vary ('xz' floor/ceiling, 'xy' north/south walls, 'zy' east/west walls)
  const a = axis[0], b = axis[1];
  const lo = { x: x0, y: y0, z: z0 }, hi = { x: x1, y: y1, z: z1 };
  for (let u = lo[a]; u < hi[a]; u += step) for (let v = lo[b]; v < hi[b]; v += step) {
    const p = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 };
    p[a] = u + step / 2; p[b] = v + step / 2;
    list.push({ ...p, q, c: colorFn(p) });
  }
}
const checker = (p) => ((Math.floor(p.x * 2) + Math.floor(p.z * 2)) & 1 ? [0.72, 0.66, 0.54] : [0.66, 0.59, 0.47]);
const wall = () => [0.91, 0.89, 0.84];
const ceil = () => [0.95, 0.94, 0.91];

const room = [];
plane(room, [-4, 0, -3], [4, 0, 3], 'xz', Q.floor, checker);
plane(room, [-4, 3, -3], [4, 3, 3], 'xz', Q.floor, ceil);
plane(room, [-4, 0, -3], [4, 3, -3], 'xy', Q.z, wall);
plane(room, [-4, 0, 3], [4, 3, 3], 'xy', Q.z, wall);
plane(room, [-4, 0, -3], [-4, 3, 3], 'zy', Q.side, wall);
// east wall with a doorway z -0.6..0.6 up to 2.1
plane(room, [4, 0, -3], [4, 3, -0.6], 'zy', Q.side, wall);
plane(room, [4, 0, 0.6], [4, 3, 3], 'zy', Q.side, wall);
plane(room, [4, 2.1, -0.6], [4, 3, 0.6], 'zy', Q.side, wall);
const annex = [];
plane(annex, [4, 0, -2], [6.6, 0, 2], 'xz', Q.floor, checker);
plane(annex, [4, 2.6, -2], [6.6, 2.6, 2], 'xz', Q.floor, ceil);
plane(annex, [4, 0, -2], [6.6, 2.6, -2], 'xy', Q.z, wall);
plane(annex, [4, 0, 2], [6.6, 2.6, 2], 'xy', Q.z, wall);
plane(annex, [6.6, 0, -2], [6.6, 2.6, 2], 'zy', Q.side, wall);

function ply(list, file) {
  const props = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3'];
  const head = `ply\nformat binary_little_endian 1.0\nelement vertex ${list.length}\n${props.map((p) => `property float ${p}`).join('\n')}\nend_header\n`;
  const buf = Buffer.alloc(list.length * props.length * 4);
  list.forEach((s, i) => {
    const [r, g, b] = s.c;
    const [qx, qy, qz, qw] = s.q;
    const v = [s.x, s.y, s.z, c2sh(r), c2sh(g), c2sh(b), logit(0.97), Math.log(0.04), Math.log(0.04), Math.log(0.006), qw, qx, qy, qz];
    v.forEach((x, k) => buf.writeFloatLE(x, (i * props.length + k) * 4));
  });
  writeFileSync(file, Buffer.concat([Buffer.from(head), buf]));
  console.log(file, list.length, 'splats', ((head.length + buf.length) / 1e6).toFixed(2), 'MB');
}
writeFileSync(join(out, 'findings.json'), "{\"_label\":\"DEMO - synthetic test file\",\"findings\":[\n{\"id\":\"s-1\",\"roomId\":null,\"category\":\"ceiling_water_damage\",\"title\":\"[TEST] Possible staining on ceiling\",\"description\":\"Synthetic.\",\"severity\":\"medium\",\"modelConfidence\":0.55,\"evidence\":{\"source\":\"panorama\",\"ref\":\"test\",\"region\":null},\"canConfirmFromImagery\":false,\"verificationStep\":\"Inspector checks the ceiling void.\",\"costLineItemIds\":[\"c-1\"],\"anchor\":{\"x\":2,\"y\":2.9,\"z\":-1}},\n{\"id\":\"s-2\",\"roomId\":null,\"category\":\"layout_inefficiency\",\"title\":\"[TEST] Pin in an uncaptured annex\",\"description\":\"Synthetic.\",\"severity\":\"high\",\"modelConfidence\":0.3,\"evidence\":{\"source\":\"floorplan_geometry\",\"ref\":\"test\",\"region\":null},\"canConfirmFromImagery\":true,\"verificationStep\":\"Capture the annex first.\",\"costLineItemIds\":[],\"anchor\":{\"x\":6.5,\"y\":1.3,\"z\":0},\"surfaceStatus\":\"inferred\"},\n{\"id\":\"s-bad\",\"title\":\"missing most fields\"}\n]}" + '\n');
ply(room, join(out, 'room.ply'));
ply(annex, join(out, 'annex.ply'));
