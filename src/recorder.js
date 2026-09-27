// Gameplay recorder: copies the WebGL canvas into a 2D canvas each frame,
// draws the score overlay and the game's link on top, and records it with
// MediaRecorder. MP4 (H.264) when the browser can, WebM otherwise.
export function recorderSupported() {
  return typeof MediaRecorder !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream;
}

function pickMime() {
  const list = [
    'video/mp4;codecs="avc1.42E01E,mp4a.40.2"', 'video/mp4;codecs=avc1', 'video/mp4',
    'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm',
  ];
  return list.find((m) => { try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; } }) || '';
}

export function createRecorder({ source, audio, overlay, maxSeconds = 60, onStop, onTick }) {
  let rec = null, chunks = [], canvas = null, ctx = null, startAt = 0, mime = '', stream = null;

  function start() {
    if (rec || !recorderSupported()) return false;
    const w = source.width, h = source.height;
    // 1280 px on the long side, even dimensions for the encoder
    const k = Math.min(1, 1280 / Math.max(w, h));
    canvas = document.createElement('canvas');
    canvas.width = Math.round(w * k / 2) * 2;
    canvas.height = Math.round(h * k / 2) * 2;
    ctx = canvas.getContext('2d');
    stream = canvas.captureStream(60);
    const a = audio && audio();
    if (a) a.getAudioTracks().forEach((t) => stream.addTrack(t));
    mime = pickMime();
    try {
      rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 128_000 });
    } catch (e) {
      rec = new MediaRecorder(stream);
    }
    mime = rec.mimeType || mime || 'video/webm';
    chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      const type = mime.split(';')[0];
      const blob = new Blob(chunks, { type });
      const seconds = (performance.now() - startAt) / 1000;
      stream.getVideoTracks().forEach((t) => t.stop());
      rec = null;
      onStop(blob, { type, ext: type.includes('mp4') ? 'mp4' : 'webm', seconds });
    };
    rec.start(500);
    startAt = performance.now();
    frame();
    return true;
  }

  function stop() { if (rec && rec.state !== 'inactive') rec.stop(); }

  // Call right after renderer.render() so the WebGL buffer is still valid
  function frame() {
    if (!rec) return;
    const w = canvas.width, h = canvas.height;
    ctx.drawImage(source, 0, 0, w, h);
    overlay(ctx, w, h);
    const s = (performance.now() - startAt) / 1000;
    onTick && onTick(s);
    if (s >= maxSeconds) stop();
  }

  return { start, stop, frame, get recording() { return !!rec; } };
}
