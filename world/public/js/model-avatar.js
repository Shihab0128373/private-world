// Loads the supplied GLB characters and drives Mixamo-style bones procedurally.
// The supplied GLBs contain skeletons but no animation clips, so walk/run/sit
// are generated here and synchronized using the game's existing player state.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
const MODEL_URLS = { m: '/models/boy.glb', f: '/models/girl.glb' };
const suffix = (name, part) => name.toLowerCase().endsWith(part.toLowerCase());

export class GameAvatar {
  constructor(appearance = { gender: 'm' }) {
    this.group = new THREE.Group();
    this.appearance = appearance;
    this.model = null;
    this.bones = {};
    this.base = new Map();
    this.phase = 0;
    this.time = 0;
    this.sitBlend = 0;
    this.baseY = 0;
    this.loadVersion = 0;
    this.setAppearance(appearance);
  }

  async setAppearance(appearance = {}) {
    const gender = appearance.gender === 'f' ? 'f' : 'm';
    this.appearance = { ...appearance, gender };
    if (this.loadedGender === gender && this.model) return;
    this.loadedGender = gender;
    const version = ++this.loadVersion;
    try {
      const gltf = await loader.loadAsync(MODEL_URLS[gender]);
      if (version !== this.loadVersion) return;
      const model = clone(gltf.scene);
      const holder = new THREE.Group();

      // boy.glb was exported with a 0.01 armature scale and a 90-degree
      // X rotation. Cancel those exporter transforms to make it upright
      // and match the girl's approximately 1.75-unit height.
      if (gender === 'm') {
        const correction = new THREE.Group();
        correction.rotation.x = -Math.PI / 2;
        correction.scale.setScalar(100);
        correction.add(model);
        holder.add(correction);
      } else {
        holder.add(model);
      }

      holder.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(holder);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      bounds.getSize(size);
      bounds.getCenter(center);
      if (size.y > 0) holder.scale.multiplyScalar(1.72 / size.y);
      holder.position.x -= center.x * holder.scale.x;
      holder.position.z -= center.z * holder.scale.z;
      holder.position.y -= bounds.min.y * holder.scale.y;

      holder.traverse(obj => {
        if (obj.isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
          if (obj.material) {
            const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
            materials.forEach(m => { m.side = THREE.DoubleSide; });
          }
        }
        if (obj.isBone) this.registerBone(obj);
      });

      if (this.model) this.group.remove(this.model);
      this.model = holder;
      this.baseY = holder.position.y;
      this.group.add(holder);
      this.bones = {};
      this.base.clear();
      holder.traverse(obj => { if (obj.isBone) this.registerBone(obj); });
      this.findBones();
    } catch (err) {
      console.error('Could not load character model:', MODEL_URLS[gender], err);
    }
  }

  registerBone(bone) {
    this.base.set(bone, bone.rotation.clone());
  }

  findBones() {
    const all = [];
    this.model?.traverse(o => { if (o.isBone) all.push(o); });
    const find = (part, side) => all.find(b => {
      const n = b.name.toLowerCase();
      return n.includes(part.toLowerCase()) && (!side || n.includes(side.toLowerCase()));
    });
    this.bones = {
      hips: find('Hips'),
      spine: find('Spine1') || find('Spine'),
      head: find('Head'),
      leftUpLeg: find('LeftUpLeg'), rightUpLeg: find('RightUpLeg'),
      leftLeg: find('LeftLeg'), rightLeg: find('RightLeg'),
      leftArm: find('LeftArm'), rightArm: find('RightArm'),
      leftForeArm: find('LeftForeArm'), rightForeArm: find('RightForeArm')
    };
    // Save the original local pose so each frame is calculated from the
    // model's bind pose instead of accumulating rotation drift.
    for (const bone of Object.values(this.bones)) {
      if (bone && !this.base.has(bone)) this.base.set(bone, bone.rotation.clone());
    }
  }

  pose(bone, axis, offset, smooth) {
    if (!bone) return;
    const base = this.base.get(bone);
    if (!base) return;
    bone.rotation[axis] += (base[axis] + offset - bone.rotation[axis]) * smooth;
  }

  update(dt, state = {}) {
    this.time += dt;
    const speed = Math.min(6, state.speed || 0);
    const moving = speed > 0.18 && !state.sit;
    if (moving) this.phase += dt * (state.run || speed > 3.7 ? 11 : 7);
    this.sitBlend += ((state.sit ? 1 : 0) - this.sitBlend) * Math.min(1, dt * 9);

    const swing = moving ? Math.sin(this.phase) * (state.run || speed > 3.7 ? .72 : .42) : 0;
    const sit = this.sitBlend;
    const smooth = Math.min(1, dt * 13);
    const b = this.bones;

    this.pose(b.leftUpLeg, 'x', swing * (1 - sit) + 1.05 * sit, smooth);
    this.pose(b.rightUpLeg, 'x', -swing * (1 - sit) + 1.05 * sit, smooth);
    this.pose(b.leftLeg, 'x', -Math.max(0, -Math.sin(this.phase)) * .72 * (1 - sit) - 1.15 * sit, smooth);
    this.pose(b.rightLeg, 'x', -Math.max(0, Math.sin(this.phase)) * .72 * (1 - sit) - 1.15 * sit, smooth);

    const armSwing = moving ? -swing * .72 : 0;
    this.pose(b.leftArm, 'x', armSwing * (1 - sit) + .12 * sit, smooth);
    this.pose(b.rightArm, 'x', -armSwing * (1 - sit) + .12 * sit, smooth);
    this.pose(b.leftForeArm, 'x', .08 + .75 * sit, smooth);
    this.pose(b.rightForeArm, 'x', .08 + .75 * sit, smooth);
    this.pose(b.spine, 'x', (moving ? (state.run || speed > 3.7 ? -.12 : -.04) : 0) - .08 * sit, smooth);
    this.pose(b.head, 'x', Math.sin(this.time * .8) * .025, smooth);
    this.pose(b.hips, 'x', 0, smooth);

    // A subtle body bounce while walking/running.
    if (this.model) {
      const targetY = moving ? Math.abs(Math.sin(this.phase * 2)) * (state.run || speed > 3.7 ? .035 : .018) : 0;
      this.model.position.y += (this.baseY + targetY - this.model.position.y) * smooth;
    }
  }
}
