/*
 * config.js
 * Static world configuration for the Agent Office visualizer.
 *
 * Everything here is data, not behaviour: agent states, office navigation
 * points, the waypoint graph used for simple path routing, agent definitions
 * and timing constants. Keeping it isolated makes it trivial to add new agents
 * or new navigation points without touching movement logic.
 *
 * Coordinates are expressed as percentages (0-100) of the office floor. This
 * keeps all movement relative to the office area so the layout stays correct
 * as the window resizes.
 */
(function (OV) {
  'use strict';

  // ---- Agent states -------------------------------------------------------
  // A finite set of behavioural states. The value is also used as a CSS class
  // (`state-idle`, `state-working`, ...) and as the status badge label.
  const STATES = {
    IDLE: 'IDLE',
    WORKING: 'WORKING',
    WALKING: 'WALKING',
    THINKING: 'THINKING',
    WAITING: 'WAITING',
    ERROR: 'ERROR',
    COMPLETED: 'COMPLETED',
    COLLABORATING: 'COLLABORATING',
  };

  // ---- Office navigation points ------------------------------------------
  // Named destinations agents can be told to walk to. `x`/`y` are the point an
  // agent stands on; `face` is the default facing direction once arrived.
  const LOCATIONS = {
    WINDOW: { x: 50, y: 10, face: 'up', label: 'Window' },
    COFFEE_AREA: { x: 88, y: 15, face: 'up', label: 'Coffee' },
    WHITEBOARD: { x: 11, y: 22, face: 'left', label: 'Whiteboard' },
    CLAUDE_DESK: { x: 50, y: 26, face: 'up', label: "Claude's desk" },
    DESK_BUILDER: { x: 16, y: 50, face: 'left', label: "Builder's desk" },
    DESK_TEST: { x: 84, y: 50, face: 'right', label: "Test's desk" },
    DESK_DEBUGGER: { x: 16, y: 76, face: 'left', label: "Debugger's desk" },
    DESK_VALIDATOR: { x: 84, y: 76, face: 'right', label: "Validator's desk" },
    CENTER_AREA: { x: 50, y: 62, face: 'down', label: 'Center' },
  };

  // ---- Waypoint graph -----------------------------------------------------
  // A small hand-authored graph forming a central "hallway". Every edge is a
  // straight line that has been placed to stay clear of desks and walls, so an
  // agent that only ever moves along graph edges never walks through furniture.
  //
  // Named LOCATIONS are also nodes in this graph (connected to the nearest
  // hallway waypoint). Pathfinding (see nav.js) runs over this structure. The
  // shape is intentionally simple; a heavier planner (A*, nav mesh) can replace
  // nav.js later without changing anything here beyond adding nodes/edges.
  const WAYPOINTS = {
    WP_TOP: { x: 50, y: 40 },
    WP_MID: { x: 50, y: 62 },
    WP_BOT: { x: 50, y: 82 },
    WP_L_TOP: { x: 33, y: 45 },
    WP_R_TOP: { x: 67, y: 45 },
    WP_L_MID: { x: 33, y: 62 },
    WP_R_MID: { x: 67, y: 62 },
    WP_WB: { x: 26, y: 34 },
    WP_COFFEE: { x: 74, y: 26 },
  };

  // Undirected adjacency. Listed once per pair; nav.js mirrors it both ways.
  const EDGES = [
    ['CLAUDE_DESK', 'WP_TOP'],
    ['WINDOW', 'WP_TOP'],
    ['WP_TOP', 'WP_L_TOP'],
    ['WP_TOP', 'WP_R_TOP'],
    ['WP_TOP', 'WP_MID'],
    ['WP_TOP', 'WP_WB'],
    ['WP_TOP', 'WP_COFFEE'],
    ['WP_WB', 'WHITEBOARD'],
    ['WP_COFFEE', 'COFFEE_AREA'],
    ['WP_L_TOP', 'WP_L_MID'],
    ['WP_R_TOP', 'WP_R_MID'],
    ['WP_MID', 'WP_L_MID'],
    ['WP_MID', 'WP_R_MID'],
    ['WP_MID', 'WP_BOT'],
    ['WP_MID', 'CENTER_AREA'],
    ['WP_L_MID', 'DESK_BUILDER'],
    ['WP_R_MID', 'DESK_TEST'],
    ['WP_L_MID', 'WP_BOT'],
    ['WP_R_MID', 'WP_BOT'],
    ['WP_BOT', 'DESK_DEBUGGER'],
    ['WP_BOT', 'DESK_VALIDATOR'],
  ];

  // ---- Agent definitions --------------------------------------------------
  // The roster the office starts with. `home` is the agent's own desk (where it
  // sits to work and returns to when idle). Adding an agent later is just a
  // matter of pushing another entry here (or calling World.addAgent at runtime).
  const AGENT_DEFS = [
    {
      id: 'claude',
      name: 'Claude',
      role: 'Orchestrator',
      emoji: '🧠',
      color: '#d97757',
      home: 'CLAUDE_DESK',
      orchestrator: true,
    },
    { id: 'builder', name: 'Builder', role: 'Engineer', emoji: '👷', color: '#6ea8fe', home: 'DESK_BUILDER' },
    { id: 'debugger', name: 'Debugger', role: 'Fixer', emoji: '🔧', color: '#e879a6', home: 'DESK_DEBUGGER' },
    { id: 'test', name: 'Test', role: 'QA', emoji: '🧪', color: '#63d2a4', home: 'DESK_TEST' },
    { id: 'validator', name: 'Validator', role: 'Reviewer', emoji: '🛡️', color: '#f5c451', home: 'DESK_VALIDATOR' },
  ];

  // ---- Tuning constants ---------------------------------------------------
  const CONFIG = {
    WALK_SPEED: 24, // percent of office per second
    ARRIVE_EPSILON: 0.6, // distance (%) at which a waypoint counts as reached
    BOB_ONLY_WHEN_MOVING: true,
    BUBBLE_MS: 3200, // how long a speech bubble stays up
    AMBIENT_MIN_MS: 5000, // idle wander scheduler window
    AMBIENT_MAX_MS: 15000,
    AMBIENT_MAX_CONCURRENT: 2, // at most this many agents wander at once
    LOG_MAX: 60, // event-log entries kept in the DOM
  };

  OV.STATES = STATES;
  OV.LOCATIONS = LOCATIONS;
  OV.WAYPOINTS = WAYPOINTS;
  OV.EDGES = EDGES;
  OV.AGENT_DEFS = AGENT_DEFS;
  OV.CONFIG = CONFIG;
})(window.OV = window.OV || {});
