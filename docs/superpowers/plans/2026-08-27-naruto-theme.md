# Switchable Themes + Hidden Leaf Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a runtime theme layer to the Agent Office visualizer and ship a second theme, "Hidden Leaf", in which subagent spawns play a shadow-clone jutsu animation.

**Architecture:** Core code stops naming furniture and instead asks the active theme for a *semantic slot* (`ORCHESTRATOR_HOME`, `WORKER_1`, `OVERFLOW_3`, …). Each theme is one data file supplying slot coordinates, waypoints, navigation edges, furniture, cast, palette, asset paths, and effect names. `Themes.apply(id)` validates the theme, rebuilds the navigation graph, re-renders the floor from data, and re-adds the cast — without tearing down the live Server-Sent Events bridge connection.

**Tech Stack:** Vanilla ES5-style classic scripts sharing `window.OV`, no bundler, no runtime dependencies. Tests run on Node's built-in `node --test`. Browser modules are loaded into tests through a `node:vm` shim.

**Spec:** `docs/superpowers/specs/2026-08-27-naruto-theme-design.md`

## Global Constraints

- No new runtime dependencies. No build step. The app must keep working when opened directly over `file://`.
- All scripts stay classic (non-module) IIFEs attaching to `window.OV`. Script order in `index.html` matters and is load-bearing.
- **Agent ids are theme-invariant.** Every theme's cast must use exactly these ids: `claude`, `builder`, `debugger`, `test`, `validator`. `js/simulation.js` looks agents up by id (`World.byId.builder`), so renaming an id in a theme breaks the simulation.
- The office theme must render identically to v1.0.2. Coordinates and labels are moved verbatim, not re-derived.
- Node version floor is 18 (per `.github/workflows/ci.yml` matrix: 18, 20, 22). Use only APIs available in Node 18.
- Theme palettes are applied from JavaScript as inline custom properties on `<body>`, never hardcoded in `css/styles.css`. Asset URLs in those properties are relative to `index.html` (for example `assets/themes/leaf/village-floor.webp`), because inline styles resolve against the document, not the stylesheet.
- Every commit message follows the existing repository style: a `type: subject` first line.

## Required Slot Contract

Every theme must define all fifteen slots. Validation rejects a theme that omits any.

```
ORCHESTRATOR_HOME  THINK_SPOT  BREAK_SPOT  AMBIENT_SPOT  GATHER_SPOT
WORKER_1  WORKER_2  WORKER_3  WORKER_4
OVERFLOW_1  OVERFLOW_2  OVERFLOW_3  OVERFLOW_4  OVERFLOW_5  OVERFLOW_6
```

`GATHER_SPOT` doubles as the fallback destination when every worker and overflow slot is occupied. Validation asserts exactly this list.

## File Structure

| File | Status | Responsibility |
| --- | --- | --- |
| `tools/browser-module.js` | Create | Load browser IIFE scripts into a `node:vm` sandbox so tests can exercise them |
| `tests/nav.test.js` | Create | Navigation graph rebuild and routing |
| `tests/themes.test.js` | Create | Theme registry, validation, slot contract, asset existence |
| `tests/spawn-queue.test.js` | Create | Spawn ritual backpressure logic |
| `js/themes/index.js` | Create | Theme registry, validation, `apply()`, persistence |
| `js/themes/office.js` | Create | Current office layout, moved out of `config.js` and `index.html` |
| `js/themes/leaf.js` | Create | Hidden Leaf layout, cast, and `CANON_NAMES` switch |
| `js/effects.js` | Create | `SpawnQueue` plus jutsu and poof effect implementations |
| `js/config.js` | Modify | Keeps `STATES` and tuning `CONFIG` only |
| `js/nav.js` | Modify | Gains `rebuild(slots, waypoints, edges)` |
| `js/agent.js` | Modify | Image sprites with emoji fallback; `GATHER_SPOT` fallback slot |
| `js/world.js` | Modify | `renderFloor(theme)` and `applyTheme(id)` |
| `js/events.js` | Modify | Slot names in `firstFreeDesk()`; effect hooks on spawn and stop |
| `js/simulation.js` | Modify | Slot names instead of hardcoded location names |
| `js/main.js` | Modify | Theme toggle wiring |
| `index.html` | Modify | Furniture markup deleted; theme toggle button; new script tags |
| `css/styles.css` | Modify | Floor image variable, jutsu and smoke keyframes, clone styling |
| `assets/themes/leaf/*.webp` | Create | Generated village floor and five character sprites |
| `package.json` | Modify | `test` script; `assets/` in `files` |
| `.github/workflows/ci.yml` | Modify | Recursive JS glob; run `npm test` |
| `README.md` | Modify | Themes section; `CANON_NAMES` release checklist |

---

### Task 1: Test harness for browser modules

The repository has no test framework. Every later task depends on being able to load `js/*.js` in Node, so this comes first.

**Files:**
- Create: `tools/browser-module.js`
- Create: `tests/nav.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `loadOV(files, options) -> OV` from `tools/browser-module.js`. `files` is an array of repository-relative paths loaded in order into one shared sandbox; the return value is the populated `window.OV` object. `options.document` optionally injects a stub `document`.

- [ ] **Step 1: Write the failing test**

Create `tests/nav.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { loadOV } = require('../tools/browser-module');

