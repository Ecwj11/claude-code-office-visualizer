/*
 * themes/index.js
 * Theme registry. A theme is pure data describing one floor: where the
 * semantic slots are, how they connect, what furniture is painted, who the
 * cast is, and which spawn effects to play. Core code never names furniture
 * directly — it asks for a slot, and the active theme answers.
 */
(function (OV) {
  'use strict';

  const REQUIRED_SLOTS = [
    'ORCHESTRATOR_HOME', 'THINK_SPOT', 'BREAK_SPOT', 'AMBIENT_SPOT', 'GATHER_SPOT',
    'WORKER_1', 'WORKER_2', 'WORKER_3', 'WORKER_4',
    'OVERFLOW_1', 'OVERFLOW_2', 'OVERFLOW_3', 'OVERFLOW_4', 'OVERFLOW_5', 'OVERFLOW_6',
  ];

  const STORAGE_KEY = 'ov.theme';
  const registry = {};

  function validate(theme) {
    const errors = [];
    if (!theme || typeof theme !== 'object') return { ok: false, errors: ['theme is not an object'] };
    if (!theme.id) errors.push('theme is missing an id');
    if (!theme.name) errors.push('theme is missing a name');

    const slots = theme.slots || {};
    REQUIRED_SLOTS.forEach(function (name) {
      const s = slots[name];
      if (!s) { errors.push('missing required slot: ' + name); return; }
      if (typeof s.x !== 'number' || typeof s.y !== 'number') {
        errors.push('slot ' + name + ' needs numeric x and y');
      }
    });

    const known = {};
    Object.keys(slots).forEach(function (n) { known[n] = true; });
    Object.keys(theme.waypoints || {}).forEach(function (n) { known[n] = true; });

    (theme.edges || []).forEach(function (pair) {
      if (!Array.isArray(pair) || pair.length !== 2) {
        errors.push('edge is not a pair: ' + JSON.stringify(pair));
        return;
      }
      pair.forEach(function (end) {
        if (!known[end]) errors.push('edge references unknown node: ' + end);
      });
    });

    (theme.cast || []).forEach(function (c) {
      if (!c.id) errors.push('cast entry is missing an id');
      if (!slots[c.slot]) errors.push('cast entry ' + (c.id || '?') + ' bound to unknown slot: ' + c.slot);
    });

    return { ok: errors.length === 0, errors: errors };
  }

  function register(theme) {
    registry[theme.id] = theme;
    return theme;
  }

  function get(id) { return registry[id] || null; }

  // Theme-flavored copy with a fallback, so a theme that defines no strings
  // still reads correctly rather than rendering "undefined".
  function strings(key, fallback) {
    const t = Themes.active;
    const table = t && t.strings ? t.strings : null;
    return (table && table[key] !== undefined) ? table[key] : fallback;
  }

  function list() { return Object.keys(registry).map(function (id) { return registry[id]; }); }

  function remember(id) {
    try {
      const store = (typeof localStorage !== 'undefined') ? localStorage : null;
      if (store) store.setItem(STORAGE_KEY, id);
    } catch (e) { /* storage blocked; the default theme still loads */ }
  }

  function remembered() {
    try {
      const store = (typeof localStorage !== 'undefined') ? localStorage : null;
      return store ? store.getItem(STORAGE_KEY) : null;
    } catch (e) { return null; }
  }

  function apply(id) {
    const theme = registry[id];
    if (!theme) {
      console.error('themes: unknown theme', id);
      return false;
    }
    const result = validate(theme);
    if (!result.ok) {
      console.error('themes: refusing to apply invalid theme "' + id + '":\n  ' + result.errors.join('\n  '));
      return false;
    }

    Themes.active = theme;

    // Publish the layout under the names the rest of the app already reads.
    OV.LOCATIONS = theme.slots;
    OV.WAYPOINTS = theme.waypoints || {};
    OV.EDGES = theme.edges || [];
    OV.AGENT_DEFS = (theme.cast || []).map(function (c) {
      return {
        id: c.id,
        name: c.name,
        role: c.role,
        emoji: c.emoji,
        sprite: c.sprite ? (theme.assets && theme.assets.base ? theme.assets.base + c.sprite : c.sprite) : null,
        color: c.color,
        home: c.slot,
        orchestrator: c.slot === 'ORCHESTRATOR_HOME',
      };
    });

    OV.Nav.rebuild(OV.LOCATIONS, OV.WAYPOINTS, OV.EDGES);
    if (OV.World && typeof OV.World.applyTheme === 'function') OV.World.applyTheme(theme);
    remember(id);
    return true;
  }

  const Themes = {
    REQUIRED_SLOTS: REQUIRED_SLOTS,
    STORAGE_KEY: STORAGE_KEY,
    active: null,
    register: register,
    validate: validate,
    strings: strings,
    get: get,
    list: list,
    apply: apply,
    remembered: remembered,
  };

  OV.Themes = Themes;
})(window.OV = window.OV || {});
