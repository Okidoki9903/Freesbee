// Frisbee flight: lift and drag from the angle of attack between the airflow
// and the disc plane (Morrison / Hummel coefficients), plus the gyroscopic
// roll that makes a spinning disc turn at high speed and fade when it slows.
import * as THREE from 'three';

export const AERO = {
  rho: 1.23, area: 0.0568, mass: 0.175, radius: 0.135,
  CL0: 0.15, CLa: 1.4, CD0: 0.08, CDa: 2.72, a0: -0.07, CM0: -0.01, CMa: 0.1, roll: 4,
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const _vr = new THREE.Vector3(), _vh = new THREE.Vector3(), _lift = new THREE.Vector3(), _fh = new THREE.Vector3();

export function aeroStep(p, v, n, wind, dt) {
  _vr.subVectors(v, wind);
  const s = _vr.length();
  if (s > 0.2) {
    _vh.copy(_vr).divideScalar(s);
    const vn = _vh.dot(n);
    const alpha = Math.asin(clamp(-vn, -1, 1));
    const q = 0.5 * AERO.rho * s * s * AERO.area;
    const CL = AERO.CL0 + AERO.CLa * alpha;
    const CD = AERO.CD0 + AERO.CDa * (alpha - AERO.a0) ** 2;
    _lift.copy(n).addScaledVector(_vh, -vn);
    if (_lift.lengthSq() > 1e-8) _lift.normalize();
    v.addScaledVector(_lift, (q * CL / AERO.mass) * dt);
    v.addScaledVector(_vh, (-q * CD / AERO.mass) * dt);
    const CM = AERO.CM0 + AERO.CMa * alpha;
    _fh.set(_vh.x, 0, _vh.z);
    if (_fh.lengthSq() > 1e-6) {
      _fh.normalize();
      n.applyAxisAngle(_fh, -AERO.roll * CM * q * dt).normalize();
    }
  }
  v.y -= 9.81 * dt;
  p.addScaledVector(v, dt);
}

// Simulate ahead; returns landing point/time and sampled positions every `every` seconds
export function simulate(p0, v0, n0, wind, maxT = 8, every = 0) {
  const p = p0.clone(), v = v0.clone(), n = n0.clone();
  const dt = 1 / 60;
  const samples = [];
  let t = 0, next = every;
  while (p.y > 0.04 && t < maxT) {
    aeroStep(p, v, n, wind, dt);
    t += dt;
    if (every && t >= next) { samples.push({ t, p: p.clone() }); next += every; }
  }
  return { p, t, samples };
}
