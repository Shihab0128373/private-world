// Cute stylized chibi/cartoon avatars built entirely with Three.js geometry.
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
  face: 'round', brow: 'soft', mouth: 'smile', nose: 0.5,
  acc: { glasses: false, hat: false, necklace: false, earrings: false, scarf: false }
});

const mat = (c, r = .8, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
const mesh = (geo, material, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(geo, material); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o;
};
const ball = (r, material, x, y, z, scale = [1,1,1]) => {
  const o = mesh(new THREE.SphereGeometry(r, 24, 18), material, x, y, z); o.scale.set(...scale); return o;
};
const capsule = (r, length, material, x=0, y=0, z=0) =>
  mesh(new THREE.CapsuleGeometry(r, length, 6, 12), material, x, y, z);

function build(a) {
  const feminine = a.gender === 'f';
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const skin = mat(a.skin, .72), hairM = mat(a.hair, .62), topM = mat(a.top, .82);
  const botM = mat(a.bottom, .85), shoeM = mat('#302631', .55);
  const white = mat('#fff', .3), iris = mat(a.eye, .25), pupil = mat('#17131a', .18);
  const ink = mat('#39232a', .8), blush = new THREE.MeshBasicMaterial({color:'#ef8d91'});
  const gold = mat('#f5c85d', .3, .55);
  const dress = a.outfit === 'dress', hoodie = a.outfit === 'hoodie', formal = a.outfit === 'formal';

  // Short, rounded legs and oversized shoes.
  const legs = [-1, 1].map(side => {
    const hip = new THREE.Group(); hip.position.set(side * .115, .48, 0); body.add(hip);
    const leg = capsule(.075, .19, dress ? skin : botM, 0, -.14, 0); hip.add(leg);
    const shoe = ball(.105, shoeM, 0, -.29, -.045, [1.18,.68,1.35]); hip.add(shoe);
    const sole = ball(.105, mat('#f4e6d6'), 0, -.33, -.045, [1.2,.25,1.38]); hip.add(sole);
    return { hip, knee: { rotation: { x: 0 } } };
  });

  // Compact pear-shaped torso with a visible collar.
  const torso = new THREE.Group(); torso.position.y = .73; body.add(torso);
  const torsoShape = ball(.245, topM, 0, 0, 0, [.9,1.22,.72]); torso.add(torsoShape);
  if (dress) {
    const skirt = mesh(new THREE.CylinderGeometry(.17,.32,.34,24), topM, 0,-.22,0);
    skirt.scale.z=.82; torso.add(skirt);
    const hem = mesh(new THREE.TorusGeometry(.255,.018,8,28), mat('#f5d5df'), 0,-.39,0);
    hem.rotation.x=Math.PI/2; torso.add(hem);
  } else {
    const belt = mesh(new THREE.CylinderGeometry(.19,.19,.055,20), botM,0,-.245,0); torso.add(belt);
  }
  // Decorative front patch / buttons.
  if (formal) {
    torso.add(mesh(new THREE.BoxGeometry(.045,.24,.018), mat('#f6e8c8'), 0,.02,-.177));
    for(let i=0;i<3;i++) torso.add(ball(.018,gold,0,.09-i*.07,-.19));
  } else if (hoodie) {
    const hood = mesh(new THREE.TorusGeometry(.12,.035,8,20), mat(a.top),0,.18,.02);
    hood.rotation.x=Math.PI/2; torso.add(hood);
    torso.add(mesh(new THREE.BoxGeometry(.018,.13,.012), mat('#e8d8d2'),0,-.12,-.18));
  } else {
    torso.add(mesh(new THREE.BoxGeometry(.12,.055,.018), mat('#fff1d9'),0,.14,-.174));
  }

  // Arms are rounded and pivoted for the existing animation system.
  const arms = [-1,1].map(side => {
    const sh = new THREE.Group(); sh.position.set(side*.235,.12,0); torso.add(sh);
    const sleeve = capsule(.075,.18, topM,0,-.105,0); sleeve.rotation.z=side*.12; sh.add(sleeve);
    const el = new THREE.Group(); el.position.y=-.22; sh.add(el);
    const fore = capsule(.058,.16,skin,0,-.085,-.005); fore.rotation.z=-side*.08; el.add(fore);
    el.add(ball(.065,skin,0,-.18,-.012,[1, .9, .85]));
    return {sh,el};
  });

  // Big rounded head, cheeks, eyes, brows, nose and smile.
  const head = new THREE.Group(); head.position.y=.47; torso.add(head);
  const faceScale = a.face === 'square' ? [1.08,1,.9] : a.face === 'oval' ? [.94,1.12,.92] : [1,1,.94];
  const skull = ball(.285,skin,0,0,0,faceScale); head.add(skull);
  // Ears
  [-1,1].forEach(side => {
    head.add(ball(.075,skin,side*.265,-.015,0,[.72,1,.65]));
    // rosy cheeks
    head.add(ball(.038,blush,side*.145,-.09,-.235,[1,.65,.22]));
  });
  // Eyes: whites + iris + pupils + tiny highlights.
  [-1,1].forEach(side => {
    const x=side*.102;
    head.add(ball(.071,white,x,.045,-.238,[.78,1.12,.42]));
    head.add(ball(.046,iris,x,.04,-.263,[.78,1.05,.45]));
    head.add(ball(.026,pupil,x,.035,-.28,[.8,1,.45]));
    head.add(ball(.012,white,x-.012,.06,-.294,[1,1,.5]));
    const browWidth = a.brow === 'thick' ? .09 : .065;
    const brow = capsule(.012,browWidth, hairM, x,.145,-.235);
    brow.rotation.z=side*.08; head.add(brow);
  });
  // Small button nose and curved smile.
  head.add(ball(.025,skin,0,-.035,-.27,[.9,.72,.65]));
  const mouthMat = mat(a.mouth === 'lips' ? '#b94e68' : '#87454a',.6);
  const smile = mesh(new THREE.TorusGeometry(.052,.009,8,20,Math.PI),mouthMat,0,-.115,-.246);
  smile.rotation.z=Math.PI; head.add(smile);
  if(a.mouth==='neutral') smile.scale.y=.12;

  // Hair cap and style-specific chunky locks.
  if(a.hairStyle!=='bald') {
    const capHair=ball(.292,hairM,0,.095,.015,[1.02,.78,.98]); head.add(capHair);
    // fringe across forehead
    if(a.hairStyle!=='buzz') {
      for(let i=0;i<5;i++) {
        const lock=ball(.07,hairM,-.16+i*.08,.105+(i%2)*.018,-.22,[.8,.8,.65]);
        lock.rotation.z=-.18+i*.08; head.add(lock);
      }
    }
    if(a.hairStyle==='long') {
      [-1,1].forEach(side=>head.add(capsule(.075,.35,hairM,side*.22,-.13,.045)));
    } else if(a.hairStyle==='bun') {
      head.add(ball(.105,hairM,0,.31,.09));
    } else if(a.hairStyle==='ponytail') {
      const tail=capsule(.055,.28,hairM,0,-.12,.22); tail.rotation.x=-.35; head.add(tail);
      head.add(ball(.055,gold,0,-.015,.2));
    } else if(a.hairStyle==='curly') {
      for(let i=0;i<11;i++){
        const q=i/11*Math.PI*2;
        head.add(ball(.075,hairM,Math.sin(q)*.22,.18+(i%3)*.025,Math.cos(q)*.16));
      }
    } else if(a.hairStyle==='short') {
      [-1,1].forEach(side=>head.add(ball(.09,hairM,side*.2,.015,.035,[.8,1,.8])));
    }
  }

  // Accessories scaled to the cartoon face.
  if(a.acc.glasses) {
    const frame=mat('#332b38',.3,.35);
    [-1,1].forEach(side=>{
      const ring=mesh(new THREE.TorusGeometry(.073,.008,8,20),frame,side*.102,.04,-.276);
      head.add(ring);
    });
    head.add(mesh(new THREE.BoxGeometry(.055,.012,.012),frame,0,.04,-.276));
  }
  if(a.acc.hat) {
    head.add(mesh(new THREE.CylinderGeometry(.22,.22,.035,24),mat('#e6b64f'),0,.29,0));
    head.add(mesh(new THREE.SphereGeometry(.17,20,14,0,Math.PI*2,0,Math.PI/2),mat('#d85c62'),0,.30,0));
    head.add(ball(.035,mat('#fff0b9'),0,.44,0));
  }
  if(a.acc.earrings) [-1,1].forEach(side=>head.add(ball(.025,gold,side*.28,-.12,-.01)));
  if(a.acc.necklace) {
    const necklace=mesh(new THREE.TorusGeometry(.105,.012,8,24),gold,0,.16,-.04);
    necklace.rotation.x=Math.PI/2.4; torso.add(necklace);
    torso.add(ball(.028,mat('#ffdf78'),0,.055,-.17));
  }
  if(a.acc.scarf) {
    const scarf=mesh(new THREE.TorusGeometry(.16,.045,8,24),mat('#e05e68'),0,.19,0);
    scarf.rotation.x=Math.PI/2; torso.add(scarf);
  }

  return {root,body,torso,head,legs,arms};
}

export class Avatar {
  constructor(a=defaultAppearance()) {
    this.group=new THREE.Group(); this.phase=0; this.t=0; this.sitBlend=0; this.setAppearance(a);
  }
  setAppearance(a) {
    this.appearance=a;
    if(this.parts) {
      this.group.remove(this.parts.root);
      this.parts.root.traverse(o=>{o.geometry?.dispose(); if(Array.isArray(o.material))o.material.forEach(m=>m.dispose()); else o.material?.dispose?.();});
    }
    this.parts=build(a); this.group.add(this.parts.root);
    this.parts.root.scale.setScalar(a.gender==='f'?.96:1);
  }
  update(dt,s) {
    const {body,torso,head,legs,arms}=this.parts; this.t+=dt;
    const sp=Math.min(s.speed,6), moving=sp>.2&&!s.sit, T=this.t;
    this.sitBlend+=((s.sit?1:0)-this.sitBlend)*Math.min(1,dt*10);
    const sb=this.sitBlend,k=1-sb;
    if(moving)this.phase+=dt*(2+sp*1.6);
    const sw=moving?Math.sin(this.phase)*Math.min(.9,.25+sp*.12):0;
    legs[0].hip.rotation.x=sw*k+sb*Math.PI/2;
    legs[1].hip.rotation.x=-sw*k+sb*Math.PI/2;
    legs[0].hip.rotation.z=0; legs[1].hip.rotation.z=0;
    let la=-sw*.8,ra=sw*.8,lz=-.08,rz=.08,lel=.12,rel=.12;
    let bob=moving?Math.abs(Math.sin(this.phase))*.045:Math.sin(T*1.6)*.008;
    let spin=0,lean=0;
    if(s.air){la=ra=2.1;lz=-.4;rz=.4;legs[0].hip.rotation.x=.5;legs[1].hip.rotation.x=-.3;}
    if(s.sit){la=ra=.5;lel=rel=.8;}
    const e=s.emote;
    if(e==='wave'){ra=0;rz=2.5+Math.sin(T*9)*.3;rel=.5;}
    else if(e==='clap'){la=ra=1.2;lel=rel=1;rz=.1+Math.max(0,Math.sin(T*14))*-.1;lz=-rz;}
    else if(e==='hug'){la=ra=1.3;lz=-.6;rz=.6;lel=rel=.4;}
    else if(e==='dance'){
      la=Math.sin(T*6)*1.2+1.5;ra=-Math.sin(T*6)*1.2+1.5;
      lz=-.5;rz=.5;bob=Math.abs(Math.sin(T*6))*.09;spin=Math.sin(T*3)*.35;
      if(!s.sit){legs[0].hip.rotation.x=Math.sin(T*6)*.45;legs[1].hip.rotation.x=-Math.sin(T*6)*.45;}
    } else if(e==='bow') lean=-Math.sin(Math.min(1,(T*1.2)%3)*Math.PI)*.55;
    const sm=Math.min(1,dt*14), L=(o,key,v)=>o.rotation[key]+=(v-o.rotation[key])*sm;
    L(torso,'x',lean); L(arms[0].sh,'x',la); L(arms[1].sh,'x',ra);
    L(arms[0].sh,'z',lz); L(arms[1].sh,'z',rz);
    L(arms[0].el,'x',lel); L(arms[1].el,'x',rel); L(torso,'y',spin);
    head.rotation.x=Math.sin(T*.7)*.025; head.rotation.z=Math.sin(T*1.1)*.012;
    body.position.y=bob-sb*.24;
  }
}
