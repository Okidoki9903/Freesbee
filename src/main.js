import * as THREE from 'three';
import { BREEDS, STAT_LABELS, dogParams } from './breeds.js';
import { Dog } from './dog.js';
import { Owner } from './owner.js';
import { AERO, aeroStep, simulate } from './aero.js';
import { createParticles, createTrail } from './fx.js';
import { buildWorld } from './world.js';
import { initAudio, audioStream, setWind, sfx } from './audio.js';
import { createInput } from './input.js';
import { createRecorder, recorderSupported } from './recorder.js';
import { t as tr, LANGS, getLang, setLang, breedText, locale, decimalComma, applyDom } from './i18n.js';
import { track, frameSample, roundFrames, summary, exportLog, clearLog } from './metrics.js';

const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const angleDamp = (a, b, rate, dt) => a + wrapAngle(b - a) * (1 - Math.exp(-rate * dt));
const UP = new THREE.Vector3(0, 1, 0);
const fmt = (n) => Math.round(n).toLocaleString(locale());
const fmtNum = (x, d = 1) => { const s = x.toFixed(d); return decimalComma() ? s.replace('.', ',') : s; };
const fmtMult = (m) => { const s = String(Math.round(m * 10) / 10); return decimalComma() ? s.replace('.', ',') : s; };

const IS_TOUCH = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (IS_TOUCH) document.body.classList.add('is-touch');

const FIELD_R = 48;
const STEP = 1 / 120;
const DOG_G = 24;
const PLAY_URL = /github\.io$/.test(location.hostname)
  ? location.origin + location.pathname.replace(/index\.html$/, '')
  : 'https://okidoki9903.github.io/Freesbee/';
const PLAY_URL_SHORT = PLAY_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');

const DIFFS = {
  facile: { ring: 99, reach: 1.2, wind: 0.5, speed: 0.92, points: 1 },
  normal: { ring: 3, reach: 1, wind: 1, speed: 1, points: 1 },
  pro: { ring: 0, reach: 0.88, wind: 1.4, speed: 1.08, points: 1.5 },
};

/* ======================================================================
   Renderer, world, actors
   ====================================================================== */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_TOUCH ? 1.75 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
$('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 600);
const world = buildWorld(scene, renderer, { fieldR: FIELD_R, lowPower: IS_TOUCH });
const fx = createParticles(scene);
const trail = createTrail(scene);

function makeDisc() {
  const pts = [
    new THREE.Vector2(0.0, 0.03), new THREE.Vector2(0.14, 0.036), new THREE.Vector2(0.23, 0.03),
    new THREE.Vector2(0.27, 0.016), new THREE.Vector2(0.285, -0.004), new THREE.Vector2(0.28, -0.03),
    new THREE.Vector2(0.262, -0.036), new THREE.Vector2(0.255, -0.02),
  ];
  const disc = new THREE.Group();
  const spinner = new THREE.Group();
  spinner.scale.setScalar(0.6);            // ~17 cm radius: a real disc, slightly oversized to read on screen
  disc.add(spinner);
  const mesh = new THREE.Mesh(
    new THREE.LatheGeometry(pts, 40),
    new THREE.MeshPhysicalMaterial({ color: 0xff5a1f, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3, side: THREE.DoubleSide })
  );
  mesh.castShadow = true;
  spinner.add(mesh);
  const decal = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.13, 28, 1, 0, Math.PI * 1.4), new THREE.MeshBasicMaterial({ color: 0xfff3e0, side: THREE.DoubleSide }));
  decal.rotation.x = -Math.PI / 2;
  decal.position.y = 0.037;
  spinner.add(decal);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.035, 16), new THREE.MeshBasicMaterial({ color: 0xfff3e0 }));
  dot.rotation.x = -Math.PI / 2;
  dot.position.set(0.19, 0.035, 0);
  spinner.add(dot);
  disc.userData.spinner = spinner;
  return disc;
}
const discMesh = makeDisc();
scene.add(discMesh);

const shadowBlob = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24), new THREE.MeshBasicMaterial({ color: 0x0d1f0d, transparent: true, opacity: 0.35, depthWrite: false }));
shadowBlob.rotation.x = -Math.PI / 2;
shadowBlob.position.y = 0.04;
scene.add(shadowBlob);
const landRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 40), new THREE.MeshBasicMaterial({ color: 0xfff3e0, transparent: true, opacity: 0.8, depthWrite: false }));
landRing.rotation.x = -Math.PI / 2;
landRing.position.y = 0.05;
landRing.visible = false;
scene.add(landRing);
const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 4), new THREE.MeshBasicMaterial({ color: 0xff5a1f }));
arrow.rotation.x = Math.PI;
arrow.visible = false;
scene.add(arrow);

const owner = new Owner();
scene.add(owner.root);

const dogCache = new Map();
let dog = null, breed = null, P = null, breedIndex = 0, diffKey = 'normal';

/* ======================================================================
   UI helpers
   ====================================================================== */
