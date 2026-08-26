const test = require('node:test');
const assert = require('node:assert');
const { loadOV } = require('../tools/browser-module');

test('loadOV populates OV from classic scripts', () => {
  const OV = loadOV(['js/config.js']);
  assert.equal(OV.STATES.IDLE, 'IDLE');
  assert.equal(typeof OV.CONFIG.WALK_SPEED, 'number');
});

test('Nav.rebuild swaps the graph and routes over the new one', () => {
  const OV = loadOV(['js/config.js', 'js/nav.js']);

  const slots = {
    A: { x: 0, y: 0, face: 'down', label: 'A' },
    B: { x: 0, y: 50, face: 'down', label: 'B' },
  };
  const waypoints = { W: { x: 0, y: 25 } };
  const edges = [['A', 'W'], ['W', 'B']];

  OV.Nav.rebuild(slots, waypoints, edges);

  assert.deepEqual(Object.keys(OV.Nav.nodes).sort(), ['A', 'B', 'W']);
  assert.deepEqual(OV.Nav.findPath('A', 'B'), ['A', 'W', 'B']);

  const pts = OV.Nav.route({ x: 0, y: 0 }, 'B');
  assert.deepEqual(pts, [{ x: 0, y: 0 }, { x: 0, y: 25 }, { x: 0, y: 50 }]);
});

test('Nav.rebuild drops nodes from the previous graph', () => {
  const OV = loadOV(['js/config.js', 'js/nav.js']);
  OV.Nav.rebuild({ A: { x: 0, y: 0 } }, {}, []);
  assert.equal(OV.Nav.nodes.CLAUDE_DESK, undefined);
});
