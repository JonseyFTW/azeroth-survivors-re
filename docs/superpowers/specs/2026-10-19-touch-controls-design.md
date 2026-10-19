# Touch controls for phones — design

_2026-10-19. Branch `touch-controls` on JonseyFTW/azeroth-survivors-re._

## Goal

Let a friend open wow.jonsey.net on a phone and play with one thumb on a joystick and the
other on an **F** button. Today a phone shows "The client failed to start:
arg0.webkitRequestFullscreen is not a function" and, even past that, has no way to press
W/A/S/D.

## Non-goals

- Tap-to-move, gyroscope steering, jump, free camera (**C**), the picture filter (**G**).
- Engine (Rust) changes. Everything here is page-side, in `web/`, per AGENTS.md ("the page
  side … ours").
- The realm page (`crates/wenilla-realm/templates/play.html`). Only the dev page
  `web/index.html` is served here.
- Making the game *run well* on a phone. Whether a given phone can run a 77 MB single-threaded
  wasm engine is unknown until tried; this work removes the two blockers (crash, no input) so
  that can be tried.

## How the game takes input today (what the overlay has to fake)

- `survivors/hero.rs::drive_hero` reads raw keys: W/S/A/D (or arrows) are **world-relative**
  in the default locked top-down camera, so pushing "up" on screen is W.
- The hero **faces the mouse cursor** (`aim_cursor` → `windows.single().cursor_position()`),
  and **F** (`mobility.rs`) aims at that cursor. The bridge's `hold('MOVEFORWARD')` commands go
  through the WoW binding table, which the survivors hero does not read, so the bridge is no
  use for movement.
- winit (0.30.13, web backend) turns `pointermove` events with `pointerType: "touch"` into
  touch events, not cursor moves, so a finger never moves the cursor. Its `keydown`/`keyup`
  listeners sit on the canvas and read `event.code`; they do not check `isTrusted`.
- On iPhone, winit's fullscreen request calls `canvas.webkitRequestFullscreen()` when
  `requestFullscreen` is missing; iOS has neither on a canvas, so the wasm panics at boot.

## Design

One new module, `web/touch.js`, imported dynamically by `web/index.html` the same way
`platform.js` and `bridge.js` are: unawaited, never load-bearing. Added to the `cp` line in
`scripts/web-build.sh` so it ships (AGENTS.md invariant).

### 1. Activation

- On when `matchMedia('(hover: none) and (pointer: coarse)')` matches (phones, tablets).
  Desktops never see it.
- `?touch=1` forces on, `?touch=0` forces off (for desktop testing with device emulation, and
  for a phone with a keyboard).

### 2. Fullscreen shim (must run before the wasm starts)

In `index.html`, before `boot(init)`: if the canvas has no `requestFullscreen`, define
`HTMLCanvasElement.prototype.webkitRequestFullscreen = function () {}` (a no-op). winit then
calls the no-op and carries on windowed. Guarded so browsers that have the real API are
untouched. This is inline in `index.html`, not in `touch.js`, because it has to exist before
instantiation and the module loads are unawaited.

### 3. Joystick

- The stick half of the screen (left by default) is a transparent touch zone. On
  `touchstart` a ring (radius 60 px) is drawn centred on the finger; the knob follows the
  finger, clamped to the ring. `touchend` removes it.
- Direction → keys: angle snapped to 8 sectors; a dead zone of 18 px (no keys). Each sector
  holds the matching set of W/A/S/D: up = W, up-right = W+D, etc. Holds are sent as
  synthetic `keydown` (with `repeat: true` after the first) and ended with `keyup`, dispatched
  on the canvas with `code`/`key` set (`KeyW`/`w` …).
- Aim: every time the joystick direction changes (and on a timer while held, ~30 Hz), a
  synthetic `pointermove` with `pointerType: 'mouse'`, `pointerId: 1`, `isPrimary: true`,
  `buttons: 0` is dispatched on the canvas at the screen point **120 px from screen centre
  in the push direction**. The hero stands at screen centre in the locked camera, so he faces
  where the stick points and **F** fires that way. When the stick is released the cursor stays
  where it was, so the hero keeps facing the last direction.
  Two winit details the synthesis must satisfy: it reads the position from `offsetX/Y`
  (browsers derive those from `clientX/Y` for synthetic events, so set `clientX/Y`), and on
  Chrome it iterates `getCoalescedEvents()`, which is **empty for a synthetic event** — so the
  synthetic event gets its own `getCoalescedEvents = () => [ev]` before dispatch.
- Only the first touch in the zone is the stick; extra fingers in the zone are ignored.

### 4. Buttons

- **F**: 72 px round button near the other thumb (bottom of the button half). `touchstart` →
  `keydown KeyF`, `touchend` → `keyup KeyF`.
- **Pause** (`⏸`): 44 px, top of the button half. Tap → `keydown`+`keyup Escape`. The game
  toggles Playing ↔ Paused on Esc, so the same button resumes.
- **Swap sides** (`⇄`): 44 px, top centre. Mirrors the layout; saved in
  `localStorage['wenilla.touch.side']` (`'left'` | `'right'`, default `'left'` = stick on the
  left).
- Level-up cards, Enter World, Randomize, the zone list and the race/class picks are already
  clickable; a touch generates a click, so nothing is added for them.

### 5. Visibility

The overlay is in the DOM from page load but hidden (`visibility: hidden`) while the boot
overlay `#wenilla-boot` exists; touch.js polls for its removal every 500 ms and then shows
itself. It stays visible in menus; the joystick does nothing there (the game ignores WASD
outside Playing).

### 6. Styling

Semi-transparent white rings/buttons (`rgba(255,255,255,.25)` fill, `.6` border), no images,
`touch-action: none`, `user-select: none`, `pointer-events: none` on the container and `auto`
only on the zones/buttons so the rest of the screen still reaches the canvas for menu taps.
Safe-area insets respected (`env(safe-area-inset-*)`).

### 7. Error handling

Everything is best-effort like platform.js: feature-detected, every handler in try/catch,
failure logs a `console.warn('touch:', e)` and the game plays as before. Releasing a touch
that was never tracked is a no-op. On `visibilitychange` to hidden, all holds are released
(keyup for every held key) so a backgrounded phone does not run the hero into a wall.

### 8. Testing

1. Desktop Chrome, `?touch=1`, DevTools device toolbar (touch emulation): stick appears under
   the pointer, hero moves in all 8 directions, faces the push direction, F fires that way,
   Pause toggles, Swap mirrors and persists across reload. Also `?touch=0` hides it.
2. Desktop Chrome without the flag: overlay absent, no console warnings from touch.js.
3. iPhone (Chrome and Safari): page passes the old crash point (shim). Record whether the
   world loads and the rough frame rate. If it does not run, stop here and report.
4. Server: `scripts/web-build.sh` output contains `touch.js`.

### 9. Deploy

CT 140: `/opt/azeroth-survivors-re` adds remote `fork` → JonseyFTW, checks out
`touch-controls`. Since only `web/*.js` and `index.html` change, the wasm is untouched:
re-running `scripts/web-build.sh` would rebuild it needlessly (12 min), so the deploy copies
the changed page files into `web/dist/` directly (a `make`-free `cp` of the same list
`web-build.sh` uses) and does not restart wenilla-host (static files are read per request,
`no-cache`).

## Files

| file | change |
|---|---|
| `web/touch.js` | new: activation, joystick, buttons, swap, key/pointer synthesis |
| `web/index.html` | the fullscreen shim (inline, before boot) + `import('./touch.js')` |
| `scripts/web-build.sh` | `touch.js` on the `cp` line |
| `CONTROLS.md` | a short "On a phone" section |
