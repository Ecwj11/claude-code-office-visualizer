/*
 * main.js
 * Bootstraps the office and wires the toolbar. Kept intentionally tiny — all
 * behaviour lives in the World / Agent / Simulation / Events modules.
 */
(function (OV) {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  ready(function () {
    OV.World.init();

    const simulateBtn = document.getElementById('btn-simulate');
    const resetBtn = document.getElementById('btn-reset');
    const thinkBtn = document.getElementById('btn-think');
    const addBtn = document.getElementById('btn-add');

    if (simulateBtn) simulateBtn.addEventListener('click', function () {
      OV.Simulation.run();
    });

    if (resetBtn) resetBtn.addEventListener('click', function () {
      OV.Simulation.stop();
      OV.World.reset();
    });

    // "Think" — quick manual demo of a single behaviour without the full story.
    if (thinkBtn) thinkBtn.addEventListener('click', function () {
      const claude = OV.World.byId.claude;
      if (!claude) return;
      claude.setState(OV.STATES.THINKING, { task: 'Thinking…' });
      OV.World.walk(claude, 'WHITEBOARD').then(function () {
        claude.say('Hmm, let me think…');
        return OV.World.delay(3000);
      }).then(function () {
        return OV.World.walk(claude, 'CLAUDE_DESK', { state: OV.STATES.IDLE });
      });
    });

    // "Add agent" — demonstrates dynamic spawning via the event interface.
    let extra = 0;
    if (addBtn) addBtn.addEventListener('click', function () {
      extra++;
      const palette = ['#c4a3ff', '#7fd1e8', '#f2a65a', '#9be870'];
      OV.Events.emit({
        type: 'SUBAGENT_START',
        agent: 'worker-' + extra,
        name: 'Worker ' + extra,
        role: 'Helper',
        emoji: '🧩',
        color: palette[(extra - 1) % palette.length],
      });
    });

    // ---- live bridge (real Claude Code hook events) ----
    const liveBtn = document.getElementById('btn-live');
    function refreshLiveBtn() {
      if (!liveBtn) return;
      const on = !!OV.Bridge.es;
      liveBtn.textContent = on ? 'GO SIM' : 'GO LIVE';
      liveBtn.classList.toggle('is-live', on);
    }
    if (liveBtn) liveBtn.addEventListener('click', function () {
      if (OV.Bridge.es) OV.Bridge.disconnect();
      else OV.Bridge.connect();
      refreshLiveBtn();
    });
    // Auto-connect only when the page is served by the bridge itself, so the
    // plain static server / file:// don't spam retries at a missing endpoint.
    if (location.port === '4319') { OV.Bridge.connect(); refreshLiveBtn(); }

    // Expose for console tinkering / real-event bridge.
    window.OfficeVisualizer = OV;
  });
})(window.OV = window.OV || {});