const ui = {
  score: $('score'), status: $('status'), popup: $('popup'), combo: $('combo'), toast: $('toast'),
  lives: [...document.querySelectorAll('.life')], stamina: $('stamina'), staminaFill: $('staminaFill'),
  windArrow: $('windArrow'), windText: $('windText'), hudBreed: $('hudBreed'),
};
function setStatus(t) { if (ui.status.textContent !== t) ui.status.textContent = t; }
let popupState = null;
function popup(main, sub = '') {
  ui.popup.textContent = main;
  if (sub) { const s = document.createElement('span'); s.textContent = sub; ui.popup.append(s); }
  ui.popup.classList.remove('show');
  void ui.popup.offsetWidth;
  ui.popup.classList.add('show');
  popupState = { main, sub, t0: performance.now() };
}
let toastTimer = 0;
function toast(t, ms = 2400) {
  ui.toast.textContent = t;
  ui.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('show'), ms);
}
const store = {
  get(k, d) { try { const v = localStorage.getItem('freesbee-' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('freesbee-' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
};

/* ======================================================================
   Breed selection
   ====================================================================== */
const statsEl = $('breedStats');
function renderBreed() {
  $('breedCount').textContent = `${breedIndex + 1} / ${BREEDS.length}`;
  const [bName, bTag] = breedText(breed.id);
  $('breedName').textContent = bName;
  $('breedTag').textContent = bTag;
  statsEl.textContent = '';
  for (const key of Object.keys(STAT_LABELS)) {
    const label = tr('stat.' + key);
    const v = breed.stats[key];
    const best = Math.max(...BREEDS.map((b) => b.stats[key]));
    const row = document.createElement('div');
    row.className = 'stat';
    const dt = document.createElement('dt'); dt.textContent = label;
    const dd = document.createElement('dd');
    const bar = document.createElement('div');
    bar.className = 'bar' + (v === best ? ' top' : '');
    bar.setAttribute('aria-label', tr('stat.of', label, v));
    for (let i = 0; i < 10; i++) { const s = document.createElement('i'); if (i < v) s.className = 'on'; bar.append(s); }
    dd.append(bar);
    row.append(dt, dd);
    statsEl.append(row);
  }
  ui.hudBreed.textContent = bName;
}
function setBreed(i) {
  breedIndex = (i + BREEDS.length) % BREEDS.length;
  if (dog) scene.remove(dog.root);
  breed = BREEDS[breedIndex];
  if (!dogCache.has(breed.id)) dogCache.set(breed.id, new Dog(breed, { shells: IS_TOUCH ? 6 : 12, cell: IS_TOUCH ? 0.015 : 0.012 }));
  dog = dogCache.get(breed.id);
  scene.add(dog.root);
  P = dogParams(breed);
  renderBreed();
  store.set('breed', breed.id);
}
function setDiff(k) {
  diffKey = k;
  for (const b of document.querySelectorAll('#diff button')) b.setAttribute('aria-checked', String(b.dataset.diff === k));
  $('diffNote').textContent = tr('diffNote.' + k);
  store.set('diff', k);
}
$('prevBreed').addEventListener('click', () => { setBreed(breedIndex - 1); sfx.select(); });
$('nextBreed').addEventListener('click', () => { setBreed(breedIndex + 1); sfx.select(); });
for (const b of document.querySelectorAll('#diff button')) b.addEventListener('click', () => setDiff(b.dataset.diff));
setBreed(Math.max(0, BREEDS.findIndex((b) => b.id === store.get('breed', 'collie'))));
setDiff(DIFFS[store.get('diff', 'normal')] ? store.get('diff', 'normal') : 'normal');

// Language picker (English by default)
const langSelect = $('langSelect');
for (const { code, name } of LANGS) {
  const o = document.createElement('option');
  o.value = code; o.textContent = name;
  langSelect.append(o);
}
langSelect.value = getLang();
function refreshTexts() {
  applyDom();
  renderBreed();
  $('diffNote').textContent = tr('diffNote.' + diffKey);
  $('modeNote').textContent = tr('modeNote.' + G.gameMode);
}
langSelect.addEventListener('change', () => { setLang(langSelect.value); refreshTexts(); });

// Game mode: 60-second arcade round (default) or survival with 3 lives
function setMode(k) {
  G.gameMode = k;
  for (const b of document.querySelectorAll('#modeSel button')) b.setAttribute('aria-checked', String(b.dataset.mode === k));
  $('modeNote').textContent = tr('modeNote.' + k);
  store.set('mode', k);
}
for (const b of document.querySelectorAll('#modeSel button')) b.addEventListener('click', () => setMode(b.dataset.mode));
applyDom();
renderBreed();

/* ======================================================================
   Input
   ====================================================================== */
const controls = createInput({
  isTouch: IS_TOUCH,
  onPad(connected, name) {
    $('padChip').hidden = !connected;
    if (connected) { $('padChip').querySelector('span').textContent = name; toast(tr('toast.padOn', name)); }
    else { toast(tr('toast.padOff')); if (G.mode === 'play' && !G.paused) setPaused(true); }
  },
  onPadActive(on) {
    document.body.classList.toggle('pad-active', on);
    $('playHint').hidden = !on;
  },
});
const input = controls.input;

/* ======================================================================
   Game state
   ====================================================================== */
const G = {
  mode: 'menu',          // menu | play | over
  paused: false,
  phase: 'intro',        // intro | windup | flying | ground | carrying | handoff
  timer: 0, throwStarted: false,
  score: 0, lives: 3, combo: 0, throws: 0, catches: 0, bestCombo: 0,
  pos: new THREE.Vector3(0, 0, 3), speed: 0, heading: Math.PI, vy: 0, onGround: true,
  jumpBuf: 0, jumpHold: 0, stamina: 1, tired: false, turnRate: 0, skid: false, prevVy: 0, accY: 0,
  leaping: false, stepTimer: 0,
  disc: { pos: new THREE.Vector3(), prev: new THREE.Vector3(), vel: new THREE.Vector3(), n: new THREE.Vector3(0, 1, 0), spin: 0, angle: 0 },
  wind: new THREE.Vector3(), plan: null, hitCooldown: 0, eager: 0,
  catchFrom: new THREE.Vector3(), carryT: 1,
  slowmo: 0, timeScale: 1,
  headAtAnim: new THREE.Vector3(), posAtAnim: new THREE.Vector3(),
  cam: { yaw: 0, manual: 0, idle: 0, focus: new THREE.Vector3(0, 1, 0), shake: 0, fov: 0 },
  intro: { angle: 0, t: 0, jumpT: 3 },
  // Arcade round
  gameMode: 'arcade', timeLeft: 60, timeUp: false, perfects: 0, bestFeat: null, after: null, fade: null,
  roundsThisSession: 0, firstCatchLogged: false, tickSec: 99,
};
// ?seconds=N shortens the round (handy for play-tests)
const ROUND_SECONDS = clamp(Number(new URLSearchParams(location.search).get('seconds')) || 60, 5, 600), MISS_PENALTY = 4, PERFECT_BONUS = 2;
const after = (sec, fn) => { G.after = { t: sec, fn }; };
const D = () => DIFFS[diffKey];

const THROWS = {
  normal: { label: null },
  floater: { label: 'throw.floater' },
  laser: { label: 'throw.laser' },
  hyzer: { label: 'throw.hyzer' },
};
const THROW_KEYS = [[0, '_from'], [0.35, 'ready'], [0.62, 'windup'], [0.76, 'release'], [1.05, 'follow'], [1.6, 'idle']];
const RELEASE_T = 0.72;

function resetGame() {
  Object.assign(G, {
    score: 0, lives: 3, combo: 0, throws: 0, catches: 0, bestCombo: 0,
    speed: 0, heading: Math.PI, vy: 0, onGround: true, stamina: 1, tired: false, leaping: false,
    slowmo: 0, timeScale: 1, jumpBuf: 0,
    timeLeft: ROUND_SECONDS, timeUp: false, perfects: 0, bestFeat: null, after: null, fade: null, tickSec: 99,
  });
  document.body.classList.toggle('mode-arcade', G.gameMode === 'arcade');
  document.body.classList.toggle('mode-survival', G.gameMode === 'survival');
  updateTimerUi();
  G.pos.set(0, 0, 3);
  G.wind.set(0, 0, 0);
  G.cam.yaw = 0; G.cam.manual = 0;
  owner.root.position.set(0, 0, 0);
  ui.lives.forEach((l) => l.classList.remove('lost'));
  ui.score.textContent = '0';
  ui.combo.hidden = true;
  trail.clear();
  startWindup(1.2);
}

function planThrow() {
  const d = D();
  const level = Math.min(G.throws, 16) / 16;
  let type = 'normal';
  const r = Math.random();
  if (G.throws >= 2) {
    if (r < 0.2) type = 'floater';
    else if (r < 0.2 + level * 0.25) type = 'laser';
    else if (r < 0.45 + level * 0.2) type = 'hyzer';
  }
  let speed = (rand(12, 14) + level * rand(1.5, 5)) * d.speed;
  let launch = rand(13, 16), pitch = rand(11, 14), bank = rand(-4, 4);
  if (type === 'floater') { speed = rand(12, 14); launch = rand(19, 23); pitch = rand(15, 18); }
  if (type === 'laser') { speed = rand(18, 21) * d.speed; launch = rand(9, 11); pitch = rand(8, 10); }
  if (type === 'hyzer') { bank = (Math.random() < 0.5 ? -1 : 1) * rand(10, 18); speed += 1; }
  const toDog = Math.atan2(G.pos.x, G.pos.z);
  let yaw = toDog + rand(-1, 1) * (0.7 + level * 1.0);
  if (G.throws === 0) { type = 'floater'; speed = 11.5; launch = 18; pitch = 15; bank = 0; yaw = toDog + rand(-0.25, 0.25); }
  const windSpeed = G.throws < 2 ? 0 : rand(0, 1.2 + level * 3) * d.wind;
  const windYaw = rand(0, Math.PI * 2);
  const wind = new THREE.Vector3(Math.sin(windYaw) * windSpeed, 0, Math.cos(windYaw) * windSpeed);
  const hand = new THREE.Vector3(Math.sin(yaw) * 0.4, 1.45, Math.cos(yaw) * 0.4);
  let plan;
  for (let i = 0; i < 14; i++) {
    plan = buildThrow(yaw, speed, launch, pitch, bank);
    const land = simulate(hand, plan.v, plan.n, wind);
    plan.land = land.p;
    if (Math.hypot(land.p.x, land.p.z) < FIELD_R - 4) break;
    speed *= 0.92;
  }
  return Object.assign(plan, { type, yaw, wind });
}
function buildThrow(yaw, speed, launchDeg, pitchDeg, bankDeg) {
  const f = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const right = new THREE.Vector3(-f.z, 0, f.x);
  const la = THREE.MathUtils.degToRad(launchDeg);
  const v = f.clone().multiplyScalar(speed * Math.cos(la)); v.y = speed * Math.sin(la);
  const n = UP.clone().applyAxisAngle(right, THREE.MathUtils.degToRad(pitchDeg));
  n.applyAxisAngle(f, THREE.MathUtils.degToRad(bankDeg));
  return { v, n };
}

function startWindup(delay) {
  G.phase = 'windup';
  G.timer = -delay;
  G.throwStarted = false;
  G.plan = planThrow();
  G.wind.copy(G.plan.wind);
  owner.setBase('idle');
  setStatus(tr('st.windup'));
}

function releaseDisc() {
  G.phase = 'flying';
  G.timer = 0;
  G.throws++;
  const d = G.disc;
  owner.discInHand(d.pos, new THREE.Quaternion());
  d.pos.y = Math.max(d.pos.y, 1.0);
  d.prev.copy(d.pos);
  d.vel.copy(G.plan.v);
  d.n.copy(G.plan.n);
  d.spin = 60;
  trail.clear();
  if (G.throws <= D().ring || G.throws === 1) {
    const land = simulate(d.pos, d.vel, d.n, G.wind);
    landRing.position.set(land.p.x, 0.05, land.p.z);
    landRing.visible = true;
  }
  const label = THROWS[G.plan.type].label;
  if (label && G.throws > 1) popup(tr(label));
  sfx.whoosh();
  setStatus(G.throws === 1 && !store.get('tutDone', false) ? tr('tut.run') : tr('st.catch'));
}

function addScore(n) { G.score += n; ui.score.textContent = fmt(G.score); }
function restartAnim(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
function flyScore(text) { const el = $('scoreFly'); el.textContent = text; restartAnim(el, 'go'); }
function flyTime(text, good) { const el = $('timeFly'); el.textContent = text; el.classList.toggle('bad', !good); restartAnim(el, 'go'); }
let lastTimerText = '';
function updateTimerUi() {
  const s = Math.max(0, Math.ceil(G.timeLeft));
  const txt = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  if (txt !== lastTimerText) { lastTimerText = txt; $('timerText').textContent = txt; }
  $('timer').classList.toggle('hurry', G.timeLeft <= 10);
}

function catchDisc(cosA) {
  const d = G.disc;
  const dist = Math.hypot(d.pos.x, d.pos.z);
  const height = G.pos.y;
  const overShoulder = cosA < 0.35;
  G.combo++; G.catches++;
  G.bestCombo = Math.max(G.bestCombo, G.combo);
  // Perfect: caught at the top of a jump the player timed
  const airborne = !G.onGround && height > 0.1;
  const perfect = airborne && Math.abs(G.vy) < 2.2;
  const timing = airborne && !perfect ? (G.vy > 0 ? tr('c.late') : tr('c.early')) : null;
  let label = tr('c.caught'), mult = 1;
  if (G.leaping && height > 0.2) { label = tr('c.dive'); mult = 2.5; }
  else if (height > 0.8) { label = tr('c.acro'); mult = 3; }
  else if (height > 0.2) { label = tr('c.jump'); mult = 2; }
  else if (d.pos.y < 0.45) { label = tr('c.close'); mult = 1.5; }
  if (height > 1.1) { label = tr('c.acro'); mult = Math.max(mult, 3); }
  const extras = [];
  if (overShoulder) { mult *= 1.5; extras.push(tr('c.shoulder')); }
  if (perfect) { mult *= 1.5; label = tr('c.perfect'); G.perfects++; }
  const comboMult = 1 + 0.5 * (G.combo - 1);
  const pts = Math.round((100 + dist * 4) * mult * comboMult * D().points / 10) * 10;
  addScore(pts);
  // Show the feat first, the points second
  const feat = [airborne || d.pos.y < 0.45 ? tr('feat.height', fmtNum(d.pos.y)) : null, tr('feat.dist', dist.toFixed(0)), ...extras, timing].filter(Boolean).join('  ·  ');
  popup(label, feat);
  flyScore(`+${fmt(pts)}`);
  if (!G.bestFeat || pts > G.bestFeat.pts) G.bestFeat = { label, feat, pts };
  track('catch', { kind: label, perfect, pts, dist: Math.round(dist), h: Math.round(d.pos.y * 100) / 100, throw: G.throws });
  if (!G.firstCatchLogged) { G.firstCatchLogged = true; track('first_catch', {}); }
  if (G.gameMode === 'arcade' && perfect && !G.timeUp) { G.timeLeft += PERFECT_BONUS; flyTime(`+${PERFECT_BONUS} s`, true); }
  if (perfect) { sfx.perfect(); G.cam.shake = 0.35; }
  if (!store.get('tutDone', false) && G.catches === 1) { setTimeout(() => toast(tr('tut.perfect'), 5000), 900); store.set('tutDone', true); }
  if (mult >= 2) { sfx.big(); G.cam.shake = 0.3; controls.rumble(0.8, 0.5, 220); G.slowmo = 0.6; }
  else { sfx.catch(); controls.rumble(0.4, 0.3, 120); }
  sfx.snap();
  sfx.bark(Math.sqrt(1 / dog.scale));
  fx.confetti(d.pos, mult >= 2 ? 60 : 30);
  if (G.combo > 1) { ui.combo.hidden = false; ui.combo.textContent = `${tr('combo')} ×${fmtMult(comboMult)}`; }
  G.phase = 'carrying';
  G.catchFrom.copy(d.pos);
  G.carryT = 0;
  dog.snap = 1;
  landRing.visible = false;
  owner.play([[0, '_from'], [0.25, 'cheer'], [0.8, 'cheer'], [1.2, 'wave']]);
  owner.setBase('wave');
  if (G.gameMode === 'arcade') {
    setStatus(tr('st.nice'));
    after(perfect ? 1.1 : 0.85, () => (G.timeUp ? endRound() : expressReturn()));
  } else setStatus(tr('st.bring'));
}

function bounceOff(center, label) {
  const d = G.disc;
  const n = new THREE.Vector3().subVectors(d.pos, center);
  if (n.lengthSq() < 1e-6) n.set(0, 1, 0);
  n.normalize();
  const vn = d.vel.dot(n);
  if (vn < 0) d.vel.addScaledVector(n, -1.35 * vn);
  d.vel.multiplyScalar(0.7);
  d.vel.y += 1.2;
  d.n.set(rand(-0.5, 0.5), 1, rand(-0.5, 0.5)).normalize();
  d.spin *= 0.5;
  G.hitCooldown = 0.3;
  G.combo = 0;
  ui.combo.hidden = true;
  popup(label, tr('c.again'));
  sfx.bonk();
  controls.rumble(0.3, 0.6, 120);
}

function discLanded() {
  G.phase = 'ground';
  G.timer = 0;
  G.combo = 0;
  ui.combo.hidden = true;
  landRing.visible = false;
  sfx.miss(); sfx.thud();
  fx.grass(G.disc.pos.x, G.disc.pos.z, 18, 2.5);
  fx.dust(G.disc.pos.x, G.disc.pos.z, 6, 0.2, 1.2);
  controls.rumble(0.2, 0.6, 180);
  owner.setBase('idle');
  track('miss', { throw: G.throws });
  if (G.gameMode === 'arcade') {
    if (!G.timeUp) { G.timeLeft = Math.max(0, G.timeLeft - MISS_PENALTY); flyTime(`−${MISS_PENALTY} s`, false); }
    popup(tr('c.miss'), tr('c.penalty', MISS_PENALTY));
    after(1.0, () => (G.timeUp || G.timeLeft <= 0 ? endRound() : expressReturn()));
    return;
  }
  G.lives--;
  ui.lives.forEach((l, i) => l.classList.toggle('lost', i >= G.lives));
  if (G.lives <= 0) {
    popup(tr('c.miss'));
    setStatus(tr('st.none'));
    after(1.5, endRound);
  } else {
    popup(tr('c.miss'), G.lives === 1 ? tr('c.last') : tr('c.left', G.lives));
    setStatus(tr('st.fetch'));
  }
}

function shareText() {
  return tr('share.score', fmt(G.score), breedText(breed.id)[0]);
}
function xIntent(text) {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(PLAY_URL)}`;
}

// Quick fade that puts the dog back by its owner for the next throw
function expressReturn() {
  G.fade = { t: 0, done: false };
}
function fadeMid() {
  const a = rand(0, Math.PI * 2);
  G.pos.set(Math.sin(a) * 2.4, 0, Math.cos(a) * 2.4);
  G.speed = 0; G.vy = 0; G.onGround = true; G.leaping = false;
  G.heading = Math.atan2(-G.pos.x, -G.pos.z);
  G.cam.yaw = Math.atan2(G.pos.x, G.pos.z); G.cam.manual = 0;
  camera.position.set(G.pos.x + Math.sin(G.cam.yaw) * 8.5, 4.2, G.pos.z + Math.cos(G.cam.yaw) * 8.5);
  G.cam.focus.set(0, 1, 0);
  trail.clear();
  owner.play([[0, '_from'], [0.2, 'receive'], [0.45, 'idle']]);
  startWindup(0.35);
}

function endRound() {
  if (G.mode !== 'play') return;
  G.mode = 'over';
  G.after = null;
  const key = 'best-' + G.gameMode;
  const best = store.get(key, G.gameMode === 'survival' ? store.get('best', 0) : 0);
  const isRecord = G.score > best && G.score > 0;
  if (isRecord) store.set(key, G.score);
  const frames = roundFrames();
  track('round_end', { mode: G.gameMode, breed: breed.id, score: G.score, catches: G.catches, perfects: G.perfects, record: isRecord, p95: frames.p95, longFrames: frames.long });
  $('overTitle').textContent = G.gameMode === 'arcade' ? tr('over.time') : tr('over.title');
  $('finalScore').textContent = fmt(G.score);
  const rec = $('recordLine');
  rec.classList.toggle('new', isRecord);
  rec.textContent = isRecord ? tr('over.newRecord') : best > 0 ? tr('over.toBeat', fmt(best - G.score + 10), fmt(best)) : '';
  const bf = $('bestFeat');
  bf.hidden = !G.bestFeat;
  if (G.bestFeat) {
    $('bestFeatLabel').textContent = G.bestFeat.label;
    $('bestFeatDetail').textContent = `${G.bestFeat.feat}  ·  +${fmt(G.bestFeat.pts)}`;
  }
  const combo = Math.max(1, 1 + 0.5 * (G.bestCombo - 1));
  $('finalDetail').textContent = `${breedText(breed.id)[0]} · ${tr('over.catches', G.catches)} · ${tr('over.perfects', G.perfects)} · ${tr('over.bestCombo')} ×${fmtMult(combo)}`;
  $('shareX').href = xIntent(shareText());
  $('overScreen').hidden = false;
  $('againBtn').focus();
}

function start(reason = 'play') {
  initAudio(() => G.paused || G.mode !== 'play');
  if (reason === 'rematch') track('rematch', { mode: G.gameMode, prevScore: G.score });
  G.roundsThisSession++;
  roundFrames();
  track('round_start', { mode: G.gameMode, breed: breed.id, diff: diffKey, n: G.roundsThisSession });
  for (const id of ['startScreen', 'overScreen', 'pauseScreen']) $(id).hidden = true;
  document.body.classList.remove('in-menu');
  G.paused = false;
  G.mode = 'play';
  input.jump = false;
  resetGame();
  sfx.bark(Math.sqrt(1 / dog.scale));
}
function toMenu() {
  track('menu_open', { from: G.mode });
  for (const id of ['overScreen', 'pauseScreen']) $(id).hidden = true;
  $('startScreen').hidden = false;
  document.body.classList.add('in-menu');
  G.mode = 'menu'; G.paused = false; G.phase = 'intro';
  landRing.visible = false;
  ui.combo.hidden = true;
  owner.setBase('wave');
}
function setPaused(on) {
  if (G.mode !== 'play') return;
  G.paused = on;
  $('pauseScreen').hidden = !on;
  if (on) $('resumeBtn').focus();
  else initAudio();
}
$('playBtn').addEventListener('click', () => start('menu'));
$('againBtn').addEventListener('click', () => start('rematch'));
$('resumeBtn').addEventListener('click', () => setPaused(false));
$('pauseBtn').addEventListener('click', (e) => { e.currentTarget.blur(); setPaused(!G.paused); });
$('menuBtn').addEventListener('click', toMenu);
$('menuBtn2').addEventListener('click', toMenu);
$('copyLink').addEventListener('click', () => {
  const done = () => toast(tr('toast.copied', PLAY_URL_SHORT));
  try {
    navigator.clipboard.writeText(PLAY_URL).then(done, () => toast(PLAY_URL, 5000));
  } catch (e) { toast(PLAY_URL, 5000); }
});
window.addEventListener('blur', () => { if (G.mode === 'play' && !G.paused) setPaused(true); });

/* ======================================================================
   Recording
   ====================================================================== */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function outlinedText(ctx, text, x, y, fill, stroke, lw) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.strokeText(text, x, y);
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
}
function drawOverlay(ctx, w, h) {
  const u = Math.min(w, h) / 720;
  const ink = '#1f3a22', paper = '#fbf7ea', orange = '#ff5a1f';
  const disp = '"Lilita One", "Arial Rounded MT Bold", sans-serif';
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  if (G.mode === 'play' || G.mode === 'over') {
    // Score card
    ctx.font = `${Math.round(40 * u)}px ${disp}`;
    const scoreText = fmt(G.score);
    const bw = Math.max(ctx.measureText(scoreText).width, 120 * u) + 32 * u;
    roundRect(ctx, 18 * u, 18 * u, bw, 78 * u, 14 * u);
    ctx.fillStyle = paper; ctx.fill(); ctx.lineWidth = 4 * u; ctx.strokeStyle = ink; ctx.stroke();
    ctx.fillStyle = ink;
    ctx.font = `800 ${Math.round(14 * u)}px Nunito, sans-serif`;
    ctx.fillText(breedText(breed.id)[0].toUpperCase(), 34 * u, 42 * u);
    ctx.font = `${Math.round(40 * u)}px ${disp}`;
    ctx.fillText(scoreText, 34 * u, 84 * u);
    if (G.gameMode === 'arcade' && G.mode === 'play') {
      ctx.textAlign = 'right';
      ctx.font = `${Math.round(44 * u)}px ${disp}`;
      outlinedText(ctx, lastTimerText, w - 24 * u, 66 * u, G.timeLeft <= 10 ? orange : paper, ink, 7 * u);
      ctx.textAlign = 'left';
    }
    if (G.combo > 1) {
      ctx.textAlign = 'center';
      ctx.font = `${Math.round(34 * u)}px ${disp}`;
      outlinedText(ctx, `${tr('combo')} ×${fmtMult(1 + 0.5 * (G.combo - 1))}`, w / 2, 52 * u, orange, ink, 6 * u);
      ctx.textAlign = 'left';
    }
  }
  // Pop-up text, same timing as the on-screen animation
  if (popupState) {
    const t = (performance.now() - popupState.t0) / 1300;
    if (t < 1) {
      const a = t < 0.15 ? t / 0.15 : t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
      const sc = t < 0.15 ? lerp(0.5, 1.1, t / 0.15) : t < 0.25 ? lerp(1.1, 1, (t - 0.15) / 0.1) : 1;
      const y = h * 0.34 - (t > 0.75 ? (t - 0.75) / 0.25 * 0.3 * 60 * u : 0);
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.textAlign = 'center';
      ctx.font = `${Math.round(64 * u * sc)}px ${disp}`;
      outlinedText(ctx, popupState.main, w / 2, y, paper, ink, 9 * u);
      if (popupState.sub) {
        ctx.font = `${Math.round(34 * u * sc)}px ${disp}`;
        outlinedText(ctx, popupState.sub, w / 2, y + 46 * u, orange, ink, 7 * u);
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    } else popupState = null;
  }
  if (G.fade) {
    const f = G.fade.t;
    ctx.fillStyle = `rgba(31,58,34,${clamp(f < 0.2 ? f / 0.2 : 1 - (f - 0.25) / 0.2, 0, 1)})`;
    ctx.fillRect(0, 0, w, h);
  }
  // Watermark with the link to play
  ctx.font = `${Math.round(30 * u)}px ${disp}`;
  const brand = 'Freesbee';
  const bwid = ctx.measureText(brand).width;
  ctx.font = `800 ${Math.round(17 * u)}px Nunito, sans-serif`;
  const link = tr('overlay.play') + ' ' + PLAY_URL_SHORT;
  const lw = ctx.measureText(link).width;
  const boxW = Math.max(bwid, lw) + 28 * u, boxH = 70 * u;
  const bx = w - boxW - 18 * u, by = h - boxH - 18 * u;
  roundRect(ctx, bx, by, boxW, boxH, 14 * u);
  ctx.fillStyle = 'rgba(31,58,34,0.78)'; ctx.fill();
  ctx.font = `${Math.round(30 * u)}px ${disp}`;
  outlinedText(ctx, brand, bx + 14 * u, by + 34 * u, orange, ink, 5 * u);
  ctx.font = `800 ${Math.round(17 * u)}px Nunito, sans-serif`;
  ctx.fillStyle = paper;
  ctx.fillText(link, bx + 14 * u, by + 58 * u);
  ctx.restore();
}

let clipUrl = null;
const recorder = createRecorder({
  source: renderer.domElement,
  audio: audioStream,
  overlay: drawOverlay,
  maxSeconds: 60,
  onTick(s) {
    const t = `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    if ($('recTime').textContent !== t) $('recTime').textContent = t;
  },
  onStop(blob, info) {
    $('recBtn').classList.remove('on');
    $('recLive').hidden = true;
    sfx.rec(false);
    if (G.mode === 'play' && !G.paused) { G.paused = true; }
    if (clipUrl) URL.revokeObjectURL(clipUrl);
    clipUrl = URL.createObjectURL(blob);
    const name = `freesbee-${breed.id}-${G.score}.${info.ext}`;
    const clip = $('clip');
    clip.src = clipUrl;
    clip.play().catch(() => {});
    const dl = $('clipDownload');
    dl.href = clipUrl;
    dl.download = name;
    const mb = fmtNum(blob.size / 1e6);
    let note = `${Math.round(info.seconds)} s · ${mb} MB · ${info.ext.toUpperCase()}`;
    if (info.ext !== 'mp4') note += '.' + tr('video.webm');
    $('clipInfo').textContent = note;
    const file = new File([blob], name, { type: info.type });
    const share = $('clipShare');
    share.hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
    share.onclick = () => navigator.share({ files: [file], text: shareText() + ' ' + PLAY_URL }).catch(() => {});
    $('clipX').href = xIntent(G.mode === 'menu' ? tr('share.menu') : shareText());
    $('videoScreen').hidden = false;
    dl.focus();
  },
});
function toggleRec() {
  if (!recorderSupported()) { toast(tr('toast.noRec')); return; }
  initAudio(() => G.paused || G.mode !== 'play');
  if (recorder.recording) { recorder.stop(); return; }
  if (recorder.start()) {
    $('recBtn').classList.add('on');
    $('recLive').hidden = false;
    sfx.rec(true);
    toast(tr('toast.recOn'));
  }
}
$('recBtn').addEventListener('click', (e) => { e.currentTarget.blur(); toggleRec(); });
$('clipClose').addEventListener('click', () => {
  $('videoScreen').hidden = true;
  $('clip').pause();
  if (G.mode === 'play' && G.paused) setPaused(true);
});

/* ======================================================================
   Physics (fixed step)
   ====================================================================== */
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3(), tmpD = new THREE.Vector3();
function closestOnSegment(a, b, p, out) {
  tmpD.subVectors(b, a);
  const l2 = tmpD.lengthSq();
  const t = l2 > 0 ? clamp(tmpC.subVectors(p, a).dot(tmpD) / l2, 0, 1) : 0;
  return out.copy(a).addScaledVector(tmpD, t);
}
const fwdOf = (h, out) => out.set(Math.sin(h), 0, Math.cos(h));
const dogVel = new THREE.Vector3();
const headNow = new THREE.Vector3();

// When the dog jumps while the disc is in the air, aim the leap at a point
// of the disc's path it can actually reach.
function planLeap() {
  const d = G.disc;
  const path = simulate(d.pos, d.vel, d.n, G.wind, 1.0, 1 / 30).samples;
  const vy0 = P.jumpVy + G.speed * 0.05, gEff = DOG_G * 0.62;
  const reach = P.reach * D().reach;
  const maxSpeed = Math.max(G.speed, P.run) + P.leap;
  const headUp = dog.headHeight, headFwd = dog.headForward;
  let best = null;
  for (const s of path) {
    if (s.t < 0.1) continue;
    const yDog = vy0 * s.t - 0.5 * gEff * s.t * s.t;
    if (yDog < -0.05) break;
    const dy = Math.abs(s.p.y - (headUp + Math.max(yDog, 0)));
    if (dy > reach + 0.25) continue;
    const dx = s.p.x - G.pos.x, dz = s.p.z - G.pos.z;
    const need = Math.max(0, Math.hypot(dx, dz) - headFwd) / s.t;
    if (need > maxSpeed) continue;
    const hd = Math.atan2(dx, dz);
    const turn = Math.abs(wrapAngle(hd - G.heading));
    if (turn > 1.5 && G.speed > 4) continue;
    const score = dy + turn * 0.3 + Math.abs(need - G.speed) * 0.04;
    if (!best || score < best.score) best = { score, heading: hd, speed: need };
  }
  return best;
}

function stepDog(h) {
  if (G.mode === 'menu') return stepIntroDog(h);
  const yaw = G.cam.yaw + G.cam.manual;
  const fx_ = -Math.sin(yaw), fz = -Math.cos(yaw);
  const mx = fx_ * input.z + -fz * input.x;
  const mz = fz * input.z + fx_ * input.x;
  const mag = Math.min(1, Math.hypot(mx, mz));

  const wantsSprint = input.sprint && mag > 0.2 && !G.tired;
  G.stamina = clamp(G.stamina + (wantsSprint ? -P.drain : P.regen) * h, 0, 1);
  if (G.stamina <= 0) G.tired = true;
  if (G.tired && G.stamina > 0.35) G.tired = false;
  const target = mag * (wantsSprint ? P.sprint : P.run);

  const prevHeading = G.heading;
  G.skid = false;
  if (G.onGround) {
    if (mag > 0.1) {
      const desired = Math.atan2(mx, mz);
      const diff = wrapAngle(desired - G.heading);
      const turnRate = lerp(P.turnLow, P.turnHigh, clamp(G.speed / P.sprint, 0, 1));
      if (G.speed < 1.5) G.heading += diff * (1 - Math.exp(-P.turnLow * 1.6 * h));
      else G.heading += clamp(diff, -turnRate * h, turnRate * h);
      if (Math.abs(diff) > 1.6 && G.speed > P.run * 0.45) {
        G.speed = Math.max(0, G.speed - 26 * h);      // plant the paws and brake to turn round
        G.skid = true;
      } else if (G.speed < target * Math.max(Math.cos(diff), 0.3)) {
        G.speed = Math.min(target, G.speed + P.accel * (1 - G.speed / (P.sprint * 1.1)) * h);
      } else {
        G.speed = Math.max(target, G.speed - 14 * h);
      }
    } else {
      G.speed = Math.max(0, G.speed - 22 * h);
    }
  } else if (mag > 0.1 && !G.leaping) {
    G.heading += clamp(wrapAngle(Math.atan2(mx, mz) - G.heading), -0.8 * h, 0.8 * h);
  }
  G.turnRate = wrapAngle(G.heading - prevHeading) / h;

  if (G.jumpBuf > 0 && G.onGround) {
    G.vy = P.jumpVy + G.speed * 0.05;
    G.leaping = false;
    if (G.phase === 'flying') {
      const leap = planLeap();
      if (leap) { G.heading = leap.heading; G.speed = leap.speed; G.leaping = true; }
    }
    G.onGround = false;
    G.jumpBuf = 0;
    G.jumpHold = 0.22;
    sfx.jump();
    fx.dust(G.pos.x, G.pos.z, 4, 0.2, 1);
  }
  G.jumpBuf -= h;
  G.prevVy = G.vy;
  if (!G.onGround) {
    const floaty = input.jumpHeld && G.jumpHold > 0 && G.vy > 0;
    G.jumpHold -= h;
    G.vy -= DOG_G * (floaty ? 0.5 : 1) * h;
    G.pos.y += G.vy * h;
    if (G.pos.y <= 0) {
      const impact = clamp(-G.vy / 10, 0, 1);
      G.pos.y = 0; G.vy = 0; G.onGround = true; G.leaping = false;
      dog.squash = impact;
      G.speed *= 0.86;
      fx.dust(G.pos.x, G.pos.z, 5 + Math.round(impact * 8), 0.25, 1.5);
      sfx.land(impact);
      if (impact > 0.6) G.cam.shake = Math.max(G.cam.shake, 0.12);
    }
  }
  G.pos.x += Math.sin(G.heading) * G.speed * h;
  G.pos.z += Math.cos(G.heading) * G.speed * h;
  const r = Math.hypot(G.pos.x, G.pos.z);
  if (r > FIELD_R) { G.pos.x *= FIELD_R / r; G.pos.z *= FIELD_R / r; G.speed *= 0.97; }
  const od = Math.hypot(G.pos.x, G.pos.z);
  if (od < 0.75) { const k = 0.75 / Math.max(od, 1e-3); G.pos.x *= k; G.pos.z *= k; }
}

// Attract mode behind the menu: the dog runs laps so you can see its gait and jump
const INTRO_C = new THREE.Vector3(0, 0, 9), INTRO_R = 4.2;
function stepIntroDog(h) {
  const it = G.intro;
  it.t += h;
  const target = clamp(4.2 + 4.5 * Math.sin(it.t * 0.33), 0.8, P.run);
  G.speed = damp(G.speed, target, 2, h);
  const w = G.speed / INTRO_R;
  it.angle += w * h;
  G.pos.x = INTRO_C.x + Math.sin(it.angle) * INTRO_R;
  G.pos.z = INTRO_C.z + Math.cos(it.angle) * INTRO_R;
  G.heading = it.angle + Math.PI / 2;
  G.turnRate = w;
  it.jumpT -= h;
  G.prevVy = G.vy;
  if (it.jumpT <= 0 && G.onGround && G.speed > 3) { G.vy = P.jumpVy; G.onGround = false; it.jumpT = rand(5, 8); }
  if (!G.onGround) {
    G.vy -= DOG_G * 0.7 * h;
    G.pos.y += G.vy * h;
    if (G.pos.y <= 0) { G.pos.y = 0; G.vy = 0; G.onGround = true; dog.squash = 0.6; fx.dust(G.pos.x, G.pos.z, 6, 0.25, 1.4); }
  }
}

function stepDisc(h) {
  const d = G.disc;
  if (G.mode === 'over' && (G.phase === 'windup' || G.phase === 'handoff')) return;
  G.hitCooldown -= h;
  fwdOf(G.heading, tmpA);
  dogVel.copy(tmpA).multiplyScalar(G.speed); dogVel.y = G.vy;
  // Head position now, from the last animated pose moved with the dog
  headNow.copy(G.headAtAnim).add(tmpB.subVectors(G.pos, G.posAtAnim));

  if (G.phase === 'windup') {
    G.timer += h;
    if (G.timer >= 0 && !G.throwStarted) { owner.play(THROW_KEYS); G.throwStarted = true; }
    if (G.timer >= RELEASE_T) releaseDisc();
    return;
  }
  if (G.phase === 'flying') {
    d.prev.copy(d.pos);
    aeroStep(d.pos, d.vel, d.n, G.wind, h);
    d.spin *= Math.exp(-0.08 * h);
    G.timer += h;
    const reach = P.reach * D().reach;
    // Eagerness: how soon the disc will be within reach (opens the mouth, stretches the neck)
    const distHead = d.pos.distanceTo(headNow);
    const closing = Math.max(0, -tmpC.subVectors(d.pos, headNow).normalize().dot(tmpD.subVectors(d.vel, dogVel)));
    G.eager = clamp(1 - (distHead - reach) / (closing * 0.4 + 0.6), 0, 1);
    if (G.timer > 0.15) {
      // Swept test: did the disc pass through the zone the head can snap to?
      closestOnSegment(d.prev, d.pos, headNow, tmpB);
      if (tmpB.distanceTo(headNow) < reach) {
        tmpC.subVectors(tmpB, G.pos); tmpC.y = 0;
        const cosA = tmpC.lengthSq() > 1e-6 ? tmpC.normalize().dot(tmpA) : 1;
        if (cosA > -0.45) {                       // the neck can turn about 115° either way
          d.pos.copy(tmpB);
          const rel = tmpC.subVectors(d.vel, dogVel).length();
          if (rel > P.grip) bounceOff(headNow, tr('c.tooFast'));
          else { catchDisc(cosA); return; }
        }
      }
      // The disc hits the body instead
      if (G.hitCooldown <= 0) {
        const sc = dog.scale, half = dog.spine * 0.55 * sc, by = dog.bodyY * sc + G.pos.y;
        tmpC.set(G.pos.x + tmpA.x * half, by, G.pos.z + tmpA.z * half);
        tmpD.set(G.pos.x - tmpA.x * half, by, G.pos.z - tmpA.z * half);
        const a = tmpC.clone(), b = tmpD.clone();
        closestOnSegment(a, b, d.pos, tmpB);
        if (tmpB.distanceTo(d.pos) < dog.r * sc * 1.1 + 0.05) bounceOff(tmpB.clone(), tr('c.bounce'));
      }
    }
    if (d.pos.y <= 0.04) { groundHit(); discLanded(); }
    return;
  }
  G.eager = 0;
  if (G.phase === 'ground') {
    d.vel.y -= 9.81 * h;
    d.pos.addScaledVector(d.vel, h);
    if (d.pos.y <= 0.04) groundHit();
    const sh = Math.hypot(d.vel.x, d.vel.z);
    if (d.pos.y <= 0.05 && sh > 0) {
      const nsh = Math.max(0, sh - 5.5 * h);
      d.vel.x *= nsh / sh; d.vel.z *= nsh / sh;
    }
    d.n.lerp(UP, 1 - Math.exp(-4 * h)).normalize();
    d.spin *= Math.exp(-2.5 * h);
    G.timer += h;
    // Pick up: the muzzle has to reach the disc on the ground
    const mzx = G.pos.x + tmpA.x * dog.headForward, mzz = G.pos.z + tmpA.z * dog.headForward;
    if (G.gameMode === 'survival' && G.lives > 0 && G.timer > 0.4 && G.onGround && G.speed < P.run * 1.05 &&
        Math.hypot(d.pos.x - mzx, d.pos.z - mzz) < 0.35 + P.reach * 0.4) {
      G.phase = 'carrying';
      G.catchFrom.copy(d.pos); G.carryT = 0;
      dog.snap = 0.6;
      sfx.snap();
      owner.setBase('wave');
      setStatus(tr('st.bring2'));
    }
    return;
  }
  if (G.phase === 'carrying') {
    if (G.gameMode === 'survival' && Math.hypot(G.pos.x, G.pos.z) < 1.7) {
      G.phase = 'handoff';
      G.timer = 0;
      if (G.combo > 0) { addScore(50); popup(tr('c.goodDog'), '+50'); }
      sfx.deliver();
      controls.rumble(0.2, 0.2, 80);
      owner.play([[0, '_from'], [0.3, 'receive'], [0.65, 'receive'], [1.0, 'idle']]);
      owner.setBase('idle');
    }
    return;
  }
  if (G.phase === 'handoff') {
    G.timer += h;
    if (G.timer >= 0.95) startWindup(0.25);
  }
}
function groundHit() {
  const d = G.disc;
  d.pos.y = 0.04;
  if (d.vel.y < -1.2) { d.vel.y = -d.vel.y * 0.25; d.vel.x *= 0.7; d.vel.z *= 0.7; }
  else d.vel.y = 0;
}

/* ======================================================================
   Per-frame animation
   ====================================================================== */
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
const handPos = new THREE.Vector3(), handQuat = new THREE.Quaternion();
const mouthPos = new THREE.Vector3(), mouthQuat = new THREE.Quaternion();

function animate(dt, t) {
  // Dog
  dog.root.position.copy(G.pos);
  dog.root.rotation.y = G.heading;
  G.accY = (G.vy - G.prevVy) / Math.max(dt, 1e-3);
  let look = null;
  if (G.phase === 'flying' || (G.phase === 'ground' && G.mode === 'play')) look = G.disc.pos;
  else if (G.phase === 'windup' || G.phase === 'handoff' || G.phase === 'carrying') look = _v.set(0, 1.4, 0);
  dog.update(dt, {
    speed: G.speed, onGround: G.onGround, vy: G.vy, turnRate: G.turnRate, skid: G.skid,
    carrying: G.phase === 'carrying', tired: G.tired, happy: G.phase === 'handoff',
    look, eager: G.eager, accY: G.accY,
  }, t);
  dog.root.updateMatrixWorld(true);
  dog.headWorld(G.headAtAnim);
  G.posAtAnim.copy(G.pos);

  // Footsteps
  G.stepTimer -= dt;
  if (G.onGround && G.speed > 3 && G.stepTimer <= 0) {
    G.stepTimer = 0.9 / (2 + G.speed * 0.6);
    fwdOf(G.heading, _w);
    fx.dust(G.pos.x - _w.x * 0.4, G.pos.z - _w.z * 0.4, G.skid ? 3 : 1, 0.15, G.skid ? 2 : 0.6);
    if (G.speed > 9) sfx.step();
  }
  world.grassUniforms.uDog.value.copy(G.pos);

  // Owner
  let ownerYaw = Math.atan2(G.pos.x, G.pos.z);
  if (G.phase === 'windup' && G.timer >= 0) ownerYaw = G.plan.yaw;
  else if (G.phase === 'flying') ownerYaw = owner.root.rotation.y;
  owner.root.rotation.y = angleDamp(owner.root.rotation.y, ownerYaw, 6, dt);
  owner.update(dt, t, { yaw: owner.root.rotation.y, look: G.phase === 'flying' ? G.disc.pos : _w.copy(G.pos).setY(0.6) });
  owner.root.updateMatrixWorld(true);

  // Disc
  const d = G.disc, spinner = discMesh.userData.spinner;
  owner.discInHand(handPos, handQuat);
  dog.mouthWorld(mouthPos);
  fwdOf(G.heading, _w);
  mouthPos.addScaledVector(_w, 0.1 * dog.scale).y -= 0.04 * dog.scale;
  _v.set(-_w.z, 0, _w.x);                      // disc held upright by the rim, plane along the muzzle
  mouthQuat.setFromUnitVectors(UP, _v);
  if (G.phase === 'windup' || G.phase === 'intro') {
    discMesh.position.copy(handPos);
    discMesh.quaternion.copy(handQuat);
    d.pos.copy(handPos);
  } else if (G.phase === 'carrying') {
    G.carryT = Math.min(1, G.carryT + dt / 0.12);
    discMesh.position.lerpVectors(G.catchFrom, mouthPos, G.carryT);
    discMesh.quaternion.copy(mouthQuat);
    d.pos.copy(discMesh.position);
  } else if (G.phase === 'handoff') {
    const k = clamp((G.timer - 0.25) / 0.2, 0, 1);
    discMesh.position.lerpVectors(mouthPos, handPos, k);
    discMesh.quaternion.slerpQuaternions(mouthQuat, handQuat, k);
    d.pos.copy(discMesh.position);
  } else {
    discMesh.position.copy(d.pos);
    _q.setFromUnitVectors(UP, d.n);
    discMesh.quaternion.copy(_q);
    d.angle -= d.spin * dt;
    spinner.rotation.y = d.angle;
  }
  if (G.phase !== 'flying' && G.phase !== 'ground') spinner.rotation.y = 0;

  const flying = G.phase === 'flying';
  shadowBlob.visible = flying || G.phase === 'ground';
  if (shadowBlob.visible) {
    shadowBlob.position.set(d.pos.x, 0.04, d.pos.z);
    const s = 1 + d.pos.y * 0.12;
    shadowBlob.scale.set(s, s, s);
    shadowBlob.material.opacity = clamp(0.45 - d.pos.y * 0.04, 0.12, 0.45);
  }
  if (landRing.visible) landRing.scale.setScalar(1 + Math.sin(t * 6.5) * 0.08);
  if (flying) trail.push(d.pos); else trail.fade();
  trail.update();
  arrow.visible = G.phase === 'carrying';
  if (arrow.visible) arrow.position.set(0, 2.6 + Math.sin(t * 5.5) * 0.2, 0);
  arrow.rotation.y += dt * 3;
}

/* ======================================================================
   Camera
   ====================================================================== */
function updateCamera(dt) {
  const c = G.cam;
  if (G.mode === 'menu') {
    // Watch the dog run its laps from the inside of the circle
    const side = window.innerWidth >= 740 && window.innerWidth / window.innerHeight >= 1.25;
    const eye = _v.copy(INTRO_C).add(_w.set(Math.sin(G.intro.angle + 0.5) * 0.8, 1.8, Math.cos(G.intro.angle + 0.5) * 0.8));
    camera.position.set(damp(camera.position.x, eye.x, 3, dt), damp(camera.position.y, eye.y, 3, dt), damp(camera.position.z, eye.z, 3, dt));
    const target = _w.copy(G.pos).setY(0.5 * dog.scale);
    camera.lookAt(target);
    // Shift the framing so the panel doesn't hide the dog
    camera.updateMatrixWorld();
    const dist = camera.position.distanceTo(target);
    const right = _v.setFromMatrixColumn(camera.matrixWorld, 0);
    if (side) target.addScaledVector(right, dist * 0.55);   // dog in the left half
    else target.y -= dist * 0.3;                            // dog in the upper half
    camera.lookAt(target);
    c.yaw = Math.atan2(camera.position.x - G.pos.x, camera.position.z - G.pos.z);
    updateFov(0);
  } else {
    const focus = (G.phase === 'flying' || G.phase === 'ground') ? G.disc.pos : owner.root.position;
    c.focus.x = damp(c.focus.x, focus.x, 5, dt);
    c.focus.z = damp(c.focus.z, focus.z, 5, dt);
    c.focus.y = damp(c.focus.y, Math.max(focus.y, 1), 5, dt);
    const dx = G.pos.x - c.focus.x, dz = G.pos.z - c.focus.z;
    if (Math.hypot(dx, dz) > 3) c.yaw = angleDamp(c.yaw, Math.atan2(dx, dz), G.phase === 'windup' ? 1.5 : 2.2, dt);
    if (Math.abs(input.camX) > 0) { c.manual -= input.camX * 2.6 * dt; c.idle = 0; }
    else { c.idle += dt; if (c.idle > 1.5) c.manual = damp(c.manual, 0, 1.2, dt); }
    c.manual = wrapAngle(c.manual);
    const yaw = c.yaw + c.manual;
    const sprinting = G.speed > P.run + 0.5;
    c.fov = damp(c.fov, sprinting ? 7 : (G.slowmo > 0 ? -6 : 0), 3, dt);
    updateFov(c.fov);
    const dist = 8.5 + (sprinting ? 0.8 : 0) - (G.slowmo > 0 ? 2 : 0);
    const cx = G.pos.x + Math.sin(yaw) * dist, cz = G.pos.z + Math.cos(yaw) * dist;
    const cy = 4.2 + G.pos.y * 0.5 - (G.slowmo > 0 ? 1.2 : 0);
    camera.position.set(damp(camera.position.x, cx, 8, dt), damp(camera.position.y, cy, 8, dt), damp(camera.position.z, cz, 8, dt));
    camera.lookAt(
      G.pos.x + (c.focus.x - G.pos.x) * 0.25,
      1.2 + G.pos.y * 0.5 + clamp(c.focus.y - 1, 0, 6) * 0.25,
      G.pos.z + (c.focus.z - G.pos.z) * 0.25
    );
    c.shake = damp(c.shake, 0, 6, dt);
    if (c.shake > 0.005) { camera.position.x += rand(-1, 1) * c.shake * 0.4; camera.position.y += rand(-1, 1) * c.shake * 0.4; }
    // Wind indicator relative to the view
    const ws = Math.hypot(G.wind.x, G.wind.z);
    if (ws > 0.05) {
      const fx_ = -Math.sin(yaw), fz = -Math.cos(yaw);
      ui.windArrow.style.transform = `rotate(${Math.atan2(G.wind.x * -fz + G.wind.z * fx_, G.wind.x * fx_ + G.wind.z * fz)}rad)`;
      ui.windArrow.style.opacity = '1';
    } else ui.windArrow.style.opacity = '0.25';
    const wt = ws < 0.3 ? tr('hud.noWind') : `${fmtNum(ws)} m/s`;
    if (ui.windText.textContent !== wt) ui.windText.textContent = wt;
    setWind(ws);
  }
  world.grassUniforms.uWind.value.set(G.wind.x * 0.35 + 0.4, G.wind.z * 0.35 + 0.2);
  fx.setScale(window.innerHeight * renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)));
}
function updateFov(extra) { camera.fov = (camera.aspect < 1 ? 72 : 60) + extra; camera.updateProjectionMatrix(); }
function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  updateFov(G.cam.fov);
}
window.addEventListener('resize', resize);
resize();

