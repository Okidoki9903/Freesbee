// The owner: a jointed figure animated with blended key poses.
// Backhand throw: step in, coil the hips and shoulders, arm across the chest,
// then unwind hips -> shoulders -> arm -> wrist and follow through.
import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

// Joint angles (radians). Arm: yaw = swing across the body (+ = toward the left side),
// pitch = raise (negative = forward/up), elbow = bend in the swing plane.
const POSES = {
  idle:    { crouch: 0, lean: 0.02, twist: 0, hips: 0, rYaw: 0.1, rPitch: -0.15, rElbow: 0.25, rWrist: 0, lYaw: -0.1, lPitch: -0.1, lElbow: 0.2, lRaise: 0, step: 0, head: 0 },
  receive: { crouch: 0.28, lean: 0.55, twist: 0.1, hips: 0, rYaw: 0.15, rPitch: -0.95, rElbow: 0.2, rWrist: 0.2, lYaw: -0.2, lPitch: -0.3, lElbow: 0.3, lRaise: 0, step: 0.15, head: -0.35 },
  ready:   { crouch: 0.05, lean: 0.05, twist: 0.2, hips: 0.1, rYaw: 0.55, rPitch: -1.15, rElbow: 1.35, rWrist: 0.2, lYaw: -0.3, lPitch: -0.5, lElbow: 0.9, lRaise: 0, step: 0, head: 0 },
  windup:  { crouch: 0.16, lean: 0.12, twist: 1.05, hips: 0.55, rYaw: 1.55, rPitch: -1.3, rElbow: 1.1, rWrist: 0.7, lYaw: -0.8, lPitch: -0.9, lElbow: 0.3, lRaise: 0, step: 0.45, head: -0.6 },
  release: { crouch: 0.12, lean: 0.05, twist: -0.15, hips: -0.2, rYaw: -0.1, rPitch: -1.5, rElbow: 0.05, rWrist: -0.5, lYaw: -0.5, lPitch: -0.4, lElbow: 0.4, lRaise: 0, step: 0.5, head: 0 },
  follow:  { crouch: 0.1, lean: 0.12, twist: -0.75, hips: -0.45, rYaw: -1.25, rPitch: -1.25, rElbow: 0.35, rWrist: -0.3, lYaw: -0.2, lPitch: -0.2, lElbow: 0.6, lRaise: 0, step: 0.4, head: 0.1 },
  wave:    { crouch: 0, lean: 0, twist: 0, hips: 0, rYaw: 0.1, rPitch: -0.2, rElbow: 0.3, rWrist: 0, lYaw: 0, lPitch: 0, lElbow: 0.5, lRaise: 2.6, step: 0, head: 0 },
  cheer:   { crouch: 0.05, lean: -0.05, twist: 0, hips: 0, rYaw: 0, rPitch: 0, rElbow: 0.3, rWrist: 0, lYaw: 0, lPitch: 0, lElbow: 0.3, lRaise: 2.8, step: 0, head: 0.25, rRaise: 2.8 },
};
const KEYS = Object.keys(POSES.idle).concat('rRaise');

function mix(a, b, t) {
  const o = {};
  for (const k of KEYS) o[k] = lerp(a[k] || 0, b[k] || 0, t);
  return o;
}

