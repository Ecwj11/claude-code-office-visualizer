/*
 * effects.js
 * Spawn and despawn effects, plus the queue that keeps them honest.
 *
 * Claude Code dispatches Task calls in parallel. A 1.15s spawn ritual played
 * serially for ten subagents would leave the visuals eleven seconds behind
 * reality, so the queue degrades to a short poof whenever the backlog grows.
 */
(function (OV) {
  'use strict';

  function SpawnQueue(opts) {
    opts = opts || {};
    this.fastThreshold = typeof opts.fastThreshold === 'number' ? opts.fastThreshold : 2;
    this.pending = [];
    this.running = false;
  }

  // job(mode) may return a value or a Promise. Resolves with the job's result.
  SpawnQueue.prototype.enqueue = function (job) {
    const self = this;
    return new Promise(function (resolve, reject) {
      self.pending.push({ job: job, resolve: resolve, reject: reject });
      self._drain();
    });
  };

  SpawnQueue.prototype._drain = function () {
    if (this.running) return;
    const next = this.pending.shift();
    if (!next) return;

    this.running = true;
    const mode = this.pending.length > this.fastThreshold ? 'fast' : 'full';
    const self = this;

    let result;
    try {
      result = next.job(mode);
    } catch (err) {
      this.running = false;
      next.reject(err);
      this._drain();
      return;
    }

    Promise.resolve(result).then(function (value) {
      self.running = false;
      next.resolve(value);
      self._drain();
    }, function (err) {
      self.running = false;
      next.reject(err);
      self._drain();
    });
  };

  const SMOKE_MS = 250;

  function smokeAt(x, y) {
    const floor = OV.World && OV.World.floorEl;
    if (!floor) return;
    const el = document.createElement('div');
    el.className = 'jutsu-smoke';
    el.style.left = x + '%';
    el.style.top = y + '%';
    floor.appendChild(el);
    const t = setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, SMOKE_MS + 300);
    if (OV.World && OV.World.trackTimer) OV.World.trackTimer(t);
  }

  // The shadow-clone ritual. `mode` comes from the queue: 'full' plays the
  // whole sequence, 'fast' collapses it so a burst of parallel Task dispatches
  // never leaves the visuals more than about a second behind reality.
  function jutsu(ctx) {
    const W = OV.World;
    const clone = ctx.agent;
    const boss = ctx.orchestrator;

    if (!boss || ctx.mode === 'fast') {
      const at = OV.LOCATIONS[clone.home] || OV.LOCATIONS.GATHER_SPOT;
      smokeAt(at.x, at.y);
      clone.el.classList.add('is-clone');
      return W.delay(SMOKE_MS);
    }

    boss.el.classList.add('jutsu-seal');
    clone.el.classList.add('is-clone', 'is-materialising');

    // Park the clone next to the orchestrator; it walks to its own slot after.
    const dest = clone.home;
    clone.position.x = boss.position.x + 6;
    clone.position.y = boss.position.y;
    clone.render();

    return W.delay(300)
      .then(function () {
        boss.say('Kage Bunshin no Jutsu!');
        return W.delay(100);
      })
      .then(function () {
        smokeAt(boss.position.x + 6, boss.position.y);
        return W.delay(SMOKE_MS);
      })
      .then(function () {
        clone.el.classList.remove('is-materialising');
        return W.delay(200);
      })
      .then(function () {
        boss.el.classList.remove('jutsu-seal');
        clone.walkTo(dest);
        return W.delay(300);
      });
  }

  function none() { return Promise.resolve(); }

  function play(name, ctx) {
    const fn = EFFECTS[name] || none;
    return Promise.resolve(fn(ctx)).catch(function (err) {
      console.warn('effects: spawn effect failed', name, err);
    });
  }

  function poof(agent) {
    smokeAt(agent.position.x, agent.position.y);
    agent.el.classList.add('is-poofing');
    return (OV.World ? OV.World.delay(SMOKE_MS) : Promise.resolve());
  }

  function despawn(name, agent) {
    if (name !== 'poof') return Promise.resolve();
    return poof(agent).catch(function () { /* never block agent removal */ });
  }

  const EFFECTS = { none: none, jutsu: jutsu };

  OV.Effects = {
    SpawnQueue: SpawnQueue,
    queue: new SpawnQueue({ fastThreshold: 2 }),
    play: play,
    despawn: despawn,
    smokeAt: smokeAt,
  };
})(window.OV = window.OV || {});
