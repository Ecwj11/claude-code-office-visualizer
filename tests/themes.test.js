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
