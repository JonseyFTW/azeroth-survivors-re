// touch.js — on-screen controls for phones: a thumb joystick, an F button and a pause button,
// drawn over the canvas and driving the unchanged client through synthetic keyboard and
// mouse-pointer events. The survivors hero reads raw W/A/S/D, faces the window cursor and aims
// F at it (benilla-app/src/survivors/{hero,mobility}.rs); winit's web backend takes
// `keydown`/`keyup` by `event.code` and any non-"touch" `pointermove` as the mouse, and never
// checks `isTrusted` — so a page can play the keyboard and mouse for a finger.
//
// Best-effort like platform.js: dynamic import, every entry feature-detected, failures logged
// and swallowed. Off on any device with a fine pointer; `?touch=1` / `?touch=0` force it.

/** Pixels of stick travel before any key is held. */
const DEAD = 18;
/** Ring radius: the knob is clamped to it. */
const RING = 60;
/** Where the synthetic cursor goes: this far from the canvas centre in the push direction. */
const AIM = 120;
/** A touch shorter than this that never left the dead zone is a tap, replayed as a click. */
const TAP_MS = 300;
const SIDE_KEY = 'wenilla.touch.side';

/** Should the overlay install? `search` is `location.search`, `coarse` the media-query answer. */
export function wantsTouch(search, coarse) {
  const q = new URLSearchParams(search).get('touch');
  if (q === '1') return true;
  if (q === '0') return false;
  return coarse;
}

// Eight 45° sectors counter-clockwise from "right"; y is screen-down, so up is negative dy.
const SECTORS = [
  ['KeyD'], ['KeyW', 'KeyD'], ['KeyW'], ['KeyW', 'KeyA'],
  ['KeyA'], ['KeyS', 'KeyA'], ['KeyS'], ['KeyS', 'KeyD'],
];

/** The key codes a stick deflection of (dx, dy) px holds; `[]` inside the dead zone. */
export function stickKeys(dx, dy) {
  if (Math.hypot(dx, dy) < DEAD) return [];
  const angle = Math.atan2(-dy, dx);
  const sector = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
  return SECTORS[sector];
}

/** Canvas-local point AIM px from the centre of a w×h canvas, in the (dx, dy) direction. */
export function aimPoint(dx, dy, w, h) {
  const len = Math.hypot(dx, dy) || 1;
  return { x: w / 2 + (dx / len) * AIM, y: h / 2 + (dy / len) * AIM };
}

/** Does a touch at (x, y) on a w×h screen start the joystick? The stick side's lower 75 %. */
export function inStickArea(x, y, w, h, side) {
  const onSide = side === 'right' ? x > w / 2 : x < w / 2;
  return onSide && y > h * 0.25;
}

const KEY = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', KeyF: 'f', Escape: 'Escape' };

const CSS = `
#wenilla-touch{position:fixed;inset:0;z-index:10;pointer-events:none;visibility:hidden;
  color:#fff;font:bold 24px/1 system-ui,sans-serif;-webkit-user-select:none;user-select:none}
#wenilla-touch.on{visibility:visible}
#wenilla-touch .zone{position:absolute;inset:0;pointer-events:auto;touch-action:none}
#wenilla-touch .ring{position:absolute;width:120px;height:120px;margin:-60px 0 0 -60px;border-radius:50%;
  border:2px solid rgba(255,255,255,.6);background:rgba(255,255,255,.15)}
#wenilla-touch .knob{position:absolute;left:50%;top:50%;width:48px;height:48px;margin:-24px 0 0 -24px;
  border-radius:50%;background:rgba(255,255,255,.5)}
#wenilla-touch .btn{position:absolute;pointer-events:auto;touch-action:none;padding:0;color:#fff;
  border:2px solid rgba(255,255,255,.6);background:rgba(255,255,255,.25);border-radius:50%;font:inherit}
#wenilla-touch .btn:active{background:rgba(255,255,255,.5)}
#wenilla-touch .f{width:72px;height:72px;font-size:30px;right:calc(24px + env(safe-area-inset-right));
  bottom:calc(32px + env(safe-area-inset-bottom))}
#wenilla-touch.right .f{right:auto;left:calc(24px + env(safe-area-inset-left))}
#wenilla-touch .pause{width:44px;height:44px;font-size:20px;right:calc(16px + env(safe-area-inset-right));
  top:calc(12px + env(safe-area-inset-top))}
#wenilla-touch.right .pause{right:auto;left:calc(16px + env(safe-area-inset-left))}
#wenilla-touch .swap{width:44px;height:44px;font-size:20px;left:50%;margin-left:-22px;
  top:calc(12px + env(safe-area-inset-top))}
`;

