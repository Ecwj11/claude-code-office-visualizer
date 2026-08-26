/*
 * events.js
 * The integration seam. Today the office is driven by the built-in simulation,
 * but every visible behaviour is expressed as a reaction to a small set of
 * events that mirror real Claude Code lifecycle hooks:
 *
 *     SUBAGENT_START   PRE_TOOL_USE   POST_TOOL_USE   SUBAGENT_STOP
 *
 * A real hook bridge (websocket, SSE, stdin reader...) only needs to call
 * OV.Events.emit({ type, agent, ... }); no visual code changes required.
 *
 * Event shape:
 *   { type, agent, name?, role?, emoji?, color?, home?, tool?, task?, message?, error? }
 */
(function (OV) {
  'use strict';

  const STATES = OV.STATES;

  // Resolve a live subagent's appearance from the active theme. Types the theme
  // knows about borrow that character's art; everything else becomes a shadow
  // clone of the orchestrator, which is the whole premise of the leaf theme.
  function castFor(subagentType) {
    const theme = OV.Themes && OV.Themes.active;
    if (!theme) return null;

    const base = theme.assets && theme.assets.base ? theme.assets.base : '';
    const byId = {};
    (theme.cast || []).forEach(function (c) { byId[c.id] = c; });

    const mapped = theme.castByType ? theme.castByType[subagentType] : null;
    const entry = mapped ? byId[mapped] : null;

    if (entry) {
      return {
        name: entry.name,
        emoji: entry.emoji,
        sprite: entry.sprite ? base + entry.sprite : null,
        color: entry.color,
        isClone: false,
      };
    }

    // A clone borrows the orchestrator's appearance. With Task 10 deferred there is
    // no sprite, so this resolves to the orchestrator's emoji — which is exactly the
    // intended reading: every unmapped subagent is a shadow clone of the boss.
    // The office theme declares no castByType and no clone treatment, so it returns
    // null here and keeps today's generic robot emoji.
    const boss = byId.claude;
    if (!boss || !theme.castByType) return null;
    return {
      name: subagentType || 'clone',
      emoji: boss.emoji,
      sprite: boss.sprite ? base + boss.sprite : null,
      color: '#7fd1e8', // chakra blue marks a clone
      isClone: true,
    };
  }

  function ensureAgent(evt) {
    const W = OV.World;
    let agent = W.byId[evt.agent];
    if (agent) return agent;
    // Dynamically spawn a new agent at the first free desk.
    const cast = castFor(evt.role || evt.name || evt.agent);
    const def = {
      id: evt.agent,
      name: evt.name || evt.agent,
      role: evt.role || 'Agent',
      emoji: evt.emoji || (cast && cast.emoji) || '🤖',
      sprite: (cast && cast.sprite) || null,
      color: evt.color || (cast && cast.color) || '#9aa4b2',
      home: evt.home || firstFreeDesk() || 'GATHER_SPOT',
      isClone: !!(cast && cast.isClone),
    };
    return W.addAgent(def);
  }

  function firstFreeDesk() {
    const W = OV.World;
    const used = {};
    W.agents.forEach((a) => { if (a.home) used[a.home] = true; });
    // Prefer the four team desks, then the overflow stations, so many
    // concurrent subagents spread across the floor instead of stacking.
    const spots = [
      'WORKER_1', 'WORKER_2', 'WORKER_3', 'WORKER_4',
      'OVERFLOW_1', 'OVERFLOW_2', 'OVERFLOW_3', 'OVERFLOW_4', 'OVERFLOW_5', 'OVERFLOW_6',
    ];
    for (let i = 0; i < spots.length; i++) if (!used[spots[i]]) return spots[i];
    return 'GATHER_SPOT'; // last resort if everything is taken
  }

  const Events = {
    castFor: castFor,

    emit: function (evt) {
      switch (evt.type) {
        case 'SUBAGENT_START': return this.onStart(evt);
        case 'PRE_TOOL_USE': return this.onPreTool(evt);
        case 'POST_TOOL_USE': return this.onPostTool(evt);
        case 'SUBAGENT_STOP': return this.onStop(evt);
        default:
          OV.World.log('event', 'Unhandled event: ' + evt.type);
          return Promise.resolve();
      }
    },

    // create agent -> walk to its desk -> wait for work
    onStart: function (evt) {
      const W = OV.World;
      const agent = ensureAgent(evt);
      W.log(agent.id, agent.name + ' spawned');
      agent.say('Hi 👋');
      agent.setState(STATES.WALKING);

      const theme = OV.Themes.active;
      const spawnFx = theme && theme.effects ? theme.effects.spawn : 'none';
      if (spawnFx && spawnFx !== 'none') {
        OV.Effects.queue.enqueue(function (mode) {
          return OV.Effects.play(spawnFx, {
            agent: agent,
            orchestrator: OV.World.byId.claude,
            mode: mode,
          });
        });
      }

      return W.walk(agent, agent.home, { state: STATES.WAITING, task: 'Ready' });
    },

    // status -> WORKING, sit at desk, show the tool/task
    onPreTool: function (evt) {
      const W = OV.World;
      const agent = ensureAgent(evt);
      const go = () => {
        agent.setState(STATES.WORKING, { task: evt.task || agent.currentTask, tool: evt.tool || null });
        if (evt.tool) agent.say(evt.tool);
        W.log(agent.id, 'PRE_TOOL_USE ' + (evt.tool || '') + (evt.task ? ' · ' + evt.task : ''));
      };
      // if the agent wandered off, walk it back to the desk first
      const atDesk = OV.Nav.dist(agent.position, OV.Nav.nodes[agent.home]) < 2;
      if (atDesk) { go(); return Promise.resolve(agent); }
      return W.walk(agent, agent.home).then(go);
    },

    // keep working / think about the result
    onPostTool: function (evt) {
      const agent = ensureAgent(evt);
      agent.setState(STATES.THINKING, { task: evt.task || agent.currentTask });
      if (evt.message) agent.say(evt.message);
      OV.World.log(agent.id, 'POST_TOOL_USE ' + (evt.tool || ''));
      return Promise.resolve(agent);
    },

    // completed -> leave desk -> walk to Claude -> report -> return & idle
    onStop: function (evt) {
      const W = OV.World;
      const agent = ensureAgent(evt);
      const gen = W.generation;
      agent.setState(STATES.COMPLETED, { task: 'Done' });
      W.log(agent.id, agent.name + ' completed');
      const claude = W.byId.claude;
      if (!claude || claude === agent) {
        agent.setState(STATES.IDLE, { task: null, tool: null });
        return Promise.resolve(agent);
      }
      return W.walk(agent, 'ORCHESTRATOR_HOME').then(() => {
        if (!W.alive(gen)) return;
        agent.say(evt.message || 'Task completed ✅');
        claude.say('Nice work');
        return W.delay(1800);
      }).then(() => {
        if (!W.alive(gen)) return;
        return W.walk(agent, agent.home, { state: STATES.IDLE, task: null, tool: null });
      }).then(() => {
        if (!W.alive(gen)) return;
        // Retire subagents spawned at runtime (e.g. live Task subagents) so the
        // office doesn't accumulate idle desks. The original roster stays.
        if (W._originalIds && !W._originalIds.has(agent.id)) {
          return W.delay(1200).then(() => {
            if (!W.alive(gen)) return;
            const theme = OV.Themes.active;
            const fx = theme && theme.effects ? theme.effects.despawn : 'none';
            return OV.Effects.despawn(fx, agent).then(() => {
              if (W.alive(gen)) W.removeAgent(agent.id);
            });
          });
        }
      });
    },
  };

  OV.Events = Events;
})(window.OV = window.OV || {});
