const test = require('node:test');
const assert = require('node:assert');
const { loadOV } = require('../tools/browser-module');

// Task 17: the shadow-clone jutsu sound. `OV.Effects.playSound` is the piece
// that talks to a real `Audio` element, so every test here injects a fake
// constructor into the vm sandbox via browser-module's `Audio` option (see
// tools/browser-module.js) instead of touching a real one.

const LEAF_SOUND = 'assets/themes/leaf/shadow_clone_jutsu.mp3';

// A fake `Audio` constructor recording play() calls and currentTime writes,
// resolving or rejecting play() as directed. `instances` lets a test assert
// how many distinct Audio elements got constructed (bullet 4: no stacking).
function makeFakeAudio(opts) {
  opts = opts || {};
  const instances = [];
  function FakeAudio(url) {
    this.url = url;
    this.playCalls = 0;
    this.currentTimeWrites = [];
    instances.push(this);
  }
  Object.defineProperty(FakeAudio.prototype, 'currentTime', {
    set(v) { this.currentTimeWrites.push(v); },
    get() { return 0; },
  });
  FakeAudio.prototype.play = function () {
    this.playCalls++;
    return opts.reject ? Promise.reject(new Error('autoplay blocked')) : Promise.resolve();
  };
  FakeAudio.instances = instances;
  return FakeAudio;
}

function loadEffects(audioOpts) {
  return loadOV(['js/effects.js'], { Audio: makeFakeAudio(audioOpts) });
}

test('playSound: unmuted -> Audio is constructed once and played once with the URL', () => {
  const FakeAudio = makeFakeAudio();
  const OV = loadOV(['js/effects.js'], { Audio: FakeAudio });
  OV.Effects.playSound(LEAF_SOUND);
  assert.equal(FakeAudio.instances.length, 1);
  assert.equal(FakeAudio.instances[0].url, LEAF_SOUND);
  assert.equal(FakeAudio.instances[0].playCalls, 1);
});

test('playSound: muted -> play() is never called (and nothing is even constructed)', () => {
  const FakeAudio = makeFakeAudio();
  const OV = loadOV(['js/effects.js'], { Audio: FakeAudio });
  OV.Effects.setMuted(true);
  OV.Effects.playSound(LEAF_SOUND);
  assert.equal(FakeAudio.instances.length, 0);
});

test('playSound: same URL twice reuses the same Audio instance and resets currentTime', () => {
  const FakeAudio = makeFakeAudio();
  const OV = loadOV(['js/effects.js'], { Audio: FakeAudio });
  OV.Effects.playSound(LEAF_SOUND);
  OV.Effects.playSound(LEAF_SOUND);
  assert.equal(FakeAudio.instances.length, 1, 'no second Audio element constructed');
  assert.equal(FakeAudio.instances[0].playCalls, 2);
  assert.deepEqual(FakeAudio.instances[0].currentTimeWrites, [0, 0]);
});

test('playSound: different URLs get their own cached Audio instance', () => {
  const FakeAudio = makeFakeAudio();
  const OV = loadOV(['js/effects.js'], { Audio: FakeAudio });
  OV.Effects.playSound(LEAF_SOUND);
  OV.Effects.playSound('assets/themes/other/clip.mp3');
  assert.equal(FakeAudio.instances.length, 2);
});

test('playSound: a rejecting play() (autoplay blocked) does not throw and does not surface an unhandled rejection', async () => {
  const FakeAudio = makeFakeAudio({ reject: true });
  const OV = loadOV(['js/effects.js'], { Audio: FakeAudio });
  assert.doesNotThrow(() => OV.Effects.playSound(LEAF_SOUND));
  // Give the rejected play() promise's internal .catch a turn to run; if it
  // weren't handled, node would report an unhandledRejection for this test.
  await new Promise((r) => setTimeout(r, 10));
});

test('playSound: no Audio global at all does not throw', () => {
  const OV = loadOV(['js/effects.js']); // no Audio option -> sandbox.Audio is undefined
  assert.doesNotThrow(() => OV.Effects.playSound(LEAF_SOUND));
});

