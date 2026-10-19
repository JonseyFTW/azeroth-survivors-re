# Touch Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a phone play Azeroth Survivors at wow.jonsey.net with an on-screen joystick, an **F** button and a pause button, and stop the iPhone boot crash.

**Architecture:** One page-side module `web/touch.js` draws an HTML overlay above the game canvas and drives the unchanged wasm client by dispatching synthetic `KeyboardEvent`s (W/A/S/D/F/Escape) and synthetic mouse-type `PointerEvent`s (for aim and for tap replay) on the canvas. A three-line shim in `web/index.html` stops winit's `webkitRequestFullscreen` crash on iOS. Spec: `docs/superpowers/specs/2026-10-19-touch-controls-design.md`.

**Tech Stack:** Plain ES modules, no build step for the page files; `node --test` (Node 24) for the pure functions, the built-in browser for the DOM path.

---

## File structure

| file | responsibility |
|---|---|
| `web/touch.js` (new) | `wantsTouch`, `stickKeys`, `aimPoint` (pure, tested) + `install()` (overlay DOM, touch handlers, key/pointer synthesis) |
| `web/tests/touch.test.mjs` (new) | node tests for the three pure functions |
| `web/index.html` | viewport meta, fullscreen shim, `import('./touch.js')` |
| `scripts/web-build.sh` | `web/touch.js` on the `cp` line |
| `CONTROLS.md` | "On a phone" section |

Facts the code relies on (verified in winit 0.30.13 and the survivors crates):
- winit's `keydown`/`keyup` listeners sit on the canvas and read `event.code`; they never check `isTrusted`.
- winit's `pointermove` handler treats any `pointerType` other than `"touch"` as the mouse, reads `offsetX/Y`, and on Chrome iterates `getCoalescedEvents()` (empty for synthetic events unless overridden).
- `set_pointer_capture` failures are caught (`let _e = …`), so synthetic `pointerdown` cannot panic the wasm.
- The survivors hero reads raw `KeyW/A/S/D`, faces the window cursor, and `F` aims at the cursor; `Escape` toggles pause.

---

### Task 1: Pure functions + tests

**Files:**
- Create: `web/touch.js`
- Create: `web/tests/touch.test.mjs`

- [ ] **Step 1: Write the failing tests**

`web/tests/touch.test.mjs`:
```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { wantsTouch, stickKeys, aimPoint } from '../touch.js';

test('wantsTouch: ?touch= overrides the media query', () => {
  assert.equal(wantsTouch('?touch=1', false), true);
  assert.equal(wantsTouch('?touch=0', true), false);
  assert.equal(wantsTouch('', true), true);
  assert.equal(wantsTouch('?bridge=hud', false), false);
});

test('stickKeys: dead zone, cardinals, diagonals (y is screen-down)', () => {
  assert.deepEqual(stickKeys(5, -5), []);
  assert.deepEqual(stickKeys(0, -50), ['KeyW']);
  assert.deepEqual(stickKeys(50, 0), ['KeyD']);
  assert.deepEqual(stickKeys(0, 50), ['KeyS']);
  assert.deepEqual(stickKeys(-50, 0), ['KeyA']);
  assert.deepEqual(stickKeys(40, -40), ['KeyW', 'KeyD']);
  assert.deepEqual(stickKeys(-40, -40), ['KeyW', 'KeyA']);
  assert.deepEqual(stickKeys(-40, 40), ['KeyS', 'KeyA']);
  assert.deepEqual(stickKeys(40, 40), ['KeyS', 'KeyD']);
});

test('aimPoint: 120 px from the canvas centre in the push direction', () => {
  assert.deepEqual(aimPoint(0, -50, 400, 800), { x: 200, y: 280 });
  assert.deepEqual(aimPoint(30, 0, 400, 800), { x: 320, y: 400 });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd C:\Scripts\azeroth-survivors-re && node --test web/tests/touch.test.mjs`
Expected: FAIL, `Cannot find module '…/web/touch.js'`.

- [ ] **Step 3: Write the pure half of `web/touch.js`**

```js
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
```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test web/tests/touch.test.mjs`
Expected: `# pass 3`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add web/touch.js web/tests/touch.test.mjs
git commit -m "touch.js: stick sector, aim point and activation rules, with tests"
```

---

### Task 2: Page wiring — viewport, fullscreen shim, import, build copy

**Files:**
- Modify: `web/index.html` (head, and the module script's platform.js import)
- Modify: `scripts/web-build.sh` (the `cp web/index.html …` line)

- [ ] **Step 1: Add the viewport meta and the shim to `web/index.html`**

After `<meta charset="utf-8">` insert:
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```
Immediately before `<script type="importmap">` insert:
```html
<script>
  // iPhone: a canvas has neither requestFullscreen nor webkitRequestFullscreen there, and
  // winit's fullscreen fallback calls the latter unconditionally — the client then panics at
  // boot ("arg0.webkitRequestFullscreen is not a function"). A no-op keeps it windowed.
  if (!HTMLCanvasElement.prototype.requestFullscreen && !HTMLCanvasElement.prototype.webkitRequestFullscreen) {
    HTMLCanvasElement.prototype.webkitRequestFullscreen = function () {};
  }
</script>
```

