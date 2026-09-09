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

// ---- sprites block (Task 18) ----------------------------------------------
// Mirrors the asset check above: a theme may declare no `sprites` block at
// all (the base `validTheme()` fixture does, and stays fully valid); only a
// declared block must resolve to a real file and have `rows`/`counts` in
// agreement.

function validSprites(overrides) {
  return Object.assign({
    sheet: 'assets/themes/leaf/naruto-sheet.webp',
    cell: { w: 78, h: 87 },
    cols: 6,
    rows: { runRight: 0, runLeft: 1, idle: 2, work: 3 },
    counts: { runRight: 6, runLeft: 6, idle: 4, work: 4 },
  }, overrides || {});
}

test('problemsFor: a sprites.sheet that does not exist on disk is reported', () => {
  const OV = ov();
  const theme = validTheme();
  theme.sprites = validSprites({ sheet: 'assets/themes/fixture/no-such-sheet.webp' });
  const problems = problemsFor(OV, theme);
  assert.ok(
    problems.some((p) => p.includes('assets/themes/fixture/no-such-sheet.webp')),
    'expected a problem mentioning the missing sheet path, got: ' + JSON.stringify(problems)
  );
});

test('problemsFor: sprites.rows and sprites.counts key sets disagreeing is reported', () => {
  const OV = ov();
  const theme = validTheme();
  theme.sprites = validSprites({ counts: { runRight: 6, runLeft: 6, idle: 4 } }); // missing 'work'
  const problems = problemsFor(OV, theme);
  assert.ok(
    problems.some((p) => p.includes('rows') && p.includes('counts')),
    'expected a problem about the rows/counts key mismatch, got: ' + JSON.stringify(problems)
  );
});

test('problemsFor: a sprites.rows index outside 0..rows-1 is reported', () => {
  const OV = ov();
  const theme = validTheme();
  theme.sprites = validSprites({ rows: { runRight: 0, runLeft: 1, idle: 2, work: 9 } });
  const problems = problemsFor(OV, theme);
  assert.ok(
    problems.some((p) => p.includes('work') && p.includes('9')),
    'expected a problem about the out-of-range row index, got: ' + JSON.stringify(problems)
  );
});

test('problemsFor: a sprites.counts value below 1 is reported', () => {
  const OV = ov();
  const theme = validTheme();
  theme.sprites = validSprites({ counts: { runRight: 6, runLeft: 6, idle: 4, work: 0 } });
  const problems = problemsFor(OV, theme);
  assert.ok(
    problems.some((p) => p.includes('counts') && p.includes('work')),
    'expected a problem about the invalid frame count, got: ' + JSON.stringify(problems)
  );
});

test('problemsFor: a valid sprites block referencing the real leaf sheet is reported clean', () => {
  const OV = ov();
  const theme = validTheme();
  theme.sprites = validSprites();
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