/** Build the overlay and wire it to the canvas. Returns without a trace on a non-touch device. */
export function install() {
  const canvas = document.getElementById('benilla');
  if (!canvas || !window.PointerEvent || !window.TouchEvent) return;
  const coarse = matchMedia('(hover: none) and (pointer: coarse)').matches;
  if (!wantsTouch(location.search, coarse)) return;

  const root = document.createElement('div');
  root.id = 'wenilla-touch';
  root.innerHTML = `<style>${CSS}</style>
    <div class="zone"><div class="ring" hidden><div class="knob"></div></div></div>
    <button class="btn f" type="button" aria-label="movement spell">F</button>
    <button class="btn pause" type="button" aria-label="pause">&#9208;</button>
    <button class="btn swap" type="button" aria-label="swap sides">&#8644;</button>`;
  document.body.appendChild(root);
  const zone = root.querySelector('.zone');
  const ring = root.querySelector('.ring');
  const knob = root.querySelector('.knob');

  // ── synthesis ──
  const held = new Set();
  const key = (type, code) =>
    canvas.dispatchEvent(new KeyboardEvent(type, { code, key: KEY[code], bubbles: true, cancelable: true }));
  const setHeld = (codes) => {
    for (const c of [...held]) if (!codes.includes(c)) { held.delete(c); key('keyup', c); }
    for (const c of codes) if (!held.has(c)) { held.add(c); key('keydown', c); }
  };
  const pointer = (type, clientX, clientY, extra = {}) => {
    const ev = new PointerEvent(type, {
      pointerType: 'mouse', pointerId: 1, isPrimary: true, clientX, clientY,
      bubbles: true, cancelable: true, ...extra,
    });
    // winit iterates getCoalescedEvents() where the browser has it — empty for a synthetic event.
    ev.getCoalescedEvents = () => [ev];
    canvas.dispatchEvent(ev);
  };
  const aim = (dx, dy) => {
    const r = canvas.getBoundingClientRect();
    const p = aimPoint(dx, dy, r.width, r.height);
    pointer('pointermove', r.left + p.x, r.top + p.y);
  };
  // A tap in the stick zone is a click for whatever the game drew there (menu picks, cards):
  // move the cursor, press on the next frame, release on the one after — glue buttons fire on
  // a release that lands on the button that took the press, so the press needs its own frame.
  const tapThrough = (x, y) => {
    pointer('pointermove', x, y);
    requestAnimationFrame(() => {
      pointer('pointerdown', x, y, { button: 0, buttons: 1 });
      requestAnimationFrame(() => pointer('pointerup', x, y, { button: 0, buttons: 0 }));
    });
  };

  let side = 'left';
  try { side = localStorage.getItem(SIDE_KEY) === 'right' ? 'right' : 'left'; } catch (_) {}
  root.classList.toggle('right', side === 'right');

  // ── touches ──
  // The zone covers the whole screen: the game never sees a finger directly (bevy's touch
  // picking does not reach the glue menus), so every touch is either the joystick — one that
  // starts in the stick area — or a tap, replayed as a click when it ends short and unmoved.
  let stick = null;       // { id, x0, y0, t0, moved }
  const taps = new Map(); // id → the same record, for every other finger
  zone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const rec = { id: t.identifier, x0: t.clientX, y0: t.clientY, t0: performance.now(), moved: false };
      if (!stick && inStickArea(t.clientX, t.clientY, innerWidth, innerHeight, side)) {
        stick = rec;
        ring.style.left = `${t.clientX}px`;
        ring.style.top = `${t.clientY}px`;
        knob.style.transform = '';
        ring.hidden = false;
      } else {
        taps.set(t.identifier, rec);
      }
    }
  }, { passive: false });
  zone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (stick && t.identifier === stick.id) {
        let dx = t.clientX - stick.x0, dy = t.clientY - stick.y0;
        const len = Math.hypot(dx, dy);
        if (len > RING) { dx *= RING / len; dy *= RING / len; }
        knob.style.transform = `translate(${dx}px,${dy}px)`;
        const codes = stickKeys(dx, dy);
        if (codes.length) { stick.moved = true; aim(dx, dy); }
        setHeld(codes);
      } else {
        const r = taps.get(t.identifier);
        if (r && Math.hypot(t.clientX - r.x0, t.clientY - r.y0) >= DEAD) r.moved = true;
      }
    }
  }, { passive: false });
  const end = (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const r = stick && t.identifier === stick.id ? stick : taps.get(t.identifier);
      if (!r) continue;
      if (r === stick) { setHeld([]); ring.hidden = true; stick = null; } else taps.delete(t.identifier);
      if (!r.moved && performance.now() - r.t0 < TAP_MS) tapThrough(r.x0, r.y0);
    }
  };
  zone.addEventListener('touchend', end, { passive: false });
  zone.addEventListener('touchcancel', end, { passive: false });

  // ── viewport ──
  // iOS leaves the canvas at its old size after a rotation (the resize lands before the new
  // viewport numbers do), so re-assert the viewport's size once it settles — but only on a real
  // orientation change: iOS also fires resizes for every toolbar slide, and each canvas resize
  // makes the renderer rebuild its targets, which stalls the boot.
  let portrait = innerHeight > innerWidth;
  const fit = () => {
    const w = innerWidth, h = innerHeight;
    const r = canvas.getBoundingClientRect();
    if (!w || !h || (Math.abs(r.width - w) < 2 && Math.abs(r.height - h) < 2)) return;
    document.documentElement.style.height = `${h}px`;
    document.body.style.height = `${h}px`;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  };
  const refit = () => {
    const now = innerHeight > innerWidth;
    if (now === portrait) return;
    portrait = now;
    setTimeout(fit, 300);
    setTimeout(fit, 1000);
  };
  window.addEventListener('resize', refit);
  window.addEventListener('orientationchange', refit);

  // ── buttons ──
  const press = (el, onDown, onUp) => {
    el.addEventListener('touchstart', (e) => { e.preventDefault(); onDown?.(); }, { passive: false });
    for (const ev of ['touchend', 'touchcancel']) {
      el.addEventListener(ev, (e) => { e.preventDefault(); onUp?.(); }, { passive: false });
    }
  };
  press(root.querySelector('.f'), () => key('keydown', 'KeyF'), () => key('keyup', 'KeyF'));
  press(root.querySelector('.pause'), null, () => { key('keydown', 'Escape'); key('keyup', 'Escape'); });
  press(root.querySelector('.swap'), null, () => {
    side = side === 'left' ? 'right' : 'left';
    root.classList.toggle('right', side === 'right');
    try { localStorage.setItem(SIDE_KEY, side); } catch (_) {}
  });

  // ── lifecycle ──
  // Hidden under the boot overlay; shown once boot.js has removed it.
  const show = () => {
    if (document.getElementById('wenilla-boot')) { setTimeout(show, 500); return; }
    root.classList.add('on');
  };
  show();
  // A backgrounded tab never gets the touchend: drop every hold.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    setHeld([]);
    ring.hidden = true;
    stick = null;
    taps.clear();
  });
  console.log(`touch: controls on (stick ${side}); ?touch=0 turns them off`);
}
