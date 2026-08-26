/*
 * world.js
 * The office runtime. Owns the collection of agents, the single
 * requestAnimationFrame movement loop, the ambient "idle wander" scheduler,
 * the event log, and the right-hand agent-state panel.
 *
 * All timers and animation frames are tracked so RESET can tear everything
 * down cleanly with no leaks. A `generation` counter invalidates any in-flight
 * async choreography (simulation / ambient) after a reset.
 */
(function (OV) {
  'use strict';

  const STATES = OV.STATES;
  const CONFIG = OV.CONFIG;

  const World = {
    agents: [],
    byId: {},
    generation: 0,
    running: false,

    _raf: 0,
    _lastT: 0,
    _timers: new Set(),
    _intervals: new Set(),
    _ambientTimer: null,
    _wandering: new Set(),

    // ---- lifecycle -------------------------------------------------------
    init: function () {
      this.floorEl = document.getElementById('office-floor');
      this.cardsEl = document.getElementById('agent-cards');
      this.logEl = document.getElementById('event-log');
      this.countEl = document.getElementById('active-count');

      // Remember the starting roster so RESET can restore exactly it.
      this._originalIds = new Set(OV.AGENT_DEFS.map((d) => d.id));
      OV.AGENT_DEFS.forEach((def) => this.addAgent(def));
      this.log('system', 'Office initialised · ' + this.agents.length + ' agents ready');
      this.startLoop();
      this.startAmbient();
    },

    addAgent: function (def) {
      if (this.byId[def.id]) return this.byId[def.id];
      const agent = new OV.Agent(def, this.floorEl);
      agent.onChange = (a, opts) => this.onAgentChange(a, opts);
      this.agents.push(agent);
      this.byId[agent.id] = agent;
      this._buildCard(agent);
      this._updateCount();
      return agent;
    },

    removeAgent: function (id) {
      const a = this.byId[id];
      if (!a) return;
      a.hideBubble();
      if (a.el && a.el.parentNode) a.el.parentNode.removeChild(a.el);
      if (a.card && a.card.el && a.card.el.parentNode) a.card.el.parentNode.removeChild(a.card.el);
      this.agents = this.agents.filter((x) => x !== a);
      delete this.byId[id];
      this._wandering.delete(id);
      this._updateCount();
    },

    // ---- movement loop ---------------------------------------------------
    startLoop: function () {
      if (this.running) return;
      this.running = true;
      this._lastT = 0;
      const tick = (t) => {
        if (!this.running) return;
        if (!this._lastT) this._lastT = t;
        let dt = (t - this._lastT) / 1000;
        this._lastT = t;
        if (dt > 0.05) dt = 0.05; // clamp after tab was backgrounded
        for (let i = 0; i < this.agents.length; i++) this.agents[i].update(dt);
        this._raf = requestAnimationFrame(tick);
      };
      this._raf = requestAnimationFrame(tick);
    },

    stopLoop: function () {
      this.running = false;
      if (this._raf) cancelAnimationFrame(this._raf);
      this._raf = 0;
      this._lastT = 0;
    },

    // ---- timer registry (leak-free) --------------------------------------
    trackTimer: function (t) { this._timers.add(t); return t; },
    setTimeoutT: function (fn, ms) {
      const t = setTimeout(() => { this._timers.delete(t); fn(); }, ms);
      this._timers.add(t);
      return t;
    },
    setIntervalT: function (fn, ms) {
      const t = setInterval(fn, ms);
      this._intervals.add(t);
      return t;
    },
    clearAllTimers: function () {
      this._timers.forEach((t) => clearTimeout(t));
      this._timers.clear();
      this._intervals.forEach((t) => clearInterval(t));
      this._intervals.clear();
      if (this._ambientTimer) { clearTimeout(this._ambientTimer); this._ambientTimer = null; }
    },

    // Promise helpers used by the simulation & ambient choreography. Each is
    // guarded by the generation counter so a RESET stops any running sequence.
    delay: function (ms) {
      return new Promise((resolve) => { this.setTimeoutT(resolve, ms); });
    },
    walk: function (agent, dest, opts) {
      opts = opts || {};
      const gen = this.generation;
      return new Promise((resolve) => {
        agent.walkTo(dest, (a, info) => {
          // Always resolve so no awaiting sequence can hang. Only apply the
          // post-arrival state on a genuine, still-current arrival.
          if (gen !== this.generation) return resolve(agent);
          if (info && info.cancelled) return resolve(agent);
          if (opts.state) agent.setState(opts.state, opts);
          resolve(agent);
        });
        if (opts.say) agent.say(opts.say);
      });
    },
    alive: function (gen) { return gen === this.generation; },

    // ---- collaboration ---------------------------------------------------
    // Reusable: agent A walks to agent B, they exchange a line, then A returns.
    agentMeet: function (a, b, message, reply) {
      const gen = this.generation;
      const dest = b.home;
      const prevTask = a.currentTask;
      return this.walk(a, dest).then(() => {
        if (!this.alive(gen)) return;
        a.setState(STATES.COLLABORATING, { task: 'with ' + b.name });
        b.setState(STATES.COLLABORATING, { task: 'with ' + a.name });
        a.say(message);
        return this.delay(900);
      }).then(() => {
        if (!this.alive(gen)) return;
        if (reply) b.say(reply);
        return this.delay(2200);
      }).then(() => {
        if (!this.alive(gen)) return;
        // both return to their desks and resume
        b.setState(STATES.WORKING, { task: b.currentTask && b.currentTask.indexOf('with ') === 0 ? null : b.currentTask });
        return this.walk(a, a.home, { state: STATES.WORKING, task: prevTask });
      });
    },

    // ---- ambient idle life ----------------------------------------------
    startAmbient: function () {
      this._scheduleAmbient();
    },
    _scheduleAmbient: function () {
      const wait = CONFIG.AMBIENT_MIN_MS +
        Math.floor(this._rand() * (CONFIG.AMBIENT_MAX_MS - CONFIG.AMBIENT_MIN_MS));
      this._ambientTimer = setTimeout(() => {
        this._ambientTick();
        this._scheduleAmbient();
      }, wait);
    },
    _movingCount: function () {
      let n = this._wandering.size;
      this.agents.forEach((a) => {
        if (a.status === STATES.WALKING && !this._wandering.has(a.id)) n++;
      });
      return n;
    },
    _ambientTick: function () {
      // The scripted simulation owns every agent while it plays; stay out of
      // its way so the two can never fight over the same agent.
      if (OV.Simulation && OV.Simulation.active) return;
      if (this._movingCount() >= CONFIG.AMBIENT_MAX_CONCURRENT) return;
      // candidates: agents currently idle at their desk
      const idle = this.agents.filter((a) => a.status === STATES.IDLE && !this._wandering.has(a.id));
      if (!idle.length) return;
      const agent = idle[Math.floor(this._rand() * idle.length)];
      this._wander(agent);
    },
    _wander: function (agent) {
      const gen = this.generation;
      this._wandering.add(agent.id);

      // Pick somewhere interesting that isn't the agent's own desk.
      const spots = ['THINK_SPOT', 'BREAK_SPOT', 'GATHER_SPOT', 'AMBIENT_SPOT'];
      // occasionally visit a peer's desk instead
      const peers = this.agents.filter((a) => a !== agent);
      let dest;
      let intent;
      if (peers.length && this._rand() < 0.35) {
        dest = peers[Math.floor(this._rand() * peers.length)].home;
        intent = STATES.WAITING;
      } else {
        dest = spots[Math.floor(this._rand() * spots.length)];
        intent = dest === 'THINK_SPOT' ? STATES.THINKING : STATES.WAITING;
      }

      const fallback = {
        THINK_SPOT: 'Reviewing the plan…',
        BREAK_SPOT: '☕ break',
        GATHER_SPOT: 'Stretching',
        AMBIENT_SPOT: 'Nice view',
      };
      const line = OV.Themes.strings('ambient_' + dest, fallback[dest]);

      const done = () => { this._wandering.delete(agent.id); };
      // A wander already in flight when the simulation starts must yield: bail
      // at the next step and free the slot so the sim has sole control.
      const yielded = () => !this.alive(gen) || (OV.Simulation && OV.Simulation.active);
      agent.setState(STATES.WALKING);
      this.walk(agent, dest).then(() => {
        if (yielded()) return;
        agent.setState(intent);
        if (line) agent.say(line);
        return this.delay(2500 + Math.floor(this._rand() * 3000));
      }).then(() => {
        if (yielded()) return;
        return this.walk(agent, agent.home, { state: STATES.IDLE });
      }).then(done, done); // always release the wandering slot
    },

    // Deterministic-ish RNG replacement (Math.random is fine in the browser).
    _rand: function () { return Math.random(); },

    // ---- panels & log ----------------------------------------------------
    _buildCard: function (agent) {
      const el = document.createElement('div');
      el.className = 'agent-card';
      el.dataset.agent = agent.id;
      el.style.setProperty('--agent-color', agent.color);
      el.innerHTML =
        '<div class="card-avatar">' + agent.emoji + '</div>' +
        '<div class="card-main">' +
          '<div class="card-top">' +
            '<span class="card-name">' + agent.name + '</span>' +
            '<span class="card-badge"><span class="badge-dot"></span><span class="badge-text">IDLE</span></span>' +
          '</div>' +
          '<div class="card-role">' + agent.role + '</div>' +
          '<div class="card-task"></div>' +
        '</div>';
      this.cardsEl.appendChild(el);
      agent.card = {
        el: el,
        name: el.querySelector('.card-name'),
        badge: el.querySelector('.card-badge'),
        badgeText: el.querySelector('.badge-text'),
        task: el.querySelector('.card-task'),
      };
      this._paintCard(agent);
    },
    _paintCard: function (agent) {
      const c = agent.card;
      if (!c) return;
      c.el.className = 'agent-card state-' + agent.status.toLowerCase();
      c.badgeText.textContent = agent.status;
      if (c.name) c.name.title = agent.name + (agent.role ? ' · ' + agent.role : '');
      let taskLine = '';
      if (agent.currentTask) taskLine = agent.currentTask;
      if (agent.currentTool) taskLine += (taskLine ? ' · ' : '') + agent.currentTool;
      c.task.textContent = taskLine;
      c.task.title = taskLine; // hover reveals the full, un-truncated text
      c.task.hidden = !taskLine;
    },

    onAgentChange: function (agent, opts) {
      this._paintCard(agent);
      if (opts && opts.log !== false && opts && opts.logMessage) {
        this.log(agent.id, opts.logMessage);
      }
    },

    log: function (kind, message) {
      if (!this.logEl) return;
      const row = document.createElement('div');
      row.className = 'log-row log-' + kind;
      const time = this._clock();
      row.innerHTML =
        '<span class="log-time">' + time + '</span>' +
        '<span class="log-kind">' + kind + '</span>' +
        '<span class="log-msg"></span>';
      row.querySelector('.log-msg').textContent = message;
      this.logEl.insertBefore(row, this.logEl.firstChild);
      while (this.logEl.childElementCount > CONFIG.LOG_MAX) {
        this.logEl.removeChild(this.logEl.lastChild);
      }
    },
    // Monotonic-ish wall clock; Date is fine in the browser runtime.
    _clock: function () {
      const d = new Date();
      const p = (n) => (n < 10 ? '0' + n : '' + n);
      return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
    },

    _updateCount: function () {
      if (this.countEl) this.countEl.textContent = String(this.agents.length);
    },

    // ---- reset -----------------------------------------------------------
    reset: function () {
      this.generation++; // invalidate all in-flight sequences
      this.clearAllTimers();
      this._wandering.clear();
      // Remove any agent spawned dynamically since load; keep the original roster.
      this.agents
        .filter((a) => !this._originalIds.has(a.id))
        .forEach((a) => this.removeAgent(a.id));
      this.agents.forEach((a) => a.resetToHome());
      if (this.logEl) this.logEl.innerHTML = '';
      this.log('system', 'Reset · agents returned to desks');
      // restart ambient life on the fresh generation
      this.startAmbient();
    },
  };

  OV.World = World;
})(window.OV = window.OV || {});
