// Particles (dust, grass, confetti) and the ribbon trail behind the disc
import * as THREE from 'three';

const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);

export function createParticles(scene) {
  const MAX = 800;
  const pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 3), size = new Float32Array(MAX), alpha = new Float32Array(MAX);
  const vel = new Float32Array(MAX * 3), life = new Float32Array(MAX), maxLife = new Float32Array(MAX);
  const grav = new Float32Array(MAX), drag = new Float32Array(MAX), s0 = new Float32Array(MAX), s1 = new Float32Array(MAX), a0 = new Float32Array(MAX);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uScale: { value: 400 } },
    vertexShader: `attribute vec3 aColor; attribute float aSize; attribute float aAlpha; uniform float uScale;
      varying vec3 vColor; varying float vAlpha;
      void main(){ vColor = aColor; vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uScale / max(-mv.z, 0.1);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vColor; varying float vAlpha;
      void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
        gl_FragColor = vec4(vColor, vAlpha * smoothstep(0.5, 0.15, d));
        #include <colorspace_fragment>
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  let cursor = 0;
  const c = new THREE.Color();
  function emit(x, y, z, vx, vy, vz, o) {
    const i = cursor; cursor = (cursor + 1) % MAX;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    c.set(o.color); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    life[i] = maxLife[i] = o.life ?? 0.8;
    grav[i] = o.grav ?? 0; drag[i] = o.drag ?? 2;
    s0[i] = o.size ?? 0.3; s1[i] = o.sizeEnd ?? (o.size ?? 0.3) * 2.5;
    a0[i] = o.alpha ?? 0.5;
  }
  function update(dt) {
    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) { alpha[i] = 0; continue; }
      life[i] -= dt;
      const k = Math.exp(-drag[i] * dt);
      vel[i * 3] *= k; vel[i * 3 + 2] *= k; vel[i * 3 + 1] = vel[i * 3 + 1] * k - grav[i] * dt;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (pos[i * 3 + 1] < 0.02) { pos[i * 3 + 1] = 0.02; vel[i * 3 + 1] *= -0.3; }
      const t = 1 - life[i] / maxLife[i];
      size[i] = lerp(s0[i], s1[i], t);
      alpha[i] = a0[i] * (1 - t) * Math.min(1, t * 8);
    }
    for (const a of ['position', 'aColor', 'aSize', 'aAlpha']) geo.attributes[a].needsUpdate = true;
  }
  const api = {
    emit, update,
    setScale(s) { mat.uniforms.uScale.value = s; },
    dust(x, z, n, spread, speed, color = 0xd8cfa2) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = speed * rand(0.4, 1);
        emit(x + rand(-spread, spread), 0.08, z + rand(-spread, spread), Math.cos(a) * s, rand(0.4, 1.4), Math.sin(a) * s,
          { color, life: rand(0.5, 0.9), size: rand(0.16, 0.28), sizeEnd: rand(0.55, 0.85), alpha: 0.42, drag: 3, grav: 0.3 });
      }
    },
    grass(x, z, n, speed) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = speed * rand(0.3, 1);
        emit(x, 0.1, z, Math.cos(a) * s, rand(1.5, 3.5), Math.sin(a) * s,
          { color: Math.random() < 0.5 ? 0x5c9a38 : 0x86b94f, life: rand(0.6, 1.0), size: 0.07, sizeEnd: 0.06, alpha: 1, drag: 1.2, grav: 9 });
      }
    },
    confetti(p, n) {
      const colors = [0xff5a1f, 0xffd23f, 0xfff3e0, 0x3fa0d8];
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, e = rand(-0.2, 1.2), s = rand(2, 5);
        emit(p.x, p.y, p.z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 1, Math.sin(a) * Math.cos(e) * s,
          { color: colors[i % colors.length], life: rand(0.7, 1.2), size: 0.1, sizeEnd: 0.08, alpha: 1, drag: 1.5, grav: 6 });
      }
    },
  };
  return api;
}

export function createTrail(scene) {
  const N = 40;
  const pts = [];
  const pos = new Float32Array(N * 2 * 3), colr = new Float32Array(N * 2 * 4);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(colr, 4).setUsage(THREE.DynamicDrawUsage));
  const idx = [];
  for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  mesh.frustumCulled = false;
  scene.add(mesh);
  const side = new THREE.Vector3(), dir = new THREE.Vector3();
  return {
    push(p) { pts.unshift(p.clone()); if (pts.length > N) pts.pop(); },
    fade() { pts.pop(); pts.pop(); },
    clear() { pts.length = 0; },
    update() {
      colr.fill(0);
      for (let i = 0; i < N && i < pts.length; i++) {
        const p = pts[i], q = pts[Math.min(i + 1, pts.length - 1)];
        dir.subVectors(p, q);
        side.set(-dir.z, 0, dir.x);
        if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
        side.normalize();
        const t = i / (N - 1), w = 0.2 * (1 - t);
        pos.set([p.x + side.x * w, p.y + 0.01, p.z + side.z * w, p.x - side.x * w, p.y - 0.01, p.z - side.z * w], i * 6);
        const a = 0.55 * (1 - t);
        colr.set([1, 0.95, 0.85, a, 1, 0.95, 0.85, a], i * 8);
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
  };
}