/* ======================================================================
   Menus driven by keyboard / gamepad
   ====================================================================== */
function handleMenus() {
  const vis = (id) => !$(id).hidden;
  if (input.rec) toggleRec();
  if (vis('videoScreen')) {
    if (input.confirm || input.pause) $('clipClose').click();
  } else if (G.mode === 'menu') {
    if (input.left) { setBreed(breedIndex - 1); sfx.select(); }
    if (input.right) { setBreed(breedIndex + 1); sfx.select(); }
    const keys = Object.keys(DIFFS), i = keys.indexOf(diffKey);
    if (input.up) setDiff(keys[Math.max(0, i - 1)]);
    if (input.down) setDiff(keys[Math.min(keys.length - 1, i + 1)]);
    if (input.confirm) start('menu');
  } else if (G.mode === 'over') {
    if (input.confirm) start('rematch');
  } else if (G.mode === 'play') {
    if (input.pause) setPaused(!G.paused);
    else if (input.confirm && G.paused) setPaused(false);
    if (input.jump && !G.paused) G.jumpBuf = 0.14;
  }
}

/* ======================================================================
   Main loop
   ====================================================================== */
const clock = new THREE.Clock();
let acc = 0;
camera.position.set(0, 4.2, 11.5);
owner.setBase('wave');

