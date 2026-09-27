// The park: sky, rolling hills, lush grass, flower beds, groves of trees,
// a pond with ducks, a gravel path with benches and lamps, butterflies,
// birds, pollen, and people walking their dogs.
import * as THREE from 'three';
import { Owner } from './owner.js';
import { Dog } from './dog.js';
import { BREEDS } from './breeds.js';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const UP = new THREE.Vector3(0, 1, 0);

// 2D value noise for the hills
function hash2(x, y) { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); }
function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export const PATH_R = 53.5;
export const POND = { x: -24, z: -66, r: 10 };

export function heightAt(x, z) {
  const r = Math.hypot(x, z);
  const hills = noise2(x * 0.018, z * 0.018) * 16 + noise2(x * 0.05, z * 0.05) * 4;
  return sstep(78, 150, r) * (hills + 3);
}

export function buildWorld(scene, renderer, { fieldR, lowPower }) {
  const HORIZON = new THREE.Color(0xd2ecf4);
  scene.fog = new THREE.Fog(new THREE.Color(0xc6e2ea), 80, 260);
  const SUN_DIR = new THREE.Vector3(0.55, 0.6, 0.35).normalize();
  const animated = [];

  // ---------------------------------------------------------------- sky
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(450, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uHorizon: { value: HORIZON }, uZenith: { value: new THREE.Color(0x3d8ee0) },
        uGround: { value: new THREE.Color(0x9fc7a0) }, uSunDir: { value: SUN_DIR }, uSunCol: { value: new THREE.Color(0xfff2d6) },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uHorizon, uZenith, uGround, uSunDir, uSunCol; varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir); float h = d.y;
          vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.5));
          col = mix(col, uGround, smoothstep(0.0, -0.08, h));
          float s = max(dot(d, uSunDir), 0.0);
          col += uSunCol * (pow(s, 900.0) * 6.0 + pow(s, 30.0) * 0.3 + pow(s, 4.0) * 0.1);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    })
  );
  sky.frustumCulled = false;
  scene.add(sky);

  scene.add(new THREE.HemisphereLight(0xe2f2ff, 0x4f7a34, 1.15));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.5);
  sun.castShadow = true;
  const sm = lowPower ? 1024 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 160 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  // Soft, lumpy clouds
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xc0d0e0, fog: false });
  const clouds = [];
  for (let i = 0; i < 16; i++) {
    const c = new THREE.Group();
    const puffs = 5 + Math.floor(Math.random() * 5);
    for (let j = 0; j < puffs; j++) {
      const p = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(6, 11), 2), cloudMat);
      p.position.set(j * rand(5, 8) - puffs * 3.5, rand(-1, 3), rand(-4, 4));
      p.scale.y = rand(0.5, 0.7);
      c.add(p);
    }
    const a = rand(0, Math.PI * 2), r = rand(200, 360);
    c.position.set(Math.cos(a) * r, rand(70, 120), Math.sin(a) * r);
    c.rotation.y = rand(0, Math.PI);
    scene.add(c);
    clouds.push(c);
  }

  // ---------------------------------------------------------------- ground
  const lawn = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#4f9a33' : '#5ba83b'; g.fillRect(i * 64, 0, 64, 256); }
    for (let i = 0; i < 3600; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(25,70,15,0.22)' : 'rgba(150,215,90,0.18)';
      g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 2 + Math.random() * 3);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(70, 70);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  })();
  const groundGeo = new THREE.PlaneGeometry(700, 700, 140, 140);
  groundGeo.rotateX(-Math.PI / 2);
  {
    const pos = groundGeo.attributes.position, col = new Float32Array(pos.count * 3);
    const cA = new THREE.Color(0xffffff), cB = new THREE.Color(0xc8dca0), tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = heightAt(x, z);
      pos.setY(i, h);
      tmp.copy(cA).lerp(cB, clamp(h / 18, 0, 0.7));   // hill tops a bit paler
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    }
    groundGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    groundGeo.computeVertexNormals();
  }
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshLambertMaterial({ map: lawn, vertexColors: true }));
  ground.receiveShadow = true;
  scene.add(ground);

  const flatDisc = (r, color, opacity, y) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 48), new THREE.MeshLambertMaterial({ color, transparent: true, opacity, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = y; m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  flatDisc(1.8, 0x9a8a5a, 0.5, 0.012);        // worn patch where the owner stands

  const chalk = new THREE.Mesh(new THREE.RingGeometry(fieldR + 0.8, fieldR + 1.1, 160),
    new THREE.MeshBasicMaterial({ color: 0xf4f4e8, transparent: true, opacity: 0.55, depthWrite: false }));
  chalk.rotation.x = -Math.PI / 2; chalk.position.y = 0.02;
  scene.add(chalk);

  // Gravel path around the field
  const gravel = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#cdbf9c'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) {
      const v = 150 + Math.random() * 80 | 0;
      g.fillStyle = `rgba(${v},${v - 12},${v - 35},0.8)`;
      g.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 2.5, 1 + Math.random() * 2.5);
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(40, 40); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const path = new THREE.Mesh(new THREE.RingGeometry(PATH_R - 1.1, PATH_R + 1.1, 200, 1), new THREE.MeshLambertMaterial({ map: gravel }));
  path.rotation.x = -Math.PI / 2; path.position.y = 0.025; path.receiveShadow = true;
  scene.add(path);

  // ---------------------------------------------------------------- grass
  const grassUniforms = { uTime: { value: 0 }, uDog: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector2(1, 0) } };
  const grassGeo = new THREE.BufferGeometry();
  grassGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.04, 0, 0, 0.04, 0, 0, -0.026, 0.2, 0, 0.026, 0.2, 0, 0, 0.44, 0], 3));
  grassGeo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  grassGeo.setAttribute('color', new THREE.Float32BufferAttribute([0.16, 0.36, 0.08, 0.16, 0.36, 0.08, 0.28, 0.55, 0.13, 0.28, 0.55, 0.13, 0.52, 0.8, 0.26], 3));
  grassGeo.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
  const grassMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  grassMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, grassUniforms);
    sh.vertexShader = 'uniform float uTime; uniform vec3 uDog; uniform vec2 uWind;\n' +
      sh.vertexShader.replace('#include <project_vertex>', `
        vec4 wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        wp = modelMatrix * wp;
        float hN = clamp(position.y / 0.44, 0.0, 1.0);
        float bend = hN * hN;
        float gust = sin(uTime * 1.6 + dot(wp.xz, uWind) * 0.25) * 0.6 + sin(uTime * 3.3 + wp.x * 0.61 - wp.z * 0.37) * 0.22 + 0.35;
        wp.xz += uWind * gust * bend * 0.16;
        vec2 away = wp.xz - uDog.xz;
        float dd = length(away);
        float push = (1.0 - smoothstep(0.15, 1.0, dd)) * bend * 0.4;
        wp.xz += away / max(dd, 0.001) * push;
        wp.y -= push * 0.55;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
      `);
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
      'float faceDirection = 1.0;\nvec3 normal = normalize( vNormal );\nvec3 nonPerturbedNormal = normal;');
  };
  const onPath = (x, z) => Math.abs(Math.hypot(x, z) - PATH_R) < 1.35;
  const inPond = (x, z, m = 0) => Math.hypot(x - POND.x, z - POND.z) < POND.r + m;
  {
    const COUNT = lowPower ? 34000 : 95000;
    const R = 70;
    const grass = new THREE.InstancedMesh(grassGeo, grassMat, COUNT);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    let n = 0;
    while (n < COUNT) {
      const r = R * Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.hypot(x, z) < 1.6 || Math.hypot(x + 2.8, z + 1.4) < 1.5 || onPath(x, z) || inPond(x, z, 0.3)) continue;
      p.set(x, heightAt(x, z), z);
      q.setFromAxisAngle(UP, Math.random() * Math.PI);
      const lush = r > fieldR + 2 ? rand(1.3, 2.1) : rand(0.6, 1.35);
      s.set(rand(0.8, 1.3), lush, 1);
      m.compose(p, q, s);
      grass.setMatrixAt(n, m);
      col.setHSL(rand(0.23, 0.3), rand(0.5, 0.68), rand(0.4, 0.55));
      grass.setColorAt(n, col);
      n++;
    }
    grass.receiveShadow = true;
    grass.frustumCulled = false;
    scene.add(grass);
  }

  // ---------------------------------------------------------------- flowers
  {
    const PATCHES = lowPower ? 26 : 40, PER = lowPower ? 40 : 70;
    const palette = [[0xe8322a, 0x2a1a10], [0xffffff, 0xf5c518], [0x4a74e8, 0xf0f0ff], [0xf5d31b, 0xe0a010], [0xb68ee0, 0xf5e6ff], [0xff8fb8, 0xfff0a0]];
    const headGeo = new THREE.CylinderGeometry(0.06, 0.02, 0.03, 7);
    const heartGeo = new THREE.SphereGeometry(0.025, 6, 4);
    const stemGeo = new THREE.CylinderGeometry(0.005, 0.007, 1, 4); stemGeo.translate(0, 0.5, 0);
    const total = PATCHES * PER;
    const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshLambertMaterial(), total);
    const hearts = new THREE.InstancedMesh(heartGeo, new THREE.MeshLambertMaterial(), total);
    const stems = new THREE.InstancedMesh(stemGeo, new THREE.MeshLambertMaterial({ color: 0x3f7f2a }), total);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    let n = 0;
    for (let i = 0; i < PATCHES; i++) {
      // Beds mostly just outside the field and along the path, a few inside
      const a = rand(0, Math.PI * 2), r = i % 5 === 0 ? rand(12, fieldR - 3) : Math.random() < 0.5 ? rand(fieldR + 1.8, PATH_R - 1.6) : rand(PATH_R + 1.6, 68);
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
      if (inPond(cx, cz, 3)) continue;
      const [petal, heart] = palette[i % palette.length];
      const spread = i % 5 === 0 ? 1.2 : rand(1.6, 3.2);
      for (let j = 0; j < PER; j++) {
        const x = cx + rand(-1, 1) * spread, z = cz + rand(-1, 1) * spread;
        if (onPath(x, z) || Math.hypot(x - cx, z - cz) > spread) continue;
        const h = rand(0.2, 0.42);
        const y = heightAt(x, z);
        e.set(rand(-0.25, 0.25), rand(0, 6), rand(-0.25, 0.25));
        q.setFromEuler(e);
        m.compose(p.set(x, y + h, z), q, s.setScalar(rand(0.8, 1.3)));
        heads.setMatrixAt(n, m); heads.setColorAt(n, c.setHex(petal).offsetHSL(0, 0, rand(-0.05, 0.05)));
        m.compose(p.set(x, y + h + 0.018, z), q, s.setScalar(1));
        hearts.setMatrixAt(n, m); hearts.setColorAt(n, c.setHex(heart));
        m.compose(p.set(x, y, z), q, s.set(1, h, 1));
        stems.setMatrixAt(n, m);
        n++;
      }
    }
    for (const im of [heads, hearts, stems]) { im.count = n; scene.add(im); }
  }

  // ---------------------------------------------------------------- trees
  {
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.38, 1, 7); trunkGeo.translate(0, 0.5, 0);
    const blobGeo = new THREE.IcosahedronGeometry(1, 1);
    const coneGeo = new THREE.ConeGeometry(1, 1, 9); coneGeo.translate(0, 0.5, 0);
    const MAXT = lowPower ? 110 : 170;
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial(), MAXT);
    const blobs = new THREE.InstancedMesh(blobGeo, new THREE.MeshLambertMaterial({ flatShading: true }), MAXT * 7);
    const cones = new THREE.InstancedMesh(coneGeo, new THREE.MeshLambertMaterial({ flatShading: true }), MAXT * 4);
    trunks.castShadow = blobs.castShadow = cones.castShadow = true;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    let nt = 0, nb = 0, nc = 0;
    const groves = Array.from({ length: 16 }, () => { const a = rand(0, Math.PI * 2), r = rand(64, 150); return [Math.cos(a) * r, Math.sin(a) * r]; });
    for (let i = 0; i < MAXT; i++) {
      let x, z;
      for (let tries = 0; tries < 30; tries++) {
        if (i < 22) { const a = rand(0, Math.PI * 2), r = rand(PATH_R + 3.5, 66); x = Math.cos(a) * r; z = Math.sin(a) * r; }
        else { const g = groves[i % groves.length]; x = g[0] + rand(-14, 14); z = g[1] + rand(-14, 14); }
        if (Math.hypot(x, z) > PATH_R + 3 && !inPond(x, z, 6)) break;
      }
      const y = heightAt(x, z) - 0.1;
      const kind = Math.random();
      const sc = rand(0.85, 1.6);
      if (kind < 0.18) {
        // pine
        m.compose(p.set(x, y, z), q.identity(), s.set(sc * 0.7, sc * 2.2, sc * 0.7));
        trunks.setMatrixAt(nt, m); trunks.setColorAt(nt++, c.setHex(0x5a3e28));
        for (let k = 0; k < 4; k++) {
          const w = sc * (2.3 - k * 0.5);
          m.compose(p.set(x, y + sc * (1.3 + k * 1.25), z), q.setFromAxisAngle(UP, rand(0, 3)), s.set(w, sc * 2.4, w));
          cones.setMatrixAt(nc, m); cones.setColorAt(nc++, c.setHSL(rand(0.3, 0.36), rand(0.45, 0.6), rand(0.18, 0.26)));
        }
      } else {
        const birch = kind < 0.32;
        const trunkH = sc * (birch ? 4.2 : 3.2);
        m.compose(p.set(x, y, z), q.identity(), s.set(sc * (birch ? 0.55 : 1), trunkH, sc * (birch ? 0.55 : 1)));
        trunks.setMatrixAt(nt, m); trunks.setColorAt(nt++, c.setHex(birch ? 0xe8e4da : 0x6b4a2b));
        const blobsN = birch ? 5 : 7;
        for (let k = 0; k < blobsN; k++) {
          const rr = sc * rand(1.1, 1.9) * (birch ? 0.8 : 1);
          m.compose(p.set(x + rand(-1.3, 1.3) * sc, y + trunkH + rand(-0.4, 1.6) * sc, z + rand(-1.3, 1.3) * sc),
            q.setFromEuler(new THREE.Euler(rand(0, 3), rand(0, 3), 0)), s.set(rr, rr * rand(0.8, 1), rr));
          blobs.setMatrixAt(nb, m);
          blobs.setColorAt(nb++, c.setHSL(birch ? rand(0.2, 0.25) : rand(0.25, 0.32), rand(0.45, 0.65), birch ? rand(0.42, 0.5) : rand(0.26, 0.38)));
        }
      }
    }
    trunks.count = nt; blobs.count = nb; cones.count = nc;
    scene.add(trunks, blobs, cones);

    // Hedges and bushes
    const bushes = new THREE.InstancedMesh(blobGeo, new THREE.MeshLambertMaterial({ flatShading: true }), 260);
    let nbu = 0;
    for (let i = 0; i < 260; i++) {
      const a = rand(0, Math.PI * 2), r = Math.random() < 0.6 ? PATH_R + rand(2, 3.2) : rand(PATH_R + 4, 75);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (inPond(x, z, 2.5)) continue;
      const rr = rand(0.6, 1.3);
      m.compose(p.set(x, heightAt(x, z) + rr * 0.35, z), q.setFromEuler(new THREE.Euler(0, rand(0, 3), 0)), s.set(rr * 1.3, rr * 0.8, rr));
      bushes.setMatrixAt(nbu, m);
      bushes.setColorAt(nbu++, c.setHSL(rand(0.24, 0.32), rand(0.45, 0.6), rand(0.26, 0.36)));
    }
    bushes.count = nbu;
    bushes.castShadow = true;
    scene.add(bushes);
  }

  // ---------------------------------------------------------------- pond
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(POND.r, 64),
    new THREE.ShaderMaterial({
      transparent: true, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTime: { value: 0 }, uDeep: { value: new THREE.Color(0x1f5b5a) }, uSky: { value: new THREE.Color(0xb9dcef) },
        uShore: { value: new THREE.Color(0x6c8a4a) }, uSunDir: { value: SUN_DIR }, uCenter: { value: new THREE.Vector2(POND.x, POND.z) }, uR: { value: POND.r },
      }]),
      vertexShader: `varying vec3 vWorld;
        #include <fog_pars_vertex>
        void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz;
          vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform float uTime, uR; uniform vec3 uDeep, uSky, uShore, uSunDir; uniform vec2 uCenter; varying vec3 vWorld;
        #include <fog_pars_fragment>
        float h(vec2 p){ return sin(p.x*1.3+uTime*1.1)*0.5 + sin(p.y*1.7-uTime*1.3)*0.4 + sin((p.x+p.y)*2.9+uTime*2.0)*0.2 + sin((p.x-p.y)*5.1-uTime*2.7)*0.1; }
        void main(){
          vec2 p = vWorld.xz; float e = 0.1;
          vec3 n = normalize(vec3(-(h(p+vec2(e,0.))-h(p-vec2(e,0.)))*0.06, 1.0, -(h(p+vec2(0.,e))-h(p-vec2(0.,e)))*0.06));
          vec3 v = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
          vec3 col = mix(uDeep, uSky, 0.2 + 0.8 * fres);
          float spec = pow(max(dot(reflect(-v, n), uSunDir), 0.0), 220.0) * 2.5;
          col += vec3(spec);
          float edge = smoothstep(uR - 1.4, uR, length(p - uCenter));
          col = mix(col, uShore, edge * 0.6);
          gl_FragColor = vec4(col, mix(0.94, 0.7, edge));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(POND.x, 0.04, POND.z);
  scene.add(water);
  animated.push((dt, t) => { water.material.uniforms.uTime.value = t; });
  const mud = new THREE.Mesh(new THREE.RingGeometry(POND.r - 0.3, POND.r + 0.9, 64), new THREE.MeshLambertMaterial({ color: 0x6f6448 }));
  mud.rotation.x = -Math.PI / 2; mud.position.set(POND.x, 0.03, POND.z);
  scene.add(mud);
  {
    // Reeds, stones and lily pads around the pond
    const reedGeo = new THREE.CylinderGeometry(0.012, 0.02, 1, 4); reedGeo.translate(0, 0.5, 0);
    const reeds = new THREE.InstancedMesh(reedGeo, new THREE.MeshLambertMaterial({ color: 0x5f8a3a }), 220);
    const tops = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.03, 0.14, 2, 6), new THREE.MeshLambertMaterial({ color: 0x5a3a22 }), 60);
    const stones = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x8e8a80, flatShading: true }), 26);
    const pads = new THREE.InstancedMesh(new THREE.CircleGeometry(0.45, 12, 0.3, Math.PI * 1.85), new THREE.MeshLambertMaterial({ color: 0x3f8a3a, side: THREE.DoubleSide }), 18);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < 220; i++) {
      const a = rand(0, Math.PI * 2), r = POND.r + rand(-0.8, 0.9), h = rand(0.8, 1.8);
      m.compose(p.set(POND.x + Math.cos(a) * r, 0, POND.z + Math.sin(a) * r), q.setFromEuler(new THREE.Euler(rand(-0.15, 0.15), 0, rand(-0.15, 0.15))), s.set(1, h, 1));
      reeds.setMatrixAt(i, m);
      if (i < 60) { m.compose(p.setY(h), q, s.setScalar(1)); tops.setMatrixAt(i, m); }
    }
    for (let i = 0; i < 26; i++) {
      const a = rand(0, Math.PI * 2), r = POND.r + rand(0.2, 1.4), sc = rand(0.25, 0.6);
      m.compose(p.set(POND.x + Math.cos(a) * r, sc * 0.3, POND.z + Math.sin(a) * r), q.setFromEuler(new THREE.Euler(rand(0, 3), rand(0, 3), 0)), s.set(sc * 1.3, sc * 0.7, sc));
      stones.setMatrixAt(i, m);
    }
    for (let i = 0; i < 18; i++) {
      const a = rand(0, Math.PI * 2), r = rand(2, POND.r - 1.5);
      m.compose(p.set(POND.x + Math.cos(a) * r, 0.06, POND.z + Math.sin(a) * r), q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, rand(0, 6))), s.setScalar(rand(0.7, 1.3)));
      pads.setMatrixAt(i, m);
    }
    stones.castShadow = true;
    scene.add(reeds, tops, stones, pads);
    // Ducks paddling in circles
    const duckBody = new THREE.MeshLambertMaterial({ color: 0x8a6a4a }), duckHead = new THREE.MeshLambertMaterial({ color: 0x1f5a3a }), beak = new THREE.MeshLambertMaterial({ color: 0xf2a020 });
    for (let i = 0; i < 4; i++) {
      const d = new THREE.Group();
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), duckBody); b.scale.set(0.8, 0.6, 1.2); d.add(b);
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), i === 0 ? duckBody : duckHead); h.position.set(0, 0.16, 0.18); d.add(h);
      const bk = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 6), beak); bk.rotation.x = Math.PI / 2; bk.position.set(0, 0.15, 0.3); d.add(bk);
      const tailM = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.15, 5), duckBody); tailM.rotation.x = -Math.PI / 2 - 0.5; tailM.position.set(0, 0.08, -0.24); d.add(tailM);
      scene.add(d);
      const R = rand(2.5, POND.r - 2), w = rand(0.08, 0.16) * (i % 2 ? 1 : -1), a0 = rand(0, 6);
      animated.push((dt, t) => {
        const a = a0 + t * w;
        d.position.set(POND.x + Math.cos(a) * R, 0.06 + Math.sin(t * 2 + i) * 0.015, POND.z + Math.sin(a) * R);
        d.rotation.y = -a + (w > 0 ? 0 : Math.PI);
      });
    }
  }

  // ---------------------------------------------------------------- benches, lamps, bins
  {
    const wood = new THREE.MeshLambertMaterial({ color: 0x9a6a3c }), iron = new THREE.MeshLambertMaterial({ color: 0x2c332e });
    const glass = new THREE.MeshLambertMaterial({ color: 0xfff4d0, emissive: 0x5a4a20 });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.2;
      if (inPond(Math.cos(a) * (PATH_R + 2), Math.sin(a) * (PATH_R + 2), 4)) continue;
      const bench = new THREE.Group();
      for (let k = 0; k < 3; k++) { const slat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 0.12), wood); slat.position.set(0, 0.45, -0.16 + k * 0.15); bench.add(slat); }
      for (let k = 0; k < 2; k++) { const back = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.035), wood); back.position.set(0, 0.62 + k * 0.16, -0.26); back.rotation.x = -0.15; bench.add(back); }
      for (const sx of [-0.7, 0.7]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.5), iron); leg.position.set(sx, 0.22, -0.05); bench.add(leg); }
      bench.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      bench.position.set(Math.cos(a) * (PATH_R + 1.9), 0, Math.sin(a) * (PATH_R + 1.9));
      bench.rotation.y = -a - Math.PI / 2;
      scene.add(bench);
    }
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const lamp = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 3.2, 8), iron); pole.position.y = 1.6; lamp.add(pole);
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.35, 6), glass); head.position.y = 3.3; lamp.add(head);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.2, 6), iron); cap.position.y = 3.55; lamp.add(cap);
      lamp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      lamp.position.set(Math.cos(a) * (PATH_R - 1.6), 0, Math.sin(a) * (PATH_R - 1.6));
      scene.add(lamp);
    }
    // Picnic blanket and basket next to the owner
    const blanketTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d');
      g.fillStyle = '#f2ead6'; g.fillRect(0, 0, 64, 64);
      g.fillStyle = 'rgba(210,60,40,0.75)';
      for (let i = 0; i < 64; i += 16) { g.fillRect(i, 0, 8, 64); g.fillRect(0, i, 64, 8); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; return t;
    })();
    const blanket = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.6), new THREE.MeshLambertMaterial({ map: blanketTex }));
    blanket.rotation.x = -Math.PI / 2; blanket.rotation.z = 0.4; blanket.position.set(-2.8, 0.02, -1.4); blanket.receiveShadow = true;
    scene.add(blanket);
    const basket = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.34), new THREE.MeshLambertMaterial({ color: 0xa8773f }));
    basket.position.set(-2.3, 0.16, -1.9); basket.rotation.y = 0.4; basket.castShadow = true;
    scene.add(basket);
  }

  // ---------------------------------------------------------------- butterflies and birds
  function flappers(count, color, size, spot) {
    const wingGeo = new THREE.CircleGeometry(size, 8, 0, Math.PI);
    wingGeo.rotateX(-Math.PI / 2);
    const mesh = new THREE.InstancedMesh(wingGeo, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), count * 2);
    const c = new THREE.Color();
    for (let i = 0; i < count * 2; i++) mesh.setColorAt(i, c.setHex(Array.isArray(color) ? color[(i >> 1) % color.length] : color));
    mesh.frustumCulled = false;
    scene.add(mesh);
    const items = Array.from({ length: count }, () => ({ ...spot(), ph: rand(0, 6), sp: rand(0.6, 1.2) }));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
    return (t, move, flapHz) => {
      items.forEach((b, i) => {
        const [x, y, z, yaw] = move(b, t);
        const flap = Math.sin(t * flapHz * b.sp + b.ph) * 1.1;
        p.set(x, y, z);
        for (const side of [0, 1]) {
          q.setFromAxisAngle(UP, yaw + (side ? Math.PI : 0));
          q2.setFromAxisAngle(new THREE.Vector3(0, 0, 1), side ? -flap : flap);
          q.multiply(q2);
          m.compose(p, q, s);
          mesh.setMatrixAt(i * 2 + side, m);
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
    };
  }
  const butterflies = flappers(lowPower ? 16 : 30, [0xf2c230, 0xffffff, 0xff7a3a, 0x7ab8ff, 0xf7a6d0], 0.07, () => {
    const a = rand(0, Math.PI * 2), r = rand(6, 66);
    return { cx: Math.cos(a) * r, cz: Math.sin(a) * r, R: rand(0.6, 2.5) };
  });
  const birds = flappers(9, 0x2a2a30, 0.45, () => ({ cx: rand(-60, 60), cz: rand(-60, 60), R: rand(25, 60), h: rand(28, 45) }));
  animated.push((dt, t) => {
    butterflies(t, (b, tt) => {
      const a = tt * 0.6 * b.sp + b.ph;
      return [b.cx + Math.cos(a) * b.R + Math.sin(tt * 1.7 + b.ph) * 0.4, 0.5 + Math.abs(Math.sin(tt * 1.3 + b.ph)) * 0.8, b.cz + Math.sin(a * 1.3) * b.R, -a];
    }, 14);
    birds(t, (b, tt) => {
      const a = tt * 0.12 * b.sp + b.ph;
      return [b.cx + Math.cos(a) * b.R, b.h + Math.sin(tt * 0.5 + b.ph) * 2, b.cz + Math.sin(a) * b.R, -a];
    }, 5);
  });

  // Pollen drifting around the camera
  const POLLEN = lowPower ? 140 : 280;
  const pollenGeo = new THREE.BufferGeometry();
  const pollenPos = new Float32Array(POLLEN * 3);
  for (let i = 0; i < POLLEN; i++) pollenPos.set([rand(-20, 20), rand(0.3, 6), rand(-20, 20)], i * 3);
  pollenGeo.setAttribute('position', new THREE.BufferAttribute(pollenPos, 3));
  const pollen = new THREE.Points(pollenGeo, new THREE.PointsMaterial({ color: 0xfff8e0, size: 0.05, transparent: true, opacity: 0.75, depthWrite: false }));
  pollen.frustumCulled = false;
  scene.add(pollen);

  // ---------------------------------------------------------------- people walking dogs on the path
  const walkers = [];
  const people = [
    { shirt: 0x3a7bd5, pants: 0x2b2b2b, skin: 0xe0b08a, hair: 0x6b4a2b, cap: null, dog: 'labrador', speed: 1.3, dir: 1 },
    { shirt: 0xe04a5a, pants: 0x3a4a6a, skin: 0x5a3a28, hair: 0x111111, cap: 0xf5f5f5, dog: 'corgi', speed: 1.1, dir: -1 },
    { shirt: 0x6ab04c, pants: 0xc8b89a, skin: 0xc68a60, hair: 0x2a1a10, cap: null, dog: null, speed: 1.5, dir: 1 },
  ];
  people.forEach((look, i) => {
    const person = new Owner(look);
    person.setBase('idle');
    scene.add(person.root);
    walkers.push({ person, look, a: i * 2.1, dog: null });
  });
  // Build the walkers' dogs a little later so the first frame isn't delayed
  setTimeout(() => {
    for (const w of walkers) {
      if (!w.look.dog) continue;
      const d = new Dog(BREEDS.find((b) => b.id === w.look.dog), { shells: lowPower ? 3 : 6, cell: 0.016 });
      scene.add(d.root);
      w.dog = d;
    }
  }, 1500);
  animated.push((dt, t) => {
    for (const w of walkers) {
      const L = w.look;
      w.a += (L.speed / PATH_R) * dt * L.dir;
      const x = Math.cos(w.a) * PATH_R, z = Math.sin(w.a) * PATH_R;
      const yaw = Math.atan2(-Math.sin(w.a) * L.dir, Math.cos(w.a) * L.dir);
      w.person.root.position.set(x, 0, z);
      w.person.update(dt, t, { yaw, look: null, walk: t * L.speed * 3.2 });
      if (w.dog) {
        const da = w.a + 0.035 * L.dir, rr = PATH_R - 0.8;
        w.dog.root.position.set(Math.cos(da) * rr, 0, Math.sin(da) * rr);
        w.dog.root.rotation.y = yaw;
        w.dog.update(dt, { speed: L.speed, onGround: true, vy: 0, turnRate: L.dir / PATH_R * L.speed, look: null, eager: 0, accY: 0, happy: false }, t);
      }
    }
  });

  return {
    sky, sun, SUN_DIR, grassUniforms,
    update(dt, t, camera, focus) {
      grassUniforms.uTime.value = t;
      for (const c of clouds) { c.position.x += dt * 0.8; if (c.position.x > 380) c.position.x = -380; }
      for (const f of animated) f(dt, t);
      // pollen wraps around the camera
      for (let i = 0; i < POLLEN; i++) {
        let x = pollenPos[i * 3] + Math.sin(t * 0.3 + i) * dt * 0.3 + grassUniforms.uWind.value.x * dt * 0.4;
        let y = pollenPos[i * 3 + 1] + Math.sin(t * 0.5 + i * 1.7) * dt * 0.15;
        let z = pollenPos[i * 3 + 2] + Math.cos(t * 0.27 + i) * dt * 0.3 + grassUniforms.uWind.value.y * dt * 0.4;
        const dx = x - camera.position.x, dz = z - camera.position.z;
        if (dx > 20) x -= 40; if (dx < -20) x += 40;
        if (dz > 20) z -= 40; if (dz < -20) z += 40;
        pollenPos[i * 3] = x; pollenPos[i * 3 + 1] = y; pollenPos[i * 3 + 2] = z;
      }
      pollenGeo.attributes.position.needsUpdate = true;
      sky.position.copy(camera.position);
      sun.position.set(focus.x + SUN_DIR.x * 60, SUN_DIR.y * 60, focus.z + SUN_DIR.z * 60);
      sun.target.position.copy(focus);
    },
  };
}
