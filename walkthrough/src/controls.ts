// Desktop and touch input (ported from Deja-View desktop.ts, HUD and shortcuts for removed features dropped):
// pointer-lock mouse look with drag as the fallback, WASD + Shift, F fly with Q/E, twin-zone touch.
// A click that is not a drag is reported to `onClick` so the app can pick a pin before grabbing the pointer.

import type { MoveInput } from './player.ts';

const MOUSE_SENS = 0.0022;
const DRAG_SENS = 0.0042;
const TOUCH_LOOK_SENS = 0.0055;
const STICK_RADIUS = 56;

interface TouchState { id: number; kind: 'move' | 'look'; x0: number; y0: number; x: number; y: number }

export class DesktopControls {
  private keys = new Set<string>();
  private lookX = 0;
  private lookY = 0;
  private dragging = false;
  private down: { x: number; y: number; moved: number } | null = null;
  private touches = new Map<number, TouchState>();
  private stick = { x: 0, y: 0 };
  enabled = true;
  onKey: (code: string) => void = () => undefined;
  /** A press-and-release on the canvas without dragging. */
  onClick: (clientX: number, clientY: number, locked: boolean) => void = () => undefined;
  onLockChange: (locked: boolean) => void = () => undefined;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    document.addEventListener('pointerlockchange', () => this.onLockChange(this.locked));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  lock(): void {
    const req = this.canvas.requestPointerLock?.() as unknown;
    if (req instanceof Promise) req.catch(() => undefined);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    this.keys.add(e.code);
    if (!e.repeat) this.onKey(e.code);
  };

  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      const kind = e.clientX < window.innerWidth / 2 ? 'move' : 'look';
      for (const t of this.touches.values()) if (t.kind === kind) return;
      this.touches.set(e.pointerId, { id: e.pointerId, kind, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY });
      this.down = kind === 'look' ? { x: e.clientX, y: e.clientY, moved: 0 } : null;
      e.preventDefault();
      return;
    }
    if (e.button !== 0 && e.button !== 2) return;
    this.dragging = true;
    this.down = { x: e.clientX, y: e.clientY, moved: 0 };
  };

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      const t = this.touches.get(e.pointerId);
      if (!t) return;
      if (t.kind === 'look') {
        this.lookX += (e.clientX - t.x) * TOUCH_LOOK_SENS;
        this.lookY += (e.clientY - t.y) * TOUCH_LOOK_SENS;
        if (this.down) this.down.moved += Math.abs(e.clientX - t.x) + Math.abs(e.clientY - t.y);
      } else {
        let dx = e.clientX - t.x0, dy = e.clientY - t.y0;
        const d = Math.hypot(dx, dy);
        if (d > STICK_RADIUS) { dx *= STICK_RADIUS / d; dy *= STICK_RADIUS / d; }
        this.stick.x = dx / STICK_RADIUS;
        this.stick.y = dy / STICK_RADIUS;
      }
      t.x = e.clientX;
      t.y = e.clientY;
      return;
    }
    if (this.locked) {
      this.lookX += e.movementX * MOUSE_SENS;
      this.lookY += e.movementY * MOUSE_SENS;
      if (this.down) this.down.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
    } else if (this.dragging && (e.buttons & 3) !== 0) {
      this.lookX += e.movementX * DRAG_SENS;
      this.lookY += e.movementY * DRAG_SENS;
      if (this.down) this.down.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    const wasDown = this.down;
    this.down = null;
    if (e.pointerType === 'touch') {
      const t = this.touches.get(e.pointerId);
      if (t?.kind === 'move') this.stick.x = this.stick.y = 0;
      this.touches.delete(e.pointerId);
      if (t?.kind === 'look' && wasDown && wasDown.moved < 8) this.onClick(e.clientX, e.clientY, false);
      return;
    }
    this.dragging = false;
    if (wasDown && wasDown.moved < 6 && e.target === this.canvas) this.onClick(e.clientX, e.clientY, this.locked);
  };

  releaseLock(): void {
    if (this.locked) document.exitPointerLock();
  }

  read(): MoveInput {
    const on = (...c: string[]) => c.some((x) => this.keys.has(x));
    let forward = (on('KeyW', 'ArrowUp') ? 1 : 0) - (on('KeyS', 'ArrowDown') ? 1 : 0);
    let right = (on('KeyD', 'ArrowRight') ? 1 : 0) - (on('KeyA', 'ArrowLeft') ? 1 : 0);
    const up = (on('KeyE', 'PageUp') ? 1 : 0) - (on('KeyQ', 'PageDown') ? 1 : 0);
    if (this.stick.x !== 0 || this.stick.y !== 0) {
      const m = Math.hypot(this.stick.x, this.stick.y);
      const s = m < 0.12 ? 0 : (m - 0.12) / 0.88;
      forward = (-this.stick.y / (m || 1)) * s;
      right = (this.stick.x / (m || 1)) * s;
    }
    if (!this.enabled) return { forward: 0, right: 0, up: 0, run: false };
    return { forward, right, up, run: on('ShiftLeft', 'ShiftRight') };
  }

  consumeLook(): { x: number; y: number } {
    const r = { x: this.lookX, y: this.lookY };
    this.lookX = this.lookY = 0;
    if (!this.enabled) r.x = r.y = 0;
    return r;
  }
}