// Sound can only start after a gesture
const unlockAudio = () => initAudio(() => G.paused || G.mode !== 'play');
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

// Show the controls for this device during the first round
function showHint() {
  const el = $('hint');
  const kind = document.body.classList.contains('pad-active') ? 'pad' : IS_TOUCH ? 'touch' : 'keys';
  el.innerHTML = tr('hint.' + kind);
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 7000);
}

// Play-test panel: open the game with #debug
if (location.hash === '#debug') {
  const panel = $('debug');
  panel.hidden = false;
  const refresh = () => {
    const s = summary();
    panel.querySelector('pre').textContent =
      `sessions ${s.sessions} · rounds ${s.rounds} · rematches ${s.rematches}\n` +
      `sessions with 3+ rounds ${s.sessionsWith3Rounds}\n` +
      `median first catch ${s.medianFirstCatchSec ?? '–'} s (since page load)\n` +
      `catches ${s.catches} · perfects ${s.perfects} · misses ${s.misses}\n` +
      `last round p95 frame ${s.lastP95ms ?? '–'} ms`;
  };
  refresh();
  setInterval(refresh, 2000);
  panel.querySelector('[data-act=copy]').addEventListener('click', () => {
    navigator.clipboard.writeText(exportLog()).then(() => toast('Log copied'), () => toast('Copy failed'));
  });
  panel.querySelector('[data-act=clear]').addEventListener('click', () => { clearLog(); refresh(); });
}

