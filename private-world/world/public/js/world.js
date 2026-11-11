// 3D world: Museum (4 exhibition rooms), House (+lawn, balcony) and Garden (night). Everything is procedural.
import * as THREE from 'three';

const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .8, metalness: 0, ...o });
function ctex(w, h, draw, rep = [1, 1]) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const noise = (g, w, h, n, a) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? '0,0,0' : '255,255,255'},${Math.random() * a})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } };
const marble = rep => ctex(512, 512, (g, w, h) => { for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.fillStyle = (x + y) % 2 ? '#d9d4ca' : '#ece8df'; g.fillRect(x * w / 2, y * h / 2, w / 2, h / 2); } noise(g, w, h, 4000, .08); g.strokeStyle = 'rgba(120,110,95,.5)'; g.strokeRect(0, 0, w, h); g.strokeRect(w / 2, 0, 0, h); g.strokeRect(0, h / 2, w, 0); }, rep);
const wood = rep => ctex(512, 512, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = `hsl(28,${35 + Math.random() * 10}%,${32 + Math.random() * 10}%)`; g.fillRect(0, i * h / 8, w, h / 8 - 2); for (let j = 0; j < 60; j++) { g.fillStyle = 'rgba(0,0,0,.06)'; g.fillRect(Math.random() * w, i * h / 8, Math.random() * 90, 1); } } }, rep);
const grass = rep => ctex(256, 256, (g, w, h) => { g.fillStyle = '#2f5a2c'; g.fillRect(0, 0, w, h); for (let i = 0; i < 3500; i++) { g.fillStyle = `hsl(${95 + Math.random() * 30},45%,${18 + Math.random() * 18}%)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 5); } }, rep);
const sky = (stops) => { const t = ctex(4, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); stops.forEach(([p, c]) => gr.addColorStop(p, c)); g.fillStyle = gr; g.fillRect(0, 0, w, h); }); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; };

export function buildWorld(scene) {
  const locs = {};
  const raycastBlockers = {};
  const loc = (id, o) => { const g = new THREE.Group(); g.visible = false; scene.add(g); return (locs[id] = { id, group: g, colliders: [], seats: [], portals: [], doors: [], blockers: [], frames: [], tick: [], ...o }); };
  const add = (L, geo, m, x, y, z, { col, shadow = true, block = false, rx = 0, ry = 0 } = {}) => {
    const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, 0); o.castShadow = shadow; o.receiveShadow = true; L.group.add(o);
    if (block) L.blockers.push(o); return o;
  };
  const box = (L, w, h, d, x, y, z, m, opt = {}) => {
    const o = add(L, new THREE.BoxGeometry(w, h, d), m, x, y + h / 2, z, opt);
    if (opt.col) L.colliders.push({ b: [x - w / 2, z - d / 2, x + w / 2, z + d / 2] }); return o;
  };
  // wall along an axis with optional gaps (doors/windows): gaps = [{a,b,low,high,glass}]
  const wall = (L, ax, fixed, a0, a1, h, m, gaps = [], th = .3) => {
    const seg = (s0, s1, y0, y1, collide) => {
      if (s1 - s0 < .01 || y1 - y0 < .01) return; const len = s1 - s0, c = (s0 + s1) / 2;
      const [w, d, x, z] = ax === 'x' ? [len, th, c, fixed] : [th, len, fixed, c];
      const o = box(L, w, y1 - y0, d, x, y0, z, m, { block: true }); o.receiveShadow = true;
      if (collide) L.colliders.push({ b: [x - w / 2, z - d / 2, x + w / 2, z + d / 2] });
    };
    let cur = a0; for (const g of [...gaps].sort((p, q) => p.a - q.a)) {
      seg(cur, g.a, 0, h, true); const low = g.low || 0, high = g.high ?? 2.3;
      if (low > 0) seg(g.a, g.b, 0, low, true); seg(g.a, g.b, high, h, false);
      if (g.glass) { const [w, d, x, z] = ax === 'x' ? [g.b - g.a, .03, (g.a + g.b) / 2, fixed] : [.03, g.b - g.a, fixed, (g.a + g.b) / 2]; add(L, new THREE.BoxGeometry(w, high - low, d), M('#bcd8ee', { transparent: true, opacity: .18, roughness: .1, metalness: .2 }), x, (low + high) / 2, z, { shadow: false }); }
      cur = g.b;
    } seg(cur, a1, 0, h, true);
  };
  const light = (L, c, i, d, x, y, z, shadow = false) => { const p = new THREE.PointLight(c, i, d, 2); p.position.set(x, y, z); p.castShadow = shadow; L.group.add(p); return p; };
  const seat = (L, x, y, z, yaw, label = 'Sit') => L.seats.push({ x, y, z, yaw, label });
  const glow = (L, x, y, z, w, h, d, c) => add(L, new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: c }), x, y, z, { shadow: false });
  const door = (L, id, x, z, axis, width, hinge, m, { portal } = {}) => { // swinging door; axis 'x' = wall runs along x
    const pivot = new THREE.Group(); const gx = axis === 'x' ? x + hinge * width / 2 : x, gz = axis === 'x' ? z : z + hinge * width / 2;
    pivot.position.set(gx, 0, gz); L.group.add(pivot);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(axis === 'x' ? width : .06, 2.2, axis === 'x' ? .06 : width), m); leaf.castShadow = true;
    leaf.position.set(axis === 'x' ? -hinge * width / 2 : 0, 1.1, axis === 'x' ? 0 : -hinge * width / 2); pivot.add(leaf);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(.04), M('#d4af37', { metalness: 1, roughness: .3 })); knob.position.set(axis === 'x' ? -hinge * (width - .12) : .05, 1.05, axis === 'x' ? .05 : -hinge * (width - .12)); pivot.add(knob);
    const col = { b: [axis === 'x' ? x - width / 2 : x - .08, axis === 'x' ? z - .08 : z - width / 2, axis === 'x' ? x + width / 2 : x + .08, axis === 'x' ? z + .08 : z + width / 2] };
    L.colliders.push(col);
    const d = { id, x, z, open: false, t: 0, pivot, col, axis, hinge, r: 1.7, label: portal ? portal.label : 'Open door' };
    d.set = o => { d.open = o; col.off = o; }; L.doors.push(d); return d;
  };
  const tree = (L, x, z, s = 1, tc = '#4a3322', lc = '#2c5b30') => {
    box(L, .3 * s, 2.2 * s, .3 * s, x, 0, z, M(tc), {}); L.colliders.push({ b: [x - .3, z - .3, x + .3, z + .3] });
    for (let i = 0; i < 3; i++) add(L, new THREE.IcosahedronGeometry((1.5 - i * .3) * s, 1), M(lc, { flatShading: true }), x + (i - 1) * .2, (2.6 + i * .9) * s, z + (i % 2) * .2);
  };

  /* =============================== MUSEUM =============================== */
  const MU = loc('museum', { name: 'Museum', spawn: { x: -5, z: 0, ry: -Math.PI / 2 }, bounds: [-8, -7, 56, 7],
    sky: { bg: '#1a1714', fog: ['#1a1714', 20, 60] }, music: .8, ambience: 'hall' });
  const wallM = M('#ece6da', { roughness: .95 }), trim = M('#7a5a3a', { roughness: .6 }), floorM = M('#fff', { map: marble([8, 6]), roughness: .25, metalness: .05 });
  const ROOMS = 4, RW = 16; MU.rooms = [];
  add(MU, new THREE.PlaneGeometry(64, 14), (() => { const m = floorM.clone(); m.map = marble([16, 3.5]); return m; })(), 24, 0, 0, { rx: -Math.PI / 2, shadow: false });
  add(MU, new THREE.PlaneGeometry(64, 14), M('#f5f1e8', { side: THREE.FrontSide }), 24, 4.5, 0, { rx: Math.PI / 2, shadow: false });
  wall(MU, 'x', -7, -8, 56, 4.5, wallM); wall(MU, 'x', 7, -8, 56, 4.5, wallM);
  wall(MU, 'z', 56, -7, 7, 4.5, wallM);
  wall(MU, 'z', -8, -7, 7, 4.5, wallM, [{ a: -1.1, b: 1.1 }]);
  for (let i = 0; i < ROOMS; i++) {
    const cx = i * RW, names = ['Memories', 'Adventures', 'Together', 'Moments'];
    MU.rooms.push({ cx, name: names[i] });
    if (i < ROOMS - 1) wall(MU, 'z', cx + 8, -7, 7, 4.5, wallM, [{ a: -2, b: 2, high: 3.4 }]);
    box(MU, 5, 3.2, .2, cx, 0, 0, wallM, { col: true, block: true }); // central panel with photos on both faces
    box(MU, 5.1, .08, .26, cx, 0, 0, trim); box(MU, 5.1, .08, .26, cx, 3.2, 0, trim);
    for (const z of [-6.8, 6.8]) { box(MU, 16, .12, .08, cx, 0, z, trim); }
    seat(MU, cx - .7, .45, 3.3, 0, 'Sit on the bench'); seat(MU, cx + .7, .45, 3.3, 0, 'Sit on the bench');
    box(MU, 2.4, .12, .6, cx, .4, 3.3, M('#3b2a1e'), { col: true }); box(MU, .12, .4, .5, cx - 1, 0, 3.3, M('#222')); box(MU, .12, .4, .5, cx + 1, 0, 3.3, M('#222'));
    box(MU, 2.4, .12, .6, cx, .4, -3.3, M('#3b2a1e'), { col: true }); seat(MU, cx - .7, .45, -3.3, Math.PI, 'Sit on the bench'); seat(MU, cx + .7, .45, -3.3, Math.PI, 'Sit on the bench');
    for (const lx of [-4, 4]) { light(MU, '#fff1dc', 14, 17, cx + lx, 3.9, 0); glow(MU, cx + lx, 4.45, 0, 3, .05, .3, '#fff6e6'); glow(MU, cx + lx, 4.45, 4, 3, .05, .3, '#fff6e6'); glow(MU, cx + lx, 4.45, -4, 3, .05, .3, '#fff6e6'); }
    // room title plaque above the west doorway
    const t = ctex(512, 96, (g, w, h) => { g.fillStyle = '#1b1712'; g.fillRect(0, 0, w, h); g.fillStyle = '#e8d9b5'; g.font = '600 46px Georgia'; g.textAlign = 'center'; g.fillText(`${['I', 'II', 'III', 'IV'][i]} · ${names[i]}`, w / 2, 62); });
    const pl = add(MU, new THREE.PlaneGeometry(2.6, .5), new THREE.MeshBasicMaterial({ map: t }), cx - 7.84, 3.9, 0, { ry: Math.PI / 2, shadow: false });
  }
  MU.group.add(new THREE.HemisphereLight('#fff4e0', '#6b5a48', .55));
  // exit door (west) -> House
  const mdoor = door(MU, 'mu-exit', -8, 0, 'z', 2.2, 1, M('#5b3a22', { roughness: .5 }), { portal: { label: 'Go outside to the House' } });
  MU.portals.push({ x: -7, z: 0, r: 1.6, to: 'house', label: 'Leave the museum → House', door: mdoor });
  MU.exits = [mdoor];

  // frame slots per room (12): north wall 4, south wall 4, panel 2+2
  const slotsFor = cx => [
    ...[-5.4, -1.8, 1.8, 5.4].map(dx => ({ x: cx + dx, z: -6.84, ry: 0 })),
    ...[-5.4, -1.8, 1.8, 5.4].map(dx => ({ x: cx + dx, z: 6.84, ry: Math.PI })),
    ...[-1.3, 1.3].map(dx => ({ x: cx + dx, z: .12, ry: 0 })), ...[-1.3, 1.3].map(dx => ({ x: cx + dx, z: -.12, ry: Math.PI }))];
  const frameGroup = new THREE.Group(); MU.group.add(frameGroup);
  const texLoader = new THREE.TextureLoader(), frameMat = M('#8a6a3a', { roughness: .4, metalness: .5 });
  MU.setPhotos = (list, maxAniso = 4) => {
    frameGroup.children.slice().forEach(c => { c.traverse(o => { if (o.material?.map) o.material.map.dispose(); }); frameGroup.remove(c); });
    MU.frames.length = 0;
    const perRoom = {}; for (const p of list) {
      const idx = perRoom[p.room] = (perRoom[p.room] ?? -1) + 1; const slot = slotsFor(p.room * RW)[idx]; if (!slot) continue;
      const g = new THREE.Group(); g.position.set(slot.x, 1.95, slot.z); g.rotation.y = slot.ry; frameGroup.add(g);
      const fr = new THREE.Mesh(new THREE.BoxGeometry(1, 1, .06), frameMat); fr.castShadow = true; g.add(fr);
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: '#555', roughness: .6, emissive: '#fff', emissiveIntensity: .0 })); pic.position.z = .033; g.add(pic);
      // engraved caption plaque under the frame (8:1 plane, width follows the frame)
      const lc = document.createElement('canvas'); lc.width = 1024; lc.height = 128; const lg = lc.getContext('2d');
      if (p.caption) {
        lg.fillStyle = 'rgba(28,22,17,.95)'; lg.beginPath(); lg.roundRect(4, 4, 1016, 120, 22); lg.fill(); lg.strokeStyle = '#c7a66b'; lg.lineWidth = 4; lg.stroke();
        lg.fillStyle = '#f4e6c8'; lg.textAlign = 'center'; lg.textBaseline = 'middle'; let fs = 52; lg.font = `${fs}px Georgia, serif`; while (lg.measureText(p.caption).width > 960 && fs > 22) { fs -= 2; lg.font = `${fs}px Georgia, serif`; }
        lg.fillText(p.caption, 512, 68);
      }
      const lt = new THREE.CanvasTexture(lc); lt.colorSpace = THREE.SRGBColorSpace; lt.anisotropy = maxAniso;
      const label = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: lt, transparent: true, depthWrite: false })); label.visible = !!p.caption; g.add(label);
      const fit = (aw, ah) => { const k = Math.min(2.3 / aw, 2 / ah), w = aw * k, h = ah * k; pic.scale.set(w, h, 1); fr.scale.set(w + .16, h + .16, 1); const lw = Math.max(1.5, Math.min(2.4, w + .16)); label.scale.set(lw, lw / 8, 1); label.position.set(0, -(h + .16) / 2 - lw / 16 - .08, .04); };
      fit(1.5, 1); pic.userData = fr.userData = { photo: p, frame: g };
      texLoader.load(`/media/thumb/${p.file}`, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; pic.material.map = t; pic.material.color.set('#fff'); pic.material.emissiveMap = t; pic.material.emissiveIntensity = .38; pic.material.needsUpdate = true; fit(t.image.width, t.image.height); });
      const wp = new THREE.Vector3(); g.getWorldPosition(wp); MU.frames.push({ photo: p, group: g, pos: wp, ry: slot.ry, pic });
    }
  };

  /* ================================ HOUSE ================================ */
  const Z0 = 100, HO = loc('house', { name: 'House', spawn: { x: -4, z: Z0 + 2, ry: -Math.PI / 2 }, bounds: [-38, Z0 - 28, 38, Z0 + 26],
    sky: { bg: sky([[0, '#5a7fb5'], [.45, '#e9b48c'], [.7, '#f6d2a2'], [1, '#c98f6b']]), fog: ['#e2b48f', 40, 130] }, music: .7, ambience: 'house' });
  const hw = M('#efe7da', { roughness: .95 }), hfloor = M('#fff', { map: wood([6, 4]), roughness: .55 });
  add(HO, new THREE.PlaneGeometry(200, 200), M('#fff', { map: grass([50, 50]), roughness: 1 }), 0, -.01, Z0, { rx: -Math.PI / 2, shadow: false });
  add(HO, new THREE.PlaneGeometry(22, 16), hfloor, 0, 0, Z0, { rx: -Math.PI / 2, shadow: false });
  add(HO, new THREE.PlaneGeometry(22, 16), M('#f6f1e8'), 0, 2.99, Z0, { rx: Math.PI / 2, shadow: false });
  box(HO, 22.6, .3, 16.6, 0, 3, Z0, M('#bfb4a2'), {}); // roof slab
  wall(HO, 'x', Z0 - 8, -11, 11, 3, hw, [{ a: -2, b: 2, low: 1, high: 2.3, glass: true }, { a: 5, b: 9, low: 1, high: 2.3, glass: true }]);
  wall(HO, 'x', Z0 + 8, -11, 11, 3, hw, [{ a: -10, b: -2, low: 0, high: 2.5, glass: true }, { a: 4, b: 8, low: 1, high: 2.3, glass: true }]);
  wall(HO, 'z', 11, Z0 - 8, Z0 + 8, 3, hw, [{ a: Z0 - 3, b: Z0 + 3, low: .9, high: 2.3, glass: true }]);
  wall(HO, 'z', -11, Z0 - 8, Z0 + 8, 3, hw, [{ a: Z0 - 1.1, b: Z0 + 1.1 }]);
  wall(HO, 'z', 0, Z0 - 8, Z0 + 8, 3, hw, [{ a: Z0 - 4, b: Z0 + 4, high: 2.4 }], .2);
  wall(HO, 'x', Z0, 0, 11, 3, hw, [{ a: 4.2, b: 5.8 }], .2);
  const front = door(HO, 'ho-front', -11, Z0, 'z', 2.2, 1, M('#6b4a2e', { roughness: .5 }), { portal: { label: 'Open the front door' } });
  const bedroom = door(HO, 'ho-bed', 5, Z0, 'x', 1.6, 1, M('#d8cfbf', { roughness: .6 }));
  bedroom.label = 'Open / close the bedroom door'; front.label = 'Open / close the front door';
  // living room
  const sofaM = M('#5b6b7a', { roughness: .95 }), cushion = M('#c9a24a', { roughness: .9 });
  box(HO, 3, .45, 1, -6, 0, Z0 - 6.2, sofaM, { col: true }); box(HO, 3, .55, .25, -6, .45, Z0 - 6.6, sofaM); box(HO, .25, .3, .9, -7.5, .45, Z0 - 6.2, sofaM); box(HO, .25, .3, .9, -4.5, .45, Z0 - 6.2, sofaM);
  box(HO, .4, .4, .12, -6.8, .45, Z0 - 6.2, cushion); seat(HO, -6.6, .5, Z0 - 6.1, Math.PI, 'Sit on the sofa'); seat(HO, -5.4, .5, Z0 - 6.1, Math.PI, 'Sit on the sofa');
  box(HO, 1.1, .38, 1, -2.2, 0, Z0 - 2.6, M('#8a5a44'), { col: true }); box(HO, .12, .8, 1, -2.7, .38, Z0 - 2.6, M('#8a5a44')); seat(HO, -2.0, .45, Z0 - 2.6, -Math.PI / 2, 'Sit in the armchair');
  box(HO, 1.6, .4, .8, -6, 0, Z0 - 3.6, M('#5a4030'), { col: true }); box(HO, 4, .02, 3, -5.8, .01, Z0 - 3.8, M('#8b3a3a'));
  box(HO, 2.4, .5, .5, -6, 0, Z0 + 1.2, M('#4a3426'), { col: true }); box(HO, 1.8, 1, .06, -6, .75, Z0 + 1.15, M('#0b0b0d', { roughness: .2 }));
  box(HO, 1.4, 2.2, .35, -10.6, 0, Z0 - 6.5, M('#4a3426'), { col: true });
  for (let i = 0; i < 4; i++) box(HO, 1.2, .04, .3, -10.6, .5 + i * .5, Z0 - 6.5, M('#6b4a32'));
  tree(HO, -9.5, Z0 + 5, .35, '#5a3b25', '#3d7a3d');
  light(HO, '#ffd9a8', 12, 14, -6, 2.6, Z0 - 2); light(HO, '#ffd9a8', 8, 12, -6, 2.6, Z0 + 4);
  // kitchen
  const cab = M('#e9e6e0', { roughness: .5 }), top = M('#3a3a40', { roughness: .3 });
  box(HO, 9, .9, .7, 5.5, 0, Z0 - 7.5, cab, { col: true }); box(HO, 9, .05, .75, 5.5, .9, Z0 - 7.5, top); box(HO, 1.2, 2.1, .8, 9.8, 0, Z0 - 7.5, M('#c8ccd2', { metalness: .6, roughness: .3 }), { col: true });
  box(HO, 2.6, .9, 1.1, 4.5, 0, Z0 - 4.8, cab, { col: true }); box(HO, 2.7, .05, 1.2, 4.5, .9, Z0 - 4.8, top);
  box(HO, 1.8, .06, 1.1, 7.8, .72, Z0 - 3.2, M('#6b4a32'), { col: true });
  [[7.1, -3.7, 0], [8.5, -3.7, 0], [7.1, -2.7, Math.PI], [8.5, -2.7, Math.PI]].forEach(([x, z, y]) => { box(HO, .42, .06, .42, x, .42, Z0 + z, M('#2b2b2b')); box(HO, .42, .45, .05, x, .45, Z0 + z + (y ? .2 : -.2), M('#2b2b2b')); seat(HO, x, .46, Z0 + z, y ? 0 : Math.PI, 'Sit at the table'); });
  box(HO, .1, .72, .1, 7.8, 0, Z0 - 3.2, M('#2b2b2b')); light(HO, '#fff0d0', 10, 12, 6, 2.6, Z0 - 4);
  // bedroom
  box(HO, 2.2, .35, 2.4, 8.6, 0, Z0 + 5.4, M('#4a3426'), { col: true }); box(HO, 2, .22, 2.2, 8.6, .35, Z0 + 5.4, M('#f1ede6')); box(HO, 2.2, 1, .12, 8.6, 0, Z0 + 6.6, M('#4a3426'));
  box(HO, .7, .15, .4, 8.1, .56, Z0 + 6.2, M('#fff')); box(HO, .7, .15, .4, 9.1, .56, Z0 + 6.2, M('#fff')); box(HO, 2, .06, .9, 8.6, .57, Z0 + 4.8, M('#7d2e3b'));
  seat(HO, 7.35, .5, Z0 + 5.4, Math.PI / 2, 'Sit on the bed'); seat(HO, 9.85, .5, Z0 + 5.4, -Math.PI / 2, 'Sit on the bed');
  box(HO, .5, .5, .5, 6.9, 0, Z0 + 7.5, M('#4a3426'), { col: true }); box(HO, 2, 2.3, .6, 2.6, 0, Z0 + 7.5, M('#6b5240'), { col: true });
  light(HO, '#ffcf99', 7, 9, 6.9, 1.3, Z0 + 7.3); glow(HO, 6.9, 1.0, Z0 + 7.5, .2, .25, .2, '#ffe2b8');
  // balcony
  box(HO, 8.6, .12, 4, -6, -.0, Z0 + 10, M('#8a7a68'), {}); for (let i = 0; i <= 8; i++) box(HO, .06, 1, .06, -10.2 + i * 1.05, 0, Z0 + 12, M('#222')); box(HO, 8.6, .06, .08, -6, 1, Z0 + 12, M('#222'));
  box(HO, .06, 1, 4, -10.3, 0, Z0 + 10, M('#222')); box(HO, .06, 1, 4, -1.7, 0, Z0 + 10, M('#222'));
  HO.colliders.push({ b: [-10.4, Z0 + 11.9, -1.6, Z0 + 12.2] }, { b: [-10.4, Z0 + 8, -10.2, Z0 + 12] }, { b: [-1.8, Z0 + 8, -1.6, Z0 + 12] });
  [-8, -4.4].forEach(x => { box(HO, .6, .08, .6, x, .45, Z0 + 10.6, M('#6b4a32')); box(HO, .6, .5, .08, x, .5, Z0 + 10.3, M('#6b4a32')); seat(HO, x, .5, Z0 + 10.6, Math.PI, 'Sit on the balcony'); });
  light(HO, '#ffb87a', 6, 10, -6, 2.4, Z0 + 10);
  // distant scenery: mountains + lake beyond the balcony
  for (let i = 0; i < 9; i++) add(HO, new THREE.ConeGeometry(18 + (i % 3) * 8, 22 + (i * 7) % 16, 5), M(i % 2 ? '#51607a' : '#3f4a63', { flatShading: true, fog: true }), -80 + i * 22, 9, Z0 + 95 + (i % 2) * 14, { shadow: false });
  add(HO, new THREE.PlaneGeometry(200, 60), M('#6fa3c8', { metalness: .6, roughness: .12 }), 0, .02, Z0 + 46, { rx: -Math.PI / 2, shadow: false });
  // lawn: path, trees, flowers, bench, gate
  for (let i = 0; i < 13; i++) add(HO, new THREE.CylinderGeometry(.6, .6, .04, 10), M('#b9b2a4'), -13 - i * 1.4, .02, Z0 + Math.sin(i * .5) * .5, { shadow: false });
  [[-18, 10], [-24, -12], [-30, 14], [-14, -16], [-26, 22], [20, 14], [22, -14], [-33, -4], [18, 22]].forEach(([x, z]) => tree(HO, x, Z0 + z, 1 + Math.abs(x % 3) * .1));
  const fl = new THREE.InstancedMesh(new THREE.SphereGeometry(.12, 6, 5), M('#fff'), 160), dm = new THREE.Object3D(), fcols = ['#e76f8a', '#f2c14e', '#fff', '#a78bfa', '#ff9e5e'];
  for (let i = 0; i < 160; i++) { const bx = -16 + (i % 40) * .22, bz = Z0 + 3 + Math.floor(i / 40) * .35; dm.position.set(bx + Math.random() * .1, .15, bz); dm.updateMatrix(); fl.setMatrixAt(i, dm.matrix); fl.setColorAt(i, new THREE.Color(fcols[i % 5])); } HO.group.add(fl);
  box(HO, .25, 3, .25, -34, 0, Z0 - 1.6, M('#d8cfbf'), { col: true }); box(HO, .25, 3, .25, -34, 0, Z0 + 1.6, M('#d8cfbf'), { col: true }); box(HO, .3, .3, 3.5, -34, 3, Z0, M('#d8cfbf'));
    HO.portals.push({ x: -33, z: Z0, r: 1.8, to: 'garden', label: 'Walk through the gate → Garden' });
  const sun = new THREE.DirectionalLight('#ffd2a0', 2.2); sun.position.set(30, 25, Z0 + 30); sun.target.position.set(0, 0, Z0); sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, near: 1, far: 100 }); sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0004;
  HO.group.add(sun, sun.target, new THREE.HemisphereLight('#ffe7c9', '#556b4a', .75)); HO.sun = sun;

  /* ================================ GARDEN ================================ */
  const G0 = 200, GA = loc('garden', { name: 'Garden', spawn: { x: 0, z: G0 + 30, ry: 0 }, bounds: [-40, G0 - 40, 40, G0 + 40],
    sky: { bg: sky([[0, '#05081a'], [.5, '#0e1b3d'], [1, '#27335c']]), fog: ['#0c1430', 18, 90] }, music: .55, ambience: 'night' });
  add(GA, new THREE.CircleGeometry(60, 48), M('#fff', { map: grass([30, 30]), roughness: 1 }), 0, 0, G0, { rx: -Math.PI / 2, shadow: false });
  // winding stone path from the gate to the pond
  for (let i = 0; i < 28; i++) { const t = i / 27, x = Math.sin(t * 5) * 4, z = G0 + 33 - t * 50; add(GA, new THREE.CylinderGeometry(.75, .8, .06, 10), M('#8d8a84', { roughness: .9 }), x, .03, z, { shadow: false }); }
  const pond = add(GA, new THREE.CircleGeometry(7, 40), M('#12263f', { metalness: .85, roughness: .08 }), 0, .04, G0 - 22, { rx: -Math.PI / 2, shadow: false });
  GA.colliders.push({ b: [-5, G0 - 27, 5, G0 - 17] });
  for (let i = 0; i < 30; i++) { const a = i / 30 * Math.PI * 2; add(GA, new THREE.DodecahedronGeometry(.4 + (i % 3) * .1, 0), M('#6e6a63'), Math.cos(a) * 7.3, .2, G0 - 22 + Math.sin(a) * 7.3, { shadow: true }); }
  const bench = (L, x, z, yaw, mt = M('#5b3d26')) => { // two-seater; faces the way the avatar faces (yaw 0 = -Z)
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; L.group.add(g);
    const part = (w, h, d, px, py, pz, m = mt) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(px, py, pz); o.castShadow = o.receiveShadow = true; g.add(o); };
    part(1.9, .08, .55, 0, .43, 0); part(1.9, .4, .07, 0, .72, .27); [-.8, .8].forEach(o => part(.08, .4, .5, o, .2, 0, M('#222')));
    const sw = Math.abs(Math.sin(yaw)) > .5, hx = sw ? .4 : 1.05, hz = sw ? 1.05 : .4; L.colliders.push({ b: [x - hx, z - hz, x + hx, z + hz] });
    [-.5, .5].forEach(o => seat(L, x + o * Math.cos(yaw), .46, z - o * Math.sin(yaw), yaw, 'Sit on the bench'));
  };
  bench(GA, -9.5, G0 - 22, -Math.PI / 2); bench(GA, 9.5, G0 - 22, Math.PI / 2); bench(GA, 0, G0 - 31.5, Math.PI); bench(GA, -7, G0 + 2, 0);
  bench(HO, -18, Z0 - 3.5, Math.PI);
  // trees around the ring + flowers
  for (let i = 0; i < 46; i++) { const a = i / 46 * Math.PI * 2 + Math.sin(i) * .1, r = 30 + (i % 4) * 3.2; if (Math.abs(Math.cos(a)) < .2 && Math.sin(a) > 0) continue; tree(GA, Math.cos(a) * r, G0 + Math.sin(a) * r, .9 + (i % 5) * .12, '#33261b', i % 3 ? '#1e4a2d' : '#25553a'); }
  const flw = new THREE.InstancedMesh(new THREE.SphereGeometry(.13, 6, 5), M('#fff', { emissive: '#222' }), 420), c3 = ['#ff7aa8', '#ffd166', '#c8b6ff', '#fff', '#ff9e5e', '#7cc6fe'];
  for (let i = 0; i < 420; i++) { const a = Math.random() * 6.283, r = 6 + Math.random() * 26; dm.position.set(Math.cos(a) * r, .16, G0 - 6 + Math.sin(a) * r * .7); if (Math.abs(dm.position.x - Math.sin((G0 + 33 - dm.position.z) / 50 * 5) * 4) < 1.6) dm.position.y = -5; dm.updateMatrix(); flw.setMatrixAt(i, dm.matrix); flw.setColorAt(i, new THREE.Color(c3[i % 6])); }
  GA.group.add(flw);
  // lamp posts with warm light + pergola with string lights
  [[-3, 24], [4, 14], [-4, 2], [5, -10], [-9, -14]].forEach(([x, z], i) => { box(GA, .1, 3, .1, x, 0, G0 + z, M('#1d1d20')); glow(GA, x, 3.15, G0 + z, .3, .3, .3, '#ffe2a8'); if (i < 3) light(GA, '#ffc77a', 14, 16, x, 3, G0 + z); });
  for (let i = 0; i < 24; i++) glow(GA, -6 + i * .5, 3.3 + Math.sin(i) * .15, G0 + 12, .1, .1, .1, '#ffe7b0'); [-6, 6].forEach(x => box(GA, .2, 3.4, .2, x, 0, G0 + 12, M('#3a2a1c'), { col: true }));
  // night sky: stars, moon, fireflies
  const sp = new Float32Array(900 * 3); for (let i = 0; i < 900; i++) { const a = Math.random() * 6.283, e = Math.random() * 1.4 + .1, r = 150; sp.set([Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, G0 + Math.sin(a) * Math.cos(e) * r], i * 3); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); GA.group.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: '#fff', size: 1.1, fog: false, sizeAttenuation: false })));
  const moon = add(GA, new THREE.SphereGeometry(7, 24, 18), new THREE.MeshBasicMaterial({ color: '#f4f1e0', fog: false }), -60, 80, G0 - 120, { shadow: false });
  const ff = new Float32Array(90 * 3), fb = []; for (let i = 0; i < 90; i++) { fb.push([Math.random() * 6.283, Math.random() * 2 + .5, Math.random() * 6.283]); }
  const fgeo = new THREE.BufferGeometry(); fgeo.setAttribute('position', new THREE.BufferAttribute(ff, 3));
  const flies = new THREE.Points(fgeo, new THREE.PointsMaterial({ color: '#d8ff7a', size: .22, transparent: true, opacity: .9 })); flies.frustumCulled = false; GA.group.add(flies);
  GA.tick.push((t, p) => { for (let i = 0; i < 90; i++) { const b = fb[i], r = 4 + (i % 9) * 3.5, a = b[0] + t * .1 * (1 + (i % 3)); ff[i * 3] = Math.cos(a) * r + Math.sin(t * b[1]) * .6; ff[i * 3 + 1] = 1 + Math.abs(Math.sin(t * .6 + b[2])) * 2.2; ff[i * 3 + 2] = G0 - 4 + Math.sin(a) * r * .8; } fgeo.attributes.position.needsUpdate = true; flies.material.opacity = .6 + Math.sin(t * 3) * .3; });
  const moonL = new THREE.DirectionalLight('#9db7ff', 1.15); moonL.position.set(-30, 50, G0 - 40); moonL.target.position.set(0, 0, G0); moonL.castShadow = true;
  Object.assign(moonL.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 140 }); moonL.shadow.mapSize.set(2048, 2048); moonL.shadow.bias = -.0005;
  GA.group.add(moonL, moonL.target, new THREE.HemisphereLight('#4a5f9a', '#18241a', .55)); GA.sun = moonL;
  // gate (south) -> Museum, and cottage-style arch
  [-1.4, 1.4].forEach(x => box(GA, .35, 3.2, .35, x, 0, G0 + 37, M('#6e6a63'), { col: true })); box(GA, 3.4, .35, .4, 0, 3.2, G0 + 37, M('#6e6a63'));
    GA.portals.push({ x: 0, z: G0 + 36, r: 1.8, to: 'museum', label: 'Go through the gate → Museum' });
  GA.portals.push({ x: 33, z: G0 - 12, r: 1.8, to: 'house', label: 'Walk home → House' });
  box(GA, .3, 2.6, .3, 32, 0, G0 - 13.6, M('#6e6a63')); box(GA, .3, 2.6, .3, 32, 0, G0 - 10.4, M('#6e6a63')); box(GA, .3, .3, 3.5, 32, 2.6, G0 - 12, M('#6e6a63'));

  /* ----- shared helpers ----- */
  const all = Object.values(locs);
  const world = {
    locs, all,
    show(id) { all.forEach(l => l.group.visible = l.id === id); },
    // circle (r) vs colliders; returns corrected [x,z]
    collide(L, x, z, r = .32) {
      const [x0, z0, x1, z1] = L.bounds; x = Math.min(x1 - r, Math.max(x0 + r, x)); z = Math.min(z1 - r, Math.max(z0 + r, z));
      for (const c of L.colliders) { if (c.off) continue; const [a, b, cx, d] = c.b; const px = Math.max(a, Math.min(x, cx)), pz = Math.max(b, Math.min(z, d)); let dx = x - px, dz = z - pz, dd = dx * dx + dz * dz;
        if (dd < r * r) { if (dd < 1e-8) { dx = x < (a + cx) / 2 ? -1 : 1; dz = 0; dd = 1; } const l = Math.sqrt(dd), k = (r - l) / (l || 1); x += dx * k; z += dz * k; } }
      return [x, z];
    },
    updateDoors(L, dt) { for (const d of L.doors) { d.t += ((d.open ? 1 : 0) - d.t) * Math.min(1, dt * 6); d.pivot.rotation.y = d.t * 1.5 * (d.axis === 'x' ? -d.hinge : d.hinge) * (d.axis === 'x' ? 1 : -1); } },
    tick(L, t, dt) { L.tick.forEach(f => f(t)); this.updateDoors(L, dt); }
  };
  return world;
}
