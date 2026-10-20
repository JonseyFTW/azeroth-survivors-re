import assert from 'node:assert/strict';
import test from 'node:test';
import { wantsTouch, stickKeys, aimPoint, inStickArea } from '../touch.js';

test('inStickArea: the stick side, below the top quarter', () => {
  assert.equal(inStickArea(100, 400, 800, 600, 'left'), true);
  assert.equal(inStickArea(700, 400, 800, 600, 'left'), false);
  assert.equal(inStickArea(100, 100, 800, 600, 'left'), false);
  assert.equal(inStickArea(700, 400, 800, 600, 'right'), true);
  assert.equal(inStickArea(100, 400, 800, 600, 'right'), false);
});

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
