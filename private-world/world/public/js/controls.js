// Desktop (WASD + mouse drag) and mobile (virtual joystick + touch look + buttons) input.
export class Controls {
  constructor(canvas, { onLook, onZoom, onInteract, onEmote, onClick, onChat }) {
    this.keys = new Set(); this.joy = { x: 0, y: 0 }; this.runToggle = false; this.jump = false; this.enabled = false;
    this.touch = matchMedia('(pointer: coarse)').matches;
    addEventListener('keydown', e => {
      if (!this.enabled || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
      const k = e.key.toLowerCase(); this.keys.add(k);
      if (k === ' ') { this.jump = true; e.preventDefault(); }
      if (k === 'e') onInteract(); if (k === 'enter' || k === '/') { e.preventDefault(); onChat?.(); } if ('12345'.includes(k) && k.length === 1) onEmote(+k - 1);
    });
    addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase())); addEventListener('blur', () => this.keys.clear());
    // pointer look: drag anywhere on the canvas; tap/click (no drag) = click on world
    const ptrs = new Map();
    canvas.addEventListener('pointerdown', e => { if (!this.enabled || e.target !== canvas) return; if (this.joyId === e.pointerId) return; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() }); canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => { const p = ptrs.get(e.pointerId); if (!p) return; onLook((e.clientX - p.x), (e.clientY - p.y)); p.x = e.clientX; p.y = e.clientY; });
    const up = e => { const p = ptrs.get(e.pointerId); if (!p) return; ptrs.delete(e.pointerId); if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 6 && performance.now() - p.t < 400) onClick(e.clientX, e.clientY); };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', e => ptrs.delete(e.pointerId));
    canvas.addEventListener('wheel', e => { onZoom(e.deltaY * .004); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    // virtual joystick
    const zone = document.getElementById('joy'), knob = document.getElementById('joy-knob'); let R = 55;
    const setJ = (e, rect) => { let dx = e.clientX - (rect.left + rect.width / 2), dy = e.clientY - (rect.top + rect.height / 2); const l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; } knob.style.transform = `translate(${dx}px,${dy}px)`; this.joy.x = dx / R; this.joy.y = dy / R; };
    zone.addEventListener('pointerdown', e => { this.joyId = e.pointerId; zone.setPointerCapture(e.pointerId); setJ(e, zone.getBoundingClientRect()); e.stopPropagation(); });
    zone.addEventListener('pointermove', e => { if (this.joyId === e.pointerId) setJ(e, zone.getBoundingClientRect()); });
    const end = e => { if (this.joyId !== e.pointerId) return; this.joyId = null; this.joy.x = this.joy.y = 0; knob.style.transform = ''; };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
    const bind = (id, f) => { const b = document.getElementById(id); b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); f(b); }); };
    bind('btn-jump', () => this.jump = true); bind('btn-act', () => onInteract());
    bind('btn-run', b => { this.runToggle = !this.runToggle; b.classList.toggle('on', this.runToggle); });
  }
  // returns {x, y (forward +), run}
  axis() {
    const k = this.keys; let x = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0), y = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    if (!x && !y) { x = this.joy.x; y = -this.joy.y; const l = Math.hypot(x, y); if (l < .15) x = y = 0; else if (l > 1) { x /= l; y /= l; } } else { const l = Math.hypot(x, y); x /= l; y /= l; }
    return { x, y, run: k.has('shift') || this.runToggle };
  }
  takeJump() { const j = this.jump; this.jump = false; return j; }
}
