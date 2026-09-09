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

  // The four row classes a sheet-animated agent can wear on its .agent-sprite
  // element (see js/sprite.js and css/styles.css). Listed once so both the
  // apply and the load-failure cleanup path stay in sync.
  const SPRITE_ROW_CLASSES = ['sprite-row-runRight', 'sprite-row-runLeft', 'sprite-row-idle', 'sprite-row-work'];
  // Frame counts the stylesheet has keyframes for; anything else animates not at all.
  const SPRITE_STEP_CLASSES = ['sprite-steps-4', 'sprite-steps-6', 'sprite-steps-8'];

  function Agent(def, floorEl) {
    this.id = def.id || 'agent-' + (++seq);
    this.name = def.name || this.id;
    this.role = def.role || 'Agent';
    this.emoji = def.emoji || '🙂';
    this.sprite = def.sprite || null; // single static image path; null means render the emoji
    this.sprites = def.sprites || null; // theme-declared sheet config; null means no frame animation
    this.color = def.color || '#8ab4f8';
    this.home = def.home; // navigation-point name of this agent's desk
    this.orchestrator = !!def.orchestrator;

    // State
    this.status = STATES.IDLE;
    this.currentTask = null;
    this.currentTool = null;
    this.animationState = 'idle'; // idle | walking | working
    this.facing = 'down'; // down | up | left | right
    // The last time `facing` became 'left' or 'right' (never both null and
    // 'up'/'down' — see _setFacing). The sheet has no vertical run cycle, so
    // WALKING while facing up/down reuses this instead (js/sprite.js).
    this.lastHorizontalFacing = null;
    this._sheetReady = false; // true once this.sprites.sheet has loaded successfully
    this._spriteRow = null; // last sprite-row-* class applied, to skip redundant DOM writes

    // Movement (all coordinates are % of the office floor)
    const start = OV.LOCATIONS[this.home] || OV.LOCATIONS.GATHER_SPOT;
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
        '<div class="agent-sprite"></div>' +
        '<div class="agent-typing"><span></span><span></span><span></span></div>' +
      '</div>' +
      '<div class="agent-shadow"></div>' +
      '<div class="agent-tag"><span class="agent-dot"></span><span class="agent-tag-name"></span></div>';
    floorEl.appendChild(el);

    this.el = el;
    this.bubbleEl = el.querySelector('.agent-bubble');
    this.bodyEl = el.querySelector('.agent-body');
    this.spriteEl = el.querySelector('.agent-sprite');
    this._paintSprite();
    const nameEl = el.querySelector('.agent-tag-name');
    nameEl.textContent = this.name; // textContent avoids HTML injection
    nameEl.title = this.name;       // hover shows the full name if truncated
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
      if (loc) this._setFacing(loc.face || 'down');
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
    if (loc && loc.face) this._setFacing(loc.face);
    this.animationState = 'idle';
    this.render();
    this._settle(); // arrived normally (no cancel flag)
  };

  Agent.prototype._face = function (dx, dy) {
    if (Math.abs(dx) > Math.abs(dy)) {
      this._setFacing(dx < 0 ? 'left' : 'right');
    } else {
      this._setFacing(dy < 0 ? 'up' : 'down');
    }
  };

  // Every facing change funnels through here so `lastHorizontalFacing` can
  // never drift out of sync with `facing` — js/sprite.js's up/down fallback
  // depends on it staying accurate.
  Agent.prototype._setFacing = function (dir) {
    this.facing = dir;
    if (dir === 'left' || dir === 'right') this.lastHorizontalFacing = dir;
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

    // state class — preserve classes owned by other systems (effects add
    // is-clone, is-poofing, jutsu-seal...). render() runs every frame, so it
    // must not clobber them.
    const managed = /^(state|anim|face)-/;
    const kept = [];
    for (let i = 0; i < el.classList.length; i++) {
      const c = el.classList[i];
      if (c !== 'agent' && !managed.test(c)) kept.push(c);
    }
    el.className = ['agent',
      'state-' + this.status.toLowerCase(),
      'anim-' + this.animationState,
      'face-' + this.facing].concat(kept).join(' ');

    // Frame animation is driven entirely by CSS steps() keyframes (see
    // css/styles.css); this only decides *which* row's keyframes apply, via
    // OV.Sprite.rowForState — a pure function, unit-tested on its own.
    if (this.sprites && this._sheetReady) this._updateSpriteRow();
  };

  // Reset to a clean state at the home desk.
  Agent.prototype.resetToHome = function () {
    this.hideBubble();
    this._settle({ cancelled: true }); // release any pending walk promise
    this._stopWalking();
    const loc = OV.LOCATIONS[this.home] || OV.LOCATIONS.GATHER_SPOT;
    this.position.x = loc.x;
    this.position.y = loc.y;
    this.lastHorizontalFacing = null;
    this._setFacing(loc.face || 'down');
    this.currentTask = null;
    this.currentTool = null;
    this.animationState = 'idle';
    this.status = STATES.IDLE;
    this.render();
    if (typeof this.onChange === 'function') this.onChange(this, {});
  };

  // Swap in the sheet row for the agent's current state/facing, if it changed.
  // Cheap (a few comparisons + at most one classList write) and safe to call
  // every render() tick alongside ten other agents.
  Agent.prototype._updateSpriteRow = function () {
    const row = OV.Sprite.rowForState(this.status, this.facing, this.lastHorizontalFacing);
    if (row === this._spriteRow) return;
    this._spriteRow = row;
    const classList = this.spriteEl.classList;
    for (let i = 0; i < SPRITE_ROW_CLASSES.length; i++) classList.remove(SPRITE_ROW_CLASSES[i]);
    classList.add('sprite-row-' + row);

    // How many frames THIS row has is per-character data (Shikamaru runs 6
    // where the rest run 8), and CSS `steps()` cannot read a custom property —
    // so the count has to arrive as a class. The row class carries the row's
    // Y offset and duration; this one carries the frame count and distance.
    const counts = (this.sprites && this.sprites.counts) || {};
    const n = counts[row];
    for (let i = 0; i < SPRITE_STEP_CLASSES.length; i++) classList.remove(SPRITE_STEP_CLASSES[i]);
    if (SPRITE_STEP_CLASSES.indexOf('sprite-steps-' + n) !== -1) classList.add('sprite-steps-' + n);
  };

  // Sprite art, in order of preference: the theme's frame-animation sheet,
  // then a single static image, then the emoji. A failed image load always
  // falls back to the emoji rather than showing a broken box (Task 7).
  Agent.prototype._paintSprite = function () {
    if (this.sprites && this.sprites.sheet) { this._paintSheetSprite(); return; }

    const el = this.spriteEl;
    if (!this.sprite) {
      el.classList.remove('has-image');
      el.textContent = this.emoji;
      return;
    }
    const probe = new Image();
    const self = this;
    probe.onload = function () {
      el.textContent = '';
      el.classList.add('has-image');
      el.style.backgroundImage = 'url("' + self.sprite + '")';
    };
    probe.onerror = function () {
      console.warn('agent: sprite failed to load, falling back to emoji', self.sprite);
      el.classList.remove('has-image');
      el.style.backgroundImage = '';
      el.textContent = self.emoji;
    };
    el.textContent = this.emoji; // shown until the image resolves
    probe.src = this.sprite;
  };

  // Frame-animation sheet path: probes the sheet the same way the single-image
  // path above probes its image. On success, marks both the sprite element
  // (for the CSS that sizes/positions the sheet) and the agent root (for the
  // CSS that must NOT run — the emoji bob/wobble and left/right flip would
  // double up with, or fight, the sheet's own animation; see css/styles.css).
  // On failure, falls back to the emoji exactly like the single-image path.
  Agent.prototype._paintSheetSprite = function () {
    const el = this.spriteEl;
    const sheet = this.sprites.sheet;
    const probe = new Image();
    const self = this;
    probe.onload = function () {
      el.textContent = '';
      el.classList.add('has-sheet');
      self.el.classList.add('has-sheet-sprite');
      el.style.backgroundImage = 'url("' + sheet + '")';
      // Geometry comes from the theme, never from the stylesheet: the CSS
      // derives width, background-size and every keyframe offset from these,
      // so a sheet with different cells or a different column count needs no
      // CSS change and the two can never drift apart.
      const cell = self.sprites.cell || {};
      const rows = Object.keys(self.sprites.rows || {}).length || 4;
      el.style.setProperty('--sprite-cell-w', String(cell.w || 78));
      el.style.setProperty('--sprite-cell-h', String(cell.h || 87));
      el.style.setProperty('--sprite-cols', String(self.sprites.cols || 6));
      el.style.setProperty('--sprite-rows', String(rows));
      self._sheetReady = true;
      self._spriteRow = null; // force _updateSpriteRow to apply a row class now
      self.render();
    };
    probe.onerror = function () {
      console.warn('agent: sprite sheet failed to load, falling back to emoji', sheet);
      self._sheetReady = false;
      self._spriteRow = null;
      el.classList.remove('has-sheet');
      for (let i = 0; i < SPRITE_ROW_CLASSES.length; i++) el.classList.remove(SPRITE_ROW_CLASSES[i]);
      for (let i = 0; i < SPRITE_STEP_CLASSES.length; i++) el.classList.remove(SPRITE_STEP_CLASSES[i]);
      self.el.classList.remove('has-sheet-sprite');
      el.style.backgroundImage = '';
      el.textContent = self.emoji;
    };
    el.textContent = this.emoji; // shown until the sheet resolves
    probe.src = sheet;
  };

  OV.Agent = Agent;
})(window.OV = window.OV || {});
