import * as THREE from 'three';
import { buildWorld } from './world.js';
import { Avatar, defaultAppearance } from './avatar.js';
import { Net } from './net.js';
import { Voice } from './voice.js';
import { AudioEngine } from './audio.js';
import { Controls } from './controls.js';
import { Gallery } from './gallery.js';
import { Customizer } from './customize.js';
import { Chat, Bubble } from './chat.js';

const $ = id => document.getElementById(id), r2 = v => Math.round(v * 100) / 100;
const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => localStorage.setItem(k, JSON.stringify(v)) };
const settings = { music: .5, amb: .7, voice: 1, sens: 1, quality: 'high', ...store.get('pw_settings', {}) };
let appearance = store.get('pw_appearance', null) || defaultAppearance('m');
const toast = (msg, kind = '') => { const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg; $('toasts').appendChild(t); setTimeout(() => t.classList.add('out'), 3200); setTimeout(() => t.remove(), 3800); };

/* ---------- renderer / scene ---------- */
const renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(60, 1, .1, 400);
const world = buildWorld(scene);
function applyQuality() {
  const q = settings.quality; renderer.setPixelRatio(q === 'high' ? Math.min(devicePixelRatio, 2) : q === 'medium' ? Math.min(devicePixelRatio, 1.25) : 1);
  renderer.shadowMap.enabled = q !== 'low'; world.locs.house.sun.castShadow = world.locs.garden.sun.castShadow = q !== 'low'; resize();
}
function resize() { renderer.setSize(innerWidth, innerHeight, false); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
addEventListener('resize', resize);

/* ---------- state ---------- */
const net = new Net(), audio = new AudioEngine(), gallery = new Gallery(net, toast);
const voice = new Voice(net, s => setVoiceUI(s));
const me = new Avatar(appearance), peerAv = new Avatar(defaultAppearance('f')); scene.add(me.group, peerAv.group); peerAv.group.visible = false;
const meBubble = new Bubble(me.group), peerBubble = new Bubble(peerAv.group);
const P = { x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, yaw: 0, sit: null, emote: '', emoteEnd: 0, loc: 'museum', speed: 0, air: false };
const C = { yaw: 0, pitch: .35, dist: 4.2, want: 4.2, intro: 0 };
const peer = { name: 'Partner', online: false, known: false, st: null, tag: null };
let inGame = false, busy = false, myName = localStorage.getItem('pw_name') || '', config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
const ray = new THREE.Raycaster();

/* ---------- name tags & hearts ---------- */
function tag(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d'); g.fillStyle = 'rgba(15,14,18,.6)'; g.beginPath(); g.roundRect(8, 8, 240, 48, 24); g.fill();
  g.fillStyle = '#fff'; g.font = '600 28px system-ui,sans-serif'; g.textAlign = 'center'; g.fillText(text.slice(0, 16), 128, 43);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true })); s.scale.set(1.1, .28, 1); s.position.y = 2.1; s.renderOrder = 10; return s;
}
const heartTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.font = '52px serif'; g.textAlign = 'center'; g.fillText('❤️', 32, 52); return new THREE.CanvasTexture(c); })();
const hearts = [];
function spawnHearts(pos, n = 6) { for (let i = 0; i < n; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthTest: false })); s.scale.setScalar(.35); s.position.set(pos.x + (Math.random() - .5) * .8, pos.y + 1.8 + Math.random() * .4, pos.z + (Math.random() - .5) * .8); s.userData = { t: -i * .12, vx: (Math.random() - .5) * .4 }; s.renderOrder = 11; scene.add(s); hearts.push(s); } }

/* ---------- locations / travel ---------- */
const fade = on => $('fade').classList.toggle('on', on), sleep = ms => new Promise(r => setTimeout(r, ms));
function applySky(L) { scene.background = typeof L.sky.bg === 'string' ? new THREE.Color(L.sky.bg) : L.sky.bg; scene.fog = new THREE.Fog(...L.sky.fog); }
function placeAt(id, x, z, ry) {
  P.loc = id; Object.assign(P, { x, z, y: 0, vx: 0, vz: 0, vy: 0, yaw: ry, sit: null, emote: '' }); C.yaw = ry; C.intro = 0;
  me.group.position.set(x, 0, z); world.show(id); applySky(world.locs[id]); audio.setLocation(id); banner(world.locs[id].name); snap = true;
}
let snap = false, lastBanner = '';
function banner(t) { if (t === lastBanner) return; lastBanner = t; const b = $('banner'); b.textContent = t; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }
async function travel(id, p) {
  if (busy) return; busy = true; const from = P.loc;
  if (p?.door) { p.door.set(true); audio.thud(); await sleep(500); }
  fade(true); await sleep(550);
  const L = world.locs[id]; placeAt(id, L.spawn.x, L.spawn.z, L.spawn.ry); lastBanner = ''; banner(L.name); if (p?.door) p.door.set(false);
  $('map').hidden = true; await sleep(250); fade(false); busy = false; C.intro = 0;
}

