/*
 * agent.js
 * The reusable Agent model. One class drives every character in the office —
 * there is no per-agent movement code anywhere else. An Agent owns its own DOM
 * node, its position, its walking path and its behavioural state. The World
 * ticks every agent once per animation frame via `update(dt)`.
 */
(function (OV) {
  'use strict';

  const STATES = OV.STATES;
  const CONFIG = OV.CONFIG;

  let seq = 0;

  function Agent(def, floorEl) {
    this.id = def.id || 'agent-' + (++seq);
    this.name = def.name || this.id;
    this.role = def.role || 'Agent';
    this.emoji = def.emoji || '🙂';
    this.color = def.color || '#8ab4f8';
    this.home = def.home; // navigation-point name of this agent's desk
    this.orchestrator = !!def.orchestrator;

    // State
    this.status = STATES.IDLE;
    this.currentTask = null;
    this.currentTool = null;
    this.animationState = 'idle'; // idle | walking | working
    this.facing = 'down'; // down | up | left | right

    // Movement (all coordinates are % of the office floor)
    const start = OV.LOCATIONS[this.home] || OV.LOCATIONS.CENTER_AREA;
    this.position = { x: start.x, y: start.y };
    this.targetPosition = { x: start.x, y: start.y };
    this.path = null;
    this.pathIndex = 0;
    this.onArrive = null;

    // Hooks (wired by World)
    this.onChange = null; // called when status/task changes -> refresh panels

    // Timers owned by this agent (bubble hide). Tracked so reset can clear them.
    this._bubbleTimer = null;

    this._build(floorEl);
    this.render();
  }

  // ---- DOM ---------------------------------------------------------------
  Agent.prototype._build = function (floorEl) {
    const el = document.createElement('div');
    el.className = 'agent';
    el.dataset.agent = this.id;
    el.style.setProperty('--agent-color', this.color);
    el.innerHTML =
      '<div class="agent-bubble" hidden></div>' +
      '<div class="agent-body">' +
        '<div class="agent-sprite">' + this.emoji + '</div>' +
        '<div class="agent-typing"><span></span><span></span><span></span></div>' +
      '</div>' +
      '<div class="agent-shadow"></div>' +
      '<div class="agent-tag"><span class="agent-dot"></span>' + this.name + '</div>';
    floorEl.appendChild(el);

    this.el = el;
    this.bubbleEl = el.querySelector('.agent-bubble');
    this.bodyEl = el.querySelector('.agent-body');
    this.spriteEl = el.querySelector('.agent-sprite');
  };

  // ---- State -------------------------------------------------------------
  Agent.prototype.setState = function (state, opts) {
    opts = opts || {};
    const changed = this.status !== state ||
      (opts.task !== undefined && opts.task !== this.currentTask) ||
      (opts.tool !== undefined && opts.tool !== this.currentTool);

    this.status = state;
    if (opts.task !== undefined) this.currentTask = opts.task;
    if (opts.tool !== undefined) this.currentTool = opts.tool;

    // Movement/animation implications of the new state.
    if (state === STATES.WORKING) {
      this.animationState = 'working';
      this._stopWalking();
      const loc = OV.LOCATIONS[this.home];
      if (loc) this.facing = loc.face || 'down';
    } else if (state === STATES.WALKING) {
      this.animationState = 'walking';
    } else if (state !== STATES.COLLABORATING) {
      // IDLE / WAITING / THINKING / ERROR / COMPLETED standing still
      if (this.animationState === 'working') this.animationState = 'idle';
    }

    this.render();
    if (changed && typeof this.onChange === 'function') this.onChange(this, opts);
  };

  // ---- Movement ----------------------------------------------------------
  // Settle the current walk's arrival callback exactly once. `info.cancelled`
  // marks a walk that was superseded/aborted rather than completed — callers
  // use it to resolve their promise without applying an "arrived" state. This
  // guarantees no awaiting sequence can hang when a walk is interrupted.
  Agent.prototype._settle = function (info) {
    const cb = this.onArrive;
    this.onArrive = null;
    if (cb) cb(this, info);
  };

  // Walk to a named navigation point. `then` may be a callback run on arrival.
  Agent.prototype.walkTo = function (destName, then) {
    // If a previous walk is still pending, release it first (cancelled) so its
    // promise resolves instead of leaking.
    this._settle({ cancelled: true });
    this.path = OV.Nav.route(this.position, destName);
    this.pathIndex = this.path.length > 1 ? 1 : 0;
    this.destName = destName;
    this.onArrive = typeof then === 'function' ? then : null;
    // Preserve a collaboration/working intent label if already set by caller.
    if (this.status !== STATES.WALKING) this.setState(STATES.WALKING);
    else { this.animationState = 'walking'; this.render(); }
    return this;
  };

  Agent.prototype._stopWalking = function () {
    this.path = null;
    this.pathIndex = 0;
  };

  // Advance along the current path. dt is in seconds.
  Agent.prototype.update = function (dt) {
    if (!this.path || this.pathIndex >= this.path.length) return;

    let budget = CONFIG.WALK_SPEED * dt;
    // Consume the movement budget across as many waypoints as needed this frame.
    while (budget > 0 && this.path && this.pathIndex < this.path.length) {
      const target = this.path[this.pathIndex];
      const dx = target.x - this.position.x;
      const dy = target.y - this.position.y;
      const d = Math.sqrt(dx * dx + dy * dy);

      if (d <= budget || d < CONFIG.ARRIVE_EPSILON) {
        this.position.x = target.x;
        this.position.y = target.y;
        budget -= d;
        this.pathIndex++;
        if (this.pathIndex >= this.path.length) {
          this._arrive();
          return;
        }
      } else {
        this.position.x += (dx / d) * budget;
        this.position.y += (dy / d) * budget;
        this._face(dx, dy);
        budget = 0;
      }
    }
    this.render();
  };

  Agent.prototype._arrive = function () {
    const loc = OV.LOCATIONS[this.destName];
    this.path = null;
    this.pathIndex = 0;
    if (loc && loc.face) this.facing = loc.face;
    this.animationState = 'idle';
    this.render();
    this._settle(); // arrived normally (no cancel flag)
  };

  Agent.prototype._face = function (dx, dy) {
    if (Math.abs(dx) > Math.abs(dy)) {
      this.facing = dx < 0 ? 'left' : 'right';
    } else {
      this.facing = dy < 0 ? 'up' : 'down';
    }
  };

  // ---- Speech / task bubbles --------------------------------------------
  Agent.prototype.say = function (message, ms) {
    if (!message) return;
    this.bubbleEl.textContent = message;
    this.bubbleEl.hidden = false;
    // restart the pop animation
    this.bubbleEl.classList.remove('pop');
    void this.bubbleEl.offsetWidth;
    this.bubbleEl.classList.add('pop');
    if (this._bubbleTimer) clearTimeout(this._bubbleTimer);
    const self = this;
    this._bubbleTimer = setTimeout(function () {
      self.bubbleEl.hidden = true;
      self._bubbleTimer = null;
    }, ms || CONFIG.BUBBLE_MS);
    if (OV.World && OV.World.trackTimer) OV.World.trackTimer(this._bubbleTimer);
  };

  Agent.prototype.hideBubble = function () {
    if (this._bubbleTimer) { clearTimeout(this._bubbleTimer); this._bubbleTimer = null; }
    if (this.bubbleEl) this.bubbleEl.hidden = true;
  };

  // ---- Rendering ---------------------------------------------------------
  Agent.prototype.render = function () {
    const el = this.el;
    el.style.left = this.position.x + '%';
    el.style.top = this.position.y + '%';

    // z-order by vertical position so lower agents overlap higher ones.
    el.style.zIndex = String(100 + Math.round(this.position.y));

    // state class
    el.className = 'agent state-' + this.status.toLowerCase() +
      ' anim-' + this.animationState +
      ' face-' + this.facing;
  };

  // Reset to a clean state at the home desk.
  Agent.prototype.resetToHome = function () {
    this.hideBubble();
    this._settle({ cancelled: true }); // release any pending walk promise
    this._stopWalking();
    const loc = OV.LOCATIONS[this.home] || OV.LOCATIONS.CENTER_AREA;
    this.position.x = loc.x;
    this.position.y = loc.y;
    this.facing = loc.face || 'down';
    this.currentTask = null;
    this.currentTool = null;
    this.animationState = 'idle';
    this.status = STATES.IDLE;
    this.render();
    if (typeof this.onChange === 'function') this.onChange(this, {});
  };

  OV.Agent = Agent;
})(window.OV = window.OV || {});
