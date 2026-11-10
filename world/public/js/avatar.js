// Procedural, customizable human avatars (no external assets) with skeletal-style procedural animation.
import * as THREE from 'three';

export const OPTIONS = {
  skin: ['#f6d9c3', '#e8b895', '#d39a73', '#a86f4c', '#7a4a32', '#4d2e20'],
  hair: ['#1b1512', '#3b2417', '#6b4226', '#b5832f', '#d8b777', '#8c2f1f', '#9a9a9a', '#3a4a78'],
  eye: ['#3b2a1e', '#2f5d8a', '#3c7a4a', '#6b6b6b'],
  top: ['#f2efe9', '#2b2f3a', '#7d2e3b', '#2f5d57', '#c9a24a', '#4b5f8a', '#d98fa0', '#5b3b6e'],
  bottom: ['#2b3550', '#1d1d1f', '#6b5a45', '#9aa3b2', '#3d2b24'],
  hairStyle: ['short', 'long', 'bun', 'ponytail', 'curly', 'buzz', 'bald'],
  outfit: ['casual', 'formal', 'dress', 'hoodie'],
  face: ['round', 'oval', 'square'],
  brow: ['soft', 'thick', 'thin'],
  mouth: ['smile', 'neutral', 'lips']
};
export const defaultAppearance = (g = 'm') => ({
  gender: g, skin: '#e8b895', hairStyle: g === 'm' ? 'short' : 'long', hair: '#3b2417', eye: '#3b2a1e',
  outfit: g === 'm' ? 'casual' : 'dress', top: g === 'm' ? '#2f5d57' : '#7d2e3b', bottom: '#2b3550',
  face: 'oval', brow: 'soft', mouth: 'smile', nose: 0.5, acc: { glasses: false, hat: false, necklace: false, earrings: false, scarf: false }
});

const mat = (c, r = .8, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
const mesh = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; return o; };
const cap = (r, l, m) => mesh(new THREE.CapsuleGeometry(r, l, 6, 12), m);