- [ ] **Step 2: Import touch.js next to platform.js**

In the `type="module"` script, after the `import('./platform.js')…` statement add:
```js
  // Phone controls (web/touch.js): a joystick + F + pause over the canvas, only on coarse-pointer
  // devices (or `?touch=1`). Dynamic, never load-bearing, same posture as platform.js.
  import('./touch.js')
    .then((m) => m.install())
    .catch((e) => console.warn('touch.js:', e));
```

- [ ] **Step 3: Ship it**

In `scripts/web-build.sh` change
```
cp web/index.html web/favicon.svg web/wasi_stubs.js web/boot.js web/platform.js web/bridge.js "${DIST}/"
```
to
```
cp web/index.html web/favicon.svg web/wasi_stubs.js web/boot.js web/platform.js web/bridge.js web/touch.js "${DIST}/"
```

- [ ] **Step 4: Check**

Run: `grep -c "touch.js" web/index.html scripts/web-build.sh`
Expected: `web/index.html:2` (comment + import) and `scripts/web-build.sh:1`.

- [ ] **Step 5: Commit**

```bash
git add web/index.html scripts/web-build.sh
git commit -m "index.html: viewport meta, iOS fullscreen shim, load touch.js; ship it"
```

---

### Task 3: The overlay — `install()`

**Files:**
- Modify: `web/touch.js` (append)

- [ ] **Step 1: Append `install()` and its helpers**

```js
const KEY = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', KeyF: 'f', Escape: 'Escape' };

const CSS = `
#wenilla-touch{position:fixed;inset:0;z-index:10;pointer-events:none;visibility:hidden;
  color:#fff;font:bold 24px/1 system-ui,sans-serif;-webkit-user-select:none;user-select:none}
#wenilla-touch.on{visibility:visible}
#wenilla-touch .zone{position:absolute;left:0;right:50%;top:25%;bottom:0;pointer-events:auto;touch-action:none}
#wenilla-touch.right .zone{left:50%;right:0}
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

  // ── joystick ──
  let stick = null; // { id, x0, y0, t0, moved }
  const own = (e) => stick && [...e.changedTouches].find((t) => t.identifier === stick.id);
  zone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (stick) return;
    const t = e.changedTouches[0];
    stick = { id: t.identifier, x0: t.clientX, y0: t.clientY, t0: performance.now(), moved: false };
    const z = zone.getBoundingClientRect();
    ring.style.left = `${t.clientX - z.left}px`;
    ring.style.top = `${t.clientY - z.top}px`;
    knob.style.transform = '';
    ring.hidden = false;
  }, { passive: false });
  zone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const t = own(e);
    if (!t) return;
    let dx = t.clientX - stick.x0, dy = t.clientY - stick.y0;
    const len = Math.hypot(dx, dy);
    if (len > RING) { dx *= RING / len; dy *= RING / len; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    const codes = stickKeys(dx, dy);
    if (codes.length) { stick.moved = true; aim(dx, dy); }
    setHeld(codes);
  }, { passive: false });
  const end = (e) => {
    const t = own(e);
    if (!t) return;
    e.preventDefault();
    setHeld([]);
    ring.hidden = true;
    if (!stick.moved && performance.now() - stick.t0 < TAP_MS) tapThrough(stick.x0, stick.y0);
    stick = null;
  };
  zone.addEventListener('touchend', end, { passive: false });
  zone.addEventListener('touchcancel', end, { passive: false });

  // ── buttons ──
  const press = (el, onDown, onUp) => {
    el.addEventListener('touchstart', (e) => { e.preventDefault(); onDown?.(); }, { passive: false });
    for (const ev of ['touchend', 'touchcancel']) {
      el.addEventListener(ev, (e) => { e.preventDefault(); onUp?.(); }, { passive: false });
    }
  };
  press(root.querySelector('.f'), () => key('keydown', 'KeyF'), () => key('keyup', 'KeyF'));
  press(root.querySelector('.pause'), null, () => { key('keydown', 'Escape'); key('keyup', 'Escape'); });

  let side = 'left';
  try { side = localStorage.getItem(SIDE_KEY) === 'right' ? 'right' : 'left'; } catch (_) {}
  root.classList.toggle('right', side === 'right');
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
  });
  console.log(`touch: controls on (stick ${side}); ?touch=0 turns them off`);
}
```

- [ ] **Step 2: Node tests still pass (the module must stay DOM-free at top level)**

Run: `node --test web/tests/touch.test.mjs`
Expected: `# pass 3`.

