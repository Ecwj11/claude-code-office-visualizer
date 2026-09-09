const test = require('node:test');
const assert = require('node:assert');
const { loadOV } = require('../tools/browser-module');

function minimalTheme(overrides) {
  const slots = {};
  ['ORCHESTRATOR_HOME', 'THINK_SPOT', 'BREAK_SPOT', 'AMBIENT_SPOT', 'GATHER_SPOT',
   'WORKER_1', 'WORKER_2', 'WORKER_3', 'WORKER_4',
   'OVERFLOW_1', 'OVERFLOW_2', 'OVERFLOW_3', 'OVERFLOW_4', 'OVERFLOW_5', 'OVERFLOW_6',
  ].forEach(function (name, i) {
    slots[name] = { x: i * 5, y: i * 5, face: 'down', label: name };
  });
  return Object.assign({
    id: 't', name: 'T',
    slots: slots,
    waypoints: {},
    edges: [],
    furniture: [],
    cast: [{ slot: 'ORCHESTRATOR_HOME', id: 'claude', name: 'C', role: 'R', emoji: '*', color: '#fff' }],
    palette: {},
    effects: { spawn: 'none', despawn: 'none' },
  }, overrides || {});
}

test('validate accepts a complete theme', () => {
  const OV = loadOV(['js/config.js', 'js/nav.js', 'js/themes/index.js']);
  const result = OV.Themes.validate(minimalTheme());
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

test('validate rejects a missing slot', () => {
  const OV = loadOV(['js/config.js', 'js/nav.js', 'js/themes/index.js']);
  const bad = minimalTheme();
  delete bad.slots.OVERFLOW_6;
  const result = OV.Themes.validate(bad);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('OVERFLOW_6')));
});

test('validate rejects an edge pointing at an unknown node', () => {
  const OV = loadOV(['js/config.js', 'js/nav.js', 'js/themes/index.js']);
  const result = OV.Themes.validate(minimalTheme({ edges: [['ORCHESTRATOR_HOME', 'NOWHERE']] }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('NOWHERE')));
});

test('validate rejects a cast entry bound to an unknown slot', () => {
  const OV = loadOV(['js/config.js', 'js/nav.js', 'js/themes/index.js']);
  const bad = minimalTheme({
    cast: [{ slot: 'DESK_OF_HOLDING', id: 'claude', name: 'C', role: 'R', color: '#fff' }],
  });
  const result = OV.Themes.validate(bad);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('DESK_OF_HOLDING')));
});

test('apply rejects an invalid theme and keeps the previous one active', () => {
  const OV = loadOV(['js/config.js', 'js/nav.js', 'js/themes/index.js']);
  OV.Themes.register(minimalTheme({ id: 'good' }));
  const broken = minimalTheme({ id: 'bad' });
  delete broken.slots.WORKER_1;
  OV.Themes.register(broken);

  assert.equal(OV.Themes.apply('good'), true);
  assert.equal(OV.Themes.apply('bad'), false);
  assert.equal(OV.Themes.active.id, 'good');
});

test('apply publishes the layout and rebuilds navigation', () => {
  const OV = loadOV(['js/config.js', 'js/nav.js', 'js/themes/index.js']);
  OV.Themes.register(minimalTheme({
    id: 'x',
    waypoints: { WP: { x: 1, y: 1 } },
    edges: [['ORCHESTRATOR_HOME', 'WP']],
  }));
  OV.Themes.apply('x');

  assert.equal(OV.LOCATIONS.ORCHESTRATOR_HOME.label, 'ORCHESTRATOR_HOME');
  assert.ok(OV.Nav.nodes.WP);
  assert.equal(OV.AGENT_DEFS[0].home, 'ORCHESTRATOR_HOME');
});

test('office theme satisfies the slot contract and keeps v1.0.2 coordinates', () => {
  const OV = loadOV(['js/config.js', 'js/nav.js', 'js/themes/index.js', 'js/themes/office.js']);
  const office = OV.Themes.get('office');
  assert.ok(office, 'office theme is registered');
  assert.deepEqual(OV.Themes.validate(office).errors, []);

  assert.deepEqual(office.slots.ORCHESTRATOR_HOME, { x: 50, y: 26, face: 'up', label: "Claude's desk" });
  assert.deepEqual(office.slots.THINK_SPOT, { x: 11, y: 22, face: 'left', label: 'Whiteboard' });
  assert.deepEqual(office.slots.OVERFLOW_5, { x: 50, y: 72, face: 'down', label: 'Station' });

  const ids = office.cast.map((c) => c.id).sort();
  assert.deepEqual(ids, ['builder', 'claude', 'debugger', 'test', 'validator']);
});

