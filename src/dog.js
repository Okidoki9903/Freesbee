// Procedural dog: body built from the breed's proportions, legs driven by
// two-bone IK so paws stay planted, and a gait that blends walk -> trot ->
// rotary gallop with a flexing spine.
import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, r, dt) => a + (b - a) * (1 - Math.exp(-r * dt));
const smooth = (t) => t * t * (3 - 2 * t);
const frac = (x) => x - Math.floor(x);

// Footfall offsets (LF, RF, LH, RH) and duty factor for each gait
const GAITS = {
  walk: { off: [0.25, 0.75, 0.0, 0.5], duty: 0.65 },
  trot: { off: [0.0, 0.5, 0.5, 0.0], duty: 0.45 },
  gallop: { off: [0.52, 0.42, 0.0, 0.12], duty: 0.3 },
};

function spotsTexture(base, spot) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#' + new THREE.Color(base).getHexString();
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#' + new THREE.Color(spot).getHexString();
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * 256, y = Math.random() * 128, r = 3 + Math.random() * 5;
    g.beginPath(); g.ellipse(x, y, r * 1.3, r, Math.random() * 3, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function coatColors(coat) {
  const { base, second } = coat;
  const lighter = new THREE.Color(base).lerp(new THREE.Color(0xffffff), 0.35).getHex();
  const C = {
    back: base, belly: lighter, chest: base, neck: base, head: base, muzzle: base, blaze: null,
    ears: base, legU: base, legL: base, paw: base, tail: base, tailTip: base, mask: null, patch: null,
  };
  switch (coat.pattern) {
    case 'collie': Object.assign(C, { belly: second, chest: second, neck: second, muzzle: second, blaze: second, legL: second, paw: second, tailTip: second }); break;
    case 'chest': Object.assign(C, { belly: second, chest: second, paw: second }); break;
    case 'patches': Object.assign(C, { head: second, ears: second, blaze: base, patch: second }); break;
    case 'mask': Object.assign(C, { muzzle: second, ears: second, mask: second, tailTip: second }); break;
    case 'husky': Object.assign(C, { belly: second, chest: second, muzzle: second, blaze: second, legL: second, paw: second, tailTip: second }); break;
    case 'corgi': Object.assign(C, { belly: second, chest: second, neck: second, muzzle: second, blaze: second, legL: second, paw: second }); break;
    case 'spots': Object.assign(C, { belly: base, ears: second }); break;
    default: break;
  }
  return C;
}

export class Dog {
  constructor(breed) {
    this.breed = breed;
    const L = breed.look;
    this.scale = L.scale;
    const LL = L.legLen, G = L.girth;
    // Leg segments (unscaled units)
    this.a = 0.19 * LL; this.b = 0.19 * LL; this.c = 0.085 * LL;
    this.H = 0.93 * (this.a + this.b) + this.c;           // joint height when standing
    this.r = 0.16 * G;                                     // body radius
    this.spine = 0.56 * L.bodyLen;                         // shoulder-to-hip distance
    this.bodyY = this.H + this.r * 0.3;
    this.legScale = this.scale * LL;

    const C = coatColors(L.coat);
    const mats = new Map();
    const spotMap = L.coat.pattern === 'spots' ? spotsTexture(L.coat.base, L.coat.second) : null;
    const mat = (hex, opts = {}) => {
      const key = hex + (opts.map ? 'm' : '') + (opts.rough || '');
      if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color: opts.map ? 0xffffff : hex, map: opts.map || null, roughness: opts.rough ?? 0.88 }));
      return mats.get(key);
    };
    const furMat = (hex) => (spotMap && hex === L.coat.base ? mat(hex, { map: spotMap }) : mat(hex));
    const cap = (r, len, m, seg = 10) => new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 5, seg), m);
    const sph = (r, m, w = 14, h = 10) => new THREE.Mesh(new THREE.SphereGeometry(r, w, h), m);

    const root = new THREE.Group();
    root.scale.setScalar(this.scale);
    const rig = new THREE.Group();
    root.add(rig);
    this.root = root; this.rig = rig;

    // ---- Spine: front and rear halves pivot around the middle ----
    const front = new THREE.Group(), rear = new THREE.Group();
    front.position.y = rear.position.y = this.bodyY;
    rig.add(front, rear);
    this.front = front; this.rear = rear;
    const halfLen = this.spine / 2;
    const chest = cap(this.r, halfLen * 0.9, furMat(C.back), 14);
    chest.rotation.x = Math.PI / 2; chest.position.z = halfLen * 0.5;
    chest.scale.set(1, 1, 1.05);
    front.add(chest);
    const brisket = sph(this.r * 0.92, furMat(C.chest));
    brisket.scale.set(0.95, 1.05, 0.9);
    brisket.position.set(0, -this.r * 0.1, halfLen * 0.95);
    front.add(brisket);
    const bellyF = sph(this.r * 0.85, furMat(C.belly));
    bellyF.scale.set(0.9, 0.7, 1.4);
    bellyF.position.set(0, -this.r * 0.35, halfLen * 0.35);
    front.add(bellyF);
    const loin = cap(this.r * 0.93, halfLen * 0.9, furMat(C.back), 14);
    loin.rotation.x = Math.PI / 2; loin.position.z = -halfLen * 0.5;
    rear.add(loin);
    const haunch = sph(this.r * 0.95, furMat(C.back));
    haunch.scale.set(1.05, 1, 1);
    haunch.position.set(0, 0, -halfLen * 0.95);
    rear.add(haunch);
    if (C.patch) {
      const p = sph(this.r * 0.7, mat(C.patch));
      p.scale.set(1.45, 0.8, 1.2);
      p.position.set(0, this.r * 0.45, -halfLen * 0.7);
      rear.add(p);
    }

    // ---- Neck and head ----
    const neck = new THREE.Group();
    neck.position.set(0, this.r * 0.45, halfLen + this.r * 0.25);
    front.add(neck);
    const NL = 0.2 * L.neck;
    const neckMesh = cap(this.r * 0.62, NL, furMat(C.neck));
    neckMesh.position.y = NL * 0.5;
    neck.add(neckMesh);
    this.neck = neck; this.neckLen = NL;
    this.neckBase = 0.8;
    neck.rotation.x = this.neckBase;

    const head = new THREE.Group();
    head.position.y = NL;
    neck.add(head);
    this.head = head;
    const hr = 0.12 * L.head;
    const skull = sph(hr, furMat(C.head), 18, 14);
    skull.scale.set(1, 0.92, 1.1);
    head.add(skull);
    if (C.blaze) {
      const blaze = sph(hr * 0.55, mat(C.blaze));
      blaze.scale.set(0.55, 1.4, 0.6);
      blaze.position.set(0, hr * 0.35, hr * 0.72);
      head.add(blaze);
    }
    if (C.mask) {
      const mask = sph(hr * 0.9, mat(C.mask));
      mask.scale.set(1.02, 0.6, 0.9);
      mask.position.set(0, -hr * 0.05, hr * 0.28);
      head.add(mask);
    }
    const sl = 0.12 * L.snout;
    const muzzle = cap(hr * 0.45, sl, mat(C.muzzle));
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(0, -hr * 0.28, hr * 0.62 + sl * 0.5);
    head.add(muzzle);
    const nose = sph(hr * 0.24, mat(0x141414, { rough: 0.3 }));
    nose.scale.set(1.25, 0.85, 1);
    nose.position.set(0, -hr * 0.18, hr * 0.62 + sl + hr * 0.36);
    head.add(nose);
    const jaw = new THREE.Group();
    jaw.position.set(0, -hr * 0.5, hr * 0.45);
    const jawMesh = new THREE.Mesh(new THREE.BoxGeometry(hr * 0.7, hr * 0.22, sl + hr * 0.45), mat(C.muzzle));
    jawMesh.position.z = (sl + hr * 0.45) * 0.5;
    jaw.add(jawMesh);
    const tongue = new THREE.Mesh(new THREE.BoxGeometry(hr * 0.45, hr * 0.08, sl + hr * 0.3), mat(0xe86a7a, { rough: 0.5 }));
    tongue.position.set(0, hr * 0.12, (sl + hr * 0.3) * 0.55);
    jaw.add(tongue);
    head.add(jaw);
    this.jaw = jaw; this.tongue = tongue;
    const mouth = new THREE.Object3D();
    mouth.position.set(0, -hr * 0.45, hr * 0.62 + sl * 0.85);
    head.add(mouth);
    this.mouth = mouth;
    const eyeMat = mat(L.eyes || 0x1a120c, { rough: 0.25 });
    for (const s of [-1, 1]) {
      const eye = sph(hr * 0.17, eyeMat, 10, 8);
      eye.position.set(hr * 0.45 * s, hr * 0.22, hr * 0.8);
      head.add(eye);
      const pupil = sph(hr * 0.08, mat(0x050505, { rough: 0.2 }), 8, 6);
      pupil.position.set(hr * 0.48 * s, hr * 0.22, hr * 0.94);
      head.add(pupil);
      const glint = sph(hr * 0.045, new THREE.MeshBasicMaterial({ color: 0xffffff }), 6, 4);
      glint.position.set(hr * 0.5 * s, hr * 0.3, hr * 0.97);
      head.add(glint);
    }

    // Ears
    const earCfg = {
      flop: { flop: 1, rx: 0.1, rz: 0.55 }, point: { flop: 0.12, rx: -0.15, rz: -0.25 },
      semi: { flop: 0.45, rx: 0.55, rz: -0.2 }, rose: { flop: 0.5, rx: -1.35, rz: 0.2 },
      fold: { flop: 0.6, rx: 1.9, rz: -0.35 }, bat: { flop: 0.1, rx: -0.1, rz: -0.38 },
    }[L.ears];
    this.ears = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(hr * 0.55 * s, hr * 0.62, -hr * 0.1);
      let ear;
      if (L.ears === 'flop') {
        ear = cap(hr * 0.3, hr * 0.8, mat(C.ears));
        ear.scale.set(0.4, 1, 1.15);
        ear.position.y = -hr * 0.55;
      } else {
        const big = L.ears === 'bat' ? 1.5 : L.ears === 'point' ? 1.15 : 0.85;
        ear = new THREE.Mesh(new THREE.ConeGeometry(hr * 0.38 * big, hr * 1.05 * big, 4), mat(C.ears));
        ear.scale.z = 0.45;
        ear.position.y = hr * 0.5 * big;
      }
      pivot.add(ear);
      head.add(pivot);
      this.ears.push({ pivot, s, cfg: earCfg, x: 0, vx: 0, z: 0, vz: 0 });
    }

    // Tail: a chain of segments on springs
    const tailCfg = {
      long: { n: 4, len: 0.1, r: 0.03, base: -2.1, bend: 0.12, run: -1.5 },
      plume: { n: 4, len: 0.1, r: 0.045, base: -2.2, bend: 0.1, run: -1.6 },
      thin: { n: 4, len: 0.12, r: 0.018, base: -2.6, bend: 0.2, run: -2.0 },
      otter: { n: 4, len: 0.09, r: 0.045, base: -2.0, bend: 0.06, run: -1.6 },
      curl: { n: 4, len: 0.08, r: 0.04, base: -0.4, bend: 0.85, run: -0.4 },
      stub: { n: 1, len: 0.05, r: 0.035, base: -0.6, bend: 0, run: -0.6 },
    }[L.tail];
    this.tailCfg = tailCfg;
    const tailRoot = new THREE.Group();
    tailRoot.position.set(0, this.r * 0.55, -halfLen - this.r * 0.75);
    rear.add(tailRoot);
    this.tail = [];
    let parent = tailRoot;
    for (let i = 0; i < tailCfg.n; i++) {
      const seg = new THREE.Group();
      if (i > 0) seg.position.y = tailCfg.len;
      const taper = L.tail === 'otter' ? 1 - i * 0.18 : 1 - i * 0.12;
      const color = i === tailCfg.n - 1 ? C.tailTip : C.tail;
      const m = cap(tailCfg.r * taper, tailCfg.len, furMat(color), 8);
      m.position.y = tailCfg.len * 0.5;
      seg.add(m);
      parent.add(seg);
      parent = seg;
      this.tail.push({ g: seg, x: 0, vx: 0, z: 0, vz: 0 });
    }

    // ---- Legs ----
    this.legs = [];
    const legDefs = [
      { name: 'LF', front: true, side: 1 }, { name: 'RF', front: true, side: -1 },
      { name: 'LH', front: false, side: 1 }, { name: 'RH', front: false, side: -1 },
    ];
    for (const d of legDefs) {
      const joint = new THREE.Group();
      const upper = new THREE.Group();
      joint.add(upper);
      const uMesh = cap((d.front ? 0.058 : 0.075) * G, this.a * 0.75, furMat(d.front ? C.legU : C.back));
      uMesh.position.y = -this.a * 0.5;
      upper.add(uMesh);
      const lower = new THREE.Group();
      lower.position.y = -this.a;
      upper.add(lower);
      const lMesh = cap(0.04 * G, this.b * 0.8, furMat(C.legL));
      lMesh.position.y = -this.b * 0.5;
      lower.add(lMesh);
      const foot = new THREE.Group();
      foot.position.y = -this.b;
      lower.add(foot);
      const fMesh = cap(0.034 * G, this.c * 0.7, furMat(C.paw));
      fMesh.position.y = -this.c * 0.5;
      foot.add(fMesh);
      const paw = sph(0.045 * G, furMat(C.paw), 10, 8);
      paw.scale.set(1, 0.55, 1.45);
      paw.position.set(0, -this.c, 0.02);
      foot.add(paw);
      rig.add(joint);
      const z = d.front ? halfLen : -halfLen;
      this.legs.push({
        ...d, joint, upper, lower, foot,
        rest: new THREE.Vector3(0.085 * G * d.side, this.H - this.bodyY, z),   // joint relative to spine centre
        paw: new THREE.Vector2(z, 0),     // (z, y) target in rig space
      });
    }

    // Collar
    const collar = new THREE.Mesh(new THREE.TorusGeometry(this.r * 0.66, 0.02, 6, 18), mat(0xd8322a, { rough: 0.6 }));
    collar.rotation.x = Math.PI / 2;
    collar.position.y = NL * 0.2;
    neck.add(collar);

    root.traverse((o) => { if (o.isMesh) o.castShadow = true; });

    // Animation state
    this.phase = 0;
    this.gaitMix = 0;      // 0 walk .. 1 trot .. 2 gallop
    this.flex = 0;
    this.bob = 0;
    this.lookYaw = 0; this.lookPitch = 0; this.reachOut = 0;
    this.jawOpen = 0;
    this.squash = 0;
    this.snap = 0;
    this.tmp = new THREE.Vector3();
  }

  // Head reach centre in world space (where the dog can snap at the disc)
  headWorld(out) { return this.head.getWorldPosition(out); }
  mouthWorld(out) { return this.mouth.getWorldPosition(out); }
  // Body capsule end points in world space, and radius
  bodyCapsule(a, b) {
    this.root.updateWorldMatrix(true, false);
    a.set(0, this.bodyY, this.spine * 0.55).applyMatrix4(this.root.matrixWorld);
    b.set(0, this.bodyY, -this.spine * 0.55).applyMatrix4(this.root.matrixWorld);
    return this.r * this.scale * 1.05;
  }
  // Distance from the body centre to the head, forward (world units)
  get headForward() { return (this.spine * 0.5 + this.r * 0.25 + this.neckLen * Math.sin(this.neckBase) + 0.07 * this.breed.look.head) * this.scale; }
  // Heights in world units
  get headHeight() { return (this.bodyY + this.r * 0.45 + this.neckLen * 0.8) * this.scale; }

  /**
   * s: { speed (m/s), onGround, vy, turnRate, skid, carrying, tired, happy,
   *      look (world Vector3 or null), eager (0..1: mouth opening for a catch) }
   */
  update(dt, s, t) {
    const sc = this.scale;
    const localSpeed = s.speed / sc;
    const ls = this.legScale;

    // Gait selection by speed relative to leg size
    const v = s.speed / ls;
    const target = v < 1.6 ? 0 : v < 4.5 ? (v - 1.6) / 2.9 : 1 + clamp((v - 4.5) / 2.5, 0, 1);
    this.gaitMix = damp(this.gaitMix, target, 4, dt);
    const gm = this.gaitMix;
    const A = gm < 1 ? GAITS.walk : GAITS.trot, B = gm < 1 ? GAITS.trot : GAITS.gallop;
    const k = gm < 1 ? gm : gm - 1;
    const gallop = clamp(gm - 1, 0, 1);

    const freq = lerp(lerp(1.5, 2.3, clamp(gm, 0, 1)), 2.3 + s.speed * 0.07, gallop) / Math.sqrt(ls);
    if (s.onGround) this.phase = frac(this.phase + freq * dt);

    let duty = lerp(A.duty, B.duty, k);
    const stride = localSpeed / freq;
    const maxSweep = (this.a + this.b) * 1.15;
    if (stride * duty > maxSweep) duty = maxSweep / stride;
    const sweep = stride * duty;
    const moving = clamp(localSpeed / 0.4, 0, 1);

    // Body motion
    const ph = this.phase * Math.PI * 2;
    const bobTarget = s.onGround
      ? lerp(-0.008 * Math.cos(ph * 2), 0.03 * Math.cos(ph - 0.6), gallop) * moving
      : 0;
    this.bob = damp(this.bob, bobTarget, 20, dt);
    const flexTarget = s.onGround ? 0.2 * gallop * Math.sin(ph + 0.4) : clamp(-s.vy * 0.03, -0.18, 0.2);
    this.flex = damp(this.flex, flexTarget, 18, dt);
    this.squash = damp(this.squash, 0, 9, dt);
    this.snap = damp(this.snap, 0, 10, dt);

    this.rig.position.y = this.bob;
    this.rig.rotation.z = damp(this.rig.rotation.z, clamp(-s.turnRate * s.speed * 0.02, -0.35, 0.35), 10, dt);
    this.rig.rotation.x = damp(this.rig.rotation.x, s.onGround ? (s.skid ? 0.12 : -0.03 * gallop) : clamp(-s.vy * 0.05, -0.35, 0.35), 8, dt);
    this.rig.scale.set(1 + this.squash * 0.08, 1 - this.squash * 0.16, 1 + this.squash * 0.05);
    this.front.rotation.x = this.flex;
    this.rear.rotation.x = -this.flex;

    // Legs
    const tmp = this.tmp;
    for (let i = 0; i < 4; i++) {
      const leg = this.legs[i];
      const half = leg.front ? this.front : this.rear;
      // Joint position follows the spine flex
      tmp.copy(leg.rest).applyAxisAngle(new THREE.Vector3(1, 0, 0), half.rotation.x);
      leg.joint.position.set(leg.rest.x, tmp.y + this.bodyY, tmp.z);
      const jz = leg.joint.position.z, jy = leg.joint.position.y;
      const neutral = leg.rest.z + (leg.front ? 0.03 : -0.02) + (s.skid ? (leg.front ? 0.12 : 0.08) : 0);
      const groundY = -this.bob;
      let pz, py;
      if (s.onGround) {
        const off = lerp(A.off[i], B.off[i], k);
        const lp = frac(this.phase + off);
        const lift = (0.05 + 0.07 * gallop) * (this.a + this.b) / 0.38;
        if (lp < duty) {
          const u = lp / duty;
          pz = neutral + sweep * (0.5 - u);
          py = groundY;
        } else {
          const u = (lp - duty) / (1 - duty);
          pz = neutral + sweep * (-0.5 + smooth(u));
          py = groundY + lift * Math.sin(Math.PI * u) * moving;
        }
        pz = lerp(neutral, pz, moving);
        py = lerp(groundY, py, moving);
      } else {
        const rising = clamp(s.vy / 4, -1, 1);
        const reach = this.a + this.b;
        if (leg.front) { pz = jz + lerp(0.2, 0.05, rising) * reach / 0.38; py = jy - reach * lerp(0.85, 0.5, rising); }
        else { pz = jz - lerp(0.02, 0.28, rising) * reach / 0.38; py = jy - reach * lerp(0.6, 0.85, rising); }
      }
      leg.paw.x = damp(leg.paw.x, pz, s.onGround ? 40 : 10, dt);
      leg.paw.y = damp(leg.paw.y, py, s.onGround ? 40 : 10, dt);
      const swingCurl = s.onGround ? 0 : 0.5;
      this.solveLeg(leg, swingCurl);
    }

    // Head: look at the target, reach out when eager
    let yawT = 0, pitchT = 0;
    if (s.look) {
      this.root.updateWorldMatrix(true, false);
      const lp = tmp.copy(s.look);
      this.root.worldToLocal(lp);
      const dz = lp.z - (this.spine * 0.5 + 0.1), dy = lp.y - (this.bodyY + this.neckLen);
      yawT = clamp(Math.atan2(lp.x, Math.max(dz, 0.05) + Math.abs(lp.x) * 0.2), -1.5, 1.5);
      pitchT = clamp(Math.atan2(dy, Math.hypot(lp.x, dz)), -0.8, 1.2);
    }
    this.lookYaw = damp(this.lookYaw, yawT, s.eager > 0.3 ? 14 : 7, dt);
    this.lookPitch = damp(this.lookPitch, pitchT, s.eager > 0.3 ? 14 : 7, dt);
    this.reachOut = damp(this.reachOut, s.eager, 12, dt);
    const counter = -this.flex * 0.8;   // keep the head steady while the spine flexes
    this.neck.rotation.set(this.neckBase - this.lookPitch * 0.5 - this.reachOut * 0.3 + counter + this.snap * 0.3, this.lookYaw * 0.55, 0, 'YXZ');
    this.head.rotation.set(-this.neckBase - this.lookPitch * 0.55 + this.reachOut * 0.25 - counter * 0.5, this.lookYaw * 0.45, 0, 'YXZ');

    // Jaw: pants while running, opens wide when a catch is coming, snaps shut on a catch
    const pant = s.carrying ? 0.05 : 0.12 + Math.sin(t * (s.tired ? 16 : 10)) * 0.05 + (s.speed > 6 ? 0.1 : 0);
    this.jawOpen = damp(this.jawOpen, s.carrying ? 0.12 : lerp(pant, 0.75, s.eager), s.eager > 0.3 ? 20 : 10, dt);
    this.jaw.rotation.x = this.jawOpen;
    this.tongue.visible = !s.carrying && s.eager < 0.4;

    // Ears on springs, pushed by speed and vertical acceleration
    const accY = s.accY || 0;
    for (const e of this.ears) {
      const f = e.cfg.flop;
      const tx = e.cfg.rx - Math.min(s.speed / 12, 1) * 0.9 * f - (s.onGround ? 0 : 0.35 * f);
      const tz = e.cfg.rz * e.s + e.s * Math.sin(t * 7 + e.s) * 0.02;
      e.vx += (-accY * 0.004 * f + (tx - e.x) * 140 - e.vx * 10) * dt;
      e.x += e.vx * dt;
      e.vz += ((tz - e.z) * 140 - e.vz * 10 - s.turnRate * 0.4 * f) * dt;
      e.z += e.vz * dt;
      e.pivot.rotation.set(e.x, 0, e.z);
    }

    // Tail chain
    const tc = this.tailCfg;
    const happy = s.carrying || s.happy;
    const wagAmp = happy ? 0.7 : 0.25 + Math.min(s.speed / 14, 1) * 0.1;
    const wagFreq = happy ? 18 : 8;
    const raise = lerp(tc.base, tc.run, Math.min(s.speed / 10, 1)) + (happy && tc.n > 1 ? 0.5 : 0);
    for (let i = 0; i < this.tail.length; i++) {
      const seg = this.tail[i];
      const tx = i === 0 ? raise : tc.bend;
      const tz = i === 0 ? Math.sin(t * wagFreq) * wagAmp : Math.sin(t * wagFreq - i * 0.7) * wagAmp * 0.4;
      const stiff = 90 - i * 15;
      seg.vx += ((tx - seg.x) * stiff - seg.vx * 8 - accY * 0.002) * dt;
      seg.x += seg.vx * dt;
      seg.vz += ((tz - seg.z) * stiff * 1.5 - seg.vz * 8) * dt;
      seg.z += seg.vz * dt;
      seg.g.rotation.set(seg.x, 0, seg.z);
    }
  }

  // Two-bone IK in the sagittal plane (z forward, y up), plus the foot segment
  solveLeg(leg, curl) {
    const a = this.a, b = this.b, c = this.c;
    const jz = leg.joint.position.z, jy = leg.joint.position.y;
    const footAngle = (leg.front ? 0.12 : 0.28) - curl * (leg.front ? 1.4 : 0.6);
    // Ankle (wrist / hock) sits above the paw along the foot segment
    const az = leg.paw.x - c * Math.sin(footAngle);
    const ay = leg.paw.y + c * Math.cos(footAngle);
    const tz = az - jz, ty = ay - jy;
    const d = clamp(Math.hypot(tz, ty), 0.02, a + b - 0.001);
    const theta = Math.atan2(tz, -ty);
    const alpha = Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1));
    // Front elbows point back, hind stifles point forward
    const phi1 = leg.front ? theta - alpha : theta + alpha;
    const kz = a * Math.sin(phi1), ky = -a * Math.cos(phi1);
    const phi2 = Math.atan2(tz - kz, -(ty - ky));
    leg.upper.rotation.x = -phi1;
    leg.lower.rotation.x = -(phi2 - phi1);
    leg.foot.rotation.x = -(footAngle - phi2);
  }
}