function build(a) {
  const f = a.gender === 'f';
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const skin = mat(a.skin, .65), hairM = mat(a.hair, .55), topM = mat(a.top, .85), botM = mat(a.bottom, .85);
  const dark = mat('#222', .6), shoeM = mat('#26211e', .5);
  const outfit = a.outfit, suit = outfit === 'formal', dress = outfit === 'dress', hood = outfit === 'hoodie';
  const sx = f ? .92 : 1.08;

  // legs: hip pivot -> thigh -> knee pivot -> shin
  const legs = [-1, 1].map(s => {
    const hip = new THREE.Group(); hip.position.set(s * .1 * sx, .92, 0);
    const legM = dress ? skin : botM;
    const thigh = cap(.075, .3, legM); thigh.position.y = -.24; hip.add(thigh);
    const knee = new THREE.Group(); knee.position.y = -.46; hip.add(knee);
    const shin = cap(.065, .3, legM); shin.position.y = -.22; knee.add(shin);
    const shoe = mesh(new THREE.BoxGeometry(.11, .07, .26), shoeM, 0, -.44, -.04); knee.add(shoe);
    return { hip, knee };
  });
  legs.forEach(l => body.add(l.hip));

  // torso
  const torso = new THREE.Group(); torso.position.y = 1.2; body.add(torso);
  const chest = cap(.17, .3, hood || suit ? mat(suit ? '#23252b' : a.top, .85) : topM); chest.scale.set(sx, 1, .72); torso.add(chest);
  if (f) { const hips = mesh(new THREE.SphereGeometry(.17, 16, 12), dress ? topM : botM, 0, -.25, 0); hips.scale.set(1.05, .8, .8); torso.add(hips); }
  else { const waist = mesh(new THREE.CylinderGeometry(.15, .16, .2, 14), suit || outfit === 'casual' || hood ? botM : topM, 0, -.27, 0); waist.scale.set(1, 1, .75); torso.add(waist); }
  if (dress) { const skirt = mesh(new THREE.CylinderGeometry(.17, .3, .5, 20, 1, true), topM, 0, -.52, 0); skirt.material.side = THREE.DoubleSide; torso.add(skirt); }
  if (suit) { const tie = mesh(new THREE.BoxGeometry(.04, .24, .02), mat(f ? '#7d2e3b' : '#8c1f2b'), 0, .06, -.125); torso.add(tie); const sh = mesh(new THREE.BoxGeometry(.09, .22, .02), mat('#f4f4f4'), 0, .08, -.121); torso.add(sh); }
  if (hood) torso.add(mesh(new THREE.TorusGeometry(.1, .045, 8, 16), topM, 0, .27, .05));
  const neck = mesh(new THREE.CylinderGeometry(.045, .05, .1, 10), skin, 0, .36, 0); torso.add(neck);

  // arms
  const arms = [-1, 1].map(s => {
    const sh = new THREE.Group(); sh.position.set(s * (.2 * sx + .06), .24, 0);
    const sleeveM = suit ? mat('#23252b') : (outfit === 'casual' && !f ? topM : topM);
    const upper = cap(.055, .22, (outfit === 'casual' || dress) ? (dress ? skin : topM) : sleeveM); upper.position.y = -.17; sh.add(upper);
    const el = new THREE.Group(); el.position.y = -.33; sh.add(el);
    const fore = cap(.048, .2, (hood || suit) ? sleeveM : skin); fore.position.y = -.14; el.add(fore);
    const hand = mesh(new THREE.SphereGeometry(.05, 10, 8), skin, 0, -.31, 0); el.add(hand);
    torso.add(sh); return { sh, el };
  });

  // head
  const head = new THREE.Group(); head.position.y = .52; torso.add(head);
  const fs = { round: [1, 1, 1], oval: [.92, 1.12, .96], square: [1.05, .98, 1] }[a.face];
  const skull = mesh(new THREE.SphereGeometry(.12, 24, 18), skin); skull.scale.set(...fs); head.add(skull);
  const eyeM = mat(a.eye, .3), white = mat('#f5f5f5', .4);
  [-1, 1].forEach(s => {
    const w = mesh(new THREE.SphereGeometry(.02, 10, 8), white, s * .045, .015, -.108); w.scale.z = .5; head.add(w);
    const p = mesh(new THREE.SphereGeometry(.012, 10, 8), eyeM, s * .045, .015, -.116); head.add(p);
    const bw = a.brow === 'thick' ? .045 : a.brow === 'thin' ? .03 : .04, bh = a.brow === 'thick' ? .014 : .008;
    const br = mesh(new THREE.BoxGeometry(bw, bh, .01), a.brow === 'soft' ? hairM : dark, s * .045, .05, -.109); br.rotation.z = -s * .12; head.add(br);
    const ear = mesh(new THREE.SphereGeometry(.025, 8, 8), skin, s * .12 * fs[0], 0, 0); ear.scale.z = .6; head.add(ear);
    if (a.acc.earrings) head.add(mesh(new THREE.SphereGeometry(.012, 8, 8), mat('#d4af37', .3, 1), s * .122 * fs[0], -.03, 0));
  });
  const nose = mesh(new THREE.ConeGeometry(.014 + a.nose * .014, .04 + a.nose * .03, 8), skin, 0, -.012, -.12); nose.rotation.x = -Math.PI / 2; head.add(nose);
  const mouthM = mat(a.mouth === 'lips' ? '#b5485a' : '#8a4a45', .5);
  const mouth = mesh(a.mouth === 'neutral' ? new THREE.BoxGeometry(.04, .006, .006) : new THREE.TorusGeometry(.025, a.mouth === 'lips' ? .007 : .0045, 6, 12, Math.PI), mouthM, 0, -.055, -.105);
  if (a.mouth !== 'neutral') mouth.rotation.z = Math.PI; head.add(mouth);

  // hair
  const hs = a.hairStyle, hc = r => new THREE.SphereGeometry(r, 24, 16, 0, Math.PI * 2, 0, Math.PI * .56);
  if (hs !== 'bald') {
    const r = hs === 'buzz' ? .124 : .132;
    const hh = mesh(hc(r), hairM, 0, .008, .008); hh.scale.set(...fs); hh.rotation.x = -.35; head.add(hh);
    if (hs === 'long') { const b = cap(.1, .3, hairM); b.position.set(0, -.12, .07); b.scale.set(1.2, 1, .7); head.add(b); }
    if (hs === 'bun') head.add(mesh(new THREE.SphereGeometry(.06, 12, 10), hairM, 0, .14, .06));
    if (hs === 'ponytail') { const t = cap(.035, .22, hairM); t.position.set(0, -.08, .15); t.rotation.x = -.5; head.add(t); }
    if (hs === 'curly') for (let i = 0; i < 14; i++) { const q = i / 14 * Math.PI * 2; head.add(mesh(new THREE.SphereGeometry(.05, 8, 6), hairM, Math.sin(q) * .12, .07 + (i % 3) * .035, Math.cos(q) * .1 + .02)); }
    if (hs === 'short') { const fr = mesh(new THREE.BoxGeometry(.2, .03, .04), hairM, 0, .085, -.095); fr.rotation.x = .2; head.add(fr); }
  }
  // accessories
  if (a.acc.glasses) { const gm = mat('#111', .3, .5); [-1, 1].forEach(s => { const g = mesh(new THREE.TorusGeometry(.03, .004, 6, 16), gm, s * .045, .015, -.125); head.add(g); }); head.add(mesh(new THREE.BoxGeometry(.03, .004, .004), gm, 0, .02, -.125)); }
  if (a.acc.hat) { const hm = mat('#2b2b30', .8); head.add(mesh(new THREE.CylinderGeometry(.19, .19, .012, 24), hm, 0, .09, -.01)); head.add(mesh(new THREE.CylinderGeometry(.11, .12, .1, 20), hm, 0, .14, 0)); }
  if (a.acc.necklace) { const n = mesh(new THREE.TorusGeometry(.07, .006, 6, 20), mat('#d4af37', .3, 1), 0, .3, -.03); n.rotation.x = Math.PI / 2.4; torso.add(n); }
  if (a.acc.scarf) { const s = mesh(new THREE.TorusGeometry(.095, .035, 8, 20), mat('#a63d40', .9), 0, .3, 0); s.rotation.x = Math.PI / 2; torso.add(s); }

  return { root, body, torso, head, legs, arms };
}

