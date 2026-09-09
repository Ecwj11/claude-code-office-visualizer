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

test('leaf theme gives every cast member its OWN sheet, not the shared fallback', () => {
  const OV = loadOV(['js/config.js', 'js/nav.js', 'js/themes/index.js', 'js/themes/leaf.js']);
  OV.Themes.apply('leaf');
  const leaf = OV.Themes.get('leaf');
  assert.ok(leaf.sprites && leaf.sprites.sheet, 'sanity: leaf still declares a fallback block');
  assert.ok(OV.AGENT_DEFS.length > 0);

  OV.AGENT_DEFS.forEach((def) => {
    const entry = leaf.cast.find((c) => c.id === def.id);
    assert.ok(entry.sprites, def.id + ' should declare its own sprites block');
    assert.deepEqual(def.sprites, entry.sprites, def.id + ' should resolve to its own sheet');
  });

  // Distinctness matters as much as presence: if two entries were copy-pasted
  // with the same file, or an entry were dropped so it silently inherited the
  // fallback, the assertions above would still pass.
  const sheets = OV.AGENT_DEFS.map((d) => d.sprites.sheet);
  assert.equal(new Set(sheets).size, sheets.length, 'every cast member needs a distinct sheet: ' + sheets.join(', '));
});

test('leaf: every sheet declares the shipped geometry (88x87 cells, 8 columns)', () => {
  const OV = loadOV(['js/config.js', 'js/nav.js', 'js/themes/index.js', 'js/themes/leaf.js']);
  OV.Themes.apply('leaf');
  const leaf = OV.Themes.get('leaf');

  // The real .webp files are 704x348 = 8 columns of 88 by 4 rows of 87. Nothing
  // else asserted these numbers, so reverting sheetFor() to the pre-migration
  // 78x87/6-column geometry used to pass every test while mis-slicing every
  // frame in the browser. css/styles.css derives width, background-size and the
  // keyframe offsets from exactly these values.
  const expectGeometry = (sp, who) => {
    assert.equal(sp.cell.w, 88, who + ' cell width');
    assert.equal(sp.cell.h, 87, who + ' cell height');
    assert.equal(sp.cols, 8, who + ' column count');
    assert.deepEqual(sp.rows, { runRight: 0, runLeft: 1, idle: 2, work: 3 }, who + ' row map');
  };

  OV.AGENT_DEFS.forEach((def) => expectGeometry(def.sprites, def.id));
  // The fallback matters just as much: it is what every runtime shadow clone uses.
  expectGeometry(leaf.sprites, 'theme-level fallback');
});

test('leaf: Shikamaru keeps his 6-frame run cycles while the rest have 8', () => {
  const OV = loadOV(['js/config.js', 'js/nav.js', 'js/themes/index.js', 'js/themes/leaf.js']);
  OV.Themes.apply('leaf');
  const byId = {};
  OV.AGENT_DEFS.forEach((d) => { byId[d.id] = d; });

  // Guards the short-row case: his sheet has 8 columns but only 6 run frames,
  // so the trailing two cells are empty and must never be stepped into.
  assert.equal(byId.validator.sprites.counts.runRight, 6);
  assert.equal(byId.validator.sprites.counts.runLeft, 6);
  assert.equal(byId.validator.sprites.cols, 8);
  ['claude', 'builder', 'test', 'debugger'].forEach((id) => {
    assert.equal(byId[id].sprites.counts.runRight, 8, id + ' runs 8 frames');
    assert.equal(byId[id].sprites.counts.runLeft, 8, id + ' runs 8 frames');
  });
  // idle/work are 4 across the whole cast.
  OV.AGENT_DEFS.forEach((d) => {
    assert.equal(d.sprites.counts.idle, 4);
    assert.equal(d.sprites.counts.work, 4);
  });
});
