// The built-in DEMO scene: a box room generated in code, plus synthetic findings. Nothing here was captured
// from a real place; the UI labels it DEMO everywhere. The annex is flagged as inferred (userData.captured =
// false) to show the reality-check tint and how a pin on an uncaptured surface is treated.

import * as THREE from 'three';
import type { DefectFinding } from './findings.ts';

function checker(a: string, b: string, n = 8): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    g.fillStyle = (x + y) % 2 ? a : b;
    g.fillRect((x * 256) / n, (y * 256) / n, 256 / n, 256 / n);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildDemoRoom(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'demo-room';
  const floorTex = checker('#b9a98f', '#a89877');
  floorTex.repeat.set(8, 6);
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 1 });
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 1 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x6b5d4f, roughness: 0.8 });
  const box = (name: string, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, inferred = false) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.name = name;
    m.position.set(x, y, z);
    if (inferred) m.userData.captured = false;
    root.add(m);
    return m;
  };
  // main room x -4..4, z -3..3, height 3
  box('floor', 8, 0.1, 6, 0, -0.05, 0, floorMat);
  box('ceiling', 8, 0.1, 6, 0, 3.05, 0, ceilMat);
  box('wall-north', 8, 3, 0.1, 0, 1.5, -3.05, wallMat);
  box('wall-south', 8, 3, 0.1, 0, 1.5, 3.05, wallMat);
  box('wall-west', 0.1, 3, 6, -4.05, 1.5, 0, wallMat);
  // east wall with a doorway (z -0.6..0.6, 2.1 m high) into the annex
  box('wall-east-a', 0.1, 3, 2.4, 4.05, 1.5, -1.8, wallMat);
  box('wall-east-b', 0.1, 3, 2.4, 4.05, 1.5, 1.8, wallMat);
  box('wall-east-lintel', 0.1, 0.9, 1.2, 4.05, 2.55, 0, wallMat);
  // furniture
  box('counter', 2.4, 0.9, 0.7, -2, 0.45, -2.5, darkMat);
  box('pillar', 0.4, 3, 0.4, 1.5, 1.5, 0.5, wallMat);
  // a darker patch on the ceiling that the demo finding points at
  const stain = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.8), new THREE.MeshBasicMaterial({ color: 0x9a7b4f, transparent: true, opacity: 0.55 }));
  stain.rotation.x = Math.PI / 2;
  stain.position.set(2, 2.995, -1);
  stain.name = 'ceiling-patch';
  root.add(stain);
  // annex x 4.1..6.6, z -2..2: NOT captured (inferred), so tinted and not evidence
  box('annex-floor', 2.5, 0.1, 4, 5.35, -0.05, 0, floorMat, true);
  box('annex-ceiling', 2.5, 0.1, 4, 5.35, 2.65, 0, ceilMat, true);
  box('annex-wall-end', 0.1, 2.6, 4, 6.65, 1.3, 0, wallMat, true);
  box('annex-wall-n', 2.5, 2.6, 0.1, 5.35, 1.3, -2.05, wallMat, true);
  box('annex-wall-s', 2.5, 2.6, 0.1, 5.35, 1.3, 2.05, wallMat, true);
  return root;
}

const base = {
  roomId: 'demo-room',
  canConfirmFromImagery: false,
  costLineItemIds: [] as string[],
};

export const DEMO_FINDINGS: { _label: string; findings: DefectFinding[] } = {
  _label: 'DEMO - SYNTHETIC SAMPLE. Not from any real property.',
  findings: [
    { ...base, id: 'demo-1', category: 'ceiling_water_damage', title: '[DEMO] Possible staining on ceiling', severity: 'medium', modelConfidence: 0.55,
      description: 'SYNTHETIC. A darker patch on the ceiling that could be old water staining or just paint. Not observed at any real site.',
      evidence: { source: 'panorama', ref: 'demo-room/ceiling-patch', region: { x: 0.52, y: 0.08, w: 0.2, h: 0.12 } },
      verificationStep: 'Inspector checks the roof and ceiling void above for active leaks and moisture-meter reads the surface.',
      costLineItemIds: ['demo-cost-ceiling-repair'], anchor: { x: 2, y: 2.9, z: -1 } },
    { ...base, id: 'demo-2', category: 'kitchen_infrastructure', title: '[DEMO] No exhaust hood seen over the counter', severity: 'unknown', modelConfidence: 0.4,
      description: 'SYNTHETIC. No hood is visible above the counter in the capture. Not seeing one does not mean there is none on site.',
      evidence: { source: 'panorama', ref: 'demo-room/north-wall', region: null },
      verificationStep: 'Inspector confirms roof penetrations, shaft routing and whether the landlord permits a hood and grease duct.',
      costLineItemIds: ['demo-cost-hood'], anchor: { x: -2, y: 2.2, z: -2.95 } },
    { ...base, id: 'demo-3', category: 'electrical', title: '[DEMO] Electrical panel of unclear capacity', severity: 'low', modelConfidence: 0.3,
      description: 'SYNTHETIC. A panel is visible on the west wall; its rating cannot be read from the capture.',
      evidence: { source: 'panorama', ref: 'demo-room/west-wall', region: { x: 0.1, y: 0.4, w: 0.08, h: 0.15 } },
      verificationStep: 'Electrician reads the panel rating and age and compares them with the planned kitchen load.',
      costLineItemIds: [], anchor: { x: -3.95, y: 1.5, z: 0.5 } },
    { ...base, id: 'demo-4', category: 'layout_inefficiency', title: '[DEMO] Column sits in the main aisle', severity: 'high', modelConfidence: 0.35,
      description: 'SYNTHETIC. A column in the middle of the room may cut the usable seating area and the service path.',
      evidence: { source: 'floorplan_geometry', ref: 'demo-room/pillar', region: null },
      canConfirmFromImagery: true,
      verificationStep: 'Inspector measures clear aisle width at the column and checks whether it is structural before any layout plan assumes it can move.',
      costLineItemIds: ['demo-cost-layout'], anchor: { x: 1.5, y: 1.3, z: 0.5 } },
    { ...base, id: 'demo-5', category: 'walls_finishes', title: '[DEMO] Finish condition in the annex', severity: 'low', modelConfidence: 0.2,
      description: 'SYNTHETIC. This pin sits in the annex, a room that was never captured (inferred). It is shown only to demonstrate how the viewer treats such a spot.',
      evidence: { source: 'panorama', ref: 'demo-room/annex', region: null },
      verificationStep: 'Nothing to verify from this pin: the surface was not captured. Capture the annex before drawing any conclusion.',
      costLineItemIds: [], anchor: { x: 6.5, y: 1.3, z: 0 } },
    { ...base, id: 'demo-6', category: 'egress_accessibility', title: '[DEMO] Rear exit not described in listing', severity: 'unknown', modelConfidence: 0.25,
      description: 'SYNTHETIC. The listing text does not mention a second exit. This has no 3D position, so it is listed without a pin.',
      evidence: { source: 'listing_text', ref: 'demo-listing', region: null },
      verificationStep: 'Inspector counts exits, checks door widths and the path to the street against the fire code.',
      costLineItemIds: [] },
  ],
};