- [ ] **Step 3: Commit**

```bash
git add web/touch.js
git commit -m "touch.js: joystick, F, pause and swap-sides overlay driving the canvas"
```

---

### Task 4: CONTROLS.md

**Files:**
- Modify: `CONTROLS.md` (append)

- [ ] **Step 1: Append**

```markdown

## On a phone

On a touch screen the page draws controls over the game (`web/touch.js`): drag anywhere on the
lower half of the stick side to move (the hero faces the way you push), **F** casts the
movement spell that way, **⏸** pauses and resumes, **⇄** at the top swaps the stick to the
other side (remembered on that phone). Tap cards and menu items as usual. `?touch=0` hides the
controls; `?touch=1` shows them on a desktop. Needs a browser with WebGPU (iOS 26+ Safari or
Chrome).
```

- [ ] **Step 2: Commit**

```bash
git add CONTROLS.md
git commit -m "CONTROLS.md: phone controls"
```

---

### Task 5: Deploy to CT 140 and test on the desktop

**Files:** none in the repo. Server: `/opt/azeroth-survivors-re` in CT 140 (pve2, `192.168.1.45`).

- [ ] **Step 1: Push the branch**

Run (PC): `git push -u origin touch-controls` (origin = JonseyFTW fork).

- [ ] **Step 2: Switch the server to the branch and copy the page files**

Run (PC):
```bash
ssh -i ~/.ssh/id_ed25519_pve root@192.168.1.11 'pct exec 140 -- bash -c "cd /opt/azeroth-survivors-re && git remote add fork https://github.com/JonseyFTW/azeroth-survivors-re 2>/dev/null; git fetch -q fork && git checkout -q -B touch-controls fork/touch-controls && cp web/index.html web/touch.js web/dist/ && brotli -f -q 5 web/dist/touch.js -o web/dist/touch.js.br && gzip -kf -6 web/dist/touch.js && git log --oneline -1 && ls -la web/dist/touch.js*"'
```
Expected: the latest commit hash and three `touch.js*` files. No wasm rebuild and no service restart (static files are served `no-cache`).

- [ ] **Step 3: Check it serves**

Run: `curl -s -o /dev/null -w "%{http_code}\n" https://wow.jonsey.net/touch.js` → `200`;
`curl -s https://wow.jonsey.net/ | grep -c "touch.js\|webkitRequestFullscreen\|viewport"` → `3`.

- [ ] **Step 4: Desktop regression**

Built-in browser, `https://wow.jonsey.net/`: no `#wenilla-touch` element (`document.getElementById('wenilla-touch')` is `null`), no `touch:` console line, menu loads as before.

- [ ] **Step 5: Overlay logic in the built-in browser**

Built-in browser, mobile preset, `https://wow.jonsey.net/?touch=1`. Wait for the menu. Verify with `javascript_tool`:
1. `document.getElementById('wenilla-touch').classList.contains('on')` → `true` once the boot overlay is gone.
2. Synthetic touch on the zone: dispatch `new TouchEvent('touchstart', {touches:[t], changedTouches:[t], bubbles:true})` with a `Touch` at the zone centre, then `touchmove` 50 px up → the ring shows and `console` has no errors; dispatch `touchend` → ring hidden.
3. Start a run (tap replay: a short touchstart/touchend on "Enter World" via the zone when the layout puts it there; otherwise click it), then repeat step 2 holding 50 px up for 2 s and screenshot: the hero moved up-screen and faces up. Repeat right → moved right. If the hero moves the opposite way to the push, the camera's world axes are flipped relative to the screen: swap the signs in `SECTORS`/`aimPoint` and re-test.
4. `touchstart`/`touchend` on `.f` → console shows the mobility cast or the hero dashes (level 5+ only; below that, no error is enough).
5. `touchend` on `.pause` → game paused; again → resumed.
6. `touchend` on `.swap` → `root.classList.contains('right')` true, `localStorage['wenilla.touch.side'] === 'right'`; reload → still right.

- [ ] **Step 6: Fix anything found, commit, re-run Step 2**

---

### Task 6: Phone test (owner)

- [ ] On the iPhone (Chrome, then Safari): open https://wow.jonsey.net. Report: (a) past the old error? (b) does the menu appear? (c) does the world load, and roughly how smooth? (d) joystick/F/pause work?
- [ ] If (c) is "no" or unplayable, stop: the phone cannot run the engine; the branch still fixes the crash and is harmless on desktop.
