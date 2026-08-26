/*
 * themes/leaf.js
 * The "Hidden Leaf" theme: a ninja village training ground where the
 * orchestrator is the village leader and every subagent it dispatches is a
 * shadow clone. Scenery is painted into the floor image, so the furniture
 * entries below are label-only hotspots aligned to that art.
 */
(function (OV) {
  'use strict';

  // Canon names are fan work. Set to false before publishing to npm.
  const CANON_NAMES = true;
  // true  -> Naruto, Sasuke, Kakashi, Sakura, Shikamaru
  // false -> Hokage, Blade, Copy-nin, Petal, Shadow

  function nm(canon, generic) { return CANON_NAMES ? canon : generic; }

  OV.Themes.register({
    id: 'leaf',
    name: 'Hidden Leaf',

    slots: {
      ORCHESTRATOR_HOME: { x: 50, y: 22, face: 'up', label: nm('Hokage desk', 'Leader desk') },
      THINK_SPOT: { x: 12, y: 30, face: 'left', label: 'Mission board' },
      BREAK_SPOT: { x: 87, y: 18, face: 'up', label: nm('Ichiraku', 'Ramen stand') },
      AMBIENT_SPOT: { x: 50, y: 8, face: 'up', label: 'Village gate' },
      GATHER_SPOT: { x: 50, y: 60, face: 'down', label: 'Training ground' },

      WORKER_1: { x: 18, y: 48, face: 'left', label: 'Training post' },
      WORKER_2: { x: 82, y: 48, face: 'right', label: 'Training post' },
      WORKER_3: { x: 18, y: 74, face: 'left', label: 'Training post' },
      WORKER_4: { x: 82, y: 74, face: 'right', label: 'Training post' },

      OVERFLOW_1: { x: 33, y: 58, face: 'down', label: 'Perch' },
      OVERFLOW_2: { x: 50, y: 55, face: 'down', label: 'Perch' },
      OVERFLOW_3: { x: 67, y: 58, face: 'down', label: 'Perch' },
      OVERFLOW_4: { x: 33, y: 72, face: 'down', label: 'Perch' },
      OVERFLOW_5: { x: 50, y: 73, face: 'down', label: 'Perch' },
      OVERFLOW_6: { x: 67, y: 72, face: 'down', label: 'Perch' },
    },

    waypoints: {
      WP_PLAZA: { x: 50, y: 38 },
      WP_MID: { x: 50, y: 60 },
      WP_BOT: { x: 50, y: 80 },
      WP_L_TOP: { x: 32, y: 44 },
      WP_R_TOP: { x: 68, y: 44 },
      WP_L_MID: { x: 32, y: 60 },
      WP_R_MID: { x: 68, y: 60 },
      WP_SCROLL: { x: 25, y: 36 },
      WP_RAMEN: { x: 74, y: 28 },
    },

    edges: [
      ['ORCHESTRATOR_HOME', 'WP_PLAZA'],
      ['AMBIENT_SPOT', 'WP_PLAZA'],
      ['WP_PLAZA', 'WP_L_TOP'],
      ['WP_PLAZA', 'WP_R_TOP'],
      ['WP_PLAZA', 'WP_MID'],
      ['WP_PLAZA', 'WP_SCROLL'],
      ['WP_PLAZA', 'WP_RAMEN'],
      ['WP_SCROLL', 'THINK_SPOT'],
      ['WP_RAMEN', 'BREAK_SPOT'],
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

    // Scenery is painted into village-floor.webp; these are label hotspots
    // positioned to sit under the corresponding painted landmark.
    furniture: [
      { id: 'gate', kind: 'hotspot', x: 50, y: 8, label: 'Village gate' },
      { id: 'tower', kind: 'hotspot', x: 50, y: 22, label: nm('Hokage tower', 'Leader tower') },
      { id: 'ramen', kind: 'hotspot', x: 87, y: 18, label: nm('Ichiraku', 'Ramen') },
      { id: 'board', kind: 'hotspot', x: 12, y: 30, label: 'Missions' },
      { id: 'post-1', kind: 'hotspot', x: 18, y: 48, label: 'Post' },
      { id: 'post-2', kind: 'hotspot', x: 82, y: 48, label: 'Post' },
      { id: 'post-3', kind: 'hotspot', x: 18, y: 74, label: 'Post' },
      { id: 'post-4', kind: 'hotspot', x: 82, y: 74, label: 'Post' },
    ],

    cast: [
      // No `sprite` fields: Task 10 is deferred, so the cast renders as emoji via the
      // fallback path built in Task 7. Adding artwork later means adding `sprite:` here
      // and an `assets` block below — no other change.
      { slot: 'ORCHESTRATOR_HOME', id: 'claude', name: nm('Naruto', 'Hokage'), role: 'Orchestrator', emoji: '🍥', color: '#ff9c3f' },
      { slot: 'WORKER_1', id: 'builder', name: nm('Sasuke', 'Blade'), role: 'Engineer', emoji: '⚡', color: '#6ea8fe' },
      { slot: 'WORKER_2', id: 'test', name: nm('Sakura', 'Petal'), role: 'QA', emoji: '🌸', color: '#f48fb1' },
      { slot: 'WORKER_3', id: 'debugger', name: nm('Kakashi', 'Copy-nin'), role: 'Fixer', emoji: '📖', color: '#b0b7c6' },
      { slot: 'WORKER_4', id: 'validator', name: nm('Shikamaru', 'Shadow'), role: 'Reviewer', emoji: '🧩', color: '#9ccc65' },
    ],

    // Live subagents arrive identified by subagent_type. Mapped types borrow a
    // cast member's art; everything else renders as a shadow clone.
    castByType: {
      builder: 'builder',
      'cavecrew-builder': 'builder',
      debugger: 'debugger',
      test: 'test',
      validator: 'validator',
      reviewer: 'validator',
      'code-reviewer': 'validator',
    },

    strings: {
      ambient_THINK_SPOT: 'Reading the mission scroll…',
      ambient_BREAK_SPOT: '🍜 ramen break',
      ambient_GATHER_SPOT: 'Training',
      ambient_AMBIENT_SPOT: 'Watching the gate',
    },

    // No `assets` block while Task 10 is deferred. `--floor-image` therefore stays
    // unset and `.office-floor` falls back to the palette gradient below.

    palette: {
      '--floor': '#3f7d4a',
      '--floor-2': '#458455',
      '--wall': '#2b4d33',
      '--accent': '#ff9c3f',
    },

    effects: { spawn: 'jutsu', despawn: 'poof' },
  });
})(window.OV = window.OV || {});