test('mute state defaults to unmuted', () => {
  const OV = loadEffects();
  assert.equal(OV.Effects.isMuted(), false);
});

test('mute state persists across reloads via localStorage', () => {
  const store = {};
  const fakeLocalStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
  };
  const FakeAudio = makeFakeAudio();

  const OV1 = loadOV(['js/effects.js'], { Audio: FakeAudio, localStorage: fakeLocalStorage });
  assert.equal(OV1.Effects.isMuted(), false, 'default is unmuted');
  OV1.Effects.setMuted(true);

  const OV2 = loadOV(['js/effects.js'], { Audio: FakeAudio, localStorage: fakeLocalStorage });
  assert.equal(OV2.Effects.isMuted(), true, 'mute choice persisted across a fresh load');
});

test('mute state survives a storage that throws (storage-blocked browser still works)', () => {
  const throwingStorage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };
  const FakeAudio = makeFakeAudio();
  const OV = loadOV(['js/effects.js'], { Audio: FakeAudio, localStorage: throwingStorage });
  assert.equal(OV.Effects.isMuted(), false);
  assert.doesNotThrow(() => OV.Effects.setMuted(true));
  assert.equal(OV.Effects.isMuted(), true, 'in-memory flag still works even though persistence failed');
  assert.doesNotThrow(() => OV.Effects.playSound(LEAF_SOUND));
});

// ---- jutsu(ctx) wiring: sound plays on the full ritual only ----------------
// The 'fast' branch of jutsu() returns before ever reaching boss.say(...), so
// exercising jutsu itself (rather than testing playSound in isolation) proves
// bullet 2: a burst of parallel dispatches that degrade to 'fast' can't stack
// overlapping clips, because 'fast' never calls playSound at all.

function makeCtx(mode) {
  return {
    mode: mode,
    spawnSound: LEAF_SOUND,
    orchestrator: {
      el: { classList: { add() {}, remove() {} } },
      say() {},
      position: { x: 10, y: 10 },
    },
    agent: {
      home: 'GATHER_SPOT',
      el: { classList: { add() {}, remove() {} } },
      position: { x: 0, y: 0 },
      render() {},
      walkTo() {},
    },
  };
}

function loadJutsu(audioOpts) {
  const FakeAudio = makeFakeAudio(audioOpts);
  const OV = loadOV(['js/effects.js'], { Audio: FakeAudio });
  OV.World = { delay: () => Promise.resolve() };
  OV.LOCATIONS = { GATHER_SPOT: { x: 50, y: 60 } };
  return { OV: OV, FakeAudio: FakeAudio };
}

test('jutsu: full mode plays the sound once, at the incantation', async () => {
  const { OV, FakeAudio } = loadJutsu();
  await OV.Effects.play('jutsu', makeCtx('full'));
  assert.equal(FakeAudio.instances.length, 1);
  assert.equal(FakeAudio.instances[0].url, LEAF_SOUND);
  assert.equal(FakeAudio.instances[0].playCalls, 1);
});

test('jutsu: fast mode (queue backpressure) plays no sound', async () => {
  const { OV, FakeAudio } = loadJutsu();
  await OV.Effects.play('jutsu', makeCtx('fast'));
  assert.equal(FakeAudio.instances.length, 0);
});

test('jutsu: ten parallel full+fast dispatches never produce more than one Audio instance per URL', async () => {
  const { OV, FakeAudio } = loadJutsu();
  const modes = ['full', 'fast', 'fast', 'full', 'fast', 'fast', 'full', 'fast', 'fast', 'fast'];
  await Promise.all(modes.map((m) => OV.Effects.play('jutsu', makeCtx(m))));
  assert.equal(FakeAudio.instances.length, 1, 'one Audio element, reused across every full ritual');
  const fullCount = modes.filter((m) => m === 'full').length;
  assert.equal(FakeAudio.instances[0].playCalls, fullCount);
});
