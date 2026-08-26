const test = require('node:test');
const assert = require('node:assert');
const { loadOV } = require('../tools/browser-module');

function makeQueue() {
  const OV = loadOV(['js/effects.js']);
  return new OV.Effects.SpawnQueue({ fastThreshold: 2 });
}

test('a single spawn plays the full ritual', async () => {
  const q = makeQueue();
  const modes = [];
  await q.enqueue((mode) => { modes.push(mode); });
  assert.deepEqual(modes, ['full']);
});

test('a burst degrades to fast once the backlog exceeds the threshold', async () => {
  const q = makeQueue();
  const modes = [];
  const job = (mode) => { modes.push(mode); };
  const all = [];
  for (let i = 0; i < 6; i++) all.push(q.enqueue(job));
  await Promise.all(all);

  assert.equal(modes.length, 6);
  assert.equal(modes[0], 'full', 'first spawn always gets the full ritual');
  assert.ok(modes.includes('fast'), 'a six-deep burst degrades');
  assert.equal(modes[modes.length - 1], 'full', 'the tail drains at full quality again');
});

test('jobs run strictly in order and one at a time', async () => {
  const q = makeQueue();
  const order = [];
  let active = 0;
  const job = (id) => () => {
    active++;
    assert.equal(active, 1, 'never two rituals at once');
    order.push(id);
    return new Promise((r) => setTimeout(() => { active--; r(); }, 5));
  };
  await Promise.all([q.enqueue(job('a')), q.enqueue(job('b')), q.enqueue(job('c'))]);
  assert.deepEqual(order, ['a', 'b', 'c']);
});

test('a throwing job does not wedge the queue', async () => {
  const q = makeQueue();
  const seen = [];
  const bad = q.enqueue(() => { throw new Error('boom'); });
  const good = q.enqueue(() => { seen.push('ran'); });
  await bad.catch(() => {});
  await good;
  assert.deepEqual(seen, ['ran']);
});
