// Keyboard, touch and gamepad (8BitDo and other pads) merged into one state.
// Physical key codes: WASD on QWERTY is ZQSD on AZERTY.
export function createInput({ onPad, onPadActive, isTouch }) {
  const input = {
    x: 0, z: 0, sprint: false, jumpHeld: false, camX: 0,
    // one-shot events, cleared by consume()
    jump: false, confirm: false, pause: false, rec: false, left: false, right: false, up: false, down: false,
  };
  const keys = new Set();
  let padActive = false;
  const setPadActive = (on) => { if (padActive !== on) { padActive = on; onPadActive(on); } };

  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    setPadActive(false);
    if (e.code === 'Space') input.jump = true;
    if (e.code === 'Escape' || e.code === 'KeyP') input.pause = true;
    if (e.code === 'Enter') input.confirm = true;
    if (e.code === 'KeyR') input.rec = true;
    if (e.code === 'ArrowLeft') input.left = true;
    if (e.code === 'ArrowRight') input.right = true;
    if (e.code === 'ArrowUp') input.up = true;
    if (e.code === 'ArrowDown') input.down = true;
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  // ---- Touch: floating joystick on the left, buttons on the right ----
  const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
  const base = document.getElementById('stickBase'), knob = document.getElementById('stickKnob');
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || stick.id !== null) return;
    if (e.target.closest('.btn-round, .screen, button, a, .hud')) return;
    if (e.clientX > window.innerWidth * 0.6) return;
    stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.x = stick.y = 0;
    base.style.left = e.clientX + 'px';
    base.style.top = e.clientY + 'px';
    base.classList.add('on');
    knob.style.transform = '';
    setPadActive(false);
  });
  window.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stick.id) return;
    let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy;
    const d = Math.hypot(dx, dy), max = 50;
    if (d > max) { dx *= max / d; dy *= max / d; }
    stick.x = dx / max; stick.y = dy / max;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  });
  const endStick = (e) => {
    if (e.pointerId !== stick.id) return;
    stick.id = null; stick.x = stick.y = 0;
    base.classList.remove('on');
  };
  window.addEventListener('pointerup', endStick);
  window.addEventListener('pointercancel', endStick);
  let touchSprint = false, touchJump = false;
  const hold = (el, down, up) => {
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.classList.add('down'); down(); });
    const u = () => { el.classList.remove('down'); up(); };
    el.addEventListener('pointerup', u); el.addEventListener('pointercancel', u); el.addEventListener('pointerleave', u);
  };
  hold(document.getElementById('btnJump'), () => { input.jump = true; touchJump = true; }, () => { touchJump = false; });
  hold(document.getElementById('btnSprint'), () => { touchSprint = true; }, () => { touchSprint = false; });

  // ---- Gamepad ----
  const pad = { index: null, prev: [], prevAxis: [0, 0], name: '' };
  const label = (id) => (/8bitdo/i.test(id) ? '8BitDo' : (id.replace(/\(.*?\)/g, '').replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 22) || 'Manette'));
  window.addEventListener('gamepadconnected', (e) => {
    pad.index = e.gamepad.index; pad.name = label(e.gamepad.id);
    onPad(true, pad.name);
    setPadActive(true);
  });
  window.addEventListener('gamepaddisconnected', (e) => {
    if (e.gamepad.index !== pad.index) return;
    pad.index = null;
    onPad(false, '');
    setPadActive(false);
  });
  function getPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (pad.index !== null && pads[pad.index]) return pads[pad.index];
    for (const p of pads) {
      if (p && p.connected) { pad.index = p.index; pad.name = label(p.id); onPad(true, pad.name); return p; }
    }
    return null;
  }
  const dead = (x, y, dz = 0.18) => {
    const m = Math.hypot(x, y);
    if (m < dz) return [0, 0];
    const k = Math.min(1, (m - dz) / (1 - dz)) / m;
    return [x * k, y * k];
  };

  function poll() {
    let x = 0, z = 0, camX = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) z += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) z -= 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    if (stick.id !== null) { x += stick.x; z -= stick.y; }
    let sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || touchSprint;
    let jumpHeld = keys.has('Space') || touchJump;

    const p = getPad();
    if (p) {
      const b = (i) => { const btn = p.buttons[i]; return !!btn && (btn.pressed || btn.value > 0.35); };
      const edge = (i) => b(i) && !pad.prev[i];
      let [lx, ly] = dead(p.axes[0] || 0, p.axes[1] || 0);
      const [rx] = dead(p.axes[2] || 0, p.axes[3] || 0, 0.2);
      if (b(12)) ly = -1; if (b(13)) ly = 1; if (b(14)) lx = -1; if (b(15)) lx = 1;
      if (p.mapping !== 'standard' && p.axes.length >= 8) {      // hat switch on some non-standard mappings
        if (Math.abs(p.axes[6]) > 0.5) lx = Math.sign(p.axes[6]);
        if (Math.abs(p.axes[7]) > 0.5) ly = Math.sign(p.axes[7]);
      }
      x += lx; z -= ly; camX += rx;
      // Jump on A or B, sprint on every other face or shoulder button,
      // so Nintendo (A/B swapped) and Xbox layouts both work.
      sprint = sprint || b(2) || b(3) || b(4) || b(5) || b(6) || b(7);
      jumpHeld = jumpHeld || b(0) || b(1);
      if (edge(0) || edge(1)) { input.jump = true; input.confirm = true; }
      if (edge(9)) { input.pause = true; input.confirm = true; }
      if (edge(8)) input.rec = true;
      if (edge(14) || edge(4) || (lx < -0.6 && pad.prevAxis[0] >= -0.6)) input.left = true;
      if (edge(15) || edge(5) || (lx > 0.6 && pad.prevAxis[0] <= 0.6)) input.right = true;
      if (edge(12) || (ly < -0.6 && pad.prevAxis[1] >= -0.6)) input.up = true;
      if (edge(13) || (ly > 0.6 && pad.prevAxis[1] <= 0.6)) input.down = true;
      pad.prevAxis = [lx, ly];
      if (Math.abs(lx) + Math.abs(ly) + Math.abs(rx) > 0 || p.buttons.some((btn) => btn.pressed)) setPadActive(true);
      pad.prev = p.buttons.map((btn) => btn.pressed || btn.value > 0.35);
    }
    const len = Math.hypot(x, z);
    if (len > 1) { x /= len; z /= len; }
    Object.assign(input, { x, z, sprint, jumpHeld, camX });
    return input;
  }
  function consume() {
    input.jump = input.confirm = input.pause = input.rec = false;
    input.left = input.right = input.up = input.down = false;
  }
  function rumble(strong, weak, ms) {
    const p = getPad();
    const act = p && p.vibrationActuator;
    if (act && act.playEffect) act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
  }
  return { input, poll, consume, rumble, isTouch };
}
