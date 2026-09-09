const test = require('node:test');
const assert = require('node:assert');
const { loadOV } = require('../tools/browser-module');

// js/sprite.js's rowForState is a pure function with no DOM dependency, so it
// loads straight out of the sandbox with just config.js for OV.STATES.
function loadSprite() {
  return loadOV(['js/config.js', 'js/sprite.js']);
}

test('rowForState: WORKING is always the work row, regardless of facing', () => {
  const OV = loadSprite();
  ['up', 'down', 'left', 'right'].forEach((facing) => {
    assert.equal(OV.Sprite.rowForState(OV.STATES.WORKING, facing, null), 'work');
  });
});

test('rowForState: WALKING facing right is runRight', () => {
  const OV = loadSprite();
  assert.equal(OV.Sprite.rowForState(OV.STATES.WALKING, 'right', null), 'runRight');
  assert.equal(OV.Sprite.rowForState(OV.STATES.WALKING, 'right', 'left'), 'runRight');
});

test('rowForState: WALKING facing left is runLeft', () => {
  const OV = loadSprite();
  assert.equal(OV.Sprite.rowForState(OV.STATES.WALKING, 'left', null), 'runLeft');
  assert.equal(OV.Sprite.rowForState(OV.STATES.WALKING, 'left', 'right'), 'runLeft');
});

test('rowForState: WALKING facing up/down reuses the agent\'s last horizontal facing', () => {
  const OV = loadSprite();
  assert.equal(OV.Sprite.rowForState(OV.STATES.WALKING, 'up', 'left'), 'runLeft');
  assert.equal(OV.Sprite.rowForState(OV.STATES.WALKING, 'down', 'left'), 'runLeft');
  assert.equal(OV.Sprite.rowForState(OV.STATES.WALKING, 'up', 'right'), 'runRight');
  assert.equal(OV.Sprite.rowForState(OV.STATES.WALKING, 'down', 'right'), 'runRight');
});

test('rowForState: WALKING facing up/down defaults to runRight when the agent has never moved horizontally', () => {
  const OV = loadSprite();
  assert.equal(OV.Sprite.rowForState(OV.STATES.WALKING, 'up', null), 'runRight');
  assert.equal(OV.Sprite.rowForState(OV.STATES.WALKING, 'down', null), 'runRight');
});

test('rowForState: every other state (IDLE, WAITING, THINKING, COLLABORATING, ERROR, COMPLETED) is the idle row', () => {
  const OV = loadSprite();
  ['IDLE', 'WAITING', 'THINKING', 'COLLABORATING', 'ERROR', 'COMPLETED'].forEach((key) => {
    assert.equal(OV.Sprite.rowForState(OV.STATES[key], 'down', null), 'idle', key + ' should be the idle row');
    assert.equal(OV.Sprite.rowForState(OV.STATES[key], 'left', 'right'), 'idle', key + ' should be the idle row regardless of facing');
  });
});

// ---- theme wiring: office declares no sprites, leaf does ------------------
// The state→row function above decides *which* row to show once an agent is
// already frame-animated; this covers the other required behaviour — whether
// an agent is frame-animated at all is decided per-theme in
// js/themes/index.js's apply(), not inside Agent's DOM code.

test('office theme yields no sprites config on any built agent def (the emoji path is chosen)', () => {
  const OV = loadOV(['js/config.js', 'js/nav.js', 'js/themes/index.js', 'js/themes/office.js']);
  OV.Themes.apply('office');
  assert.ok(OV.AGENT_DEFS.length > 0, 'sanity: office has agents');
  OV.AGENT_DEFS.forEach((def) => {
    // strictEqual, not a truthiness check: `undefined` is as falsy as `null`,
    // so a truthiness assertion would still pass if the `sprites:` line in
    // js/themes/index.js's apply() were deleted outright rather than
    // correctly resolving to null. This must fail in that case, because
    // Agent's constructor relies on an explicit `null` (via `def.sprites ||
    // null`) either way — but the *reason* it's null matters for catching a
    // future regression here.
    assert.ok(Object.prototype.hasOwnProperty.call(def, 'sprites'), def.id + ' def should have a sprites key at all');
    assert.strictEqual(def.sprites, null, def.id + ' should have no sprites config');
  });
});

test('leaf theme applies its shared sprites sheet config to every cast member', () => {
  const OV = loadOV(['js/config.js', 'js/nav.js', 'js/themes/index.js', 'js/themes/leaf.js']);
  OV.Themes.apply('leaf');
  const leaf = OV.Themes.get('leaf');
  assert.ok(leaf.sprites && leaf.sprites.sheet, 'sanity: leaf declares a sprites block');
  assert.ok(OV.AGENT_DEFS.length > 0);
  OV.AGENT_DEFS.forEach((def) => {
    assert.deepEqual(def.sprites, leaf.sprites);
  });
});