test('office theme routes builder to the orchestrator without crossing a desk', () => {
  const OV = loadOV(['js/config.js', 'js/nav.js', 'js/themes/index.js', 'js/themes/office.js']);
  OV.Themes.apply('office');
  const path = OV.Nav.findPath('WORKER_1', 'ORCHESTRATOR_HOME');
  assert.ok(path.length > 2, 'route goes through the hallway graph, not straight through furniture');
  assert.equal(path[0], 'WORKER_1');
  assert.equal(path[path.length - 1], 'ORCHESTRATOR_HOME');
});

test('leaf theme satisfies the slot contract', () => {
  const OV = loadOV(['js/config.js', 'js/nav.js', 'js/themes/index.js', 'js/themes/leaf.js']);
  const leaf = OV.Themes.get('leaf');
  assert.ok(leaf, 'leaf theme is registered');
  assert.deepEqual(OV.Themes.validate(leaf).errors, []);
  assert.deepEqual(leaf.effects, {
    spawn: 'jutsu', despawn: 'poof',
    spawnSound: 'assets/themes/leaf/shadow_clone_jutsu.mp3',
  });
});

test('leaf theme uses the theme-invariant agent ids', () => {
  const OV = loadOV(['js/config.js', 'js/nav.js', 'js/themes/index.js', 'js/themes/leaf.js']);
  const ids = OV.Themes.get('leaf').cast.map((c) => c.id).sort();
  assert.deepEqual(ids, ['builder', 'claude', 'debugger', 'test', 'validator']);
});

test('leaf graph connects every slot to the orchestrator', () => {
  const OV = loadOV(['js/config.js', 'js/nav.js', 'js/themes/index.js', 'js/themes/leaf.js']);
  OV.Themes.apply('leaf');
  OV.Themes.REQUIRED_SLOTS.forEach((slot) => {
    const p = OV.Nav.findPath(slot, 'ORCHESTRATOR_HOME');
    assert.ok(p.length >= 1 && p[p.length - 1] === 'ORCHESTRATOR_HOME',
      slot + ' cannot reach ORCHESTRATOR_HOME');
    if (slot !== 'ORCHESTRATOR_HOME') {
      assert.ok(p.length > 1, slot + ' is stranded (no route found)');
    }
  });
});

// castFor: resolves a live subagent's appearance from the active theme. Pure,
// theme-driven logic with no DOM dependency, so it's testable straight out of
// the sandbox loader without a World/Agent stub.
test('castFor: office returns null for every subagent type, even one with a matching cast id', () => {
  const OV = loadOV([
    'js/config.js', 'js/nav.js', 'js/themes/index.js',
    'js/themes/office.js', 'js/themes/leaf.js', 'js/events.js',
  ]);
  OV.Themes.apply('office');
  // Office DOES have a cast entry with id 'builder' — this must still be null,
  // proving the guard keys off the theme declaring castByType, not off a cast
  // id happening to exist. That distinction is what keeps office unchanged.
  assert.equal(OV.Events.castFor('builder'), null);
  assert.equal(OV.Events.castFor('anything-else'), null);
});

test('castFor: leaf maps a known subagent type to that character\'s look', () => {
  const OV = loadOV([
    'js/config.js', 'js/nav.js', 'js/themes/index.js',
    'js/themes/office.js', 'js/themes/leaf.js', 'js/events.js',
  ]);
  OV.Themes.apply('leaf');
  const cast = OV.Events.castFor('builder');
  assert.equal(cast.emoji, '⚡');
  assert.equal(cast.color, '#6ea8fe');
  assert.equal(cast.isClone, false);
  // A mapped subagent borrows that character's OWN art, not the fallback sheet.
  const builderEntry = OV.Themes.get('leaf').cast.find((c) => c.id === 'builder');
  assert.deepEqual(cast.sprites, builderEntry.sprites);
  assert.match(cast.sprites.sheet, /sasuke-sheet\.webp$/);
});