test('loadOV populates OV from classic scripts', () => {
  const OV = loadOV(['js/config.js']);
  assert.equal(OV.STATES.IDLE, 'IDLE');
  assert.equal(typeof OV.CONFIG.WALK_SPEED, 'number');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/nav.test.js`
Expected: FAIL with `Cannot find module '../tools/browser-module'`.

- [ ] **Step 3: Write minimal implementation**

Create `tools/browser-module.js`:

```js
/*
 * browser-module.js
 * Loads the app's classic browser scripts into a node:vm sandbox so they can be
 * unit-tested from Node. The app deliberately ships non-module IIFEs that
 * attach to window.OV; this shim gives them the `window` they expect without
 * requiring a bundler or a headless browser.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function loadOV(files, options) {
  options = options || {};
  const sandbox = {
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    Promise: Promise,
    localStorage: options.localStorage,
    document: options.document,
    window: {},
  };
  sandbox.window.OV = {};
  sandbox.window.localStorage = options.localStorage;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  files.forEach(function (file) {
    const full = path.join(ROOT, file);
    const src = fs.readFileSync(full, 'utf8');
    vm.runInContext(src, sandbox, { filename: file });
  });

  return sandbox.window.OV;
}

module.exports = { loadOV: loadOV, ROOT: ROOT };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/nav.test.js`
Expected: PASS, 1 test.

- [ ] **Step 5: Add the npm test script**

In `package.json`, add to `scripts`:

```json
"test": "node --test tests/*.test.js"
```

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/browser-module.js tests/nav.test.js package.json
git commit -m "test: add node:vm harness for loading browser modules in tests"
```

---

### Task 2: Make the navigation graph rebuildable

`js/nav.js:14-34` builds its node table and adjacency list once, at load, inside a closure. An alternate layout cannot take effect until that is re-runnable.

**Files:**
- Modify: `js/nav.js`
- Modify: `tests/nav.test.js`

**Interfaces:**
- Consumes: `loadOV` from Task 1.
- Produces: `OV.Nav.rebuild(slots, waypoints, edges)` which replaces `OV.Nav.nodes` and the internal adjacency table and returns `OV.Nav`. `OV.Nav.route(pos, destName)`, `OV.Nav.dist(a, b)`, `OV.Nav.nearestNode(pos)`, and `OV.Nav.nodes` keep their current signatures. `js/events.js:83` reads `OV.Nav.nodes` at call time, so `rebuild` must reassign the property rather than mutate a captured local.

- [ ] **Step 1: Write the failing test**

Append to `tests/nav.test.js`:

```js
test('Nav.rebuild swaps the graph and routes over the new one', () => {
  const OV = loadOV(['js/config.js', 'js/nav.js']);

  const slots = {
    A: { x: 0, y: 0, face: 'down', label: 'A' },
    B: { x: 0, y: 50, face: 'down', label: 'B' },
  };
  const waypoints = { W: { x: 0, y: 25 } };
  const edges = [['A', 'W'], ['W', 'B']];

  OV.Nav.rebuild(slots, waypoints, edges);

  assert.deepEqual(Object.keys(OV.Nav.nodes).sort(), ['A', 'B', 'W']);
  assert.deepEqual(OV.Nav.findPath('A', 'B'), ['A', 'W', 'B']);

  const pts = OV.Nav.route({ x: 0, y: 0 }, 'B');
  assert.deepEqual(pts, [{ x: 0, y: 0 }, { x: 0, y: 25 }, { x: 0, y: 50 }]);
});

test('Nav.rebuild drops nodes from the previous graph', () => {
  const OV = loadOV(['js/config.js', 'js/nav.js']);
  OV.Nav.rebuild({ A: { x: 0, y: 0 } }, {}, []);
  assert.equal(OV.Nav.nodes.CLAUDE_DESK, undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with `OV.Nav.rebuild is not a function`.

- [ ] **Step 3: Rewrite `js/nav.js`**

Replace the whole file body (keep the existing header comment, extending it to mention rebuild):

```js
(function (OV) {
  'use strict';

  // Live graph state. `rebuild` replaces these wholesale; every read below and
  // in other modules goes through the Nav object, so a theme switch takes
  // effect immediately without re-loading any script.
  let nodes = {};
  let adj = {};

  function rebuild(slots, waypoints, edges) {
    nodes = {};
    adj = {};

    Object.keys(slots || {}).forEach(function (name) {
      nodes[name] = { x: slots[name].x, y: slots[name].y };
    });
    Object.keys(waypoints || {}).forEach(function (name) {
      nodes[name] = { x: waypoints[name].x, y: waypoints[name].y };
    });

    Object.keys(nodes).forEach(function (n) { adj[n] = []; });
    (edges || []).forEach(function (pair) {
      const a = pair[0];
      const b = pair[1];
      if (!nodes[a] || !nodes[b]) {
        console.warn('nav: edge references unknown node', pair);
        return;
      }
      if (adj[a].indexOf(b) === -1) adj[a].push(b);
      if (adj[b].indexOf(a) === -1) adj[b].push(a);
    });

    Nav.nodes = nodes; // re-published so callers reading Nav.nodes see the new graph
    return Nav;
  }

  function dist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function nearestNode(pos) {
    let best = null;
    let bestD = Infinity;
    Object.keys(nodes).forEach(function (name) {
      const d = dist(pos, nodes[name]);
      if (d < bestD) { bestD = d; best = name; }
    });
    return best;
  }

  function findPath(start, goal) {
    if (start === goal) return [goal];
    const dst = {};
    const prev = {};
    const visited = {};
    Object.keys(nodes).forEach(function (n) { dst[n] = Infinity; });
    dst[start] = 0;

    while (true) {
      let u = null;
      let uD = Infinity;
      Object.keys(dst).forEach(function (n) {
        if (!visited[n] && dst[n] < uD) { uD = dst[n]; u = n; }
      });
      if (u === null) break;
      if (u === goal) break;
      visited[u] = true;
      adj[u].forEach(function (v) {
        const nd = dst[u] + dist(nodes[u], nodes[v]);
        if (nd < dst[v]) { dst[v] = nd; prev[v] = u; }
      });
    }

    if (dst[goal] === Infinity) return [goal];
    const path = [];
    let cur = goal;
    while (cur !== undefined) {
      path.unshift(cur);
      cur = prev[cur];
    }
    return path;
  }

  function route(currentPos, destName) {
    if (!nodes[destName]) {
      console.warn('nav: unknown destination', destName);
      return [{ x: currentPos.x, y: currentPos.y }];
    }
    const start = nearestNode(currentPos);
    const names = findPath(start, destName);
    const pts = names.map(function (n) { return { x: nodes[n].x, y: nodes[n].y }; });
    if (dist(currentPos, nodes[start]) > 0.5) {
      pts.unshift({ x: currentPos.x, y: currentPos.y });
    }
    return pts;
  }

  const Nav = {
    nodes: nodes,
    rebuild: rebuild,
    route: route,
    findPath: findPath,
    nearestNode: nearestNode,
    dist: dist,
  };

  // Build once from whatever config is present at load time. After Task 4 the
  // active theme drives this instead.
  if (OV.LOCATIONS) rebuild(OV.LOCATIONS, OV.WAYPOINTS, OV.EDGES);

  OV.Nav = Nav;
})(window.OV = window.OV || {});
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS, 3 tests.

- [ ] **Step 5: Syntax check**

Run: `node --check js/nav.js`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add js/nav.js tests/nav.test.js
git commit -m "refactor: make the nav graph rebuildable at runtime"
```

---

### Task 3: Theme registry and validation

**Files:**
- Create: `js/themes/index.js`
- Create: `tests/themes.test.js`

**Interfaces:**
- Consumes: `OV.Nav.rebuild` from Task 2.
- Produces:
  - `OV.Themes.REQUIRED_SLOTS` — array of the 15 slot names.
  - `OV.Themes.register(theme)` — stores a theme by `theme.id`; returns the theme.
  - `OV.Themes.validate(theme)` — returns `{ ok: boolean, errors: string[] }`. Pure; no side effects. Later tasks and the CI script both call this.
  - `OV.Themes.get(id)`, `OV.Themes.list()` — accessors.
  - `OV.Themes.active` — the currently applied theme object, or `null`.
  - `OV.Themes.strings(key, fallback)` — reads `theme.strings[key]`, returning `fallback` when the active theme does not override it. Used for ambient wander copy, which is theme-flavored ("Nice view" at a window is wrong at a village gate).
  - `OV.Themes.apply(id)` — validates, then publishes `OV.LOCATIONS`, `OV.WAYPOINTS`, `OV.EDGES`, `OV.AGENT_DEFS`; calls `OV.Nav.rebuild`; calls `OV.World.applyTheme(theme)` when `OV.World` exists; persists the choice. Returns `true` on success, `false` on validation failure (leaving the previous theme active).

- [ ] **Step 1: Write the failing test**

Create `tests/themes.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { loadOV } = require('../tools/browser-module');

function minimalTheme(overrides) {
  const slots = {};
  ['ORCHESTRATOR_HOME', 'THINK_SPOT', 'BREAK_SPOT', 'AMBIENT_SPOT', 'GATHER_SPOT',
   'WORKER_1', 'WORKER_2', 'WORKER_3', 'WORKER_4',
   'OVERFLOW_1', 'OVERFLOW_2', 'OVERFLOW_3', 'OVERFLOW_4', 'OVERFLOW_5', 'OVERFLOW_6',
  ].forEach(function (name, i) {
    slots[name] = { x: i * 5, y: i * 5, face: 'down', label: name };
  });
  return Object.assign({
    id: 't', name: 'T',
    slots: slots,
    waypoints: {},
    edges: [],
    furniture: [],
    cast: [{ slot: 'ORCHESTRATOR_HOME', id: 'claude', name: 'C', role: 'R', emoji: '*', color: '#fff' }],
    palette: {},
    effects: { spawn: 'none', despawn: 'none' },
  }, overrides || {});
}

test('validate accepts a complete theme', () => {
  const OV = loadOV(['js/config.js', 'js/nav.js', 'js/themes/index.js']);
  const result = OV.Themes.validate(minimalTheme());
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

test('validate rejects a missing slot', () => {
  const OV = loadOV(['js/config.js', 'js/nav.js', 'js/themes/index.js']);
  const bad = minimalTheme();
  delete bad.slots.OVERFLOW_6;
  const result = OV.Themes.validate(bad);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('OVERFLOW_6')));
});

test('validate rejects an edge pointing at an unknown node', () => {
  const OV = loadOV(['js/config.js', 'js/nav.js', 'js/themes/index.js']);
  const result = OV.Themes.validate(minimalTheme({ edges: [['ORCHESTRATOR_HOME', 'NOWHERE']] }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('NOWHERE')));
});

test('validate rejects a cast entry bound to an unknown slot', () => {
  const OV = loadOV(['js/config.js', 'js/nav.js', 'js/themes/index.js']);
  const bad = minimalTheme({
    cast: [{ slot: 'DESK_OF_HOLDING', id: 'claude', name: 'C', role: 'R', color: '#fff' }],
  });
  const result = OV.Themes.validate(bad);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('DESK_OF_HOLDING')));
});

test('apply rejects an invalid theme and keeps the previous one active', () => {
  const OV = loadOV(['js/config.js', 'js/nav.js', 'js/themes/index.js']);
  OV.Themes.register(minimalTheme({ id: 'good' }));
  const broken = minimalTheme({ id: 'bad' });
  delete broken.slots.WORKER_1;
  OV.Themes.register(broken);

  assert.equal(OV.Themes.apply('good'), true);
  assert.equal(OV.Themes.apply('bad'), false);
  assert.equal(OV.Themes.active.id, 'good');
});

test('apply publishes the layout and rebuilds navigation', () => {
  const OV = loadOV(['js/config.js', 'js/nav.js', 'js/themes/index.js']);
  OV.Themes.register(minimalTheme({
    id: 'x',
    waypoints: { WP: { x: 1, y: 1 } },
    edges: [['ORCHESTRATOR_HOME', 'WP']],
  }));
  OV.Themes.apply('x');

  assert.equal(OV.LOCATIONS.ORCHESTRATOR_HOME.label, 'ORCHESTRATOR_HOME');
  assert.ok(OV.Nav.nodes.WP);
  assert.equal(OV.AGENT_DEFS[0].home, 'ORCHESTRATOR_HOME');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `js/themes/index.js` does not exist (`ENOENT`).

- [ ] **Step 3: Write the implementation**

Create `js/themes/index.js`:

```js
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
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS, all theme tests green.

- [ ] **Step 5: Commit**

```bash
git add js/themes/index.js tests/themes.test.js
git commit -m "feat: add theme registry with slot-contract validation"
```

---

### Task 4: Extract the office theme

Move the existing layout out of `js/config.js` and `index.html` into `js/themes/office.js`, renaming locations onto slots. Coordinates are copied verbatim — this task must not change a single number.

**Files:**
- Create: `js/themes/office.js`
- Modify: `js/config.js`
- Modify: `index.html`
- Modify: `tests/themes.test.js`

**Interfaces:**
- Consumes: `OV.Themes.register`, `OV.Themes.validate` from Task 3.
- Produces: a registered theme with `id: 'office'`. `js/config.js` retains only `OV.STATES` and `OV.CONFIG`.

**Slot mapping (old name → new slot), all values copied from the current `js/config.js`:**

| Old | Slot | x | y | face | label |
| --- | --- | --- | --- | --- | --- |
| `CLAUDE_DESK` | `ORCHESTRATOR_HOME` | 50 | 26 | up | Claude's desk |
| `WHITEBOARD` | `THINK_SPOT` | 11 | 22 | left | Whiteboard |
| `COFFEE_AREA` | `BREAK_SPOT` | 88 | 15 | up | Coffee |
| `WINDOW` | `AMBIENT_SPOT` | 50 | 10 | up | Window |
| `CENTER_AREA` | `GATHER_SPOT` | 50 | 62 | down | Center |
| `DESK_BUILDER` | `WORKER_1` | 16 | 50 | left | Builder's desk |
| `DESK_TEST` | `WORKER_2` | 84 | 50 | right | Test's desk |
| `DESK_DEBUGGER` | `WORKER_3` | 16 | 76 | left | Debugger's desk |
| `DESK_VALIDATOR` | `WORKER_4` | 84 | 76 | right | Validator's desk |
| `STATION_1..6` | `OVERFLOW_1..6` | 34/50/66/34/50/66 | 57/56/57/71/72/71 | down | Station |

- [ ] **Step 1: Write the failing test**

Append to `tests/themes.test.js`:

```js
test('office theme satisfies the slot contract and keeps v1.0.2 coordinates', () => {
  const OV = loadOV(['js/config.js', 'js/nav.js', 'js/themes/index.js', 'js/themes/office.js']);
  const office = OV.Themes.get('office');
  assert.ok(office, 'office theme is registered');
  assert.deepEqual(OV.Themes.validate(office).errors, []);

  assert.deepEqual(office.slots.ORCHESTRATOR_HOME, { x: 50, y: 26, face: 'up', label: "Claude's desk" });
  assert.deepEqual(office.slots.THINK_SPOT, { x: 11, y: 22, face: 'left', label: 'Whiteboard' });
  assert.deepEqual(office.slots.OVERFLOW_5, { x: 50, y: 72, face: 'down', label: 'Station' });

  const ids = office.cast.map((c) => c.id).sort();
  assert.deepEqual(ids, ['builder', 'claude', 'debugger', 'test', 'validator']);
});

test('office theme routes builder to the orchestrator without crossing a desk', () => {
  const OV = loadOV(['js/config.js', 'js/nav.js', 'js/themes/index.js', 'js/themes/office.js']);
  OV.Themes.apply('office');
  const path = OV.Nav.findPath('WORKER_1', 'ORCHESTRATOR_HOME');
  assert.ok(path.length > 2, 'route goes through the hallway graph, not straight through furniture');
  assert.equal(path[0], 'WORKER_1');
  assert.equal(path[path.length - 1], 'ORCHESTRATOR_HOME');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `js/themes/office.js` does not exist.

- [ ] **Step 3: Create `js/themes/office.js`**

```js
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
```

- [ ] **Step 4: Slim `js/config.js`**

Delete the `LOCATIONS`, `WAYPOINTS`, `EDGES`, and `AGENT_DEFS` blocks and their exports. Keep `STATES` and `CONFIG` exactly as they are. Update the file header comment to say it now holds only states and tuning constants, and that layout data lives in `js/themes/`.

The final exports become:

```js
  OV.STATES = STATES;
  OV.CONFIG = CONFIG;
```

- [ ] **Step 5: Add the new scripts to `index.html`**

In the script block at the bottom, insert after `js/config.js` and before `js/nav.js`:

```html
  <script src="js/themes/index.js"></script>
  <script src="js/themes/office.js"></script>
```

- [ ] **Step 6: Run tests and syntax checks**

Run: `npm test && node --check js/themes/office.js && node --check js/config.js`
Expected: PASS, no output from the checks.

- [ ] **Step 7: Commit**

```bash
git add js/themes/office.js js/config.js index.html tests/themes.test.js
git commit -m "refactor: move the office layout into a theme data file"
```

---

### Task 5: Rename locations to slots in events and simulation

**Files:**
- Modify: `js/events.js`
- Modify: `js/simulation.js`
- Modify: `js/agent.js`
- Modify: `js/world.js`

**Interfaces:**
- Consumes: the slot names published by `OV.Themes.apply` in Task 3.
- Produces: no new exports. After this task no file outside `js/themes/` mentions `DESK_`, `STATION_`, `CLAUDE_DESK`, `WHITEBOARD`, `COFFEE_AREA`, `WINDOW`, or `CENTER_AREA`.

- [ ] **Step 1: Find every remaining hardcoded location name**

Run:

```bash
grep -rn "CLAUDE_DESK\|WHITEBOARD\|COFFEE_AREA\|CENTER_AREA\|DESK_\|STATION_\|\bWINDOW\b" js/ --include='*.js' | grep -v '^js/themes/'
```

Expected: hits in `js/events.js`, `js/simulation.js`, `js/agent.js`.

- [ ] **Step 2: Update `js/events.js`**

Replace the `spots` array in `firstFreeDesk()` (`js/events.js:41-45`):

```js
    const spots = [
      'WORKER_1', 'WORKER_2', 'WORKER_3', 'WORKER_4',
      'OVERFLOW_1', 'OVERFLOW_2', 'OVERFLOW_3', 'OVERFLOW_4', 'OVERFLOW_5', 'OVERFLOW_6',
    ];
```

and the fallback on the following line:

```js
    return 'GATHER_SPOT'; // last resort if everything is taken
```

Also update `ensureAgent`'s `home` fallback to `'GATHER_SPOT'`.

- [ ] **Step 3: Update `js/agent.js` fallbacks**

Three places use `OV.LOCATIONS.CENTER_AREA` as a fallback (`js/agent.js:33` and `js/agent.js:226`). Change each to `OV.LOCATIONS.GATHER_SPOT`.

- [ ] **Step 4: Update `js/simulation.js`**

Replace every destination string per the Task 4 mapping table: `CLAUDE_DESK` becomes `ORCHESTRATOR_HOME`, `WHITEBOARD` becomes `THINK_SPOT`, `COFFEE_AREA` becomes `BREAK_SPOT`, `WINDOW` becomes `AMBIENT_SPOT`, `CENTER_AREA` becomes `GATHER_SPOT`, `DESK_BUILDER` becomes `WORKER_1`, `DESK_TEST` becomes `WORKER_2`, `DESK_DEBUGGER` becomes `WORKER_3`, `DESK_VALIDATOR` becomes `WORKER_4`.

Leave user-facing story text alone — only the location identifiers change.

- [ ] **Step 5: Update the ambient wander in `js/world.js`**

`_wander` (`js/world.js:188-213`) hardcodes both the destination list (line 193) and the bubble copy keyed by location name (lines 207-210). The copy is theme-flavored — "Nice view" is right at a window and wrong at a village gate — so it moves into the theme with a fallback.

Replace the `spots` array:

```js
      const spots = ['THINK_SPOT', 'BREAK_SPOT', 'GATHER_SPOT', 'AMBIENT_SPOT'];
```

Replace the intent line:

```js
        intent = dest === 'THINK_SPOT' ? STATES.THINKING : STATES.WAITING;
```

Replace the bubble-copy table with a lookup through the theme:

```js
      const fallback = {
        THINK_SPOT: 'Reviewing the plan…',
        BREAK_SPOT: '☕ break',
        GATHER_SPOT: 'Stretching',
        AMBIENT_SPOT: 'Nice view',
      };
      const line = OV.Themes.strings('ambient_' + dest, fallback[dest]);
```

Then use `line` wherever the old table's value was read.

- [ ] **Step 6: Verify nothing was missed**

Re-run the grep from Step 1.
Expected: no output.

- [ ] **Step 7: Syntax check and commit**

```bash
for f in $(find js -name '*.js'); do node --check "$f" || exit 1; done
npm test
git add js/events.js js/simulation.js js/agent.js js/world.js
git commit -m "refactor: address office locations by semantic slot name"
```

---

### Task 6: Render the floor from theme data

**Files:**
- Modify: `js/world.js`
- Modify: `index.html`

**Interfaces:**
- Consumes: `theme.furniture` and `theme.palette` from Task 3's theme shape.
- Produces:
  - `OV.World.renderFloor(theme)` — clears `.furn` and `.rug` nodes from the floor and rebuilds them from `theme.furniture`.
  - `OV.World.applyTheme(theme)` — full in-place rebuild: stop the loop, clear agents, apply palette to `<body>`, `renderFloor`, re-add the cast, restart the loop and ambient scheduler. Called by `Themes.apply`.

- [ ] **Step 1: Delete the hardcoded furniture from `index.html`**

Remove every element between the `<!-- ambient / structural pieces -->` comment and the `<!-- agents are injected here by world.js -->` comment, leaving `.office-floor` empty apart from that trailing comment.

- [ ] **Step 2: Add `renderFloor` to `js/world.js`**

Add these methods to the `World` object, after `removeAgent`:

```js
    // ---- floor rendering (theme-driven) ----------------------------------
    // Furniture is data, not markup. Each entry becomes one absolutely
    // positioned element; `kind` selects the visual treatment defined in CSS.
    renderFloor: function (theme) {
      const floor = this.floorEl;
      if (!floor) return;

      const old = floor.querySelectorAll('.furn, .rug');
      for (let i = 0; i < old.length; i++) old[i].remove();

      (theme.furniture || []).forEach((f) => {
        const el = document.createElement('div');
        el.dataset.furn = f.id;
        el.style.left = f.x + '%';
        el.style.top = f.y + '%';

        if (f.kind === 'rug') {
          el.className = 'rug';
          floor.prepend(el);
          return;
        }

        el.className = 'furn ' + f.kind + (f.className ? ' ' + f.className : '');

        if (f.kind === 'desk') {
          const m = document.createElement('div');
          m.className = 'monitor';
          m.textContent = f.emoji || '💻';
          el.appendChild(m);
        } else if (f.kind === 'window') {
          const v = document.createElement('div');
          v.className = 'window-view';
          el.appendChild(v);
        } else if (f.kind === 'whiteboard') {
          const s = document.createElement('div');
          s.className = 'board-scribble';
          el.appendChild(s);
        } else if (f.emoji) {
          const e = document.createElement('span');
          e.className = f.kind === 'plant' ? 'furn-plant-emoji' : 'furn-emoji';
          e.textContent = f.emoji;
          el.appendChild(e);
        }

        if (f.label) {
          const lab = document.createElement('span');
          lab.className = 'furn-label';
          lab.textContent = f.label; // textContent avoids HTML injection
          el.appendChild(lab);
        }

        floor.prepend(el);
      });
    },

    // Swap the whole floor in place. Deliberately does NOT touch OV.Bridge, so
    // a live SSE run keeps streaming across a theme change.
    applyTheme: function (theme) {
      const wasRunning = this.running;
      this.stopLoop();
      this.clearAllTimers();
      this.generation++;

      this.agents.slice().forEach((a) => this.removeAgent(a.id));

      const body = document.body;
      body.dataset.theme = theme.id;

      // Clear the previous theme's custom properties before applying this
      // theme's, otherwise switching to a theme with a smaller palette leaves
      // the old colors stuck on <body>.
      (this._paletteKeys || []).forEach((k) => body.style.removeProperty(k));
      this._paletteKeys = Object.keys(theme.palette || {});
      this._paletteKeys.forEach((k) => {
        body.style.setProperty(k, theme.palette[k]);
      });
      if (theme.assets && theme.assets.floor) {
        body.style.setProperty('--floor-image', 'url("' + theme.assets.base + theme.assets.floor + '")');
      } else {
        body.style.removeProperty('--floor-image');
      }

      this.renderFloor(theme);

      this._originalIds = new Set(OV.AGENT_DEFS.map((d) => d.id));
      OV.AGENT_DEFS.forEach((def) => this.addAgent(def));

      this.log('system', 'Theme · ' + theme.name);
      this.startLoop();
      this.startAmbient();
    },
```

- [ ] **Step 3: Make `World.init` theme-aware**

Replace the roster bootstrap in `init` (`js/world.js:38-39`) with a call into the theme system, so the floor and cast always come from the same source:

```js
      const wanted = OV.Themes.remembered() || 'office';
      if (!OV.Themes.apply(wanted)) OV.Themes.apply('office');
```

Then delete from `init` everything that `applyTheme` now owns: the `this._originalIds` assignment, the `OV.AGENT_DEFS.forEach` roster loop, the `this.log('Office initialised…')` line, `this.startLoop()`, and `this.startAmbient()`.

This is not cosmetic. `_scheduleAmbient` (`js/world.js:162-169`) assigns `this._ambientTimer` without clearing a previous one, so calling `startAmbient()` from both `init` and `applyTheme` leaks a timer and doubles the wander rate. `startLoop()` is idempotent (`if (this.running) return`), but `startAmbient()` is not.

After the edit, `init` reads: resolve the DOM element references, then apply the theme. Everything else follows from `applyTheme`.

- [ ] **Step 4: Verify in the browser**

Run: `npm run serve` and open `http://localhost:4319/`.
Expected: the office renders exactly as before — rug, window, coffee, whiteboard, five desks, three plants, five agents at their desks.

- [ ] **Step 5: Commit**

```bash
node --check js/world.js && npm test
git add js/world.js index.html
git commit -m "feat: render office furniture from theme data instead of markup"
```

---

### Task 7: Image sprites with emoji fallback

**Files:**
- Modify: `js/agent.js`
- Modify: `css/styles.css`

**Interfaces:**
- Consumes: `def.sprite` (an already-resolved path) produced by `Themes.apply` in Task 3.
- Produces: `.agent-sprite` renders a background image when `def.sprite` is set, and falls back to `def.emoji` if the image fails to load.

- [ ] **Step 1: Update `Agent` construction**

In `Agent(def, floorEl)`, after `this.emoji = def.emoji || '🙂';` add:

```js
    this.sprite = def.sprite || null; // image path; null means render the emoji
```

- [ ] **Step 2: Update `_build`**

Replace the `.agent-sprite` line in the `innerHTML` template with an empty node, then populate it after the element exists:

```js
        '<div class="agent-sprite"></div>' +
```

and after `this.spriteEl = el.querySelector('.agent-sprite');` add:

```js
    this._paintSprite();
```

Then add the method:

```js
  // Sprite art: an image when the theme supplies one, the emoji otherwise. A
  // failed image load falls back to the emoji rather than showing a broken box.
  Agent.prototype._paintSprite = function () {
    const el = this.spriteEl;
    if (!this.sprite) {
      el.classList.remove('has-image');
      el.textContent = this.emoji;
      return;
    }
    const probe = new Image();
    const self = this;
    probe.onload = function () {
      el.textContent = '';
      el.classList.add('has-image');
      el.style.backgroundImage = 'url("' + self.sprite + '")';
    };
    probe.onerror = function () {
      console.warn('agent: sprite failed to load, falling back to emoji', self.sprite);
      el.classList.remove('has-image');
      el.style.backgroundImage = '';
      el.textContent = self.emoji;
    };
    el.textContent = this.emoji; // shown until the image resolves
    probe.src = this.sprite;
  };
```

- [ ] **Step 3: Add the CSS**

Append to `css/styles.css` near the existing `.agent-sprite` rule (line 332):

```css
/* image sprites (themes that ship art); emoji themes are unaffected */
.agent-sprite.has-image {
  width: 42px;
  height: 42px;
  font-size: 0;
  background-repeat: no-repeat;
  background-position: center bottom;
  background-size: contain;
}
```

The existing `.agent.face-left .agent-sprite { transform: scaleX(-1); }` rule already flips image sprites, so no new facing rules are needed.

- [ ] **Step 4: Verify**

Run: `npm run serve`, open the app.
Expected: office theme unchanged (emoji sprites, no images requested — confirm zero 404s in the network panel).

- [ ] **Step 5: Commit**

```bash
node --check js/agent.js
git add js/agent.js css/styles.css
git commit -m "feat: support image sprites with emoji fallback"
```

---

### Task 8: Spawn queue backpressure

Pure logic, no DOM, so it is unit-testable. Ten 1.15-second rituals played back to back would run eleven seconds behind live events; this queue caps that.

**Files:**
- Create: `js/effects.js`
- Create: `tests/spawn-queue.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `OV.Effects.SpawnQueue`, constructed as `new SpawnQueue({ fastThreshold: 2 })`. `queue.enqueue(job)` returns a Promise resolving to the job's result; `job` is called as `job(mode)` where `mode` is `'full'` or `'fast'`. Jobs run strictly in order, one at a time. `mode` is `'fast'` when more than `fastThreshold` jobs are still waiting at dequeue time.

- [ ] **Step 1: Write the failing test**

Create `tests/spawn-queue.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { loadOV } = require('../tools/browser-module');

function makeQueue() {
  const OV = loadOV(['js/effects.js']);
  return new OV.Effects.SpawnQueue({ fastThreshold: 2 });
}

test('a single spawn plays the full ritual', async () => {
  const q = makeQueue();
  const modes = [];
  await q.enqueue((mode) => { modes.push(mode); });
  assert.deepEqual(modes, ['full']);
});

test('a burst degrades to fast once the backlog exceeds the threshold', async () => {
  const q = makeQueue();
  const modes = [];
  const job = (mode) => { modes.push(mode); };
  const all = [];
  for (let i = 0; i < 6; i++) all.push(q.enqueue(job));
  await Promise.all(all);

  assert.equal(modes.length, 6);
  assert.equal(modes[0], 'full', 'first spawn always gets the full ritual');
  assert.ok(modes.includes('fast'), 'a six-deep burst degrades');
  assert.equal(modes[modes.length - 1], 'full', 'the tail drains at full quality again');
});

test('jobs run strictly in order and one at a time', async () => {
  const q = makeQueue();
  const order = [];
  let active = 0;
  const job = (id) => () => {
    active++;
    assert.equal(active, 1, 'never two rituals at once');
    order.push(id);
    return new Promise((r) => setTimeout(() => { active--; r(); }, 5));
  };
  await Promise.all([q.enqueue(job('a')), q.enqueue(job('b')), q.enqueue(job('c'))]);
  assert.deepEqual(order, ['a', 'b', 'c']);
});

test('a throwing job does not wedge the queue', async () => {
  const q = makeQueue();
  const seen = [];
  const bad = q.enqueue(() => { throw new Error('boom'); });
  const good = q.enqueue(() => { seen.push('ran'); });
  await bad.catch(() => {});
  await good;
  assert.deepEqual(seen, ['ran']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `js/effects.js` does not exist.

- [ ] **Step 3: Write `js/effects.js`**

```js
/*
 * effects.js
 * Spawn and despawn effects, plus the queue that keeps them honest.
 *
 * Claude Code dispatches Task calls in parallel. A 1.15s spawn ritual played
 * serially for ten subagents would leave the visuals eleven seconds behind
 * reality, so the queue degrades to a short poof whenever the backlog grows.
 */
(function (OV) {
  'use strict';

  function SpawnQueue(opts) {
    opts = opts || {};
    this.fastThreshold = typeof opts.fastThreshold === 'number' ? opts.fastThreshold : 2;
    this.pending = [];
    this.running = false;
  }

  // job(mode) may return a value or a Promise. Resolves with the job's result.
  SpawnQueue.prototype.enqueue = function (job) {
    const self = this;
    return new Promise(function (resolve, reject) {
      self.pending.push({ job: job, resolve: resolve, reject: reject });
      self._drain();
    });
  };

  SpawnQueue.prototype._drain = function () {
    if (this.running) return;
    const next = this.pending.shift();
    if (!next) return;

    this.running = true;
    const mode = this.pending.length > this.fastThreshold ? 'fast' : 'full';
    const self = this;

    let result;
    try {
      result = next.job(mode);
    } catch (err) {
      this.running = false;
      next.reject(err);
      this._drain();
      return;
    }

    Promise.resolve(result).then(function (value) {
      self.running = false;
      next.resolve(value);
      self._drain();
    }, function (err) {
      self.running = false;
      next.reject(err);
      self._drain();
    });
  };

  OV.Effects = { SpawnQueue: SpawnQueue };
})(window.OV = window.OV || {});
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS, 4 new tests.

- [ ] **Step 5: Commit**

```bash
git add js/effects.js tests/spawn-queue.test.js
git commit -m "feat: add spawn effect queue with backpressure degradation"
```

---

### Task 9: The jutsu and poof effects

**Files:**
- Modify: `js/effects.js`
- Modify: `js/events.js`
- Modify: `index.html`

**Interfaces:**
- Consumes: `OV.Effects.SpawnQueue` from Task 8; `OV.World.byId`, `OV.World.delay`, `Agent.say`, `Agent.walkTo`.
- Produces:
  - `OV.Effects.play(name, ctx)` — runs the named spawn effect, returns a Promise. `ctx` is `{ agent, orchestrator, mode }`.
  - `OV.Effects.despawn(name, agent)` — returns a Promise that resolves once the exit animation has finished.
  - `OV.Effects.smokeAt(x, y)` — appends a smoke element to the office floor and removes it when the animation ends.

- [ ] **Step 1: Add the effect implementations to `js/effects.js`**

Insert before the `OV.Effects = ...` export, then extend the export object:

```js
  const SMOKE_MS = 250;

  function smokeAt(x, y) {
    const floor = OV.World && OV.World.floorEl;
    if (!floor) return;
    const el = document.createElement('div');
    el.className = 'jutsu-smoke';
    el.style.left = x + '%';
    el.style.top = y + '%';
    floor.appendChild(el);
    const t = setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, SMOKE_MS + 300);
    if (OV.World && OV.World.trackTimer) OV.World.trackTimer(t);
  }

  // The shadow-clone ritual. `mode` comes from the queue: 'full' plays the
  // whole sequence, 'fast' collapses it so a burst of parallel Task dispatches
  // never leaves the visuals more than about a second behind reality.
  function jutsu(ctx) {
    const W = OV.World;
    const clone = ctx.agent;
    const boss = ctx.orchestrator;

    if (!boss || ctx.mode === 'fast') {
      const at = OV.LOCATIONS[clone.home] || OV.LOCATIONS.GATHER_SPOT;
      smokeAt(at.x, at.y);
      clone.el.classList.add('is-clone');
      return W.delay(SMOKE_MS);
    }

    boss.el.classList.add('jutsu-seal');
    clone.el.classList.add('is-clone', 'is-materialising');

    // Park the clone next to the orchestrator; it walks to its own slot after.
    const dest = clone.home;
    clone.position.x = boss.position.x + 6;
    clone.position.y = boss.position.y;
    clone.render();

    return W.delay(300)
      .then(function () {
        boss.say('Kage Bunshin no Jutsu!');
        return W.delay(100);
      })
      .then(function () {
        smokeAt(boss.position.x + 6, boss.position.y);
        return W.delay(SMOKE_MS);
      })
      .then(function () {
        clone.el.classList.remove('is-materialising');
        return W.delay(200);
      })
      .then(function () {
        boss.el.classList.remove('jutsu-seal');
        clone.walkTo(dest);
        return W.delay(300);
      });
  }

  function none() { return Promise.resolve(); }

  function play(name, ctx) {
    const fn = EFFECTS[name] || none;
    return Promise.resolve(fn(ctx)).catch(function (err) {
      console.warn('effects: spawn effect failed', name, err);
    });
  }

  function poof(agent) {
    smokeAt(agent.position.x, agent.position.y);
    agent.el.classList.add('is-poofing');
    return (OV.World ? OV.World.delay(SMOKE_MS) : Promise.resolve());
  }

  function despawn(name, agent) {
    if (name !== 'poof') return Promise.resolve();
    return poof(agent).catch(function () { /* never block agent removal */ });
  }

  const EFFECTS = { none: none, jutsu: jutsu };
```

and change the export to:

```js
  OV.Effects = {
    SpawnQueue: SpawnQueue,
    queue: new SpawnQueue({ fastThreshold: 2 }),
    play: play,
    despawn: despawn,
    smokeAt: smokeAt,
  };
```

- [ ] **Step 2: Hook the effects into `js/events.js`**

In `onStart` (around `js/events.js:67`, where it logs `spawned`), wrap the spawn in the queue:

```js
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
```

In `onStop`, before the branch that retires runtime-spawned subagents (`js/events.js:119`), await the despawn effect:

```js
        const theme = OV.Themes.active;
        const fx = theme && theme.effects ? theme.effects.despawn : 'none';
        return OV.Effects.despawn(fx, agent).then(function () {
          W.removeAgent(agent.id);
        });
```

Concretely: find the existing branch that reads roughly

```js
        if (!W._originalIds.has(agent.id)) W.removeAgent(agent.id);
```

and replace it with

```js
        if (!W._originalIds.has(agent.id)) {
          const theme = OV.Themes.active;
          const fx = theme && theme.effects ? theme.effects.despawn : 'none';
          return OV.Effects.despawn(fx, agent).then(function () {
            W.removeAgent(agent.id);
          });
        }
```

so the clone stays on screen for the length of its poof, then is removed. If the surrounding function does not already return a Promise, return this one — `onStop` is already Promise-based elsewhere in the file.

- [ ] **Step 3: Add the script tag**

In `index.html`, add after `js/agent.js`:

```html
  <script src="js/effects.js"></script>
```

- [ ] **Step 4: Verify the office theme is unaffected**

Run: `npm run serve`, click ADD AGENT five times.
Expected: identical behavior to today — office's `effects.spawn` is `none`, so no smoke, no delay.

- [ ] **Step 5: Commit**

```bash
node --check js/effects.js && node --check js/events.js && npm test
git add js/effects.js js/events.js index.html
git commit -m "feat: add shadow-clone spawn and poof despawn effects"
```

---

### Task 10: Generate the Hidden Leaf assets — DEFERRED

> **STATUS: DEFERRED, 2026-08-27.** The Higgsfield workspace has zero credits, so the
> six images could not be generated. Rather than block the feature or fake the assets,
> the user chose to ship the Hidden Leaf theme with its emoji cast and CSS village
> palette now, and add artwork in a follow-up. Task 7's sprite-fallback path makes this
> work with no further code changes: a cast entry with no `sprite` simply renders its
> emoji.
>
> **Do not implement this task.** Tasks 11, 12, and 15 have been amended accordingly.
> When credits exist, the follow-up is: run this task as written, add `sprite:` fields
> to the five leaf cast entries, add the `assets` block to the theme, and add `"assets/"`
> to `package.json`'s `files`. Nothing else changes.

### Task 10 (original, for the follow-up)

**Files:**
- Create: `assets/themes/leaf/village-floor.webp`
- Create: `assets/themes/leaf/naruto.webp`, `sasuke.webp`, `kakashi.webp`, `sakura.webp`, `shikamaru.webp`
- Create: `assets/themes/leaf/README.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: six image files at the exact paths above. Task 11's theme file references them by name, and Task 14's CI check asserts they exist.

- [ ] **Step 1: Generate the floor**

Use `mcp__claude_ai_Higgsfield__generate_image` with this prompt:

> Top-down orthographic game map of a ninja village training ground, hand-painted stylized game art, warm green grass and dirt paths, a wooden Hokage tower at top center, a small ramen stand with red awning at the right, a wooden mission scroll board at the left, four wooden training posts arranged in the mid and lower area, a village gate at the top edge, subtle leaf motifs, muted saturated palette, no characters, no text, no UI, seamless flat lighting.

Aspect ratio 16:10. Save to `assets/themes/leaf/village-floor.webp`.

- [ ] **Step 2: Generate the five characters**

Use `mcp__claude_ai_Higgsfield__generate_image_batch` with one job per character, sharing this prompt skeleton and varying the description:

> Chibi game sprite of a young ninja, three-quarter front view, standing idle, full body, clean flat cel-shaded style, plain solid background, centered, no text, no border. {DESCRIPTION}

| File | `{DESCRIPTION}` |
| --- | --- |
| `naruto.webp` | Spiky blond hair, blue eyes, orange and black tracksuit, blue forehead protector, whisker marks on cheeks. |
| `sasuke.webp` | Dark spiky hair, dark blue high-collar shirt, white arm guards, calm serious expression. |
| `kakashi.webp` | Silver spiky hair, cloth mask covering the lower face, forehead protector slanted over one eye, green flak vest. |
| `sakura.webp` | Short pink hair, red sleeveless tunic, black shorts, red forehead protector worn as a headband. |
| `shikamaru.webp` | Dark hair tied in a spiky ponytail, green flak vest, bored expression, hands in pockets. |

- [ ] **Step 3: Cut out the backgrounds**

Run `mcp__claude_ai_Higgsfield__remove_background` on each of the five character images. Save the transparent results over the same filenames.

- [ ] **Step 4: Check the sizes**

Run:

```bash
ls -l assets/themes/leaf/
du -sh assets/themes/leaf/
```

Expected: six files, total under 500 KB. If the floor image exceeds 300 KB, re-export it smaller — this ships in an npm package.

- [ ] **Step 5: Document provenance**

Create `assets/themes/leaf/README.md`:

```markdown
# Hidden Leaf theme assets

These images are AI-generated fan art produced for this project's optional
"Hidden Leaf" theme. Naruto and its characters are the intellectual property of
Shueisha and Pierrot; this theme is unofficial and unaffiliated.

See the `CANON_NAMES` switch in `js/themes/leaf.js` before publishing this
package to a public registry.
```

- [ ] **Step 6: Add assets to the published package**

In `package.json`, add `"assets/"` to the `files` array, after `"js/"`.

- [ ] **Step 7: Commit**

```bash
git add assets package.json
git commit -m "assets: add generated Hidden Leaf village and character art"
```

---

### Task 11: The Hidden Leaf theme

**Files:**
- Create: `js/themes/leaf.js`
- Modify: `index.html`
- Modify: `tests/themes.test.js`

**Interfaces:**
- Consumes: `OV.Themes.register` from Task 3; assets from Task 10.
- Produces: a registered theme with `id: 'leaf'`, `effects: { spawn: 'jutsu', despawn: 'poof' }`, and a `castByType` map from `subagent_type` to cast id.

- [ ] **Step 1: Write the failing test**

Append to `tests/themes.test.js`:

```js
test('leaf theme satisfies the slot contract', () => {
  const OV = loadOV(['js/config.js', 'js/nav.js', 'js/themes/index.js', 'js/themes/leaf.js']);
  const leaf = OV.Themes.get('leaf');
  assert.ok(leaf, 'leaf theme is registered');
  assert.deepEqual(OV.Themes.validate(leaf).errors, []);
  assert.deepEqual(leaf.effects, { spawn: 'jutsu', despawn: 'poof' });
});

test('leaf theme uses the theme-invariant agent ids', () => {
  const OV = loadOV(['js/config.js', 'js/nav.js', 'js/themes/index.js', 'js/themes/leaf.js']);
  const ids = OV.Themes.get('leaf').cast.map((c) => c.id).sort();
  assert.deepEqual(ids, ['builder', 'claude', 'debugger', 'test', 'validator']);
});

test('leaf graph connects every slot to the orchestrator', () => {
  const OV = loadOV(['js/config.js', 'js/nav.js', 'js/themes/index.js', 'js/themes/leaf.js']);
  OV.Themes.apply('leaf');
  OV.Themes.REQUIRED_SLOTS.forEach((slot) => {
    const p = OV.Nav.findPath(slot, 'ORCHESTRATOR_HOME');
    assert.ok(p.length >= 1 && p[p.length - 1] === 'ORCHESTRATOR_HOME',
      slot + ' cannot reach ORCHESTRATOR_HOME');
    if (slot !== 'ORCHESTRATOR_HOME') {
      assert.ok(p.length > 1, slot + ' is stranded (no route found)');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `js/themes/leaf.js` does not exist.

- [ ] **Step 3: Write `js/themes/leaf.js`**

```js
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
```

- [ ] **Step 4: Add the script tag**

In `index.html`, after `js/themes/office.js`:

```html
  <script src="js/themes/leaf.js"></script>
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: PASS, including the asset-existence and connectivity tests.

- [ ] **Step 6: Commit**

```bash
node --check js/themes/leaf.js
git add js/themes/leaf.js index.html tests/themes.test.js
git commit -m "feat: add the Hidden Leaf theme"
```

---

### Task 12: Clone casting for live subagents

**Files:**
- Modify: `js/events.js`
- Modify: `js/bridge.js`

**Interfaces:**
- Consumes: `theme.castByType` and `theme.cast` from Task 11.
- Produces: `OV.Events.castFor(subagentType)` returning `{ name, sprite, emoji, color, isClone }`. Used by `ensureAgent` so a live subagent gets themed art. A type with no mapping returns the orchestrator's sprite with `isClone: true`.

- [ ] **Step 1: Add `castFor` to `js/events.js`**

Insert above `ensureAgent`:

```js
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
```

- [ ] **Step 2: Use it in `ensureAgent`**

Replace the `def` construction in `ensureAgent` with:

```js
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
```

- [ ] **Step 3: Export it**

Add `castFor: castFor,` to the `Events` object literal so tests and the bridge can reach it.

- [ ] **Step 4: Pass the subagent type through the bridge**

In `js/bridge.js`, `_spawn(aid, atype)` builds the `SUBAGENT_START` event. Confirm it sets `role: atype`; if it does not, add it so `castFor` receives the real `subagent_type`.

Run: `grep -n "_spawn" -A 12 js/bridge.js`

- [ ] **Step 5: Verify**

Run: `npm run serve`, switch to the leaf theme (after Task 13 lands the toggle; until then run `OV.Themes.apply('leaf')` in the console), then click ADD AGENT.
Expected: the new agent renders with the Naruto sprite, a blue-ish tag color, and the smoke ritual.

- [ ] **Step 6: Commit**

```bash
node --check js/events.js && node --check js/bridge.js && npm test
git add js/events.js js/bridge.js
git commit -m "feat: cast live subagents from the active theme"
```

---

### Task 13: Theme toggle in the toolbar

**Files:**
- Modify: `index.html`
- Modify: `js/main.js`
- Modify: `css/styles.css`

**Interfaces:**
- Consumes: `OV.Themes.list`, `OV.Themes.apply`, `OV.Themes.active` from Task 3.
- Produces: a `#btn-theme` button that cycles through registered themes and labels itself with the theme it will switch to.

- [ ] **Step 1: Add the button**

In `index.html`, inside `.toolbar`, before the RESET button:

```html
        <button id="btn-theme" class="btn">THEME</button>
```

- [ ] **Step 2: Wire it in `js/main.js`**

Inside the `ready` callback, after the existing button wiring:

```js
    // Theme toggle. Cycles the registered themes; the label names the theme the
    // click will switch TO, so the user always sees where the button leads.
    const themeBtn = document.getElementById('btn-theme');
    function nextTheme() {
      const all = OV.Themes.list();
      const activeId = OV.Themes.active ? OV.Themes.active.id : null;
      const i = all.findIndex(function (t) { return t.id === activeId; });
      return all[(i + 1) % all.length];
    }
    function refreshThemeBtn() {
      if (!themeBtn) return;
      const next = nextTheme();
      themeBtn.textContent = next ? next.name.toUpperCase() : 'THEME';
      themeBtn.title = next ? 'Switch to ' + next.name : '';
    }
    if (themeBtn) themeBtn.addEventListener('click', function () {
      const next = nextTheme();
      if (!next) return;
      OV.Simulation.stop();
      OV.Themes.apply(next.id);
      refreshThemeBtn();
    });
    refreshThemeBtn();
```

- [ ] **Step 3: Style the hotspot furniture kind**

Task 11's leaf furniture uses `kind: 'hotspot'` — a label with no art, since the scenery is painted into the floor. Append to `css/styles.css`:

```css
/* label-only furniture: used by themes whose scenery is baked into the floor art */
.furn.hotspot .furn-label { background: rgba(8, 11, 18, 0.45); }
```

- [ ] **Step 4: Verify the toggle**

Run: `npm run serve`, click the theme button.
Expected: the floor swaps to the village, agents become the Team Seven cast, the button label flips to AGENT OFFICE. Reload the page: the leaf theme persists via `localStorage`.

- [ ] **Step 5: Commit**

```bash
node --check js/main.js && npm test
git add index.html js/main.js css/styles.css
git commit -m "feat: add a theme toggle to the toolbar"
```

---

### Task 14: Jutsu styling and reduced motion

**Files:**
- Modify: `css/styles.css`

**Interfaces:**
- Consumes: the class names applied in Task 9 (`.jutsu-smoke`, `.jutsu-seal`, `.is-clone`, `.is-materialising`, `.is-poofing`) and the `--floor-image` property set in Task 6.

- [ ] **Step 1: Make the floor accept a theme image**

Modify the `.office-floor` rule (`css/styles.css:215`) so the painted floor sits above the gradient:

```css
.office-floor {
  position: absolute;
  inset: 0;
  border-radius: 16px;
  background-image:
    var(--floor-image, none),
    linear-gradient(180deg, var(--wall) 0 8%, transparent 8%),
    repeating-linear-gradient(115deg, var(--floor) 0 34px, var(--floor-2) 34px 68px);
  background-size: cover, auto, auto;
  background-position: center, center, center;
  border: 3px solid #0c0f18;
  box-shadow:
    inset 0 0 0 2px #3a3560,
    inset 0 22px 44px rgba(0,0,0,0.35),
    0 24px 60px rgba(0,0,0,0.5);
  overflow: hidden;
}
```

The gradients remain as the fallback layer, so a failed floor image degrades to the palette colors rather than to bare white.

- [ ] **Step 2: Add the jutsu styles**

Append to `css/styles.css`:

```css
/* ============ shadow clone jutsu ============ */
.jutsu-smoke {
  position: absolute;
  width: 70px; height: 70px;
  transform: translate(-50%, -60%);
  border-radius: 50%;
  pointer-events: none;
  z-index: 400;
  background: radial-gradient(circle at 50% 55%,
    rgba(255,255,255,.95) 0%,
    rgba(226,232,240,.75) 35%,
    rgba(148,163,184,.35) 60%,
    rgba(148,163,184,0) 72%);
  animation: jutsu-puff 550ms ease-out forwards;
}

@keyframes jutsu-puff {
  0%   { opacity: 0; transform: translate(-50%, -60%) scale(.35); }
  35%  { opacity: 1; transform: translate(-50%, -62%) scale(1.05); }
  100% { opacity: 0; transform: translate(-50%, -74%) scale(1.5); }
}

/* orchestrator mid-seal: braced stance plus a chakra flare */
.agent.jutsu-seal .agent-sprite {
  animation: jutsu-brace 400ms ease-in-out;
  filter: drop-shadow(0 0 10px rgba(255, 176, 76, .95)) drop-shadow(0 4px 3px rgba(0,0,0,.45));
}

@keyframes jutsu-brace {
  0%, 100% { transform: translateY(0) scale(1); }
  45%      { transform: translateY(2px) scale(1.06); }
}

/* clones read as copies: slightly translucent with a chakra-blue rim */
.agent.is-clone .agent-sprite {
  opacity: .85;
  filter: drop-shadow(0 0 6px rgba(127, 209, 232, .8)) drop-shadow(0 4px 3px rgba(0,0,0,.45));
}

.agent.is-materialising { opacity: 0; }
.agent { transition: opacity 200ms ease-out; }

.agent.is-poofing { opacity: 0; transform-origin: 50% 90%; }

@media (prefers-reduced-motion: reduce) {
  .jutsu-smoke { animation-duration: 1ms; opacity: 0; }
  .agent.jutsu-seal .agent-sprite { animation: none; }
  .agent { transition: none; }
}
```

- [ ] **Step 3: Verify**

Run: `npm run serve`, switch to the leaf theme, click ADD AGENT once, then five times rapidly.
Expected: single click plays the full ritual with the seal flare and smoke; the rapid burst degrades to quick poofs and stays visually in step with the log rows.

- [ ] **Step 4: Commit**

```bash
git add css/styles.css
git commit -m "style: add jutsu smoke, clone, and reduced-motion styling"
```

---

### Task 15: CI, validation script, and documentation

**Files:**
- Create: `tools/validate-themes.js`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: `OV.Themes.validate` from Task 3; `loadOV` from Task 1.
- Produces: `node tools/validate-themes.js` exiting non-zero with a readable report when any registered theme is invalid or references a missing asset.

- [ ] **Step 1: Write the validation script**

Create `tools/validate-themes.js`:

```js
#!/usr/bin/env node
/*
 * validate-themes.js
 * Loads every registered theme and checks the slot contract, graph
 * connectivity, and asset presence. Run in CI so a typo in a theme file cannot
 * ship as "agents walk into walls".
 */
const fs = require('fs');
const path = require('path');
const { loadOV, ROOT } = require('./browser-module');

const THEME_FILES = fs
  .readdirSync(path.join(ROOT, 'js/themes'))
  .filter((f) => f.endsWith('.js') && f !== 'index.js')
  .map((f) => 'js/themes/' + f);

const OV = loadOV(['js/config.js', 'js/nav.js', 'js/themes/index.js'].concat(THEME_FILES));

let failures = 0;

OV.Themes.list().forEach((theme) => {
  const problems = OV.Themes.validate(theme).errors.slice();

  // Asset check. A theme may legitimately reference no assets at all (the Hidden
  // Leaf theme ships emoji-only while artwork is deferred); only what IS referenced
  // must exist on disk.
  const base = (theme.assets && theme.assets.base) || '';
  const assets = [];
  if (theme.assets && theme.assets.floor) assets.push(theme.assets.floor);
  (theme.cast || []).forEach((c) => { if (c.sprite) assets.push(c.sprite); });
  assets.forEach((a) => {
    if (!fs.existsSync(path.join(ROOT, base + a))) problems.push('missing asset: ' + base + a);
  });

  // Ambient-string key agreement. `_wander` looks up 'ambient_' + slot, so a typo'd
  // key silently falls back to the in-code default forever and no test would fail.
  Object.keys(theme.strings || {}).forEach((key) => {
    if (key.indexOf('ambient_') !== 0) return;
    const slot = key.slice('ambient_'.length);
    if (!theme.slots[slot]) problems.push('strings key references unknown slot: ' + key);
  });

  OV.Nav.rebuild(theme.slots, theme.waypoints, theme.edges);
  OV.Themes.REQUIRED_SLOTS.forEach((slot) => {
    if (slot === 'ORCHESTRATOR_HOME') return;
    const p = OV.Nav.findPath(slot, 'ORCHESTRATOR_HOME');
    if (p.length < 2) problems.push('slot is stranded (no route to ORCHESTRATOR_HOME): ' + slot);
  });

  if (problems.length) {
    failures++;
    console.error('FAIL ' + theme.id);
    problems.forEach((p) => console.error('  - ' + p));
  } else {
    console.log('ok   ' + theme.id + ' (' + theme.name + ')');
  }
});

if (failures) {
  console.error('\n' + failures + ' theme(s) invalid');
  process.exit(1);
}
console.log('\nall themes valid');
```

- [ ] **Step 2: Run it**

Run: `node tools/validate-themes.js`
Expected: `ok office`, `ok leaf`, `all themes valid`, exit code 0.

- [ ] **Step 3: Fix the CI glob and add the new checks**

In `.github/workflows/ci.yml`, replace the syntax-check step's loop — the current `js/*.js` glob does not match `js/themes/*.js`:

```yaml
      - name: Syntax-check all JS
        run: |
          for f in $(find js bridge tools -name '*.js'); do
            echo "check $f"
            node --check "$f"
          done

      - name: Unit tests
        run: npm test

      - name: Validate themes
        run: node tools/validate-themes.js
```

- [ ] **Step 4: Document the themes in `README.md`**

Add a `## Themes` section after the feature list:

```markdown
## Themes

The office ships with two themes, switched from the THEME button in the toolbar.
The choice persists in `localStorage` and switching does not drop a live bridge
connection, so you can change the look mid-run.

| Theme | Look | Spawn effect |
| --- | --- | --- |
| Agent Office | The original engineering floor | Subagents walk in |
| Hidden Leaf | A ninja village training ground | Shadow clone jutsu |

Adding a third theme means adding one file under `js/themes/`, registering it,
and adding a script tag. Core code addresses places by semantic slot
(`ORCHESTRATOR_HOME`, `WORKER_1`, `OVERFLOW_3`, …), so a new theme needs no
changes anywhere else. `node tools/validate-themes.js` checks a theme against
the slot contract before you ship it.

### A note on the Hidden Leaf theme

Its artwork is AI-generated fan art. Naruto and its characters are the
intellectual property of Shueisha and Pierrot; this theme is unofficial and
unaffiliated. `js/themes/leaf.js` has a `CANON_NAMES` switch at the top — set it
to `false` to use generic ninja names instead.

**Release checklist:** decide `CANON_NAMES` before running `npm publish`.
```

- [ ] **Step 5: Commit**

```bash
git add tools/validate-themes.js .github/workflows/ci.yml README.md
git commit -m "ci: validate themes and document the theme system"
```

---

### Task 16: Full browser verification

The only tasks not covered by automated checks are the visual ones. This task is the gate before release.

**Files:**
- Create: `docs/leaf.jpg` (screenshot)
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: verification evidence and a README screenshot of the new theme.

- [ ] **Step 1: Start the bridge**

Run: `npm run serve` and open `http://localhost:4319/`.

- [ ] **Step 2: Verify the office theme against v1.0.2**

Compare the rendered office side by side with `docs/office.jpg`.
Expected: identical furniture placement, identical labels, identical agent starting positions. Any difference is a regression from Task 4 or Task 6 — fix before continuing.

- [ ] **Step 3: Verify the leaf theme at ten agents**

In the browser console:

```js
OV.Themes.apply('leaf');
for (let i = 0; i < 5; i++) {
  OV.Events.emit({ type: 'SUBAGENT_START', agent: 'w' + i, name: 'Clone ' + i, role: 'general-purpose' });
}
```

Expected: five clones spawn with the ritual (degrading to fast poofs partway through the burst), then walk to `OVERFLOW_1` through `OVERFLOW_5`. Ten total agents on screen, no overlapping name tags, no text overflow — the crowding case tuned in v1.0.2.

- [ ] **Step 4: Verify a theme switch during a live run**

With the bridge connected (`LIVE` pill green), click the theme button mid-run.
Expected: the bridge pill stays `LIVE`, the event log keeps appending, and no reconnect appears in the console.

- [ ] **Step 5: Check the console**

Expected: no errors, no failed asset requests.

- [ ] **Step 6: Capture the screenshot**

Take a screenshot of the leaf theme with several clones active. Save as `docs/leaf.jpg`. Add it to the README beneath the existing office screenshot with the caption "Hidden Leaf theme — shadow clones at work".

- [ ] **Step 7: Commit**

```bash
git add docs/leaf.jpg README.md
git commit -m "docs: add Hidden Leaf screenshot"
```

---

## Verification Summary

Before declaring this done, all of the following must pass:

```bash
npm test                          # unit tests: nav, themes, spawn queue
node tools/validate-themes.js     # slot contract, connectivity, assets
for f in $(find js bridge tools -name '*.js'); do node --check "$f"; done
```

Plus the manual browser checks in Task 16: office identical to v1.0.2, leaf readable at ten agents, theme switch preserves the live SSE connection.
