const test = require('node:test');
const assert = require('node:assert');
const { loadOV } = require('../tools/browser-module');
const { problemsFor } = require('../tools/validate-themes');

// The three checks under test here (asset existence, ambient_* key agreement,
// castByType targets) are layered on top of OV.Themes.validate inside
// tools/validate-themes.js itself — see tests/themes.test.js for coverage of
// the base slot/edge/cast contract. These tests exist because each of the
// three was added after a review found the exact silent-failure class it now
// catches; deleting any one of them from problemsFor must fail its test here.

const REQUIRED_SLOTS = [
  'ORCHESTRATOR_HOME', 'THINK_SPOT', 'BREAK_SPOT', 'AMBIENT_SPOT', 'GATHER_SPOT',
  'WORKER_1', 'WORKER_2', 'WORKER_3', 'WORKER_4',
  'OVERFLOW_1', 'OVERFLOW_2', 'OVERFLOW_3', 'OVERFLOW_4', 'OVERFLOW_5', 'OVERFLOW_6',
];

// A fully valid theme: every required slot present, a star of edges connecting
// every slot to ORCHESTRATOR_HOME (so the connectivity check passes), a
// castByType target that names a real cast id, and an ambient_* strings key
// that names a real slot. No assets referenced at all, matching how Hidden
// Leaf currently ships (emoji-only) — the base case must stay asset-free and
// still be considered fully valid.
function validTheme() {
  const slots = {};
  REQUIRED_SLOTS.forEach((name, i) => {
    slots[name] = { x: i * 5, y: i * 5, face: 'down', label: name };
  });
  const edges = REQUIRED_SLOTS
    .filter((name) => name !== 'ORCHESTRATOR_HOME')
    .map((name) => ['ORCHESTRATOR_HOME', name]);

  return {
    id: 'fixture',
    name: 'Fixture',
    slots: slots,
    waypoints: {},
    edges: edges,
    furniture: [],
    cast: [
      { slot: 'ORCHESTRATOR_HOME', id: 'claude', name: 'Claude', role: 'Orchestrator', emoji: '*', color: '#fff' },
      { slot: 'WORKER_1', id: 'builder', name: 'Builder', role: 'Engineer', emoji: '*', color: '#fff' },
    ],
    castByType: { sometype: 'builder' },
    strings: { ambient_THINK_SPOT: 'thinking…' },
    palette: {},
    effects: { spawn: 'none', despawn: 'none' },
  };
}

function ov() {
  return loadOV(['js/config.js', 'js/nav.js', 'js/themes/index.js']);
}

test('problemsFor: a fully valid theme reports no problems', () => {
  const OV = ov();
  assert.deepEqual(problemsFor(OV, validTheme()), []);
});

test('problemsFor: castByType naming an unknown cast id is reported', () => {
  const OV = ov();
  const theme = validTheme();
  theme.castByType = { sometype: 'no-such-cast-id' };
  const problems = problemsFor(OV, theme);
  assert.ok(
    problems.some((p) => p.includes('no-such-cast-id')),
    'expected a problem mentioning the bad castByType target, got: ' + JSON.stringify(problems)
  );
});

test('problemsFor: an ambient_* strings key naming an unknown slot is reported', () => {
  const OV = ov();
  const theme = validTheme();
  theme.strings = { ambient_NOWHERE_SPOT: 'lost' };
  const problems = problemsFor(OV, theme);
  assert.ok(
    problems.some((p) => p.includes('ambient_NOWHERE_SPOT')),
    'expected a problem mentioning the bad strings key, got: ' + JSON.stringify(problems)
  );
});

test('problemsFor: a referenced asset that is missing on disk is reported', () => {
  const OV = ov();
  const theme = validTheme();
  theme.assets = { base: '' };
  theme.cast = theme.cast.map((c) => (c.id === 'builder' ? Object.assign({}, c, { sprite: 'no/such/sprite.png' }) : c));
  const problems = problemsFor(OV, theme);
  assert.ok(
    problems.some((p) => p.includes('no/such/sprite.png')),
    'expected a problem mentioning the missing asset path, got: ' + JSON.stringify(problems)
  );
});

test('problemsFor: effects.spawnSound pointing at a missing file is reported', () => {
  const OV = ov();
  const theme = validTheme();
  theme.effects = { spawn: 'none', despawn: 'none', spawnSound: 'assets/themes/fixture/does-not-exist.mp3' };
  const problems = problemsFor(OV, theme);
  assert.ok(
    problems.some((p) => p.includes('assets/themes/fixture/does-not-exist.mp3')),
    'expected a problem mentioning the missing spawnSound path, got: ' + JSON.stringify(problems)
  );
});

test('problemsFor: a valid effects.spawnSound path is reported clean', () => {
  const OV = ov();
  const theme = validTheme();
  // Real, committed file — exercises the happy path against the repo's own asset.
  theme.effects = { spawn: 'none', despawn: 'none', spawnSound: 'assets/themes/leaf/shadow_clone_jutsu.mp3' };
  assert.deepEqual(problemsFor(OV, theme), []);
});

test('problemsFor: a slot with no edge connecting it is reported as stranded', () => {
  const OV = ov();
  const theme = validTheme();
  theme.edges = theme.edges.filter((pair) => pair.indexOf('WORKER_1') === -1);
  const problems = problemsFor(OV, theme);
  assert.ok(
    problems.some((p) => p.includes('stranded') && p.includes('WORKER_1')),
    'expected a problem marking WORKER_1 stranded, got: ' + JSON.stringify(problems)
  );
});