track('session_start', { lang: getLang(), touch: IS_TOUCH, w: innerWidth, h: innerHeight });
setMode(store.get('mode', 'arcade') === 'survival' ? 'survival' : 'arcade');
start('boot');
showHint();

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;
  controls.poll();
  handleMenus();
  controls.consume();

  const frozen = G.paused || !$('videoScreen').hidden;
  if (!frozen) {
    if (G.slowmo > 0) G.slowmo -= dt;
    G.timeScale = damp(G.timeScale, G.slowmo > 0 ? 0.3 : 1, 10, dt);
    const gdt = dt * G.timeScale;
    if (G.mode === 'play') {
      frameSample(dt * 1000);
      if (G.after) { G.after.t -= gdt; if (G.after.t <= 0) { const f = G.after.fn; G.after = null; f(); } }
      if (G.gameMode === 'arcade' && !G.timeUp && G.phase !== 'intro') {
        if (!G.fade) G.timeLeft -= gdt;
        if (G.timeLeft <= 0) {
          G.timeLeft = 0; G.timeUp = true;
          sfx.buzzer();
          if (G.phase !== 'flying' && G.phase !== 'carrying' && !G.after) after(0.6, endRound);
          else if (G.phase === 'flying') popup(tr('c.lastThrow'));
        } else if (G.timeLeft <= 10 && Math.ceil(G.timeLeft) < G.tickSec) { G.tickSec = Math.ceil(G.timeLeft); sfx.tick(); }
      }
      updateTimerUi();
    }
    if (G.fade) {
      G.fade.t += dt;
      if (G.fade.t >= 0.2 && !G.fade.done) { G.fade.done = true; fadeMid(); }
      const f = G.fade.t;
      $('fade').style.opacity = String(f < 0.2 ? f / 0.2 : Math.max(0, 1 - (f - 0.25) / 0.2));
      if (f > 0.46) { G.fade = null; $('fade').style.opacity = '0'; }
    }
    acc += gdt;
    let steps = 0;
    while (acc >= STEP && steps < 24) {
      stepDog(STEP);
      if (G.mode !== 'menu') stepDisc(STEP);
      acc -= STEP; steps++;
    }
    if (steps === 24) acc = 0;
    animate(gdt, t);
    fx.update(gdt);
    world.update(gdt, t, camera, G.pos);
  }
  updateCamera(frozen ? 0 : dt);

  const st = G.stamina.toFixed(3);
  if (ui.staminaFill.dataset.v !== st) { ui.staminaFill.dataset.v = st; ui.staminaFill.style.transform = `scaleX(${st})`; }
  ui.stamina.classList.toggle('tired', G.tired);
  if (G.phase === 'ground' && G.gameMode === 'survival' && G.lives > 0 && G.timer > 0.4) setStatus(tr('st.fetch'));

  renderer.render(scene, camera);
  recorder.frame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
