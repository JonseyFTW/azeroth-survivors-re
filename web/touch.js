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
