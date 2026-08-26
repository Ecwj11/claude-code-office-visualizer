/*
 * config.js
 * Static, theme-independent configuration for the visualizer: agent states
 * and tuning constants.
 *
 * Floor layout (navigation points, the waypoint graph, furniture and the
 * agent roster) is no longer defined here — it lives in js/themes/ as
 * per-theme data registered via OV.Themes.register(). See js/themes/office.js
 * for the original office floor.
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
  OV.CONFIG = CONFIG;
})(window.OV = window.OV || {});
