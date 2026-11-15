import * as THREE from "three";

/** Cube-face textures, decoded off the main thread, capped at 1024 px, shared and LRU-evicted. Client only. */

export const MAX_TEXTURE_PX = 1024;

type Entry = { promise: Promise<THREE.Texture>; texture?: THREE.Texture; used: number };

export class TextureStore {
  private entries = new Map<string, Entry>();
  private tick = 0;

  constructor(
    private readonly cap: number,
    /** urls currently on screen are never evicted */
    private readonly inUse: (url: string) => boolean,
  ) {}

  get(url: string): THREE.Texture | undefined {
    const e = this.entries.get(url);
    if (e) e.used = ++this.tick;
    return e?.texture;
  }

  load(url: string): Promise<THREE.Texture> {
    const hit = this.entries.get(url);
    if (hit) {
      hit.used = ++this.tick;
      return hit.promise;
    }
    const entry: Entry = { used: ++this.tick, promise: Promise.resolve(null as unknown as THREE.Texture) };
    entry.promise = decode(url).then((tex) => {
      if (!this.entries.has(url)) {
        tex.dispose();
        throw new Error("evicted");
      }
      entry.texture = tex;
      this.evict();
      return tex;
    });
    entry.promise.catch(() => this.entries.delete(url));
    this.entries.set(url, entry);
    return entry.promise;
  }

  private evict() {
    if (this.entries.size <= this.cap) return;
    const order = [...this.entries.entries()].filter(([u, e]) => e.texture && !this.inUse(u)).sort((a, b) => a[1].used - b[1].used);
    for (const [url, e] of order) {
      if (this.entries.size <= this.cap) break;
      disposeTexture(e.texture!);
      this.entries.delete(url);
    }
  }

  dispose() {
    for (const e of this.entries.values()) if (e.texture) disposeTexture(e.texture);
    this.entries.clear();
  }
}

function disposeTexture(t: THREE.Texture) {
  const img = t.image as ImageBitmap | undefined;
  t.dispose();
  if (img && typeof img.close === "function") img.close();
}

async function decode(url: string): Promise<THREE.Texture> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`face ${res.status}`);
  const blob = await res.blob();
  // flipY here because ImageBitmap textures ignore texture.flipY; resize caps every face at 1024 and squares it
  const bitmap = await createImageBitmap(blob, { imageOrientation: "flipY", resizeWidth: MAX_TEXTURE_PX, resizeHeight: MAX_TEXTURE_PX, resizeQuality: "high" });
  const tex = new THREE.Texture(bitmap);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}
