// Sculpting toolkit: signed-distance primitives blended with smooth unions
// (like Blender metaballs), turned into a smooth mesh with surface nets,
// plus a shell-texturing fur material.
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Primitives. Each has: d(x,y,z) signed distance, box (bounds), k (blend radius)
// and t(x,y,z) (0..1 position along the primitive, used for skin weights).
// ---------------------------------------------------------------------------
export function roundCone(a, b, r1, r2, opts = {}) {
  const bax = b.x - a.x, bay = b.y - a.y, baz = b.z - a.z;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const m = Math.max(r1, r2);
  return {
    ...opts,
    box: [Math.min(a.x, b.x) - m, Math.min(a.y, b.y) - m, Math.min(a.z, b.z) - m, Math.max(a.x, b.x) + m, Math.max(a.y, b.y) + m, Math.max(a.z, b.z) + m],
    t(x, y, z) { return Math.max(0, Math.min(1, ((x - a.x) * bax + (y - a.y) * bay + (z - a.z) * baz) * il2)); },
    d(x, y, z) {
      // Inigo Quilez's exact round-cone distance
      const pax = x - a.x, pay = y - a.y, paz = z - a.z;
      const yy = pax * bax + pay * bay + paz * baz;
      const zz = yy - l2;
      const qx = pax * l2 - bax * yy, qy = pay * l2 - bay * yy, qz = paz * l2 - baz * yy;
      const x2 = qx * qx + qy * qy + qz * qz;
      const y2 = yy * yy * l2, z2 = zz * zz * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
      if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
      return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
    },
  };
}

export function ellipsoid(c, rx, ry, rz, opts = {}) {
  return {
    ...opts,
    box: [c.x - rx, c.y - ry, c.z - rz, c.x + rx, c.y + ry, c.z + rz],
    t() { return 0.5; },
    d(x, y, z) {
      const px = (x - c.x) / rx, py = (y - c.y) / ry, pz = (z - c.z) / rz;
      const k0 = Math.sqrt(px * px + py * py + pz * pz);
      const k1 = Math.sqrt(px * px / (rx * rx) + py * py / (ry * ry) + pz * pz / (rz * rz));
      return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(rx, ry, rz);
    },
  };
}

// Polynomial smooth minimum
function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export function sdfOf(prims) {
  return (x, y, z) => {
    let d = 1e9;
    for (const p of prims) {
      const b = p.box, m = (p.k || 0) + 0.03;
      if (x < b[0] - m || y < b[1] - m || z < b[2] - m || x > b[3] + m || y > b[4] + m || z > b[5] + m) continue;
      d = smin(d, p.d(x, y, z), p.k || 0);
    }
    return d;
  };
}

// ---------------------------------------------------------------------------
// Surface nets: one vertex per surface-crossing cell, quads across sign changes.
// Returns positions (Float32Array) and indices (Uint32Array), with normals from
// the SDF gradient so the surface looks smooth.
// ---------------------------------------------------------------------------
export function surfaceNets(sdf, prims, cell) {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const p of prims) {
    const b = p.box, m = (p.k || 0) + cell * 2;
    x0 = Math.min(x0, b[0] - m); y0 = Math.min(y0, b[1] - m); z0 = Math.min(z0, b[2] - m);
    x1 = Math.max(x1, b[3] + m); y1 = Math.max(y1, b[4] + m); z1 = Math.max(z1, b[5] + m);
  }
  const nx = Math.ceil((x1 - x0) / cell) + 1, ny = Math.ceil((y1 - y0) / cell) + 1, nz = Math.ceil((z1 - z0) / cell) + 1;
  const field = new Float32Array(nx * ny * nz);
  const id = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    field[id(i, j, k)] = sdf(x0 + i * cell, y0 + j * cell, z0 + k * cell);
  }
  const vid = new Int32Array(nx * ny * nz).fill(-1);
  const pos = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const v = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let inside = 0;
    for (let c = 0; c < 8; c++) {
      v[c] = field[id(i + corners[c][0], j + corners[c][1], k + corners[c][2])];
      if (v[c] < 0) inside++;
    }
    if (inside === 0 || inside === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [e0, e1] of edges) {
      const a = v[e0], b = v[e1];
      if ((a < 0) === (b < 0)) continue;
      const t = a / (a - b);
      const c0 = corners[e0], c1 = corners[e1];
      sx += c0[0] + (c1[0] - c0[0]) * t; sy += c0[1] + (c1[1] - c0[1]) * t; sz += c0[2] + (c1[2] - c0[2]) * t;
      n++;
    }
    vid[id(i, j, k)] = pos.length / 3;
    pos.push(x0 + (i + sx / n) * cell, y0 + (j + sy / n) * cell, z0 + (k + sz / n) * cell);
  }
  const idx = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const f0 = field[id(i, j, k)] < 0;
    // edge along x
    if (f0 !== (field[id(i + 1, j, k)] < 0)) quad(vid[id(i, j, k)], vid[id(i, j - 1, k)], vid[id(i, j - 1, k - 1)], vid[id(i, j, k - 1)], f0);
    // edge along y
    if (f0 !== (field[id(i, j + 1, k)] < 0)) quad(vid[id(i, j, k)], vid[id(i, j, k - 1)], vid[id(i - 1, j, k - 1)], vid[id(i - 1, j, k)], f0);
    // edge along z
    if (f0 !== (field[id(i, j, k + 1)] < 0)) quad(vid[id(i, j, k)], vid[id(i - 1, j, k)], vid[id(i - 1, j - 1, k)], vid[id(i, j - 1, k)], f0);
  }
  const positions = new Float32Array(pos);
  const normals = new Float32Array(pos.length);
  const e = cell * 0.5;
  for (let q = 0; q < pos.length; q += 3) {
    const x = pos[q], y = pos[q + 1], z = pos[q + 2];
    let gx = sdf(x + e, y, z) - sdf(x - e, y, z), gy = sdf(x, y + e, z) - sdf(x, y - e, z), gz = sdf(x, y, z + e) - sdf(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    normals[q] = gx / l; normals[q + 1] = gy / l; normals[q + 2] = gz / l;
  }
  // Make every triangle face outward (agree with the gradient)
  const index = new Uint32Array(idx);
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t] * 3, b = index[t + 1] * 3, c = index[t + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const dot = cx * (normals[a] + normals[b] + normals[c]) + cy * (normals[a + 1] + normals[b + 1] + normals[c + 1]) + cz * (normals[a + 2] + normals[b + 2] + normals[c + 2]);
    if (dot < 0) { const tmp = index[t + 1]; index[t + 1] = index[t + 2]; index[t + 2] = tmp; }
  }
  return { positions, normals, index };
}