export class Owner {
  constructor() {
    const std = (color, roughness = 0.8) => new THREE.MeshStandardMaterial({ color, roughness });
    const skin = std(0x8d5a3b), shirt = std(0xf2c230), pants = std(0x2d4d7a, 0.9), capM = std(0x1f3a22), shoe = std(0xf5f5f5, 0.6), hair = std(0x1a120c, 0.9);
    const cap = (r, len, m) => new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 5, 12), m);

    const root = new THREE.Group();
    const pelvis = new THREE.Group();
    pelvis.position.y = 0.95;
    root.add(pelvis);
    const hipsMesh = cap(0.16, 0.12, pants);
    hipsMesh.rotation.z = Math.PI / 2;
    pelvis.add(hipsMesh);

    // Legs: thigh -> shin -> foot
    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(0.11 * s, -0.02, 0);
      const thigh = cap(0.085, 0.3, pants);
      thigh.position.y = -0.22;
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -0.45;
      const shin = cap(0.07, 0.3, pants);
      shin.position.y = -0.2;
      knee.add(shin);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.27), shoe);
      foot.position.set(0, -0.44, 0.06);
      knee.add(foot);
      hip.add(knee);
      pelvis.add(hip);
      this.legs.push({ hip, knee, s });
    }

    // Torso twists over the pelvis
    const torso = new THREE.Group();
    torso.position.y = 0.08;
    pelvis.add(torso);
    const chest = cap(0.2, 0.3, shirt);
    chest.scale.set(1.2, 1, 0.75);
    chest.position.y = 0.3;
    torso.add(chest);
    const neck = cap(0.05, 0.06, skin);
    neck.position.y = 0.6;
    torso.add(neck);
    const headG = new THREE.Group();
    headG.position.y = 0.77;
    torso.add(headG);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 16), skin);
    head.scale.set(0.95, 1.08, 1);
    headG.add(head);
    const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.135, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.3), hair);
    hairM.position.y = 0.02;
    headG.add(hairM);
    const capTop = new THREE.Mesh(new THREE.SphereGeometry(0.14, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), capM);
    capTop.position.y = 0.04;
    headG.add(capTop);
    const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.015, 16, 1, false, -Math.PI / 2, Math.PI), capM);
    visor.position.set(0, 0.05, 0.1);
    visor.scale.z = 1.3;
    headG.add(visor);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), std(0x151515, 0.3));
      eye.position.set(0.045 * s, 0.01, 0.12);
      headG.add(eye);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), skin);
    nose.position.set(0, -0.02, 0.13);
    headG.add(nose);

    // Arms: shoulder (yaw, pitch, raise) -> elbow -> hand
    this.arms = {};
    for (const [name, s] of [['r', -1], ['l', 1]]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.25 * s, 0.5, 0);
      torso.add(shoulder);
      const upperArm = new THREE.Group();
      shoulder.add(upperArm);
      const um = cap(0.058, 0.2, shirt);
      um.position.y = -0.14;
      upperArm.add(um);
      const elbow = new THREE.Group();
      elbow.position.y = -0.29;
      upperArm.add(elbow);
      const fm = cap(0.045, 0.2, skin);
      fm.position.y = -0.13;
      elbow.add(fm);
      const wrist = new THREE.Group();
      wrist.position.y = -0.27;
      elbow.add(wrist);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), skin);
      hand.scale.set(0.8, 1.1, 0.6);
      hand.position.y = -0.04;
      wrist.add(hand);
      const grip = new THREE.Object3D();      // where the disc rim sits
      grip.position.y = -0.07;
      wrist.add(grip);
      this.arms[name] = { shoulder, upperArm, elbow, wrist, grip, s };
    }

    root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.root = root; this.pelvis = pelvis; this.torso = torso; this.headG = headG;
    this.pose = { ...POSES.idle, rRaise: 0 };
    this.anim = null;       // { keys: [[time, poseName], ...], t }
    this.base = 'idle';
    this.breath = 0;
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
  }

  // Play a keyframed sequence, e.g. [[0,'ready'],[0.4,'windup'],[0.6,'release']]
  play(keys) { this.anim = { keys, t: 0, from: { ...this.pose } }; }
  setBase(name) { this.base = name; }

  update(dt, t, { yaw, look }) {
    this.root.rotation.y = yaw;
    let target;
    if (this.anim) {
      const a = this.anim;
      a.t += dt;
      const keys = a.keys;
      if (a.t >= keys[keys.length - 1][0]) {
        target = { ...POSES[keys[keys.length - 1][1]] };
        this.anim = null;
        this.pose = mix(this.pose, target, 1);
      } else {
        let i = 0;
        while (i < keys.length - 1 && a.t >= keys[i + 1][0]) i++;
        const [t0, n0] = keys[i], [t1, n1] = keys[i + 1];
        const p0 = i === 0 && t0 === 0 && a.t < t1 && n0 === '_from' ? a.from : POSES[n0];
        const k = ease(clamp((a.t - t0) / (t1 - t0), 0, 1));
        this.pose = mix(p0, POSES[n1], k);
      }
    } else {
      target = POSES[this.base];
      const k = 1 - Math.exp(-6 * dt);
      this.pose = mix(this.pose, target, k);
    }
    const p = this.pose;
    const wave = this.base === 'wave' && !this.anim ? Math.sin(t * 9) * 0.35 : 0;
    this.breath = Math.sin(t * 2.1);

    // Body
    this.pelvis.position.y = 0.95 - p.crouch * 0.35 + this.breath * 0.004;
    this.pelvis.rotation.set(0, p.hips, 0);
    this.torso.rotation.set(p.lean, p.twist - p.hips, 0, 'YXZ');
    // Legs: crouch bends the knees, step puts the right foot forward
    for (const leg of this.legs) {
      const lead = leg.s < 0 ? p.step : -p.step * 0.4;
      leg.hip.rotation.set(-p.crouch * 1.1 - lead * 0.6, -p.hips, 0);
      leg.knee.rotation.x = p.crouch * 1.9 + Math.max(0, lead) * 0.3;
    }
    // Arms
    const r = this.arms.r, l = this.arms.l;
    r.shoulder.rotation.set(p.rPitch, p.rYaw, -(p.rRaise || 0), 'YXZ');
    // Positive bends the right forearm across the chest (toward the left side)
    r.elbow.rotation.set(0, 0, p.rElbow);
    r.wrist.rotation.set(0, 0, p.rWrist);
    l.shoulder.rotation.set(p.lPitch, p.lYaw, p.lRaise + wave, 'YXZ');
    l.elbow.rotation.set(0, 0, -p.lElbow);

    // Head looks at the dog or the disc
    if (look) {
      this.root.updateWorldMatrix(true, false);
      const lp = this._v.copy(look);
      this.torso.worldToLocal(lp);
      const hy = clamp(Math.atan2(lp.x, lp.z), -1.1, 1.1);
      const hp = clamp(-Math.atan2(lp.y - 0.77, Math.hypot(lp.x, lp.z)), -0.6, 0.7);
      this.headG.rotation.set(lerp(hp, p.head, 0.3), hy, 0, 'YXZ');
    }
  }

  // Where the disc sits in the throwing hand, and its orientation
  discInHand(outPos, outQuat) {
    const a = this.arms.r;
    a.grip.updateWorldMatrix(true, false);
    a.grip.getWorldPosition(outPos);
    a.elbow.getWorldPosition(this._w);
    // The disc sticks out past the fingers, along the forearm
    const dir = this._v.subVectors(outPos, this._w).normalize();
    outPos.addScaledVector(dir, 0.2);
    const up = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(dir, up);
    if (side.lengthSq() < 0.01) side.set(1, 0, 0);
    side.normalize();
    const n = up.clone().applyAxisAngle(side, -0.15);
    outQuat.setFromUnitVectors(up, n);
    return outPos;
  }
  handPos(out) { return this.arms.r.grip.getWorldPosition(out); }
}
