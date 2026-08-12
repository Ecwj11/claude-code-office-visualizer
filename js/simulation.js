/*
 * simulation.js
 * The scripted "day in the office" that the SIMULATE button plays. It is a
 * thin orchestration layer: it mostly emits the same lifecycle events a real
 * Claude Code bridge would (OV.Events.emit) and uses the World's collaboration
 * helper for agent-to-agent scenes. Every await is guarded by the generation
 * counter, so RESET stops the story instantly and cleanly.
 */
(function (OV) {
  'use strict';

  const STATES = OV.STATES;

  const Simulation = {
    active: false,

    run: function () {
      if (this.active) return; // already playing
      const W = OV.World;
      const gen = W.generation;
      this.active = true;
      this._setButton(true);
      W.log('sim', '▶ Simulation started');

      const self = this;
      this._script(W, gen).then(function () {
        if (W.alive(gen)) W.log('sim', '■ Simulation finished · office idle');
      }).catch(function (err) {
        console.error('Simulation error', err);
      }).then(function () {
        if (W.alive(gen)) { self.active = false; self._setButton(false); }
      });
    },

    stop: function () {
      // RESET bumps the generation; we just drop our active flag/button.
      this.active = false;
      this._setButton(false);
    },

    _setButton: function (on) {
      const btn = document.getElementById('btn-simulate');
      if (!btn) return;
      btn.classList.toggle('is-running', on);
      btn.querySelector('.btn-label').textContent = on ? 'RUNNING…' : 'SIMULATE';
      btn.disabled = on;
    },

    // The choreography. Reads top-to-bottom like a storyboard.
    _script: async function (W, gen) {
      const ok = () => W.alive(gen);
      const E = OV.Events;
      const claude = W.byId.claude;

      // 1. Claude thinks at the whiteboard
      claude.setState(STATES.THINKING, { task: 'Planning the task' });
      await W.walk(claude, 'WHITEBOARD'); if (!ok()) return;
      claude.say('Let me plan this out…');
      await W.delay(2200); if (!ok()) return;

      // 2. Claude spawns Builder
      W.log('sim', 'Claude spawns Builder');
      claude.say('Builder — build the API');
      await E.emit({ type: 'SUBAGENT_START', agent: 'builder' }); if (!ok()) return;
      await E.emit({ type: 'PRE_TOOL_USE', agent: 'builder', tool: 'Edit', task: 'src/api/routes.ts' }); if (!ok()) return;

      // Claude returns to its desk to orchestrate
      W.walk(claude, 'CLAUDE_DESK', { state: STATES.WORKING, task: 'Orchestrating' });
      await W.delay(2600); if (!ok()) return;

      // 3. Claude spawns Debugger
      W.log('sim', 'Claude spawns Debugger');
      await E.emit({ type: 'SUBAGENT_START', agent: 'debugger' }); if (!ok()) return;
      await E.emit({ type: 'PRE_TOOL_USE', agent: 'debugger', tool: 'Bash', task: 'Checking Redis' }); if (!ok()) return;
      await W.delay(2000); if (!ok()) return;

      // 4. Builder needs help -> walks to Debugger -> they collaborate
      const builder = W.byId.builder;
      const debuggerA = W.byId.debugger;
      builder.setState(STATES.WAITING, { task: 'Need help' });
      builder.say('Need help 🙋');
      await W.delay(700); if (!ok()) return;
      await W.agentMeet(builder, debuggerA, 'API ready — can you check?', 'On it, checking…'); if (!ok()) return;
      builder.setState(STATES.WORKING, { task: 'src/api/routes.ts', tool: 'Edit' });

      // 5. Test starts, walks to the testing desk, runs, finds an issue
      W.log('sim', 'Claude spawns Test');
      await E.emit({ type: 'SUBAGENT_START', agent: 'test' }); if (!ok()) return;
      await E.emit({ type: 'PRE_TOOL_USE', agent: 'test', tool: 'Bash', task: 'Running pytest' }); if (!ok()) return;
      await W.delay(2600); if (!ok()) return;

      const test = W.byId.test;
      test.setState(STATES.ERROR, { task: '2 tests failing' });
      test.say('Found an issue ❌');
      await W.delay(1400); if (!ok()) return;

      // 6. Test walks to Claude to report -> Claude reacts
      await W.walk(test, 'CLAUDE_DESK'); if (!ok()) return;
      test.say('Tests failing on /users');
      claude.setState(STATES.THINKING, { task: 'Triaging failure' });
      claude.say('Debugger — take a look');
      await W.delay(1800); if (!ok()) return;
      W.walk(test, test.home, { state: STATES.WAITING, task: 'Waiting for fix' });

      // 7. Debugger fixes the issue
      debuggerA.setState(STATES.ERROR, { task: 'Reproducing bug' });
      debuggerA.say('Reproducing…');
      await W.delay(1800); if (!ok()) return;
      await E.emit({ type: 'PRE_TOOL_USE', agent: 'debugger', tool: 'Edit', task: 'Fix null check' }); if (!ok()) return;
      debuggerA.say('Fixing null check');
      await W.delay(2400); if (!ok()) return;
      await E.emit({ type: 'POST_TOOL_USE', agent: 'debugger', tool: 'Edit', message: 'Patched ✅' }); if (!ok()) return;

      // 8. Test re-runs and passes
      test.setState(STATES.WORKING, { task: 'Re-running pytest', tool: 'Bash' });
      test.say('Re-running…');
      await W.delay(2200); if (!ok()) return;
      test.setState(STATES.COMPLETED, { task: 'All green' });
      test.say('All tests pass ✅');

      // 9. Validator reviews the result
      W.log('sim', 'Claude spawns Validator');
      await E.emit({ type: 'SUBAGENT_START', agent: 'validator' }); if (!ok()) return;
      await E.emit({ type: 'PRE_TOOL_USE', agent: 'validator', tool: 'Read', task: 'Reviewing API' }); if (!ok()) return;
      await W.delay(2800); if (!ok()) return;
      const validator = W.byId.validator;
      validator.setState(STATES.COMPLETED, { task: 'LGTM 👍' });
      validator.say('Looks good, shipping');
      await W.delay(1200); if (!ok()) return;

      // 10. Everyone reports done and returns to idle
      await Promise.all([
        E.emit({ type: 'SUBAGENT_STOP', agent: 'builder', message: 'API built ✅' }),
        W.delay(400).then(() => E.emit({ type: 'SUBAGENT_STOP', agent: 'debugger', message: 'Bug fixed ✅' })),
      ]);
      if (!ok()) return;
      await Promise.all([
        E.emit({ type: 'SUBAGENT_STOP', agent: 'test', message: 'Tests green ✅' }),
        E.emit({ type: 'SUBAGENT_STOP', agent: 'validator', message: 'Reviewed ✅' }),
      ]);
      if (!ok()) return;

      claude.setState(STATES.IDLE, { task: null, tool: null });
    },
  };

  OV.Simulation = Simulation;
})(window.OV = window.OV || {});
