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

  // Every character sheet shares one geometry: 704x348, 88x87 cells, 8 columns,
  // rows runRight/runLeft/idle/work. Only the file and the run-cycle length
  // differ. Returns a FRESH object each call — never a shared `cell`/`rows`
  // sub-object — so one cast member's block can't be mutated through another's.
  function sheetFor(file, runFrames) {
    return {
      sheet: 'assets/themes/leaf/' + file,
      cell: { w: 88, h: 87 },
      cols: 8,
      rows: { runRight: 0, runLeft: 1, idle: 2, work: 3 },
      counts: { runRight: runFrames, runLeft: runFrames, idle: 4, work: 4 },
    };
  }

  OV.Themes.register({
    id: 'leaf',
    name: 'Hidden Leaf',

    slots: {
      ORCHESTRATOR_HOME: { x: 50, y: 22, face: 'up', label: nm('Hokage desk', 'Leader desk') },
      THINK_SPOT: { x: 12, y: 30, face: 'left', label: 'Mission board' },
      BREAK_SPOT: { x: 87, y: 18, face: 'up', label: 'Tea corner' },
      AMBIENT_SPOT: { x: 50, y: 8, face: 'up', label: 'Window' },
      GATHER_SPOT: { x: 50, y: 60, face: 'down', label: 'Briefing floor' },

      WORKER_1: { x: 18, y: 48, face: 'left', label: 'Desk' },
      WORKER_2: { x: 82, y: 48, face: 'right', label: 'Desk' },
      WORKER_3: { x: 18, y: 74, face: 'left', label: 'Desk' },
      WORKER_4: { x: 82, y: 74, face: 'right', label: 'Desk' },

      OVERFLOW_1: { x: 33, y: 58, face: 'down', label: 'Floor' },
      OVERFLOW_2: { x: 50, y: 55, face: 'down', label: 'Floor' },
      OVERFLOW_3: { x: 67, y: 58, face: 'down', label: 'Floor' },
      OVERFLOW_4: { x: 33, y: 72, face: 'down', label: 'Floor' },
      OVERFLOW_5: { x: 50, y: 73, face: 'down', label: 'Floor' },
      OVERFLOW_6: { x: 67, y: 72, face: 'down', label: 'Floor' },
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
      { id: 'window', kind: 'hotspot', x: 50, y: 8, label: 'Window' },
      { id: 'tower', kind: 'hotspot', x: 50, y: 22, label: nm('Hokage tower', 'Leader tower') },
      { id: 'tea', kind: 'hotspot', x: 87, y: 18, label: 'Tea corner' },
      { id: 'board', kind: 'hotspot', x: 12, y: 30, label: 'Mission board' },
      { id: 'post-1', kind: 'hotspot', x: 18, y: 48, label: 'Desk' },
      { id: 'post-2', kind: 'hotspot', x: 82, y: 48, label: 'Desk' },
      { id: 'post-3', kind: 'hotspot', x: 18, y: 74, label: 'Desk' },
      { id: 'post-4', kind: 'hotspot', x: 82, y: 74, label: 'Desk' },
    ],

    cast: [
      // Every member has its own art. `sheetFor` builds a fresh block per
      // character (no shared sub-objects), so one character's geometry can
      // never be mutated through another's. Shikamaru's run cycles are 6
      // frames where the rest are 8 — the per-row `steps(n)` handling covers
      // that, and his two trailing columns are simply never displayed.
      { slot: 'ORCHESTRATOR_HOME', id: 'claude', name: nm('Naruto', 'Hokage'), role: 'Orchestrator', emoji: '🍥', color: '#ff9c3f', sprites: sheetFor('naruto-sheet.webp', 8) },
      { slot: 'WORKER_1', id: 'builder', name: nm('Sasuke', 'Blade'), role: 'Engineer', emoji: '⚡', color: '#6ea8fe', sprites: sheetFor('sasuke-sheet.webp', 8) },
      { slot: 'WORKER_2', id: 'test', name: nm('Sakura', 'Petal'), role: 'QA', emoji: '🌸', color: '#f48fb1', sprites: sheetFor('sakura-sheet.webp', 8) },
      { slot: 'WORKER_3', id: 'debugger', name: nm('Kakashi', 'Copy-nin'), role: 'Fixer', emoji: '📖', color: '#b0b7c6', sprites: sheetFor('kakashi-sheet.webp', 8) },
      { slot: 'WORKER_4', id: 'validator', name: nm('Shikamaru', 'Shadow'), role: 'Reviewer', emoji: '🧩', color: '#9ccc65', sprites: sheetFor('shikamaru-sheet.webp', 6) },
    ],

    // Fallback sheet for anything with no cast entry of its own — every shadow
    // clone spawned at runtime lands here (js/themes/index.js and js/events.js
    // both fall back to it). Naruto's art, because a clone IS a Naruto clone.
    // See js/sprite.js for the state→row logic and js/agent.js for the
    // load-failure fallback to the emoji above.
    //
    // Kept as a top-level `sprites` key rather than nested under `assets`:
    // sheet paths are full document-relative paths, while `assets.base` is
    // prefixed onto the single-image `sprite` key. Keeping them separate stops
    // the two path conventions from colliding.
    sprites: sheetFor('naruto-sheet.webp', 8),

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
      ambient_BREAK_SPOT: '🍵 tea break',
      ambient_GATHER_SPOT: 'Stretching',
      ambient_AMBIENT_SPOT: 'Watching the village',
    },

    // The painted mission-room scene. js/world.js sets `--floor-image` from
    // these two fields; `.office-floor` falls back to the palette gradient
    // below if the image ever fails to load.
    assets: { base: 'assets/themes/leaf/', floor: 'village-floor.webp' },

    palette: {
      '--floor': '#3f7d4a',
      '--floor-2': '#458455',
      '--wall': '#2b4d33',
      '--accent': '#ff9c3f',
    },

    effects: { spawn: 'jutsu', despawn: 'poof', spawnSound: 'assets/themes/leaf/shadow_clone_jutsu.mp3' },
  });
})(window.OV = window.OV || {});
