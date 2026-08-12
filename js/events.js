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

  function ensureAgent(evt) {
    const W = OV.World;
    let agent = W.byId[evt.agent];
    if (agent) return agent;
    // Dynamically spawn a new agent at the first free desk.
    const def = {
      id: evt.agent,
      name: evt.name || evt.agent,
      role: evt.role || 'Agent',
      emoji: evt.emoji || '🤖',
      color: evt.color || '#9aa4b2',
      home: evt.home || firstFreeDesk() || 'CENTER_AREA',
    };
    return W.addAgent(def);
  }

  function firstFreeDesk() {
    const W = OV.World;
    const used = {};
    W.agents.forEach((a) => { if (a.home) used[a.home] = true; });
    const desks = ['DESK_BUILDER', 'DESK_DEBUGGER', 'DESK_TEST', 'DESK_VALIDATOR'];
    for (let i = 0; i < desks.length; i++) if (!used[desks[i]]) return desks[i];
    return null;
  }

  const Events = {
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
      return W.walk(agent, 'CLAUDE_DESK').then(() => {
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
          W.delay(1200).then(() => { if (W.alive(gen)) W.removeAgent(agent.id); });
        }
      });
    },
  };

  OV.Events = Events;
})(window.OV = window.OV || {});
