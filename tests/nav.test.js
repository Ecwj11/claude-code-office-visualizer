const test = require('node:test');
const assert = require('node:assert');
const { loadOV } = require('../tools/browser-module');

test('loadOV populates OV from classic scripts', () => {
  const OV = loadOV(['js/config.js']);
  assert.equal(OV.STATES.IDLE, 'IDLE');
  assert.equal(typeof OV.CONFIG.WALK_SPEED, 'number');
});
