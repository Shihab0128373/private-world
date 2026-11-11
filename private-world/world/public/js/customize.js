// Character customization screen with a live 3D preview.
import * as THREE from 'three';
import { Avatar, OPTIONS, defaultAppearance } from './avatar.js';

const LABELS = { skin: 'Skin tone', hair: 'Hair colour', eye: 'Eye colour', top: 'Top / dress colour', bottom: 'Trousers colour', hairStyle: 'Hairstyle', outfit: 'Outfit', face: 'Face shape', brow: 'Eyebrows', mouth: 'Mouth' };
export class Customizer {
  constructor(canvas, panel) {
    this.canvas = canvas; this.panel = panel;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); this.r.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene = new THREE.Scene(); this.cam = new THREE.PerspectiveCamera(32, 1, .1, 20); this.cam.position.set(0, 1.15, -4.2); this.cam.lookAt(0, .98, 0);
    this.scene.add(new THREE.HemisphereLight('#fff', '#556', 1.1)); const k = new THREE.DirectionalLight('#fff4e0', 2.2); k.position.set(2, 4, -3); this.scene.add(k);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(.9, 40), new THREE.MeshStandardMaterial({ color: '#2a2630', roughness: .9 })); floor.rotation.x = -Math.PI / 2; this.scene.add(floor);
    this.av = new Avatar(); this.scene.add(this.av.group); this.rot = Math.PI; this.drag = null; this.running = false;
    canvas.addEventListener('pointerdown', e => { this.drag = e.clientX; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => { if (this.drag != null) { this.rot += (e.clientX - this.drag) * .012; this.drag = e.clientX; } });
    canvas.addEventListener('pointerup', () => this.drag = null);
  }
  open(a) { this.a = JSON.parse(JSON.stringify(a)); this.av.setAppearance(this.a); this.build(); this.running = true; this.last = performance.now(); this.loop(); }
  close() { this.running = false; }
  change(fn) { fn(this.a); this.av.setAppearance(this.a); this.build(); }
  build() {
    const p = this.panel, a = this.a; p.innerHTML = '';
    const row = (title, el) => { const d = document.createElement('div'); d.className = 'crow'; d.innerHTML = `<label>${title}</label>`; d.appendChild(el); p.appendChild(d); };
    const pills = (key, opts, fmt = v => v) => { const w = document.createElement('div'); w.className = 'pills'; opts.forEach(o => { const b = document.createElement('button'); b.className = 'pill' + (a[key] === o ? ' on' : ''); b.textContent = fmt(o); b.onclick = () => this.change(x => x[key] = o); w.appendChild(b); }); return w; };
    const sw = key => { const w = document.createElement('div'); w.className = 'swatches'; OPTIONS[key].forEach(c => { const b = document.createElement('button'); b.className = 'sw' + (a[key] === c ? ' on' : ''); b.style.background = c; b.setAttribute('aria-label', c); b.onclick = () => this.change(x => x[key] = c); w.appendChild(b); }); return w; };
    row('Body', pills('gender', ['m', 'f'], v => v === 'm' ? 'Male' : 'Female'));
    // switching body type keeps all choices but swaps defaults that only make sense for the new look if untouched
    p.firstChild.querySelectorAll('.pill').forEach((b, i) => b.onclick = () => this.change(x => { const g = i ? 'f' : 'm'; if (x.gender !== g) { x.gender = g; x.hairStyle = g === 'f' ? (x.hairStyle === 'short' ? 'long' : x.hairStyle) : (x.hairStyle === 'long' ? 'short' : x.hairStyle); } }));
    for (const k of ['skin', 'face', 'eye', 'brow', 'mouth']) row(LABELS[k], OPTIONS[k][0].startsWith('#') ? sw(k) : pills(k, OPTIONS[k], v => v[0].toUpperCase() + v.slice(1)));
    const nose = Object.assign(document.createElement('input'), { type: 'range', min: 0, max: 1, step: .05, value: a.nose }); nose.oninput = () => { a.nose = +nose.value; this.av.setAppearance(a); }; row('Nose size', nose);
    row(LABELS.hairStyle, pills('hairStyle', OPTIONS.hairStyle, v => v[0].toUpperCase() + v.slice(1))); row(LABELS.hair, sw('hair'));
    row(LABELS.outfit, pills('outfit', OPTIONS.outfit, v => v[0].toUpperCase() + v.slice(1))); row(LABELS.top, sw('top')); row(LABELS.bottom, sw('bottom'));
    const acc = document.createElement('div'); acc.className = 'pills';
    Object.keys(a.acc).forEach(k => { const b = document.createElement('button'); b.className = 'pill' + (a.acc[k] ? ' on' : ''); b.textContent = k[0].toUpperCase() + k.slice(1); b.onclick = () => this.change(x => x.acc[k] = !x.acc[k]); acc.appendChild(b); }); row('Accessories', acc);
  }
  loop() {
    if (!this.running) return; requestAnimationFrame(() => this.loop());
    const now = performance.now(), dt = Math.min(.05, (now - this.last) / 1000); this.last = now;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight; if (!w || !h) return; if (this.canvas.width !== Math.round(w * this.r.getPixelRatio())) { this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
    if (this.drag == null) this.rot += dt * .35; this.av.group.rotation.y = this.rot; this.av.update(dt, { speed: 0 }); this.r.render(this.scene, this.cam);
  }
}
export { defaultAppearance };