/* ---------- interaction ---------- */
const dist2 = (a, b) => Math.hypot(a.x - P.x, a.z - P.z);
const seatTaken = s => peer.online && peer.st?.sit && peer.st.loc === P.loc && Math.hypot(peer.st.x - s.x, peer.st.z - s.z) < .6;
function sit(s) { P.sit = s; P.x = s.x; P.z = s.z; P.y = s.y - .45; P.yaw = s.yaw; P.vx = P.vz = 0; P.emote = ''; }
function stand() { const s = P.sit; if (!s) return; P.x = s.x - Math.sin(s.yaw) * .75; P.z = s.z - Math.cos(s.yaw) * .75; P.y = 0; P.sit = null; [P.x, P.z] = world.collide(world.locs[P.loc], P.x, P.z); }
function toggleDoor(d, fromNet) { d.set(!d.open); audio.thud(); if (!fromNet) net.send('door', { id: d.id, open: d.open }); }
function nearest() {
  const L = world.locs[P.loc]; if (P.sit) return { label: 'Stand up', run: stand, d: 0 }; let best = null;
  const cand = (d, label, run) => { if (!best || d < best.d) best = { d, label, run }; };
  for (const s of L.seats) { const d = dist2(s); if (d < 1.4 && !seatTaken(s)) cand(d, s.label, () => sit(s)); }
  for (const dr of L.doors) if (dr.id !== 'mu-exit') { const d = dist2(dr); if (d < dr.r) cand(d + .3, dr.open ? 'Close the door' : 'Open the door', () => toggleDoor(dr)); }
  for (const p of L.portals) { const d = dist2(p); if (d < p.r + .4) cand(d - .5, p.label, () => travel(p.to, p)); }
  if (P.loc === 'museum') for (const f of L.frames) { const d = dist2(f.pos); if (d < 4.2) cand(d + .8, 'View photo', () => gallery.openViewer(f.photo)); }
  return best;
}
function interact() { if (!inGame || busy || !allClosed()) return; nearest()?.run(); }
const allClosed = () => ['viewer', 'manager', 'settings', 'invite', 'map', 'custom'].every(id => $(id).hidden);

const EMOTES = ['wave', 'dance', 'clap', 'bow', 'heart'], DUR = { wave: 3, dance: 7, clap: 3, bow: 3, hug: 4, heart: 0 };
function emote(name) {
  if (!inGame || !name) return; if (name === 'heart') { spawnHearts(P); audio.chime([84, 88]); net.send('emote', 'heart'); return; }
  if (P.sit && name !== 'wave' && name !== 'clap') return stand();
  P.emote = name; P.emoteEnd = performance.now() + DUR[name] * 1000; net.send('emote', name); $('emotes').hidden = true;
}

/* ---------- chat ---------- */
const chat = new Chat({ net, toast, getName: () => myName || 'Me', onFocus: () => controls.keys.clear(), onMessage: (m, mine) => (mine ? meBubble : peerBubble).say(m.text) });

/* ---------- controls ---------- */
const controls = new Controls($('game'), {
  onLook: (dx, dy) => { C.yaw -= dx * .006 * settings.sens; C.pitch = Math.max(-.25, Math.min(1.2, C.pitch + dy * .005 * settings.sens)); },
  onZoom: d => { C.want = Math.max(2, Math.min(8, C.want + d)); }, onInteract: interact, onEmote: i => emote(EMOTES[i]), onChat: () => chat.focus(),
  onClick: (x, y) => {
    if (!inGame || P.loc !== 'museum' || !allClosed()) return; ray.setFromCamera(new THREE.Vector2(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1), cam);
    const hit = ray.intersectObjects(world.locs.museum.frames.map(f => f.pic), false)[0]; if (!hit) return;
    const ph = hit.object.userData.photo, f = world.locs.museum.frames.find(q => q.photo.id === ph.id);
    dist2(f.pos) < 8 ? gallery.openViewer(ph) : toast('Walk a little closer to view this photo');
  }
});
if (controls.touch) document.body.classList.add('touch');

