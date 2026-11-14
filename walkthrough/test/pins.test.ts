import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { raycastSprites } from '../src/pins.ts';

function scene() {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(0, 0, 5);
  camera.updateMatrixWorld(true);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
  sprite.position.set(0, 0, 0);
  sprite.scale.set(1, 1, 1);
  sprite.userData.pinId = 'p1';
  sprite.updateMatrixWorld(true);
  return { camera, sprite };
}

test('a ray through a sprite hits it when the camera is provided', () => {
  const { camera, sprite } = scene();
  const hits = raycastSprites(new THREE.Raycaster(), camera, new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1), [sprite]);
  assert.equal(hits[0]?.object.userData.pinId, 'p1');
});

test('a ray that misses returns no hits', () => {
  const { camera, sprite } = scene();
  const hits = raycastSprites(new THREE.Raycaster(), camera, new THREE.Vector3(5, 5, 5), new THREE.Vector3(0, 0, -1), [sprite]);
  assert.equal(hits.length, 0);
});

test('without setting the camera, three.js throws on sprite raycast (the bug this guards against)', () => {
  const { sprite } = scene();
  const ray = new THREE.Raycaster();
  ray.set(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1));
  assert.throws(() => ray.intersectObjects([sprite], false));
});
