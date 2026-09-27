// Park scenery: sky, sun, clouds, lawn, instanced grass, trees, picnic spot
import * as THREE from 'three';

const rand = (a, b) => a + Math.random() * (b - a);
const UP = new THREE.Vector3(0, 1, 0);

export function buildWorld(scene, renderer, { fieldR, lowPower }) {
  const HORIZON = new THREE.Color(0xcfe8f2);
  scene.fog = new THREE.Fog(HORIZON, 70, 210);
  const SUN_DIR = new THREE.Vector3(0.55, 0.62, 0.35).normalize();

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uHorizon: { value: HORIZON.clone() },
        uZenith: { value: new THREE.Color(0x3f8fd6) },
        uGround: { value: new THREE.Color(0x9fc7a0) },
        uSunDir: { value: SUN_DIR },
        uSunCol: { value: new THREE.Color(0xfff2d6) },
      },
      vertexShader: `varying vec3 vDir;
        void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uHorizon, uZenith, uGround, uSunDir, uSunCol; varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55));
          col = mix(col, uGround, smoothstep(0.0, -0.08, h));
          float s = max(dot(d, uSunDir), 0.0);
          col += uSunCol * (pow(s, 900.0) * 6.0 + pow(s, 30.0) * 0.35 + pow(s, 4.0) * 0.08);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    })
  );
  sky.frustumCulled = false;
  scene.add(sky);

  scene.add(new THREE.HemisphereLight(0xdff1ff, 0x55703a, 1.1));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
  sun.castShadow = true;
  const sm = lowPower ? 1024 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 140 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xb8c8d8, flatShading: true, fog: false });
  const clouds = [];
  for (let i = 0; i < 14; i++) {
    const c = new THREE.Group();
    const puffs = 4 + Math.floor(Math.random() * 4);
    for (let j = 0; j < puffs; j++) {
      const p = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(5, 9), 1), cloudMat);
      p.position.set(j * rand(5, 7) - puffs * 3, rand(-1.5, 2), rand(-3, 3));
      p.scale.y = 0.6;
      c.add(p);
    }
    const a = rand(0, Math.PI * 2), r = rand(170, 300);
    c.position.set(Math.cos(a) * r, rand(55, 95), Math.sin(a) * r);
    c.rotation.y = rand(0, Math.PI);
    scene.add(c);
    clouds.push(c);
  }

  // Lawn with mowing stripes
  const lawn = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#5f9a39' : '#6daa45'; g.fillRect(i * 64, 0, 64, 256); }
    for (let i = 0; i < 3200; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(35,70,20,0.2)' : 'rgba(170,210,110,0.16)';
      g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 2 + Math.random() * 3);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(60, 60);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  })();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshLambertMaterial({ map: lawn }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const worn = new THREE.Mesh(
    new THREE.CircleGeometry(1.8, 32),
    new THREE.MeshLambertMaterial({ color: 0x9a8a5a, transparent: true, opacity: 0.55, depthWrite: false })
  );
  worn.rotation.x = -Math.PI / 2;
  worn.position.y = 0.012;
  worn.receiveShadow = true;
  scene.add(worn);

  const chalk = new THREE.Mesh(
    new THREE.RingGeometry(fieldR + 0.8, fieldR + 1.1, 160),
    new THREE.MeshBasicMaterial({ color: 0xf4f4e8, transparent: true, opacity: 0.6, depthWrite: false })
  );
  chalk.rotation.x = -Math.PI / 2;
  chalk.position.y = 0.02;
  scene.add(chalk);

  // Instanced grass that sways with the wind and parts under the dog
  const grassUniforms = { uTime: { value: 0 }, uDog: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector2(1, 0) } };
  const grassGeo = new THREE.BufferGeometry();
  grassGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.04, 0, 0, 0.04, 0, 0, -0.026, 0.2, 0, 0.026, 0.2, 0, 0, 0.44, 0], 3));
  grassGeo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  grassGeo.setAttribute('color', new THREE.Float32BufferAttribute([0.24, 0.42, 0.13, 0.24, 0.42, 0.13, 0.36, 0.58, 0.19, 0.36, 0.58, 0.19, 0.6, 0.78, 0.34], 3));
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
  {
    const COUNT = lowPower ? 26000 : 70000;
    const R = 62;
    const grass = new THREE.InstancedMesh(grassGeo, grassMat, COUNT);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    let n = 0;
    while (n < COUNT) {
      const r = R * Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.hypot(x, z) < 1.6) continue;
      if (Math.hypot(x + 2.8, z + 1.4) < 1.5) continue;
      p.set(x, 0, z);
      q.setFromAxisAngle(UP, Math.random() * Math.PI);
      s.set(rand(0.8, 1.3), rand(0.55, 1.35) * (r > fieldR + 2 ? 1.5 : 1), 1);
      m.compose(p, q, s);
      grass.setMatrixAt(n, m);
      col.setHSL(rand(0.22, 0.28), rand(0.45, 0.6), rand(0.42, 0.55));
      grass.setColorAt(n, col);
      n++;
    }
    grass.receiveShadow = true;
    grass.frustumCulled = false;
    scene.add(grass);
  }
  {
    const COUNT = lowPower ? 600 : 1400;
    const fl = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.06, 0), new THREE.MeshLambertMaterial(), COUNT);
    const m = new THREE.Matrix4(), col = new THREE.Color();
    const palette = [0xffffff, 0xfff4b0, 0xffd23f, 0xf7c6e0];
    for (let i = 0; i < COUNT; i++) {
      const r = 60 * Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2;
      m.makeTranslation(Math.cos(a) * r, rand(0.14, 0.3), Math.sin(a) * r);
      fl.setMatrixAt(i, m);
      fl.setColorAt(i, col.setHex(palette[i % palette.length]));
    }
    scene.add(fl);
  }

  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2b });
  const leafMats = [0x3f7d34, 0x4d8f3a, 0x2f6b2e, 0x5a9a3c].map((c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
  for (let i = 0; i < 80; i++) {
    const a = rand(0, Math.PI * 2), r = rand(fieldR + 7, 130), s = rand(0.9, 1.7);
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * s, 0.42 * s, 3 * s, 7), trunkMat);
    trunk.position.y = 1.5 * s;
    tree.add(trunk);
    const leafMat = leafMats[Math.floor(Math.random() * leafMats.length)];
    for (let j = 0; j < 4; j++) {
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry((1.7 - j * 0.28) * s, 1), leafMat);
      leaf.position.set(rand(-0.8, 0.8) * s, (3 + j * 0.95) * s, rand(-0.8, 0.8) * s);
      leaf.rotation.set(rand(0, 3), rand(0, 3), 0);
      tree.add(leaf);
    }
    tree.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    tree.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    tree.rotation.y = rand(0, Math.PI * 2);
    scene.add(tree);
  }
  const bushMat = new THREE.MeshLambertMaterial({ color: 0x4f8f36, flatShading: true });
  for (let i = 0; i < 50; i++) {
    const a = rand(0, Math.PI * 2), r = rand(fieldR + 3, fieldR + 14);
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.6, 1.3), 1), bushMat);
    b.position.set(Math.cos(a) * r, 0.35, Math.sin(a) * r);
    b.scale.y = 0.75;
    b.castShadow = true;
    scene.add(b);
  }
  const blanketTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#f2ead6'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(210,60,40,0.75)';
    for (let i = 0; i < 64; i += 16) { g.fillRect(i, 0, 8, 64); g.fillRect(0, i, 64, 8); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; return t;
  })();
  const blanket = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.6), new THREE.MeshLambertMaterial({ map: blanketTex }));
  blanket.rotation.x = -Math.PI / 2;
  blanket.rotation.z = 0.4;
  blanket.position.set(-2.8, 0.02, -1.4);
  blanket.receiveShadow = true;
  scene.add(blanket);
  const basket = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.34), new THREE.MeshLambertMaterial({ color: 0xa8773f }));
  basket.position.set(-2.3, 0.16, -1.9);
  basket.rotation.y = 0.4;
  basket.castShadow = true;
  scene.add(basket);

  return {
    sky, sun, SUN_DIR, grassUniforms,
    update(dt, t, camera, focus) {
      grassUniforms.uTime.value = t;
      for (const c of clouds) { c.position.x += dt * 0.8; if (c.position.x > 320) c.position.x = -320; }
      sky.position.copy(camera.position);
      sun.position.set(focus.x + SUN_DIR.x * 60, SUN_DIR.y * 60, focus.z + SUN_DIR.z * 60);
      sun.target.position.copy(focus);
    },
  };
}