// Pull a point onto the surface along the gradient
export function snapToSurface(sdf, p, offset = 0) {
  const e = 0.002;
  for (let i = 0; i < 8; i++) {
    const d = sdf(p.x, p.y, p.z) - offset;
    const gx = sdf(p.x + e, p.y, p.z) - sdf(p.x - e, p.y, p.z);
    const gy = sdf(p.x, p.y + e, p.z) - sdf(p.x, p.y - e, p.z);
    const gz = sdf(p.x, p.y, p.z + e) - sdf(p.x, p.y, p.z - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    p.x -= gx / l * d; p.y -= gy / l * d; p.z -= gz / l * d;
  }
  return p;
}

// ---------------------------------------------------------------------------
// Fur: the mesh is drawn several times, each shell pushed out along the normal.
// Shells discard most pixels so only "hairs" remain, thinner toward the tips.
// ---------------------------------------------------------------------------
export function furMaterials(shells, furLen, density, opts = {}) {
  const mats = [];
  for (let s = 0; s <= shells; s++) {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: opts.roughness ?? 0.9, metalness: 0 });
    const shell = shells ? s / shells : 0;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uShell = { value: shell };
      sh.uniforms.uFurLen = { value: furLen };
      sh.uniforms.uDensity = { value: density };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aFur;\nuniform float uShell;\nuniform float uFurLen;\nvarying vec3 vFurP;\nvarying float vFurA;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vFurP = position; vFurA = aFur;
          transformed += normal * (uShell * uFurLen * aFur);
          transformed.y -= uShell * uShell * uFurLen * aFur * 0.5;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uShell;\nuniform float uDensity;\nvarying vec3 vFurP;\nvarying float vFurA;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          if (uShell > 0.0) {
            vec3 cellId = floor(vFurP * uDensity);
            float hs = fract(sin(dot(cellId, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
            if (hs < uShell * 1.05 || vFurA < 0.05) discard;
          }
          diffuseColor.rgb *= mix(0.72, 1.06, uShell);`);
    };
    m.customProgramCacheKey = () => 'freesbee-fur';
    mats.push(m);
  }
  return mats;
}

// Add fur shells to a (skinned or rigid) mesh; shells share geometry and skeleton
export function addFurShells(mesh, mats) {
  const parent = mesh.parent;
  const shells = [];
  for (let s = 1; s < mats.length; s++) {
    let shell;
    if (mesh.isSkinnedMesh) {
      shell = new THREE.SkinnedMesh(mesh.geometry, mats[s]);
      shell.bind(mesh.skeleton, mesh.bindMatrix);
    } else {
      shell = new THREE.Mesh(mesh.geometry, mats[s]);
    }
    shell.position.copy(mesh.position);
    shell.quaternion.copy(mesh.quaternion);
    shell.scale.copy(mesh.scale);
    shell.castShadow = false;
    shell.receiveShadow = true;
    shell.frustumCulled = false;
    parent.add(shell);
    shells.push(shell);
  }
  return shells;
}