export class Avatar {
  constructor(a = defaultAppearance()) {
    this.group = new THREE.Group(); this.phase = 0; this.t = 0; this.sitBlend = 0; this.setAppearance(a);
  }
  setAppearance(a) {
    this.appearance = a;
    if (this.parts) { this.group.remove(this.parts.root); this.parts.root.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); }); }
    this.parts = build(a); this.group.add(this.parts.root);
    const h = a.gender === 'f' ? .96 : 1.02; this.parts.root.scale.setScalar(h);
  }
  // s: {speed, air, sit, emote}.  Avatar faces -Z; +rotation.x swings limbs forward, +rotation.z (right arm) / -z (left arm) swings outward.
  update(dt, s) {
    const { body, torso, head, legs, arms } = this.parts; this.t += dt;
    const sp = Math.min(s.speed, 6), moving = sp > .2 && !s.sit;
    this.sitBlend += ((s.sit ? 1 : 0) - this.sitBlend) * Math.min(1, dt * 10); const sb = this.sitBlend, k = 1 - sb;
    if (moving) this.phase += dt * (2 + sp * 1.6);
    const sw = moving ? Math.sin(this.phase) * Math.min(.9, .25 + sp * .12) : 0, T = this.t;
    legs[0].hip.rotation.x = sw * k + sb * Math.PI / 2; legs[1].hip.rotation.x = -sw * k + sb * Math.PI / 2;
    legs[0].knee.rotation.x = -(moving ? Math.max(0, -Math.sin(this.phase)) * .9 : 0) * k - sb * Math.PI / 2;
    legs[1].knee.rotation.x = -(moving ? Math.max(0, Math.sin(this.phase)) * .9 : 0) * k - sb * Math.PI / 2;
    let la = -sw * .8, ra = sw * .8, lz = -.08, rz = .08, lel = .15, rel = .15, bob = moving ? Math.abs(Math.sin(this.phase)) * .03 : Math.sin(T * 1.6) * .004, spin = 0, lean = 0;
    if (s.air) { la = ra = 2.2; lz = -.5; rz = .5; legs[0].hip.rotation.x = .5; legs[1].hip.rotation.x = -.3; legs[0].knee.rotation.x = -.9; }
    if (s.sit) { la = ra = .5; lel = rel = .9; }
    const e = s.emote;
    if (e === 'wave') { ra = 0; rz = 2.5 + Math.sin(T * 9) * .3; rel = .5; }
    else if (e === 'clap') { la = ra = 1.2; lel = rel = 1; rz = .1 + Math.max(0, Math.sin(T * 14)) * -.1; lz = -rz; }
    else if (e === 'hug') { la = ra = 1.3; lz = -.6; rz = .6; lel = rel = .4; }
    else if (e === 'dance') { la = Math.sin(T * 6) * 1.2 + 1.8; ra = -Math.sin(T * 6) * 1.2 + 1.8; lz = -.5; rz = .5; bob = Math.abs(Math.sin(T * 6)) * .06; spin = Math.sin(T * 3) * .5; if (!s.sit) { legs[0].hip.rotation.x = Math.sin(T * 6) * .4; legs[1].hip.rotation.x = -Math.sin(T * 6) * .4; } }
    else if (e === 'bow') lean = -Math.sin(Math.min(1, (T * 1.2) % 3) * Math.PI) * .8;
    const sm = Math.min(1, dt * 14), L = (o, k2, v) => o.rotation[k2] += (v - o.rotation[k2]) * sm;
    L(torso, 'x', lean); L(arms[0].sh, 'x', la); L(arms[1].sh, 'x', ra); L(arms[0].sh, 'z', lz); L(arms[1].sh, 'z', rz); L(arms[0].el, 'x', lel); L(arms[1].el, 'x', rel); L(torso, 'y', spin);
    head.rotation.x = Math.sin(T * .7) * .02; body.position.y = bob - sb * .44;
  }
}
