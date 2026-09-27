// Local, anonymous play-test log. Nothing leaves the browser: open the game
// with #debug to see a summary and copy the raw log.
const KEY = 'freesbee-metrics';
const MAX = 2000;
let events = [];
try { events = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { events = []; }
const sessionId = Math.random().toString(36).slice(2, 8);
const t0 = performance.now();
let frames = [];

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(events.slice(-MAX))); } catch (e) { /* storage unavailable */ }
}

export function track(name, data = {}) {
  events.push({ n: name, s: sessionId, at: Date.now(), since: Math.round(performance.now() - t0), ...data });
  if (events.length > MAX) events = events.slice(-MAX);
  save();
}

// Frame times for the current round (ms)
export function frameSample(ms) { if (frames.length < 20000) frames.push(ms); }
export function roundFrames() {
  if (!frames.length) return { p95: 0, long: 0 };
  const sorted = [...frames].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const long = frames.filter((f) => f > 100).length;
  frames = [];
  return { p95: Math.round(p95 * 10) / 10, long };
}

export function summary() {
  const rounds = events.filter((e) => e.n === 'round_end');
  const sessions = new Set(events.map((e) => e.s));
  const rematches = events.filter((e) => e.n === 'rematch').length;
  const firstCatch = events.filter((e) => e.n === 'first_catch').map((e) => e.since);
  const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);
  return {
    sessions: sessions.size,
    rounds: rounds.length,
    rematches,
    sessionsWith3Rounds: [...sessions].filter((s) => rounds.filter((r) => r.s === s).length >= 3).length,
    medianFirstCatchSec: median(firstCatch) === null ? null : Math.round(median(firstCatch) / 100) / 10,
    lastP95ms: rounds.length ? rounds[rounds.length - 1].p95 : null,
    perfects: events.filter((e) => e.n === 'catch' && e.perfect).length,
    catches: events.filter((e) => e.n === 'catch').length,
    misses: events.filter((e) => e.n === 'miss').length,
  };
}
export function exportLog() { return JSON.stringify(events); }
export function clearLog() { events = []; save(); }
