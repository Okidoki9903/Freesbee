// Procedural dog. The skeleton (same rig as the animation code uses) is posed
// standing, the body is sculpted around it from blended volumes, meshed with
// surface nets, skinned to the bones, painted with the breed's coat and
// covered with shell fur. Legs are driven by two-bone IK so paws plant, and
// the gait blends walk -> trot -> rotary gallop with a flexing spine.
import * as THREE from 'three';
import { roundCone, ellipsoid, sdfOf, surfaceNets, snapToSurface, furMaterials, addFurShells } from './sculpt.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, r, dt) => a + (b - a) * (1 - Math.exp(-r * dt));
const smooth = (t) => t * t * (3 - 2 * t);
const sstep = (e0, e1, x) => smooth(clamp((x - e0) / (e1 - e0), 0, 1));
const frac = (x) => x - Math.floor(x);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Footfall offsets (LF, RF, LH, RH) and duty factor for each gait
const GAITS = {
  walk: { off: [0.25, 0.75, 0.0, 0.5], duty: 0.65 },
  trot: { off: [0.0, 0.5, 0.5, 0.0], duty: 0.45 },
  gallop: { off: [0.52, 0.42, 0.0, 0.12], duty: 0.3 },
};

const TAILS = {
  long: { n: 4, len: 0.1, r: 0.032, base: -2.1, bend: 0.12, run: -1.5, fur: 1.1 },
  plume: { n: 4, len: 0.1, r: 0.036, base: -2.2, bend: 0.1, run: -1.6, fur: 2.4 },
  thin: { n: 4, len: 0.12, r: 0.02, base: -2.6, bend: 0.2, run: -2.0, fur: 0.3 },
  otter: { n: 4, len: 0.09, r: 0.045, base: -2.0, bend: 0.06, run: -1.6, fur: 0.6 },
  curl: { n: 4, len: 0.085, r: 0.036, base: -0.4, bend: 0.85, run: -0.4, fur: 2.2 },
  stub: { n: 1, len: 0.05, r: 0.035, base: -0.6, bend: 0, run: -0.6, fur: 1 },
};
const EARS = {
  flop: { flop: 1, rx: 0.1, rz: 0.55 }, point: { flop: 0.12, rx: -0.15, rz: -0.25 },
  semi: { flop: 0.45, rx: 0.55, rz: -0.2 }, rose: { flop: 0.5, rx: -1.35, rz: 0.2 },
  fold: { flop: 0.6, rx: 1.9, rz: -0.35 }, bat: { flop: 0.1, rx: -0.1, rz: -0.38 },
};

function coatColors(coat) {
  const { base, second } = coat;
  const lighter = new THREE.Color(base).lerp(new THREE.Color(0xffffff), 0.3).getHex();
  const C = {
    back: base, belly: lighter, chest: base, neck: base, head: base, muzzle: base, blaze: null,
    ears: base, legU: base, legL: base, paw: base, tail: base, tailTip: base, mask: null,
  };
  switch (coat.pattern) {
    case 'collie': Object.assign(C, { belly: second, chest: second, neck: second, muzzle: second, blaze: second, legL: second, paw: second, tailTip: second }); break;
    case 'chest': Object.assign(C, { belly: second, chest: second, paw: second }); break;
    case 'patches': Object.assign(C, { head: second, ears: second, blaze: base }); break;
    case 'mask': Object.assign(C, { muzzle: second, ears: second, mask: second, tailTip: second }); break;
    case 'husky': Object.assign(C, { belly: second, chest: second, muzzle: second, legL: second, legU: second, paw: second }); break;
    case 'corgi': Object.assign(C, { belly: second, chest: second, neck: second, muzzle: second, blaze: second, legL: second, paw: second }); break;
    case 'spots': Object.assign(C, { ears: second }); break;
    default: break;
  }
  const out = {};
  for (const k in C) out[k] = C[k] === null ? null : new THREE.Color(C[k]);
  out.second = new THREE.Color(second);
  out.base = new THREE.Color(base);
  return out;
}

// Cheap 3D hash + Worley spots (dalmatian)
function hash3(x, y, z) { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); }
function spotAt(p, size) {
  const cx = Math.floor(p.x / size), cy = Math.floor(p.y / size), cz = Math.floor(p.z / size);
  let best = 0;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
    const x = cx + i, y = cy + j, z = cz + k;
    if (hash3(x, y, z) > 0.75) continue;
    const fx = (x + hash3(x + 7, y, z)) * size, fy = (y + hash3(x, y + 7, z)) * size, fz = (z + hash3(x, y, z + 7)) * size;
    const r = size * (0.2 + 0.2 * hash3(x + 3, y + 5, z + 1));
    const d = Math.hypot(p.x - fx, p.y - fy, p.z - fz);
    best = Math.max(best, sstep(r, r * 0.7, d));
  }
  return best;
}

