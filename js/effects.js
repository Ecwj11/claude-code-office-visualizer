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

  OV.Effects = { SpawnQueue: SpawnQueue };
})(window.OV = window.OV || {});
