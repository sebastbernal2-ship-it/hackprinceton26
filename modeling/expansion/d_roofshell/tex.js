// Procedural textures (canvas) for d_roofshell. All sizes in metres are noted per texture.
import * as THREE from '../../vendor/three.module.min.js';

export function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// value noise on a periodic lattice
export function makeNoise(seed, period) {
  const r = rng(seed), g = new Float32Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const sm = t => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = sm(x - xi), fy = sm(y - yi);
    const P = period, a = ((xi % P) + P) % P, b = ((yi % P) + P) % P, a1 = (a + 1) % P, b1 = (b + 1) % P;
    const v00 = g[b * P + a], v10 = g[b * P + a1], v01 = g[b1 * P + a], v11 = g[b1 * P + a1];
    return (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy;
  };
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function toTex(c, srgb = true, rep = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(rep, rep);
  return t;
}
const clamp = v => v < 0 ? 0 : v > 255 ? 255 : v;

// Asphalt 3-tab shingles, weathered light grey. Tile = 2 m (along eave) x 2 m (up slope).
export function shingleTex(base = [178, 181, 180]) {
  const W = 1024, c = canvas(W, W), x = c.getContext('2d'), img = x.createImageData(W, W), d = img.data;
  const bump = canvas(W, W), bx = bump.getContext('2d'), bimg = bx.createImageData(W, W), bd = bimg.data;
  const R = rng(7), n1 = makeNoise(3, 16), n2 = makeNoise(5, 64);
  const courses = 14, ch = W / courses, tabW = W / 6;
  const tabShade = []; for (let i = 0; i < courses * 8; i++) tabShade.push((R() - 0.5) * 22);
  for (let y = 0; y < W; y++) {
    const ci = Math.floor(y / ch), fy = (y - ci * ch) / ch; // fy 0 = bottom edge of course (image top = eave side? we flip below)
    const off = (ci % 3) * tabW / 3;
    for (let xx = 0; xx < W; xx++) {
      const ti = Math.floor((xx + off) / tabW), fx = ((xx + off) % tabW) / tabW;
      let s = tabShade[(ci * 8 + ti) % tabShade.length];
      const gran = (R() - 0.5) * 34;
      const weather = (n1(xx / 64, y / 64) - 0.5) * 30 + (n2(xx / 16, y / 16) - 0.5) * 10;
      let shade = 0, h = 200;
      if (fy < 0.10) { shade = -38 * (1 - fy / 0.10); h = 80 + 1200 * fy; } // shadow under the course above (butt edge)
      if (fx < 0.012 || fx > 0.988) { if (fy < 0.55) { shade -= 45; h = 70; } } // keyway slots
      const v = s + gran + weather + shade;
      const k = (y * W + xx) * 4;
      d[k] = clamp(base[0] + v); d[k + 1] = clamp(base[1] + v); d[k + 2] = clamp(base[2] + v * 1.02); d[k + 3] = 255;
      const bb = clamp(h + gran * 0.6); bd[k] = bd[k + 1] = bd[k + 2] = bb; bd[k + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0); bx.putImageData(bimg, 0, 0);
  const map = toTex(c), bm = toTex(bump, false);
  map.repeat.set(0.5, 0.5); bm.repeat.set(0.5, 0.5);
  return { map, bump: bm };
}

// Smooth sand-finish stucco. Tile = 2 m.
export function stuccoTex(base = [236, 233, 225]) {
  const W = 512, c = canvas(W, W), x = c.getContext('2d'), img = x.createImageData(W, W), d = img.data;
  const b = canvas(W, W), bx = b.getContext('2d'), bimg = bx.createImageData(W, W), bd = bimg.data;
  const R = rng(11), n1 = makeNoise(13, 8), n2 = makeNoise(17, 32), n3 = makeNoise(19, 128);
  for (let y = 0; y < W; y++) for (let xx = 0; xx < W; xx++) {
    const k = (y * W + xx) * 4;
    const lo = (n1(xx / 64, y / 64) - 0.5) * 10 + (n2(xx / 16, y / 16) - 0.5) * 5;
    const fine = (n3(xx / 4, y / 4) - 0.5) * 10 + (R() - 0.5) * 6;
    const v = lo + fine * 0.6;
    d[k] = clamp(base[0] + v); d[k + 1] = clamp(base[1] + v); d[k + 2] = clamp(base[2] + v * 0.95); d[k + 3] = 255;
    const h = 128 + fine * 4; bd[k] = bd[k + 1] = bd[k + 2] = clamp(h); bd[k + 3] = 255;
  }
  x.putImageData(img, 0, 0); bx.putImageData(bimg, 0, 0);
  const map = toTex(c), bm = toTex(b, false); map.repeat.set(0.5, 0.5); bm.repeat.set(0.5, 0.5);
  return { map, bump: bm };
}

// Broom-finished concrete. Tile = 2 m.
export function concreteTex(base = [196, 193, 186]) {
  const W = 512, c = canvas(W, W), x = c.getContext('2d'), img = x.createImageData(W, W), d = img.data;
  const R = rng(23), n1 = makeNoise(29, 8), n2 = makeNoise(31, 64);
  for (let y = 0; y < W; y++) for (let xx = 0; xx < W; xx++) {
    const k = (y * W + xx) * 4;
    const v = (n1(xx / 64, y / 64) - 0.5) * 18 + (n2(xx / 8, y / 8) - 0.5) * 8 + (R() - 0.5) * 14;
    d[k] = clamp(base[0] + v); d[k + 1] = clamp(base[1] + v); d[k + 2] = clamp(base[2] + v); d[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = toTex(c); t.repeat.set(0.5, 0.5); return t;
}

// Oak strip flooring, 57 mm strips, tinted with colours sampled from the scanned bedroom floor. Tile = 2 m.
export function woodTex(cDark, cMid, cLight) {
  const W = 1024, c = canvas(W, W), x = c.getContext('2d');
  const R = rng(41), stripPx = W / 2 * 0.057;
  const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  for (let sx = 0; sx < W; sx += stripPx) {
    let y = -R() * 400;
    while (y < W) {
      const len = 200 + R() * 500, t = R();
      const col = t < 0.5 ? lerp(cDark, cMid, t * 2) : lerp(cMid, cLight, (t - 0.5) * 2);
      x.fillStyle = `rgb(${col.map(Math.round).join(',')})`;
      x.fillRect(sx, y, stripPx, len);
      // grain
      for (let g = 0; g < 7; g++) {
        const gx = sx + R() * stripPx; x.strokeStyle = `rgba(40,20,5,${0.05 + R() * 0.08})`; x.lineWidth = 0.6 + R();
        x.beginPath(); x.moveTo(gx, y); for (let yy = y; yy < y + len; yy += 20) x.lineTo(gx + Math.sin(yy * 0.03 + g) * 1.5, yy); x.stroke();
      }
      x.fillStyle = 'rgba(30,15,5,0.55)'; x.fillRect(sx, y, stripPx, 1.5); // butt joint
      y += len;
    }
    x.fillStyle = 'rgba(30,15,5,0.45)'; x.fillRect(sx, 0, 1.2, W); // strip seam
  }
  const t = toTex(c); t.repeat.set(0.5, 0.5); return t;
}

// Grass detail tile (1 m) - used as a multiplicative detail layer on the site texture.
export function grassDetailTex() {
  const W = 512, c = canvas(W, W), x = c.getContext('2d');
  x.fillStyle = 'rgb(128,128,128)'; x.fillRect(0, 0, W, W);
  const R = rng(53);
  for (let i = 0; i < 26000; i++) {
    const px = R() * W, py = R() * W, l = 3 + R() * 7, a = (R() - 0.5) * 1.2;
    const v = 90 + R() * 90;
    x.strokeStyle = `rgba(${v},${v + 8},${v - 10},0.55)`; x.lineWidth = 1 + R() * 0.8;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.sin(a) * l, py - Math.cos(a) * l); x.stroke();
    // wrap copies near borders for seamless tiling
    if (px < 10 || py < 10) { x.beginPath(); x.moveTo(px + W, py + W); x.lineTo(px + W + Math.sin(a) * l, py + W - Math.cos(a) * l); x.stroke(); }
  }
  const t = toTex(c, false); return t;
}

// Leafy canopy texture
export function leafTex(base = [64, 92, 48]) {
  const W = 256, c = canvas(W, W), x = c.getContext('2d');
  x.fillStyle = `rgb(${base.join(',')})`; x.fillRect(0, 0, W, W);
  const R = rng(61);
  for (let i = 0; i < 2600; i++) {
    const v = (R() - 0.5) * 70;
    x.fillStyle = `rgba(${clamp(base[0] + v)},${clamp(base[1] + v * 1.1)},${clamp(base[2] + v * 0.7)},0.8)`;
    x.beginPath(); x.ellipse(R() * W, R() * W, 2 + R() * 4, 1 + R() * 2.5, R() * 3, 0, 7); x.fill();
  }
  return toTex(c);
}

// Vertical board fence (tile 2 m wide x 1.8 m)
export function fenceTex() {
  const W = 512, H = 460, c = canvas(W, H), x = c.getContext('2d'); const R = rng(71);
  for (let b = 0; b < 14; b++) {
    const v = (R() - 0.5) * 30; x.fillStyle = `rgb(${150 + v},${112 + v},${78 + v})`; x.fillRect(b * W / 14, 0, W / 14, H);
    for (let g = 0; g < 10; g++) { x.fillStyle = `rgba(70,45,25,${R() * 0.15})`; x.fillRect(b * W / 14 + R() * W / 14, 0, 1, H); }
    x.fillStyle = 'rgba(40,25,10,0.6)'; x.fillRect(b * W / 14, 0, 1.5, H);
  }
  return toTex(c);
}
