/*
 * bridge.js
 * Live mode: connects to the local bridge server's SSE stream and translates
 * real Claude Code hook events into office behaviour, reusing the exact same
 * OV.Events interface the simulation uses.
 *
 * Attribution model (per the official Claude Code hooks schema):
 *   - Subagents share the main session_id; the reliable key is `agent_id`,
 *     which is PRESENT on subagent events and ABSENT on main-session events.
 *   - No `agent_id`  → the main session → the "Claude" agent.
 *   - `SubagentStart {agent_id, agent_type}` → spawn a fresh office agent
 *     (named from `agent_type`). Its tool events carry the same `agent_id`.
 *   - `SubagentStop {agent_id}` → that agent reports to Claude and retires.
 *   - A `Task` PreToolUse in the main session is Claude delegating (announce).
 *
 * The mapping is tolerant of missing fields: worst case, activity is
 * attributed to Claude.
 */
(function (OV) {
  'use strict';

  const STATES = OV.STATES;

  function base(p) {
    if (!p) return '';
    const parts = String(p).split('/');
    return parts[parts.length - 1] || String(p);
  }
  function trunc(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }
  // Human label for a tool + its input.
  function describe(tool, input) {
    input = input || {};
    switch (tool) {
      case 'Edit':
      case 'MultiEdit':
      case 'Write':
      case 'NotebookEdit':
      case 'Read': return base(input.file_path || input.notebook_path);
      case 'Bash': return trunc(input.command, 40);
      case 'Grep': return 'grep ' + trunc(input.pattern, 24);
      case 'Glob': return trunc(input.pattern, 28);
      case 'Task': return trunc(input.description || input.subagent_type || 'subagent', 30);
      case 'WebFetch': return trunc(input.url, 30);
      case 'WebSearch': return trunc(input.query, 28);
      default: return tool || 'tool';
    }
  }

  const SUB_EMOJI = ['🤖', '🧩', '📦', '🔬', '⚙️', '🛰️'];
  const SUB_COLOR = ['#c4a3ff', '#7fd1e8', '#f2a65a', '#9be870', '#ef8fc0', '#f5c451'];

  const Bridge = {
    es: null,
    connected: false,
    _agents: {},          // Claude Code agent_id -> office agent id
    _subCount: 0,

    // ---- connection ------------------------------------------------------
    connect: function (url) {
      if (this.es) this.disconnect();
      if (!url) {
        // Use the same origin only when the page is actually served by the
        // bridge (port 4319); otherwise (file://, or the plain static server)
        // point at the bridge's default port.
        url = (/^https?:/.test(location.protocol) && location.port === '4319')
          ? location.origin + '/events'
          : 'http://localhost:4319/events';
      }
      try {
        this.es = new EventSource(url);
      } catch (e) {
        this._status('error');
        return;
      }
      this.es.onopen = () => { this.connected = true; this._status('live'); };
      this.es.onerror = () => {
        // EventSource auto-retries; reflect the interim state.
        if (this.connected) { this.connected = false; this._status('reconnecting'); }
        else this._status('offline');
      };
      this.es.onmessage = (e) => {
        let msg = null;
        try { msg = JSON.parse(e.data); } catch (_) { return; }
        this._onMessage(msg);
      };
      this._status('connecting');
    },

    disconnect: function () {
      if (this.es) { this.es.close(); this.es = null; }
      this.connected = false;
      this._status('offline');
    },

    _onMessage: function (msg) {
      if (!msg || !msg.type) return;
      if (msg.type === 'BRIDGE_CONNECTED') { this._status('live'); return; }
      if (msg.type === 'HOOK') this._onHook(msg.payload || {});
    },

    // ---- hook → office ---------------------------------------------------
    _onHook: function (p) {
      const name = p.hook_event_name || p.hookEventName || p.event || '';
      const aid = p.agent_id || p.agentId || null;   // present only in subagents
      const atype = p.agent_type || p.agentType || null;
      const tool = p.tool_name || p.toolName;
      const input = p.tool_input || p.toolInput || {};
      const W = OV.World;

      switch (name) {
        case 'SessionStart':
          this._claude().setState(STATES.IDLE, { task: null });
          W.log('live', 'Session started' + (p.source ? ' (' + p.source + ')' : ''));
          break;

        case 'UserPromptSubmit':
          this._claude().setState(STATES.THINKING, { task: 'Reading request' });
          this._claude().say('New task 📝');
          break;

        case 'SubagentStart':
          this._spawn(aid, atype);
          break;

        case 'PreToolUse':
          if (tool === 'Task' && !aid) {
            // Claude in the main session delegating; the subagent itself will
            // arrive via SubagentStart.
            const t = input.subagent_type || 'subagent';
            this._claude().setState(STATES.THINKING, { task: 'Delegating → ' + t });
            this._claude().say('Spawn ' + t);
          } else {
            const a = this._agentFor(aid, atype);
            OV.Events.emit({ type: 'PRE_TOOL_USE', agent: a.id, tool: tool, task: describe(tool, input) });
          }
          break;

        case 'PostToolUse': {
          const a = this._agentFor(aid, atype);
          OV.Events.emit({ type: 'POST_TOOL_USE', agent: a.id, tool: tool });
          break;
        }

        case 'SubagentStop': {
          const id = aid && this._agents[aid];
          if (id && W.byId[id]) {
            OV.Events.emit({ type: 'SUBAGENT_STOP', agent: id, message: trunc(p.last_assistant_message, 28) || 'Done ✅' });
            delete this._agents[aid];
          }
          break;
        }

        case 'Stop':
          this._claude().setState(STATES.IDLE, { task: null, tool: null });
          W.log('live', 'Claude idle');
          break;

        case 'Notification':
          this._claude().say(trunc(p.message || 'Notification', 30));
          break;

        case 'SessionEnd':
          W.log('live', 'Session ended');
          break;

        // The remaining ~20 infrastructure events (FileChanged, CwdChanged, …)
        // are intentionally ignored to keep the office readable.
        default:
          break;
      }
    },

    _claude: function () {
      return OV.World.byId.claude || OV.World.agents[0];
    },

    // Resolve the office agent for a Claude Code agent_id (null = main = Claude),
    // spawning one lazily if a tool event beats the SubagentStart.
    _agentFor: function (aid, atype) {
      if (!aid) return this._claude();
      const W = OV.World;
      if (this._agents[aid] && W.byId[this._agents[aid]]) return W.byId[this._agents[aid]];
      return this._spawn(aid, atype);
    },

    _spawn: function (aid, atype) {
      const W = OV.World;
      if (aid && this._agents[aid] && W.byId[this._agents[aid]]) return W.byId[this._agents[aid]];
      this._subCount++;
      const id = 'sub-' + this._subCount;
      const pretty = atype
        ? atype.replace(/(^|[-_ ])(\w)/g, (m, s, c) => (s ? ' ' : '') + c.toUpperCase()).trim()
        : 'Agent ' + this._subCount;
      if (aid) this._agents[aid] = id;
      OV.Events.emit({
        type: 'SUBAGENT_START',
        agent: id,
        name: pretty,
        role: atype || 'Subagent',
        emoji: SUB_EMOJI[(this._subCount - 1) % SUB_EMOJI.length],
        color: SUB_COLOR[(this._subCount - 1) % SUB_COLOR.length],
      });
      return W.byId[id];
    },

    // ---- status pill -----------------------------------------------------
    _status: function (state) {
      const el = document.getElementById('bridge-status');
      if (!el) return;
      const label = {
        live: 'LIVE', connecting: 'CONNECTING…', reconnecting: 'RECONNECTING…',
        offline: 'SIM', error: 'SIM', '': 'SIM',
      }[state] || 'SIM';
      el.dataset.state = state;
      el.textContent = label;
      el.title = state === 'live'
        ? 'Connected to Claude Code hook bridge'
        : 'Not connected — showing simulation. Run bridge/server.js and Claude Code hooks to go live.';
    },
  };

  OV.Bridge = Bridge;
})(window.OV = window.OV || {});
