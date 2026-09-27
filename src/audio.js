// Small Web Audio synth: effects, ambient wind and birds. Also exposes a
// MediaStream of the game sound so the recorder can put it in the video.
const rand = (a, b) => a + Math.random() * (b - a);

let actx = null, master = null, recordDest = null, noiseBuf = null, windGain = null;
let isQuiet = () => false;

export function initAudio(quiet) {
  if (quiet) isQuiet = quiet;
  if (!actx) {
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      master = actx.createGain();
      master.gain.value = 0.8;
      master.connect(actx.destination);
      noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      startAmbience();
    } catch (e) { actx = null; }
  }
  if (actx && actx.state === 'suspended') actx.resume().catch(() => {});
}

export function audioStream() {
  if (!actx || !actx.createMediaStreamDestination) return null;
  if (!recordDest) {
    recordDest = actx.createMediaStreamDestination();
    master.connect(recordDest);
  }
  return recordDest.stream;
}

export function setWind(speed) { if (windGain) windGain.gain.value = 0.015 + speed * 0.012; }

function tone(freq, dur, type = 'sine', vol = 0.15, slideTo = null, delay = 0) {
  if (!actx) return;
  const t = actx.currentTime + delay;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol, freq, q = 1, delay = 0) {
  if (!actx) return;
  const t = actx.currentTime + delay;
  const src = actx.createBufferSource(); src.buffer = noiseBuf;
  const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = actx.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.5); src.stop(t + dur);
}
function startAmbience() {
  const src = actx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
  windGain = actx.createGain(); windGain.gain.value = 0.02;
  src.connect(f).connect(windGain).connect(master);
  src.start();
  const chirp = () => {
    if (!document.hidden && !isQuiet()) {
      const base = rand(2400, 3600);
      for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) tone(base, 0.07, 'sine', 0.025, base * 1.3, i * 0.11);
    }
    setTimeout(chirp, rand(3000, 9000));
  };
  setTimeout(chirp, 2500);
}

export const sfx = {
  bark(pitch = 1) { tone(520 * pitch, 0.09, 'square', 0.06, 260 * pitch); tone(480 * pitch, 0.11, 'square', 0.06, 220 * pitch, 0.12); noise(0.08, 0.05, 900 * pitch, 2); },
  whoosh() { noise(0.45, 0.12, 1400, 0.8); },
  snap() { noise(0.05, 0.2, 2200, 3); },
  catch() { tone(660, 0.1, 'triangle', 0.15); tone(990, 0.18, 'triangle', 0.15, null, 0.09); },
  big() { [660, 830, 990, 1320].forEach((f, i) => tone(f, 0.16, 'triangle', 0.13, null, i * 0.07)); },
  bonk() { tone(220, 0.12, 'triangle', 0.14, 140); noise(0.08, 0.12, 700, 1.5); },
  miss() { tone(300, 0.35, 'sawtooth', 0.05, 120); noise(0.2, 0.08, 400); },
  jump() { tone(300, 0.12, 'sine', 0.06, 600); },
  land(k) { noise(0.12, 0.06 * k, 300, 0.7); },
  thud() { noise(0.15, 0.1, 250, 0.8); },
  deliver() { tone(520, 0.1, 'sine', 0.12); tone(780, 0.12, 'sine', 0.12, null, 0.08); },
  step() { noise(0.05, 0.02, 500, 1); },
  rec(on) { tone(on ? 880 : 440, 0.12, 'sine', 0.1); },
  select() { tone(700, 0.06, 'triangle', 0.08); },
};
