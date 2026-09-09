/*
 * themes/office.js
 * The original Agent Office floor, expressed as theme data. Coordinates and
 * labels are copied verbatim from the pre-theme js/config.js and index.html so
 * this theme renders identically to v1.0.2.
 */
(function (OV) {
  'use strict';

  OV.Themes.register({
    id: 'office',
    name: 'Agent Office',

    slots: {
      ORCHESTRATOR_HOME: { x: 50, y: 26, face: 'up', label: "Claude's desk" },
      THINK_SPOT: { x: 11, y: 22, face: 'left', label: 'Whiteboard' },
      BREAK_SPOT: { x: 88, y: 15, face: 'up', label: 'Coffee' },
      AMBIENT_SPOT: { x: 50, y: 10, face: 'up', label: 'Window' },
      GATHER_SPOT: { x: 50, y: 62, face: 'down', label: 'Center' },

      WORKER_1: { x: 16, y: 50, face: 'left', label: "Builder's desk" },
      WORKER_2: { x: 84, y: 50, face: 'right', label: "Test's desk" },
      WORKER_3: { x: 16, y: 76, face: 'left', label: "Debugger's desk" },
      WORKER_4: { x: 84, y: 76, face: 'right', label: "Validator's desk" },

      OVERFLOW_1: { x: 34, y: 57, face: 'down', label: 'Station' },
      OVERFLOW_2: { x: 50, y: 56, face: 'down', label: 'Station' },
      OVERFLOW_3: { x: 66, y: 57, face: 'down', label: 'Station' },
      OVERFLOW_4: { x: 34, y: 71, face: 'down', label: 'Station' },
      OVERFLOW_5: { x: 50, y: 72, face: 'down', label: 'Station' },
      OVERFLOW_6: { x: 66, y: 71, face: 'down', label: 'Station' },
    },

    waypoints: {
      WP_TOP: { x: 50, y: 40 },
      WP_MID: { x: 50, y: 62 },
      WP_BOT: { x: 50, y: 82 },
      WP_L_TOP: { x: 33, y: 45 },
      WP_R_TOP: { x: 67, y: 45 },
      WP_L_MID: { x: 33, y: 62 },
      WP_R_MID: { x: 67, y: 62 },
      WP_WB: { x: 26, y: 34 },
      WP_COFFEE: { x: 74, y: 26 },
    },

    edges: [
      ['ORCHESTRATOR_HOME', 'WP_TOP'],
      ['AMBIENT_SPOT', 'WP_TOP'],
      ['WP_TOP', 'WP_L_TOP'],
      ['WP_TOP', 'WP_R_TOP'],
      ['WP_TOP', 'WP_MID'],
      ['WP_TOP', 'WP_WB'],
      ['WP_TOP', 'WP_COFFEE'],
      ['WP_WB', 'THINK_SPOT'],
      ['WP_COFFEE', 'BREAK_SPOT'],
      ['WP_L_TOP', 'WP_L_MID'],
      ['WP_R_TOP', 'WP_R_MID'],
      ['WP_MID', 'WP_L_MID'],
      ['WP_MID', 'WP_R_MID'],
      ['WP_MID', 'WP_BOT'],
      ['WP_MID', 'GATHER_SPOT'],
      ['WP_L_MID', 'WORKER_1'],
      ['WP_R_MID', 'WORKER_2'],
      ['WP_L_MID', 'WP_BOT'],
      ['WP_R_MID', 'WP_BOT'],
      ['WP_BOT', 'WORKER_3'],
      ['WP_BOT', 'WORKER_4'],
      ['WP_MID', 'OVERFLOW_1'],
      ['WP_MID', 'OVERFLOW_2'],
      ['WP_MID', 'OVERFLOW_3'],
      ['WP_MID', 'OVERFLOW_4'],
      ['WP_MID', 'OVERFLOW_5'],
      ['WP_MID', 'OVERFLOW_6'],
    ],

    // Mirrors the furniture that used to be hardcoded in index.html.
    furniture: [
      { id: 'rug', kind: 'rug', x: 50, y: 62 },
      { id: 'window', kind: 'window', x: 50, y: 10, label: 'Window' },
      { id: 'coffee', kind: 'coffee', x: 88, y: 15, emoji: '☕', label: 'Coffee' },
      { id: 'whiteboard', kind: 'whiteboard', x: 11, y: 22, label: 'Whiteboard' },
      { id: 'desk-claude', kind: 'desk', x: 50, y: 26, emoji: '🖥️', label: 'Claude', className: 'desk-claude' },
      { id: 'desk-1', kind: 'desk', x: 16, y: 50, emoji: '💻', label: 'Builder' },
      { id: 'desk-2', kind: 'desk', x: 84, y: 50, emoji: '💻', label: 'Test' },
      { id: 'desk-3', kind: 'desk', x: 16, y: 76, emoji: '💻', label: 'Debugger' },
      { id: 'desk-4', kind: 'desk', x: 84, y: 76, emoji: '💻', label: 'Validator' },
      { id: 'plant-1', kind: 'plant', x: 50, y: 90, emoji: '🪴' },
      { id: 'plant-2', kind: 'plant', x: 6, y: 92, emoji: '🌿' },
      { id: 'plant-3', kind: 'plant', x: 94, y: 92, emoji: '🌿' },
    ],

    cast: [
      { slot: 'ORCHESTRATOR_HOME', id: 'claude', name: 'Claude', role: 'Orchestrator', emoji: '🧠', color: '#d97757' },
      { slot: 'WORKER_1', id: 'builder', name: 'Builder', role: 'Engineer', emoji: '👷', color: '#6ea8fe' },
      { slot: 'WORKER_2', id: 'test', name: 'Test', role: 'QA', emoji: '🧪', color: '#63d2a4' },
      { slot: 'WORKER_3', id: 'debugger', name: 'Debugger', role: 'Fixer', emoji: '🔧', color: '#e879a6' },
      { slot: 'WORKER_4', id: 'validator', name: 'Validator', role: 'Reviewer', emoji: '🛡️', color: '#f5c451' },
    ],

    // No castByType: unmapped live subagents keep today's generic robot emoji.
    strings: {
      ambient_THINK_SPOT: 'Reviewing the plan…',
      ambient_BREAK_SPOT: '☕ break',
      ambient_GATHER_SPOT: 'Stretching',
      ambient_AMBIENT_SPOT: 'Nice view',
    },
    palette: {},
    effects: { spawn: 'none', despawn: 'none' },
  });
})(window.OV = window.OV || {});
