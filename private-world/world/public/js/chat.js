// Roblox-style text chat: scrolling chat box + speech bubbles above the players' heads.
import * as THREE from 'three';

export class Bubble {
  constructor(parent, y = 2.55) {
    this.s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false })); this.s.center.set(.5, 0); this.s.position.y = y; this.s.renderOrder = 12; this.s.visible = false; parent.add(this.s); this.until = 0;
  }
  say(text, ms = 7000) {
    const c = document.createElement('canvas'), g = c.getContext('2d'), F = '30px system-ui,"Noto Sans Bengali",sans-serif', MAX = 420; g.font = F;
    const lines = []; let cur = '';
    for (const word of text.split(/\s+/)) {
      let w = word; while (g.measureText(w).width > MAX) { let n = w.length; while (n > 1 && g.measureText(w.slice(0, n)).width > MAX) n--; if (cur) { lines.push(cur); cur = ''; } lines.push(w.slice(0, n)); w = w.slice(n); }
      const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width > MAX) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur); if (lines.length > 5) { lines.length = 5; lines[4] = lines[4].slice(0, -1) + '…'; }
    const tw = Math.max(...lines.map(l => g.measureText(l).width)), W = Math.ceil(tw + 36), H = lines.length * 38 + 26, T = 14;
    c.width = W; c.height = H + T; g.font = F; g.fillStyle = 'rgba(255,255,255,.96)'; g.beginPath(); g.roundRect(0, 0, W, H, 18); g.fill();
    g.beginPath(); g.moveTo(W / 2 - 10, H - 1); g.lineTo(W / 2 + 10, H - 1); g.lineTo(W / 2, H + T); g.closePath(); g.fill();
    g.fillStyle = '#1b1b1f'; g.textBaseline = 'middle'; lines.forEach((l, i) => g.fillText(l, 18, 13 + 19 + i * 38));
    this.s.material.map?.dispose(); const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; this.s.material.map = tex; this.s.material.needsUpdate = true;
    this.s.scale.set(W / 190, (H + T) / 190, 1); this.until = performance.now() + ms; this.s.material.opacity = 1; this.s.visible = true;
  }
  update() { if (!this.s.visible) return; const left = this.until - performance.now(); if (left <= 0) this.s.visible = false; else this.s.material.opacity = Math.min(1, left / 500); }
}

export class Chat {
  constructor({ net, getName, onMessage, onFocus, toast }) {
    const $ = id => document.getElementById(id); Object.assign(this, { net, getName, onMessage, onFocus, toast });
    this.box = $('chat'); this.log = $('chat-log'); this.input = $('chat-input');
    this.input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') this.send(); else if (e.key === 'Escape') this.blur(); });
    this.input.addEventListener('focus', () => { this.box.classList.add('active'); this.onFocus?.(); });
    this.input.addEventListener('blur', () => this.box.classList.remove('active'));
    $('chat-send').onclick = () => this.send(); $('b-chat').onclick = () => this.focus();
    net.on('chat', m => this.add(m, false));
  }
  focus() { this.box.classList.add('open'); this.input.focus(); }
  blur() { this.input.blur(); this.box.classList.remove('open'); }
  load(list) { this.log.innerHTML = ''; (list || []).forEach(m => this.add(m, false, true)); }
  add(m, mine, quiet = false) {
    const d = document.createElement('div'); d.className = 'cm' + (mine ? ' me' : ''); const b = document.createElement('b'); b.textContent = m.name + ': '; d.append(b, document.createTextNode(m.text));
    this.log.appendChild(d); while (this.log.children.length > 40) this.log.firstChild.remove();
    if (quiet) d.classList.add('old'); else setTimeout(() => d.classList.add('old'), 12000);
    this.log.scrollTop = this.log.scrollHeight; if (!quiet) this.onMessage?.(m, mine);
  }
  async send() {
    const text = this.input.value.trim(); this.input.value = ''; this.blur(); if (!text) return;
    this.add({ name: this.getName(), text: text.slice(0, 200), t: Date.now() }, true);
    const r = await this.net.chat(text); if (r?.error) this.toast(r.error, 'err');
  }
}