export class Dog {
  constructor(breed, opts = {}) {
    this.breed = breed;
    const L = breed.look;
    this.scale = L.scale;
    const LL = L.legLen, G = L.girth;
    this.a = 0.19 * LL; this.b = 0.19 * LL; this.c = 0.085 * LL;
    this.H = 0.93 * (this.a + this.b) + this.c;
    this.r = 0.16 * G;
    this.spine = 0.56 * L.bodyLen;
    this.bodyY = this.H + this.r * 0.3;
    this.legScale = this.scale * LL;
    const r = this.r, halfLen = this.spine / 2;
    const hr = 0.12 * L.head, sl = 0.12 * L.snout;
    this.hr = hr;

    // ------------------------------------------------------------------
    // Skeleton (groups used as bones)
    // ------------------------------------------------------------------
    const root = new THREE.Group();
    root.scale.setScalar(this.scale);
    const rig = new THREE.Group();
    root.add(rig);
    this.root = root; this.rig = rig;
    const front = new THREE.Group(), rear = new THREE.Group();
    front.position.y = rear.position.y = this.bodyY;
    rig.add(front, rear);
    this.front = front; this.rear = rear;

    const neck = new THREE.Group();
    neck.position.set(0, r * 0.45, halfLen + r * 0.25);
    front.add(neck);
    const NL = 0.2 * L.neck;
    this.neck = neck; this.neckLen = NL; this.neckBase = 0.8;
    neck.rotation.x = this.neckBase;
    const head = new THREE.Group();
    head.position.y = NL;
    head.rotation.x = -this.neckBase;
    neck.add(head);
    this.head = head;

    const tailCfg = TAILS[L.tail];
    this.tailCfg = tailCfg;
    const tailRoot = new THREE.Group();
    tailRoot.position.set(0, r * 0.45, -halfLen - r * 0.7);
    rear.add(tailRoot);
    this.tail = [];
    let parent = tailRoot;
    for (let i = 0; i < tailCfg.n; i++) {
      const seg = new THREE.Group();
      if (i > 0) seg.position.y = tailCfg.len;
      seg.rotation.x = i === 0 ? tailCfg.base : tailCfg.bend;
      parent.add(seg);
      parent = seg;
      this.tail.push({ g: seg, x: seg.rotation.x, vx: 0, z: 0, vz: 0 });
    }
    const tailTip = new THREE.Object3D();
    tailTip.position.y = tailCfg.len;
    parent.add(tailTip);

    this.legs = [];
    for (const d of [{ name: 'LF', front: true, side: 1 }, { name: 'RF', front: true, side: -1 }, { name: 'LH', front: false, side: 1 }, { name: 'RH', front: false, side: -1 }]) {
      const joint = new THREE.Group(), upper = new THREE.Group(), lower = new THREE.Group(), foot = new THREE.Group();
      joint.add(upper);
      lower.position.y = -this.a; upper.add(lower);
      foot.position.y = -this.b; lower.add(foot);
      rig.add(joint);
      const z = d.front ? halfLen : -halfLen;
      const leg = { ...d, joint, upper, lower, foot, rest: V(0.085 * G * d.side, this.H - this.bodyY, z), paw: new THREE.Vector2(z, 0) };
      joint.position.set(leg.rest.x, this.H, z);
      leg.paw.set(z + (d.front ? 0.03 : -0.02), 0);
      this.solveLeg(leg, 0);
      this.legs.push(leg);
    }
    root.updateMatrixWorld(true);

    // Positions of bones in root space (unscaled)
    const at = (obj, x = 0, y = 0, z = 0) => root.worldToLocal(obj.localToWorld(V(x, y, z)));
    const neckP = at(neck), headC = at(head);
    const neckDir = headC.clone().sub(neckP).normalize();

    // ------------------------------------------------------------------
    // Sculpt: volumes around the bones
    // ------------------------------------------------------------------
    const prims = [];
    const P = (prim) => { prims.push(prim); return prim; };
    const tuck = L.tuck ?? 0.2, chestD = L.chest ?? 0.3, neckW = L.neckW ?? 1, muzW = L.muzzleW ?? 1, mane = L.mane ?? 1;
    // Torso
    P(ellipsoid(V(0, this.bodyY + 0.01, -halfLen - r * 0.12), r * 0.9, r * 0.95, r * 0.95, { bones: ['rear'], k: 0.05, tag: 'body', fur: 1 }));
    P(roundCone(V(0, this.bodyY + r * 0.2 * tuck, -halfLen * 0.8), V(0, this.bodyY - r * 0.05, halfLen * 0.45), r * 0.85 * (1 - 0.3 * tuck), r * 0.98,
      { bones: ['rear', 'front'], k: 0.07, tag: 'body', fur: 1 }));
    P(ellipsoid(V(0, this.bodyY - r * 0.12 * (1 + chestD), halfLen * 0.42), r * 0.95, r * (1.05 + 0.3 * chestD), r * 1.2, { bones: ['front'], k: 0.06, tag: 'body', fur: 1 }));
    P(ellipsoid(V(0, this.bodyY + r * 0.08, halfLen + r * 0.05), r * 0.8, r * 1.0, r * 0.72, { bones: ['front'], k: 0.05, tag: 'chest', fur: 1.2 }));
    if (mane > 1.1) {
      P(ellipsoid(neckP.clone().add(V(0, -r * 0.3, r * 0.15)), r * 0.62 * Math.sqrt(mane), r * 0.7 * Math.sqrt(mane), r * 0.55 * Math.sqrt(mane),
        { bones: ['neck'], k: 0.07, tag: 'mane', fur: mane }));
    }
    // Neck
    P(roundCone(neckP.clone().addScaledVector(neckDir, -r * 0.25), headC.clone().add(V(0, -hr * 0.15, -hr * 0.35)), r * 0.62 * neckW, hr * 0.7 * neckW,
      { bones: ['neck', 'head'], exp: 3, k: 0.06, tag: 'neck', fur: 1.1 * Math.sqrt(mane) }));
    // Head: skull, cheeks, brows, muzzle
    P(ellipsoid(headC.clone().add(V(0, hr * 0.05, -hr * 0.05)), hr * 0.92, hr * 0.86, hr * 1.02, { bones: ['head'], k: 0.03, tag: 'head', fur: 0.45 }));
    P(ellipsoid(headC.clone().add(V(0, -hr * 0.3, hr * 0.3)), hr * 0.72, hr * 0.55, hr * 0.72, { bones: ['head'], k: 0.05, tag: 'cheek', fur: 0.4 }));
    for (const s of [-1, 1]) P(ellipsoid(headC.clone().add(V(s * hr * 0.36, hr * 0.3, hr * 0.6)), hr * 0.26, hr * 0.15, hr * 0.22, { bones: ['head'], k: 0.04, tag: 'head', fur: 0.35 }));
    const muzA = headC.clone().add(V(0, -hr * 0.22, hr * 0.55)), muzB = headC.clone().add(V(0, -hr * 0.3, hr * 0.6 + sl));
    P(roundCone(muzA, muzB, hr * 0.5 * muzW, hr * 0.3 * muzW, { bones: ['head'], k: 0.05, tag: 'muzzle', fur: 0.12 }));
    this.stopZ = headC.z + hr * 0.5;
    // Legs
    for (const leg of this.legs) {
      const n = leg.name, J = at(leg.joint), K = at(leg.lower), A = at(leg.foot), Pw = at(leg.foot, 0, -this.c, 0.02);
      const half = leg.front ? 'front' : 'rear';
      if (leg.front) {
        P(roundCone(J.clone().add(V(-leg.side * 0.01, r * 0.55, r * 0.05)), K, 0.072 * G, 0.046 * G, { bones: [half, n + '0'], k: 0.05, tag: 'legU', fur: 0.7 }));
        P(roundCone(K, A, 0.042 * G, 0.029 * G, { bones: [n + '1'], k: 0.025, tag: 'legL', fur: 0.35 }));
      } else {
        P(roundCone(J.clone().add(V(-leg.side * 0.01, r * 0.5, -r * 0.05)), K, 0.09 * G, 0.048 * G, { bones: [half, n + '0'], k: 0.05, tag: 'thigh', fur: 0.9 * Math.sqrt(mane) }));
        P(ellipsoid(J.clone().lerp(K, 0.45).add(V(0, 0.01, 0.02)), 0.068 * G, 0.12 * LL, 0.09 * G, { bones: [n + '0'], k: 0.05, tag: 'thigh', fur: 0.9 * Math.sqrt(mane) }));
        P(roundCone(K, A, 0.045 * G, 0.027 * G, { bones: [n + '1'], k: 0.025, tag: 'legL', fur: 0.35 }));
      }
      P(roundCone(A, Pw.clone().add(V(0, 0.022, 0)), 0.029 * G, 0.028 * G, { bones: [n + '2'], k: 0.02, tag: 'legL', fur: 0.3 }));
      P(ellipsoid(Pw.clone().add(V(0, 0.022, 0.016)), 0.038 * G, 0.024 * G, 0.048 * G, { bones: [n + '2'], k: 0.02, tag: 'paw', fur: 0.3 }));
    }
    // Tail
    const tailPts = [at(tailRoot, 0, -0.02, 0.03)];
    for (const seg of this.tail) tailPts.push(at(seg.g, 0, tailCfg.len, 0));
    for (let i = 0; i < this.tail.length; i++) {
      const u0 = i / this.tail.length, u1 = (i + 1) / this.tail.length;
      const taper = (u) => tailCfg.r * (L.tail === 'otter' ? 1.25 - 0.8 * u : 1.1 - 0.55 * u);
      P(roundCone(tailPts[i], tailPts[i + 1], taper(u0), taper(u1), { bones: ['t' + i], k: 0.03, tag: 'tail', u0, u1, fur: tailCfg.fur }));
    }

    const sdf = sdfOf(prims);
    const cell = opts.cell || 0.012;
    const { positions, normals, index } = surfaceNets(sdf, prims, cell);

    // ------------------------------------------------------------------
    // Skin weights, coat paint, fur length per vertex
    // ------------------------------------------------------------------
    const bones = [front, rear, neck, head];
    const boneIdx = { front: 0, rear: 1, neck: 2, head: 3 };
    for (const leg of this.legs) {
      boneIdx[leg.name + '0'] = bones.length; bones.push(leg.upper);
      boneIdx[leg.name + '1'] = bones.length; bones.push(leg.lower);
      boneIdx[leg.name + '2'] = bones.length; bones.push(leg.foot);
    }
    this.tail.forEach((seg, i) => { boneIdx['t' + i] = bones.length; bones.push(seg.g); });

    const C = coatColors(L.coat);
    const nv = positions.length / 3;
    const skinIndex = new Uint16Array(nv * 4), skinWeight = new Float32Array(nv * 4);
    const colors = new Float32Array(nv * 3), furA = new Float32Array(nv);
    const acc = new Float32Array(bones.length);
    const p = V(0, 0, 0), nrm = V(0, 0, 0), col = new THREE.Color();
    const sigma = 0.012;
    for (let v = 0; v < nv; v++) {
      p.fromArray(positions, v * 3); nrm.fromArray(normals, v * 3);
      acc.fill(0);
      let dmin = Infinity, dom = null, domT = 0;
      const ds = [];
      for (const pr of prims) {
        const b = pr.box, m = (pr.k || 0) + 0.06;
        if (p.x < b[0] - m || p.y < b[1] - m || p.z < b[2] - m || p.x > b[3] + m || p.y > b[4] + m || p.z > b[5] + m) continue;
        const d = pr.d(p.x, p.y, p.z);
        ds.push([pr, d]);
        if (d < dmin) { dmin = d; dom = pr; domT = pr.t(p.x, p.y, p.z); }
      }
      let furSum = 0, wSum = 0;
      for (const [pr, d] of ds) {
        const w = Math.exp(-(d - dmin) / sigma);
        if (w < 0.01) continue;
        const t = pr.t(p.x, p.y, p.z);
        if (pr.bones.length === 2) {
          const wb = Math.pow(t, pr.exp || 1);
          acc[boneIdx[pr.bones[0]]] += w * (1 - wb);
          acc[boneIdx[pr.bones[1]]] += w * wb;
        } else acc[boneIdx[pr.bones[0]]] += w;
        furSum += w * pr.fur; wSum += w;
      }
      // keep the four strongest bones
      const order = [...acc.keys()].sort((a, b) => acc[b] - acc[a]).slice(0, 4);
      const tot = order.reduce((s, i) => s + acc[i], 0) || 1;
      order.forEach((bi, j) => { skinIndex[v * 4 + j] = bi; skinWeight[v * 4 + j] = acc[bi] / tot; });
      furA[v] = wSum ? furSum / wSum : 1;
      this.paint(col, C, L, dom ? dom.tag : 'body', dom && dom.tag === 'tail' ? lerp(dom.u0, dom.u1, domT) : domT, p, nrm, headC);
      colors[v * 3] = col.r; colors[v * 3 + 1] = col.g; colors[v * 3 + 2] = col.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aFur', new THREE.BufferAttribute(furA, 1));
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
    geo.setIndex(new THREE.BufferAttribute(index, 1));

    // Fur: fewer shells for short coats
    const fur = L.fur ?? 0.01;
    const shells = Math.max(2, Math.round((opts.shells ?? 12) * clamp(fur / 0.02, 0.35, 1)));
    this.furMats = furMaterials(shells, fur, fur > 0.015 ? 300 : 420);
    const skeleton = new THREE.Skeleton(bones);
    const body = new THREE.SkinnedMesh(geo, this.furMats[0]);
    body.castShadow = true;
    body.receiveShadow = true;
    body.frustumCulled = false;
    root.add(body);
    root.updateMatrixWorld(true);
    body.bind(skeleton, body.matrixWorld);
    addFurShells(body, this.furMats);
    this.body = body;

    // ------------------------------------------------------------------
    // Rigid details: eyes, nose, jaw, ears, collar, toes
    // ------------------------------------------------------------------
    const std = (color, rough = 0.5, extra = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: rough, ...extra });
    const toHead = (q) => head.worldToLocal(root.localToWorld(q.clone()));
    const eyeMat = std(L.eyes || 0x2a160a, 0.15, { clearcoat: 1, clearcoatRoughness: 0.05 });
    const pupilMat = std(0x050505, 0.1, { clearcoat: 1 });
    const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const lidMat = std(0x1a1210, 0.6);
    for (const s of [-1, 1]) {
      const q = snapToSurface(sdf, headC.clone().add(V(s * hr * 0.44, hr * 0.14, hr * 0.7)));
      const er = hr * 0.14;
      const eyeG = new THREE.Group();
      eyeG.position.copy(toHead(q));
      eyeG.lookAt(eyeG.position.clone().add(V(s * 0.45, 0.05, 1)));   // not parented yet: same frame as position
      eyeG.position.add(V(-s * er * 0.2, 0, -er * 0.35));
      const lid = new THREE.Mesh(new THREE.SphereGeometry(er * 1.12, 16, 12), lidMat);
      lid.scale.z = 0.7;
      eyeG.add(lid);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(er, 16, 12), eyeMat);
      eye.position.z = er * 0.25;
      eyeG.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(er * 0.55, 12, 10), pupilMat);
      pupil.position.z = er * 0.6;
      eyeG.add(pupil);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(er * 0.18, 6, 4), glintMat);
      glint.position.set(er * 0.3, er * 0.35, er * 1.12);
      eyeG.add(glint);
      head.add(eyeG);
    }
    const noseP = snapToSurface(sdf, muzB.clone().add(V(0, hr * 0.12, hr * 0.28)));
    const nose = new THREE.Mesh(new THREE.SphereGeometry(hr * 0.2 * muzW, 16, 12), std(0x121212, 0.25, { clearcoat: 0.8, clearcoatRoughness: 0.3 }));
    nose.scale.set(1.35, 0.9, 0.95);
    nose.position.copy(toHead(noseP));
    head.add(nose);
    for (const s of [-1, 1]) {
      const nostril = new THREE.Mesh(new THREE.SphereGeometry(hr * 0.05, 8, 6), std(0x000000, 0.9));
      nostril.position.copy(nose.position).add(V(s * hr * 0.08, -hr * 0.03, hr * 0.17 * muzW));
      head.add(nostril);
    }
    // Jaw: hidden in the muzzle when closed
    const jaw = new THREE.Group();
    jaw.position.copy(toHead(headC.clone().add(V(0, -hr * 0.45, hr * 0.3))));
    const jawLen = sl + hr * 0.35;
    const jawGeo = new THREE.CapsuleGeometry(hr * 0.2 * muzW, jawLen, 4, 10);
    jawGeo.rotateX(Math.PI / 2); jawGeo.translate(0, 0, jawLen * 0.5);
    const jawMesh = new THREE.Mesh(jawGeo, std(C.muzzle.getHex(), 0.85));
    jawMesh.scale.set(1.1, 0.55, 1);
    jaw.add(jawMesh);
    const mouthIn = new THREE.Mesh(jawGeo, std(0x5a1f24, 0.7));
    mouthIn.scale.set(0.9, 0.35, 0.95);
    mouthIn.position.y = hr * 0.05;
    jaw.add(mouthIn);
    const tongue = new THREE.Mesh(new THREE.CapsuleGeometry(hr * 0.13, jawLen * 0.8, 4, 8), std(0xe0697a, 0.45));
    tongue.rotation.x = Math.PI / 2;
    tongue.scale.set(1.3, 0.35, 1);
    tongue.position.set(0, hr * 0.1, jawLen * 0.55);
    jaw.add(tongue);
    jaw.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    head.add(jaw);
    this.jaw = jaw; this.tongue = tongue;
    const mouth = new THREE.Object3D();
    mouth.position.copy(toHead(headC.clone().add(V(0, -hr * 0.42, hr * 0.55 + sl * 0.8))));
    head.add(mouth);
    this.mouth = mouth;

    // Ears (rigid, with the same fur)
    const earCfg = EARS[L.ears];
    const constAttrs = (g, color, furv) => {
      const n = g.attributes.position.count;
      const c = new Float32Array(n * 3), f = new Float32Array(n).fill(furv);
      for (let i = 0; i < n; i++) { c[i * 3] = color.r; c[i * 3 + 1] = color.g; c[i * 3 + 2] = color.b; }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      g.setAttribute('aFur', new THREE.BufferAttribute(f, 1));
      return g;
    };
    this.ears = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      const flop = L.ears === 'flop';
      pivot.position.copy(toHead(headC.clone().add(V(s * hr * (flop ? 0.72 : 0.55), hr * (flop ? 0.42 : 0.62), -hr * 0.12))));
      let geo2, inner = null;
      if (L.ears === 'flop') {
        geo2 = new THREE.SphereGeometry(1, 16, 12);
        geo2.scale(hr * 0.12, hr * 0.6, hr * 0.38); geo2.translate(s * hr * 0.08, -hr * 0.5, 0);
      } else {
        const big = L.ears === 'bat' ? 1.45 : L.ears === 'point' ? 1.1 : 0.8;
        geo2 = new THREE.ConeGeometry(hr * 0.36 * big, hr * 1.0 * big, 16, 1);
        geo2.scale(1, 1, 0.32); geo2.translate(0, hr * 0.5 * big, 0);
        if (L.ears === 'point' || L.ears === 'bat') {
          const ig = new THREE.ConeGeometry(hr * 0.24 * big, hr * 0.78 * big, 12, 1);
          ig.scale(1, 1, 0.2); ig.translate(0, hr * 0.42 * big, hr * 0.06);
          inner = new THREE.Mesh(ig, std(0xc9938a, 0.8));
        }
      }
      constAttrs(geo2, C.ears, L.ears === 'flop' ? 0.7 : 0.4);
      const ear = new THREE.Mesh(geo2, this.furMats[0]);
      ear.castShadow = true;
      pivot.add(ear);
      if (inner) pivot.add(inner);
      head.add(pivot);
      addFurShells(ear, this.furMats.slice(0, Math.min(this.furMats.length, 5)));
      this.ears.push({ pivot, s, cfg: earCfg, x: earCfg.rx, vx: 0, z: earCfg.rz * s, vz: 0 });
    }

    // Collar around the neck
    const cc = neckP.clone().addScaledVector(neckDir, NL * 0.3);
    // Neck radius: walk sideways from the neck axis until leaving the surface
    let neckR = 0.02;
    while (neckR < 0.3 && sdf(cc.x + neckR, cc.y, cc.z) < 0) neckR += 0.002;
    const collar = new THREE.Mesh(new THREE.TorusGeometry(neckR + 0.004, 0.012, 8, 28), std(0xd8322a, 0.5));
    collar.position.copy(neck.worldToLocal(root.localToWorld(cc.clone())));
    collar.rotation.x = Math.PI / 2;
    collar.castShadow = true;
    neck.add(collar);
    const tag = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.005, 16), std(0xf2c230, 0.25, { metalness: 0.9 }));
    tag.position.copy(collar.position).add(V(0, -0.01, neckR + 0.02));
    tag.rotation.x = Math.PI / 2;
    neck.add(tag);

    // Toe bumps and claws on each paw
    const clawMat = std(0x2b2520, 0.4);
    for (const leg of this.legs) {
      for (let i = 0; i < 4; i++) {
        const x = (i - 1.5) * 0.017 * G;
        const toeP = snapToSurface(sdf, at(leg.foot, x, -this.c + 0.012, 0.075 * G));
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.014, 6), clawMat);
        claw.position.copy(leg.foot.worldToLocal(root.localToWorld(toeP.clone())));
        claw.rotation.x = Math.PI / 2 + 0.6;
        leg.foot.add(claw);
      }
    }

    // Animation state
    this.phase = 0; this.gaitMix = 0; this.flex = 0; this.bob = 0;
    this.lookYaw = 0; this.lookPitch = 0; this.reachOut = 0;
    this.jawOpen = 0; this.squash = 0; this.snap = 0;
    this.tmp = new THREE.Vector3();
  }

  // Coat colour at a surface point
  paint(out, C, L, tag, t, p, n, headC) {
    const pat = L.coat.pattern, halfLen = this.spine / 2, hr = this.hr;
    const mix = (c, f) => { if (c && f > 0) out.lerp(c, clamp(f, 0, 1)); };
    switch (tag) {
      case 'body': case 'chest': case 'mane':
        out.copy(C.back);
        mix(C.belly, sstep(-0.15, -0.55, n.y));
        mix(C.chest, sstep(halfLen * 0.5, halfLen * 0.95, p.z) * sstep(0.45, -0.05, n.y));
        if (tag === 'mane') mix(C.neck, sstep(0.3, -0.2, n.y) + sstep(0.2, 0.7, n.z));
        break;
      case 'neck':
        out.copy(C.neck.equals(C.back) ? C.back : C.back);
        mix(C.neck, pat === 'collie' || pat === 'corgi' ? sstep(0.1, 0.6, t) + sstep(0.2, -0.3, n.y) : 0);
        mix(C.chest, sstep(0.0, 0.6, n.z * 0.8 - n.y * 0.6));
        break;
      case 'head': case 'cheek':
        out.copy(C.head);
        if (tag === 'cheek') mix(C.muzzle, sstep(-0.05, -0.45, n.y) + sstep(headC.z + hr * 0.1, headC.z + hr * 0.5, p.z) * 0.8);
        if (C.blaze) mix(C.blaze, sstep(hr * 0.2, hr * 0.08, Math.abs(p.x)) * sstep(0.1, 0.45, n.y) * sstep(headC.z - hr * 0.4, headC.z + hr * 0.1, p.z));
        break;
      case 'muzzle':
        out.copy(C.muzzle);
        break;
      case 'legU': out.copy(C.legU); mix(C.legL, sstep(0.55, 0.9, t)); break;
      case 'thigh': out.copy(C.back); mix(C.belly, sstep(0.1, -0.5, n.x * Math.sign(p.x)));   // lighter inner thigh mix(C.legL, sstep(0.6, 0.95, t) * (C.legL.equals(C.back) ? 0 : 1)); break;
      case 'legL': out.copy(C.legL); break;
      case 'paw': out.copy(C.paw); break;
      case 'tail': out.copy(C.tail); mix(C.tailTip, sstep(0.65, 0.9, t)); break;
      default: out.copy(C.back);
    }
    // Pattern-specific touches
    if (pat === 'husky') {
      if (tag === 'body' || tag === 'chest' || tag === 'mane' || tag === 'neck' || tag === 'thigh') mix(C.second, sstep(0.05, -0.35, n.y) + (tag === 'mane' ? 0.6 : 0));
      if (tag === 'head' || tag === 'cheek') {
        // white face mask with dark cap
        mix(C.second, sstep(0.25, -0.1, n.y) * sstep(headC.z - hr * 0.3, headC.z + hr * 0.4, p.z));
        const brow = sstep(hr * 0.2, hr * 0.08, Math.hypot(Math.abs(p.x) - hr * 0.3, p.y - headC.y - hr * 0.42));
        mix(C.second, brow);
      }
      if (tag === 'tail') mix(C.second, sstep(-0.1, -0.5, n.y));
    }
    if (pat === 'mask' && (tag === 'head' || tag === 'cheek')) {
      mix(C.mask, sstep(headC.z + hr * 0.15, headC.z + hr * 0.55, p.z) * 0.9);
    }
    if (pat === 'mask' && (tag === 'body' || tag === 'chest')) {
      mix(C.second, sstep(0.55, 0.95, n.y) * 0.35);   // darker saddle
    }
    if (pat === 'patches' && (tag === 'body' || tag === 'thigh' || tag === 'tail')) {
      const d = Math.hypot(p.x, p.y - (this.bodyY + this.r * 0.7), p.z + halfLen * 0.75);
      mix(C.second, sstep(this.r * 0.85, this.r * 0.55, d));
    }
    if (pat === 'spots' && tag !== 'muzzle' && tag !== 'paw') {
      mix(C.second, spotAt(p, tag === 'head' || tag === 'cheek' || tag === 'legL' ? 0.035 : 0.06));
    }
    if (pat === 'collie' && tag === 'neck') mix(C.second, sstep(0.55, 0.25, t) * 0.9);  // white collar ring
  }

  mouthWorld(out) { return this.mouth.getWorldPosition(out); }
  headWorld(out) { return this.head.getWorldPosition(out); }
  get headForward() { return (this.spine * 0.5 + this.r * 0.25 + this.neckLen * Math.sin(this.neckBase) + 0.07 * this.breed.look.head) * this.scale; }
  get headHeight() { return (this.bodyY + this.r * 0.45 + this.neckLen * 0.8) * this.scale; }

  /**
   * s: { speed (m/s), onGround, vy, turnRate, skid, carrying, tired, happy,
   *      look (world Vector3 or null), eager (0..1), accY }
   */
  update(dt, s, t) {
    const ls = this.legScale;
    const localSpeed = s.speed / this.scale;
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

    const ph = this.phase * Math.PI * 2;
    const bobTarget = s.onGround ? lerp(-0.008 * Math.cos(ph * 2), 0.03 * Math.cos(ph - 0.6), gallop) * moving : 0;
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

    const tmp = this.tmp, X = new THREE.Vector3(1, 0, 0);
    for (let i = 0; i < 4; i++) {
      const leg = this.legs[i];
      const half = leg.front ? this.front : this.rear;
      tmp.copy(leg.rest).applyAxisAngle(X, half.rotation.x);
      leg.joint.position.set(leg.rest.x, tmp.y + this.bodyY, tmp.z);
      const jz = leg.joint.position.z, jy = leg.joint.position.y;
      const neutral = leg.rest.z + (leg.front ? 0.03 : -0.02) + (s.skid ? (leg.front ? 0.12 : 0.08) : 0);
      const groundY = -this.bob;
      let pz, py;
      if (s.onGround) {
        const off = lerp(A.off[i], B.off[i], k);
        const lp = frac(this.phase + off);
        const lift = (0.05 + 0.07 * gallop) * (this.a + this.b) / 0.38;
        if (lp < duty) { const u = lp / duty; pz = neutral + sweep * (0.5 - u); py = groundY; }
        else { const u = (lp - duty) / (1 - duty); pz = neutral + sweep * (-0.5 + smooth(u)); py = groundY + lift * Math.sin(Math.PI * u) * moving; }
        pz = lerp(neutral, pz, moving);
        py = lerp(groundY, py, moving);
      } else {
        const rising = clamp(s.vy / 4, -1, 1), reach = this.a + this.b;
        if (leg.front) { pz = jz + lerp(0.2, 0.05, rising) * reach / 0.38; py = jy - reach * lerp(0.85, 0.5, rising); }
        else { pz = jz - lerp(0.02, 0.28, rising) * reach / 0.38; py = jy - reach * lerp(0.6, 0.85, rising); }
      }
      leg.paw.x = damp(leg.paw.x, pz, s.onGround ? 40 : 10, dt);
      leg.paw.y = damp(leg.paw.y, py, s.onGround ? 40 : 10, dt);
      this.solveLeg(leg, s.onGround ? 0 : 0.5);
    }

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
    const counter = -this.flex * 0.8;
    this.neck.rotation.set(this.neckBase - this.lookPitch * 0.5 - this.reachOut * 0.3 + counter + this.snap * 0.3, this.lookYaw * 0.55, 0, 'YXZ');
    this.head.rotation.set(-this.neckBase - this.lookPitch * 0.55 + this.reachOut * 0.25 - counter * 0.5, this.lookYaw * 0.45, 0, 'YXZ');

    const pant = s.carrying ? 0.05 : 0.12 + Math.sin(t * (s.tired ? 16 : 10)) * 0.05 + (s.speed > 6 ? 0.1 : 0);
    this.jawOpen = damp(this.jawOpen, s.carrying ? 0.12 : lerp(pant, 0.75, s.eager), s.eager > 0.3 ? 20 : 10, dt);
    this.jaw.rotation.x = this.jawOpen;
    this.tongue.visible = !s.carrying && s.eager < 0.4;

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
    const az = leg.paw.x - c * Math.sin(footAngle);
    const ay = leg.paw.y + c * Math.cos(footAngle);
    const tz = az - jz, ty = ay - jy;
    const d = clamp(Math.hypot(tz, ty), 0.02, a + b - 0.001);
    const theta = Math.atan2(tz, -ty);
    const alpha = Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1));
    const phi1 = leg.front ? theta - alpha : theta + alpha;
    const kz = a * Math.sin(phi1), ky = -a * Math.cos(phi1);
    const phi2 = Math.atan2(tz - kz, -(ty - ky));
    leg.upper.rotation.x = -phi1;
    leg.lower.rotation.x = -(phi2 - phi1);
    leg.foot.rotation.x = -(footAngle - phi2);
  }
}