/* ---------- update loop ---------- */
const clock = new THREE.Clock(); let sendT = 0, lastPrompt = '';
const lerpAng = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * Math.min(1, t); };
function updatePlayer(dt) {
  const L = world.locs[P.loc], ax = controls.axis(), jump = controls.takeJump(), mag = Math.hypot(ax.x, ax.y);
  if (P.emote && performance.now() > P.emoteEnd) P.emote = '';
  if (P.sit) { if (mag > .3 || jump) stand(); }
  if (!P.sit) {
    const fx = -Math.sin(C.yaw), fz = -Math.cos(C.yaw), rx = Math.cos(C.yaw), rz = -Math.sin(C.yaw), dx = fx * ax.y + rx * ax.x, dz = fz * ax.y + rz * ax.x, sp = ax.run ? 5.4 : 2.6, k = Math.min(1, dt * 10);
    P.vx += (dx * sp - P.vx) * k; P.vz += (dz * sp - P.vz) * k;
    if (mag > .1) { P.yaw = lerpAng(P.yaw, Math.atan2(-dx, -dz), dt * 12); if (P.emote && P.emote !== 'dance') P.emote = ''; else if (P.emote === 'dance' && mag > .5) P.emote = ''; }
    if (jump && P.y <= .001 && !busy) { P.vy = 5.2; P.emote = ''; }
    P.vy -= 14 * dt; P.y += P.vy * dt; if (P.y < 0) { P.y = 0; P.vy = 0; } P.air = P.y > .05;
    const [nx, nz] = world.collide(L, P.x + P.vx * dt, P.z + P.vz * dt); P.x = nx; P.z = nz;
  } else P.air = false;
  P.speed = P.sit ? 0 : Math.hypot(P.vx, P.vz);
  me.group.position.set(P.x, P.y, P.z); me.group.rotation.y = P.yaw; me.update(dt, { speed: P.speed, air: P.air, sit: !!P.sit, emote: P.emote });
}
const camRay = new THREE.Raycaster();
function updateCamera(dt) {
  const L = world.locs[P.loc], t = new THREE.Vector3(P.x, P.y + (P.sit ? 1.2 : 1.55), P.z);
  if (C.intro < 1) { C.intro = Math.min(1, C.intro + dt / 2.6); const e = 1 - (1 - C.intro) ** 3; C.dist = C.want + (1 - e) * 5; } else C.dist += (C.want - C.dist) * Math.min(1, dt * 8);
  const cp = Math.cos(C.pitch), dir = new THREE.Vector3(Math.sin(C.yaw) * cp, Math.sin(C.pitch), Math.cos(C.yaw) * cp);
  let d = C.dist; camRay.set(t, dir); camRay.far = d + .3; const hit = camRay.intersectObjects(L.blockers, false)[0]; if (hit) d = Math.max(.6, hit.distance - .25);
  const want = t.clone().addScaledVector(dir, d); if (want.y < .25) want.y = .25; cam.position.copy(want); cam.lookAt(t);
  const fov = 60 + (P.speed > 4 ? 6 : 0) + (C.intro < 1 ? (1 - C.intro) * 8 : 0); cam.fov += (fov - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix();
}
function updatePeer(dt) {
  const st = peer.st, vis = peer.online && st && st.loc === P.loc; peerAv.group.visible = !!vis; if (!st) return;
  const g = peerAv.group; if (snap || peer.snap) { g.position.set(st.x, st.y, st.z); g.rotation.y = st.ry; peer.snap = false; }
  const k = 1 - Math.exp(-dt * 12); g.position.x += (st.x - g.position.x) * k; g.position.y += (st.y - g.position.y) * k; g.position.z += (st.z - g.position.z) * k; g.rotation.y = lerpAng(g.rotation.y, st.ry, dt * 12);
  peerAv.update(dt, { speed: st.sp, air: !!st.a, sit: st.sit, emote: st.em });
}
function updateUI() {
  const a = inGame && allClosed() && !busy ? nearest() : null, txt = a ? a.label : '';
  if (txt !== lastPrompt) { lastPrompt = txt; $('prompt').hidden = !txt; $('prompt').innerHTML = txt ? `<kbd>${controls.touch ? '●' : 'E'}</kbd> ${txt}` : ''; }
  const near = peer.online && peer.st && peer.st.loc === P.loc && Math.hypot(peer.st.x - P.x, peer.st.z - P.z) < 2.6; $('b-hug').hidden = !near;
  if (P.loc === 'museum') { const i = Math.max(0, Math.min(3, Math.floor((P.x + 8) / 16))); banner(`Museum · ${world.locs.museum.rooms[i].name}`); }
  if (voice.pc || voice.track) { const l = voice.levels(); $('b-voice').style.setProperty('--lvl', Math.min(1, l.local * 2.5)); $('peer-chip').classList.toggle('speaking', l.remote > .04); }
}
function frame() {
  requestAnimationFrame(frame); const dt = Math.min(.05, clock.getDelta()), t = clock.elapsedTime;
  if (inGame) {
    updatePlayer(dt); updateCamera(dt); updatePeer(dt); meBubble.update(); peerBubble.update(); snap = false; world.tick(world.locs[P.loc], t, dt); updateUI();
    sendT += dt; if (sendT > .066) { sendT = 0; net.send('state', { x: r2(P.x), y: r2(P.y), z: r2(P.z), ry: r2(P.yaw), sp: r2(P.speed), a: P.air ? 1 : 0, loc: P.loc, sit: !!P.sit, em: P.emote }); }
    for (let i = hearts.length - 1; i >= 0; i--) { const h = hearts[i], u = h.userData; u.t += dt; if (u.t < 0) { h.visible = false; continue; } h.visible = true; h.position.y += dt * .8; h.position.x += u.vx * dt; h.material.opacity = Math.max(0, 1 - u.t / 2); if (u.t > 2) { scene.remove(h); hearts.splice(i, 1); } }
  } else { C.yaw += dt * .06; updateCamera(dt); world.tick(world.locs[P.loc], t, dt); }
  renderer.render(scene, cam);
}

/* ---------- network events ---------- */
function setPeerInfo(info) {
  if (!info) return; peer.known = true; peer.online = !!info.online; peer.name = info.name || 'Partner';
  if (info.appearance) peerAv.setAppearance(info.appearance); peerAv.group.remove(peer.tag); peer.tag = tag(peer.name); peerAv.group.add(peer.tag); statusUI();
}
function statusUI() {
  const s = net.status || 'online', dot = $('conn-dot'); dot.className = 'dot ' + (s === 'online' ? 'ok' : s === 'reconnecting' ? 'warn' : 'bad');
  $('conn-text').textContent = s === 'online' ? 'Connected' : s === 'reconnecting' ? 'Reconnecting…' : 'Offline';
  const L = peer.st && world.locs[peer.st.loc], where = peer.online && peer.st && peer.st.loc !== P.loc && L ? ` · in the ${L.name}` : '';
  $('peer-text').textContent = !peer.known ? 'Waiting for your partner…' : peer.online ? `${peer.name} is here${where}` : `${peer.name} is away`;
  $('peer-chip').classList.toggle('on', peer.online);
}
net.on('status', s => { net.status = s; statusUI(); if (s === 'online' && inGame) toast('Back online'); if (s === 'offline' && inGame) toast('Connection lost — reconnecting…', 'err'); });
net.on('peer-joined', info => { setPeerInfo({ ...info, online: true }); peer.snap = true; audio.chime(); toast(`${info.name || 'Your partner'} joined`); net.send('appearance', appearance); voice.peerOnline = true; $('invite').hidden = true; });
net.on('peer-left', () => { peer.online = false; voice.peerOnline = false; statusUI(); toast(`${peer.name} disconnected`); });
net.on('peer-state', s => { peer.st = s; if (!peerAv.group.visible) peer.snap = true; });
net.on('peer-appearance', a => peerAv.setAppearance(a));
net.on('peer-emote', e => { if (e === 'heart') { spawnHearts(peerAv.group.position); audio.chime([84, 88]); } });
net.on('door', ({ id, open }) => { const d = world.locs.house.doors.find(x => x.id === id); if (d) { d.set(open); audio.thud(); } });
net.on('photos', () => gallery.refresh());
net.on('resumed', r => { if (r.error) { toast(r.error, 'err'); return; } setPeerInfo(r.peer); voice.peerOnline = !!r.peer?.online; net.send('appearance', appearance); gallery.refresh(); applyDoors(r.doors); });
const applyDoors = d => Object.entries(d || {}).forEach(([id, o]) => world.locs.house.doors.find(x => x.id === id)?.set(o));
gallery.onChange = list => world.locs.museum.setPhotos(list, renderer.capabilities.getMaxAnisotropy());

/* ---------- voice UI ---------- */
function setVoiceUI(s) {
  const txt = { idle: 'Voice: waiting for partner', connecting: 'Voice: connecting…', connected: 'Voice: connected', reconnecting: 'Voice: reconnecting…', failed: 'Voice: connection failed', tap: 'Tap anywhere to enable sound' }[s] || s;
  $('voice-text').textContent = txt; $('voice-text').className = s;
}
function micUI() { const b = $('b-voice'); b.className = 'ibtn ' + (!voice.hasMic ? 'off' : voice.muted ? 'muted' : 'live'); b.title = !voice.hasMic ? 'Enable microphone' : voice.muted ? 'Unmute' : 'Mute'; $('mic-state').textContent = !voice.hasMic ? 'Mic off' : voice.muted ? 'Muted' : 'Live'; }
async function toggleMic() {
  if (!voice.hasMic) { const r = await voice.enableMic(); if (r.error) toast(r.error, 'err'); } else voice.toggleMute(); micUI();
}
$('b-voice').onclick = toggleMic; addEventListener('click', () => { if (voice.state === 'tap') { voice.audio.play().then(() => setVoiceUI('connected')).catch(() => {}); } }, true);

/* ---------- panels ---------- */
const panels = ['settings', 'invite', 'map', 'emotes'], openPanel = id => { panels.forEach(p => $(p).hidden = p !== id || !$(p).hidden); };
$('b-settings').onclick = () => openPanel('settings'); $('b-invite').onclick = () => { fillInvite(); openPanel('invite'); }; $('b-map').onclick = () => openPanel('map'); $('b-emote').onclick = () => openPanel('emotes');
$('b-photos').onclick = () => gallery.open(); $('b-custom').onclick = () => openCustomizer(false);
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => b.closest('.panel').hidden = true);
document.querySelectorAll('#map [data-loc]').forEach(b => b.onclick = () => travel(b.dataset.loc));
document.querySelectorAll('#emotes [data-e]').forEach(b => b.onclick = () => emote(b.dataset.e)); $('b-hug').onclick = () => emote('hug');
addEventListener('keydown', e => { if (!inGame || /INPUT|SELECT/.test(document.activeElement?.tagName)) return; if (e.key === 'Escape') panels.concat(['manager']).forEach(p => $(p).hidden = true); if (e.key.toLowerCase() === 'v') toggleMic(); });
function fillInvite() { const link = `${location.origin}/?room=${net.session.roomId}`; $('invite-code').textContent = net.session.roomId; $('invite-link').value = link; $('b-share').hidden = !navigator.share; }
$('copy-link').onclick = async () => { try { await navigator.clipboard.writeText($('invite-link').value); toast('Invitation link copied'); } catch { $('invite-link').select(); toast('Press Ctrl+C to copy'); } };
$('copy-code').onclick = async () => { try { await navigator.clipboard.writeText(net.session.roomId); toast('Room code copied'); } catch {} };
$('b-share').onclick = () => navigator.share({ title: 'Join me in our private world', text: `Join my private room: ${net.session.roomId}`, url: $('invite-link').value }).catch(() => {});
// settings
const bindSet = (id, key, fn) => { const el = $(id); el.value = settings[key]; el.oninput = () => { settings[key] = el.type === 'range' ? +el.value : el.value; store.set('pw_settings', settings); fn?.(); }; };
bindSet('set-music', 'music', () => audio.setVolumes(settings.music, settings.amb)); bindSet('set-amb', 'amb', () => audio.setVolumes(settings.music, settings.amb));
bindSet('set-voice', 'voice', () => voice.setVolume(settings.voice)); bindSet('set-sens', 'sens'); bindSet('set-quality', 'quality', applyQuality);
$('set-leave').onclick = () => { if (confirm('Leave this room? You can rejoin later with the room code.')) { location.href = '/'; } };