test('castFor: leaf turns an unmapped subagent type into a shadow clone of the orchestrator', () => {
  const OV = loadOV([
    'js/config.js', 'js/nav.js', 'js/themes/index.js',
    'js/themes/office.js', 'js/themes/leaf.js', 'js/events.js',
  ]);
  OV.Themes.apply('leaf');
  const cast = OV.Events.castFor('general-purpose');
  assert.equal(cast.emoji, '🍥');
  assert.equal(cast.color, '#7fd1e8');
  assert.equal(cast.isClone, true);
  // Task 18: a shadow clone borrows the boss's look, sprites included.
  assert.deepEqual(cast.sprites, OV.Themes.get('leaf').sprites);
});

test('castFor: leaf resolves an aliased subagent type to the target cast member', () => {
  const OV = loadOV([
    'js/config.js', 'js/nav.js', 'js/themes/index.js',
    'js/themes/office.js', 'js/themes/leaf.js', 'js/events.js',
  ]);
  OV.Themes.apply('leaf');
  // 'code-reviewer' has no cast entry of its own; castByType aliases it to 'validator'.
  const cast = OV.Events.castFor('code-reviewer');
  const validator = OV.Themes.get('leaf').cast.find((c) => c.id === 'validator');
  assert.equal(cast.emoji, validator.emoji);
  assert.equal(cast.color, validator.color);
  assert.equal(cast.isClone, false);
  assert.deepEqual(cast.sprites, validator.sprites);
  assert.match(cast.sprites.sheet, /shikamaru-sheet\.webp$/);
  assert.equal(cast.sprites.counts.runRight, 6, 'alias must carry Shikamaru\'s 6-frame run, not an 8-frame default');
});

// ensureAgent: only touches OV.World.byId / .agents / .addAgent, so a minimal
// stub World (no real Agent/DOM) is enough to inspect the def it builds. This
// is the def that becomes `new OV.Agent(def, floorEl)` for every dynamically
// spawned subagent — a typo here (e.g. reading `.sprite` instead of
// `.sprites` off the resolved cast) would silently make every runtime-spawned
// leaf clone render as plain emoji with nothing failing elsewhere.
function stubWorld() {
  const built = [];
  return {
    byId: {},
    agents: [],
    addAgent: function (def) { built.push(def); return def; },
    built: built,
  };
}

test('ensureAgent: leaf threads the resolved sprites config onto a mapped subagent\'s def', () => {
  const OV = loadOV([
    'js/config.js', 'js/nav.js', 'js/themes/index.js',
    'js/themes/office.js', 'js/themes/leaf.js', 'js/events.js',
  ]);
  OV.Themes.apply('leaf');
  const W = stubWorld();
  OV.World = W;
  const def = OV.Events.ensureAgent({ agent: 'sub-1', role: 'builder' });
  const builderEntry = OV.Themes.get('leaf').cast.find((c) => c.id === 'builder');
  assert.deepEqual(def.sprites, builderEntry.sprites);
  assert.match(def.sprites.sheet, /sasuke-sheet\.webp$/);
});

test('ensureAgent: leaf threads the resolved sprites config onto an unmapped (clone) subagent\'s def', () => {
  const OV = loadOV([
    'js/config.js', 'js/nav.js', 'js/themes/index.js',
    'js/themes/office.js', 'js/themes/leaf.js', 'js/events.js',
  ]);
  OV.Themes.apply('leaf');
  const W = stubWorld();
  OV.World = W;
  const def = OV.Events.ensureAgent({ agent: 'sub-2', role: 'general-purpose' });
  assert.deepEqual(def.sprites, OV.Themes.get('leaf').sprites);
  // A clone has no cast entry, so it must land on the theme-level fallback —
  // Naruto's sheet, because a shadow clone is a clone OF the orchestrator.
  assert.match(def.sprites.sheet, /naruto-sheet\.webp$/);
});

test('ensureAgent: office builds a def with no sprites config at all', () => {
  const OV = loadOV([
    'js/config.js', 'js/nav.js', 'js/themes/index.js',
    'js/themes/office.js', 'js/themes/leaf.js', 'js/events.js',
  ]);
  OV.Themes.apply('office');
  const W = stubWorld();
  OV.World = W;
  const def = OV.Events.ensureAgent({ agent: 'sub-3', role: 'builder' });
  assert.strictEqual(def.sprites, null);
});
