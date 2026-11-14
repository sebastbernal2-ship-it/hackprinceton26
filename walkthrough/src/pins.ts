// Finding pins: a billboard marker per anchored finding, coloured by severity, with a stem to the surface.
// Inferred or unknown surfaces get a different look (violet hollow ring with a slash) so they cannot be
// mistaken for evidence. Picking is a raycast against the markers.

import * as THREE from 'three';
import { SEVERITY_COLOR, type DefectFinding, type SurfaceStatus } from './findings.ts';

export interface Pin {
  finding: DefectFinding;
  surface: SurfaceStatus | 'unknown';
  /** True when the anchor is far from any scanned surface (meshes only). */
  floating: boolean;
  position: THREE.Vector3;
  sprite: THREE.Sprite;
  stem: THREE.Line;
}

const INFERRED = '#8c5cff';

function markerTexture(color: string, surface: Pin['surface'], selected: boolean): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.translate(S / 2, S / 2);
  const r = 44;
  g.lineWidth = 12;
  if (surface === 'captured' || surface === 'unknown') {
    g.fillStyle = color;
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    g.lineWidth = selected ? 14 : 8;
    g.strokeStyle = '#ffffff';
    g.stroke();
    g.fillStyle = '#ffffff';
    g.font = 'bold 56px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(surface === 'unknown' ? '?' : '!', 0, 3);
  } else {
    // inferred: hollow violet ring, dashed, slashed through
    g.strokeStyle = INFERRED;
    g.setLineDash([14, 10]);
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
    g.fillStyle = 'rgba(140,92,255,0.18)';
    g.beginPath(); g.arc(0, 0, r - 6, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(-26, 26); g.lineTo(26, -26); g.stroke();
    if (selected) { g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath(); g.arc(0, 0, r + 12, 0, Math.PI * 2); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class PinLayer {
  readonly group = new THREE.Group();
  readonly pins: Pin[] = [];
  private selected: Pin | null = null;
  private ray = new THREE.Raycaster();
  private textures = new Map<string, THREE.CanvasTexture>();

  constructor() {
    this.group.name = 'finding-pins';
    this.group.renderOrder = 800;
  }

  private tex(color: string, surface: Pin['surface'], selected: boolean): THREE.CanvasTexture {
    const k = `${color}|${surface}|${selected}`;
    let t = this.textures.get(k);
    if (!t) this.textures.set(k, (t = markerTexture(color, surface, selected)));
    return t;
  }

  add(finding: DefectFinding, surface: Pin['surface'], floating: boolean): Pin | null {
    const a = finding.anchor;
    if (!a) return null;
    const position = new THREE.Vector3(a.x, a.y, a.z);
    const mat = new THREE.SpriteMaterial({ map: this.tex(SEVERITY_COLOR[finding.severity], surface, false), depthTest: false, depthWrite: false, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(position);
    sprite.renderOrder = 800;
    sprite.userData.pinId = finding.id;
    const stemGeo = new THREE.BufferGeometry().setFromPoints([position.clone(), new THREE.Vector3(a.x, 0, a.z)]);
    const stem = new THREE.Line(stemGeo, new THREE.LineBasicMaterial({ color: surface === 'inferred' ? INFERRED : SEVERITY_COLOR[finding.severity], transparent: true, opacity: 0.45, depthTest: false }));
    stem.renderOrder = 799;
    this.group.add(stem, sprite);
    const pin: Pin = { finding, surface, floating, position, sprite, stem };
    this.pins.push(pin);
    return pin;
  }

  select(pin: Pin | null): void {
    if (this.selected) this.selected.sprite.material.map = this.tex(SEVERITY_COLOR[this.selected.finding.severity], this.selected.surface, false);
    this.selected = pin;
    if (pin) pin.sprite.material.map = this.tex(SEVERITY_COLOR[pin.finding.severity], pin.surface, true);
    for (const p of this.pins) p.sprite.material.needsUpdate = true;
  }

  /** Keeps markers a readable size on screen: ~0.06 of the distance, never tiny up close or huge far away. */
  update(camera: THREE.Camera): void {
    const cp = camera.getWorldPosition(new THREE.Vector3());
    for (const p of this.pins) {
      const d = cp.distanceTo(p.position);
      const s = THREE.MathUtils.clamp(d * 0.07, 0.2, 0.7);
      p.sprite.scale.set(s, s, 1);
    }
  }

  pick(origin: THREE.Vector3, direction: THREE.Vector3): Pin | null {
    this.ray.set(origin, direction.clone().normalize());
    const hits = this.ray.intersectObjects(this.pins.map((p) => p.sprite), false);
    const id = hits[0]?.object.userData.pinId;
    return this.pins.find((p) => p.finding.id === id) ?? null;
  }
}