/* ---------- customize ---------- */
const custom = new Customizer($('custom-canvas'), $('custom-panel')); let customFromMenu = true;
function openCustomizer(fromMenu) { customFromMenu = fromMenu; custom.open(appearance); $('custom').hidden = false; if (!fromMenu) controls.enabled = false; }
$('btn-custom').onclick = () => openCustomizer(true);
$('custom-cancel').onclick = () => { custom.close(); $('custom').hidden = true; controls.enabled = inGame; };
$('custom-save').onclick = () => {
  appearance = custom.a; store.set('pw_appearance', appearance); me.setAppearance(appearance); net.send('appearance', appearance); custom.close(); $('custom').hidden = true; controls.enabled = inGame; toast('Look saved');
};

/* ---------- menu flow ---------- */
const nameVal = () => { const n = $('name').value.trim().slice(0, 20) || 'Player'; myName = n; localStorage.setItem('pw_name', n); return n; };
$('name').value = myName;
async function enter(res) {
  if (res.error) { $('menu-err').textContent = res.error; busy = false; return; }
  $('menu-err').textContent = ''; $('menu').hidden = true; $('hud').hidden = false; inGame = true; controls.enabled = true; audio.setVolumes(settings.music, settings.amb); audio.start();
  history.replaceState(null, '', `/?room=${res.roomId}`); setPeerInfo(res.peer || { online: false }); if (!res.peer) { peer.known = false; statusUI(); }
  applyDoors(res.doors); chat.load(res.chat); net.send('appearance', appearance); gallery.refresh(); voice.peerOnline = !!res.peer?.online; voice.setVolume(settings.voice); voice.init(config.iceServers, res.host); micUI();
  const sp = world.locs.museum.spawn; placeAt('museum', sp.x, sp.z, sp.ry); lastBanner = ''; banner('Museum · Memories');
  if (!res.peer?.online) { fillInvite(); $('invite').hidden = false; }
  setTimeout(async () => { const r = await voice.enableMic(); micUI(); if (r.error) toast(r.error + ' You can retry with the mic button.', 'err'); }, 900);
}
async function begin(fn, btn) {
  if (btn.disabled) return; btn.disabled = true; $('menu-err').textContent = '';
  try { await Promise.race([net.connect(), sleep(8000).then(() => { throw new Error('timeout'); })]); await enter(await fn()); } catch (e) { $('menu-err').textContent = 'Could not connect to the server.'; } btn.disabled = false;
}
$('btn-create').onclick = () => begin(() => net.create(nameVal()), $('btn-create'));
$('btn-join').onclick = () => { const code = $('join-code').value.trim().toUpperCase(); if (code.length < 4) { $('menu-err').textContent = 'Enter the room code or paste the invitation link.'; return; } begin(() => net.join(code, nameVal()), $('btn-join')); };
$('join-code').oninput = e => { const m = e.target.value.match(/room=([A-Za-z0-9]+)/); e.target.value = (m ? m[1] : e.target.value).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); };
$('btn-resume').onclick = () => begin(() => net.join(net.session.roomId, nameVal()), $('btn-resume'));
$('btn-menu-settings').onclick = () => { $('menu').hidden = true; $('settings').hidden = false; $('settings').classList.add('from-menu'); };
$('set-close').onclick = () => { $('settings').hidden = true; if (!inGame) $('menu').hidden = false; };

/* ---------- boot ---------- */
(async () => {
  applyQuality(); try { config = await (await fetch('/api/config')).json(); } catch {}
  const qr = new URLSearchParams(location.search).get('room');
  if (qr) { $('join-code').value = qr.toUpperCase().slice(0, 8); $('join-hint').textContent = 'You were invited — enter your name and press Join Room.'; }
  if (net.session && (!qr || qr.toUpperCase() === net.session.roomId)) { $('btn-resume').hidden = false; $('btn-resume').textContent = `Resume room ${net.session.roomId}`; }
  placeAt('museum', 8, 0, Math.PI / 2); C.want = 6; C.pitch = .25; C.dist = 6; C.intro = 1;
  me.group.visible = true; $('loading').hidden = true; frame();
  net.connect().catch(() => {});
})();
