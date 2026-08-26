# Design: Switchable UI Themes and the Hidden Leaf Theme

Date: 2026-08-27
Status: Approved for planning
Repository: claude-code-office-visualizer (`claude-agent-office`)

## Summary

Add a theme layer to the Agent Office visualizer so the floor plan, artwork,
cast, and spawn effects can be swapped at runtime. Ship two themes: the
existing office (visually unchanged from v1.0.2) and a new "Hidden Leaf"
theme, in which the orchestrator is Naruto, subagents are Team Seven
characters, and each subagent spawn plays a shadow-clone jutsu animation.

The toolbar gains a theme toggle. Switching themes rebuilds the world in place
and does not drop the live Server-Sent Events bridge connection, so a user can
switch themes in the middle of a real Claude Code run without losing the
stream.

## Goals

- A theme owns its own layout: locations, waypoints, navigation edges, and
  furniture.
- Adding a third theme later is one new data file with no changes to core code.
- The office theme renders identically to v1.0.2. This is the regression bar.
- Subagent spawns in the Hidden Leaf theme play a shadow-clone ritual that
  stays visually in sync with live events even under parallel dispatch.

## Non-goals

- No new build step, bundler, or runtime dependency. The project stays vanilla
  classic scripts sharing `window.OV`, loadable over `file://`.
- No replacement of the pathfinder. `nav.js` keeps Dijkstra over a hand-authored
  graph; only its initialization becomes re-runnable.
- No per-theme changes to the bridge protocol or hook contract.

## Background: why the current code blocks this

Two properties of the existing code make an own-layout theme impossible without
refactoring:

1. `js/nav.js` builds its node table and adjacency list once, at script load,
   inside an IIFE closure (`js/nav.js:14-34`). A theme with different
   coordinates cannot take effect until that build is re-runnable.
2. `js/events.js` and `js/simulation.js` hardcode location names such as
   `DESK_BUILDER`, `WHITEBOARD`, `CLAUDE_DESK`, and `STATION_1`
   (`js/events.js:41`). A village layout with different place names breaks both
   modules.

Additionally, all office furniture is hardcoded markup in `index.html`, so a
second layout has nowhere to put its own scenery.

## Architecture

### Semantic slots

Core code stops referring to furniture by name. It refers to a **slot**, and
the active theme supplies that slot's coordinates, facing, and label. Every
theme must fill the full slot set; validation refuses to activate a theme that
does not.

| Slot | Office | Hidden Leaf |
| --- | --- | --- |
| `ORCHESTRATOR_HOME` | Claude's desk | Hokage desk |
| `THINK_SPOT` | Whiteboard | Mission scroll board |
| `BREAK_SPOT` | Coffee area | Ichiraku ramen stand |
| `AMBIENT_SPOT` | Window | Village gate |
| `GATHER_SPOT` | Center area | Training ground |
| `WORKER_1` – `WORKER_4` | Four team desks | Four training posts |
| `OVERFLOW_1` – `OVERFLOW_6` | Stations 1-6 | Rooftop perches 1-6 |

Waypoints remain theme-private. Only a theme's own edges reference them, so
they need no shared contract.

### Theme object

```js
OV.Themes.register({
  id: 'leaf',
  name: 'Hidden Leaf',
  slots:      { ORCHESTRATOR_HOME: { x, y, face, label }, /* ...full set... */ },
  waypoints:  { WP_GATE: { x, y }, /* ... */ },
  edges:      [['ORCHESTRATOR_HOME', 'WP_GATE'], /* ... */],
  furniture:  [{ id, x, y, label, sprite }],
  cast:       [{ slot, id, name, role, sprite, color }],
  castByType: { builder: 'sasuke', debugger: 'kakashi', /* ... */ },
  assets:     { base: 'assets/themes/leaf/', floor: 'village-floor.webp' },
  palette:    { '--floor': '#3f7d4a', '--accent': '#ff9c3f' },
  effects:    { spawn: 'jutsu', despawn: 'poof' },
});
```

`Themes.apply(id)` validates before switching: every required slot present,
every edge endpoint resolvable to a known slot or waypoint, every cast entry
bound to an existing slot. A theme that fails validation is rejected, the
current theme stays active, and the reason is logged. A malformed theme file
can never leave the user with a broken floor.

### Casting live subagents

The `cast` array binds the fixed roster to slots. Live subagents, however,
arrive from the bridge identified by `subagent_type`, and there may be more of
them than there are cast entries.

`castByType` maps a `subagent_type` to a cast member, so a live `builder`
subagent renders as Sasuke, a `debugger` as Kakashi, and so on. Any subagent
whose type has no mapping — and any spawn beyond the five cast members —
renders as the clone variant: the Naruto sprite at reduced opacity with a
chakra-blue outline, its name tag carrying the real `subagent_type`. This keeps
ten concurrent subagents readable while staying true to the premise that
everything the orchestrator dispatches is one of its own shadow clones.

The office theme has no `castByType`; unmapped subagents keep today's generic
robot emoji.

### Data flow on theme switch

```
themes/office.js ─┐
themes/leaf.js  ──┴─> Themes.register() ─> Themes.apply(id)
                                             │
        ┌────────────────────┬───────────────┴───────┬─────────────────────┐
        v                    v                       v                     v
   Nav.rebuild()      World.renderFloor()      World.reset()      CSS custom properties
   (new export)       (furniture from data)    (roster from       set on <body>,
                                                theme.cast)       data-theme="leaf"
```

The bridge (`js/bridge.js`) is deliberately outside this flow. Its EventSource
is never torn down by a theme switch.

### Per-file changes

- **`js/themes/index.js`** (new): registry, validation, `apply()`, and
  persistence of the last chosen theme in `localStorage`, wrapped in try/catch
  so a storage-blocked browser still loads the default theme.
- **`js/themes/office.js`** (new): the current layout, moved verbatim out of
  `config.js` and `index.html`, renamed onto slots.
- **`js/themes/leaf.js`** (new): the Hidden Leaf layout and cast.
- **`js/effects.js`** (new): spawn and despawn effect implementations, selected
  by `theme.effects`. Office uses `none`, which preserves today's behavior.
- **`js/nav.js`**: wrap the node and adjacency build in
  `rebuild(slots, waypoints, edges)` and export it. `route()` unchanged.
- **`js/config.js`**: keeps `STATES` and the tuning `CONFIG`. `LOCATIONS`,
  `WAYPOINTS`, `EDGES`, and `AGENT_DEFS` move into `themes/office.js`.
  `OV.LOCATIONS` becomes a live reference that the active theme replaces.
- **`js/world.js`**: add `renderFloor(theme)` to build furniture elements from
  data, and `applyTheme(id)` to stop the loop, clear the floor, rebuild
  navigation, re-add the cast, and restart.
- **`js/agent.js`**: `.agent-sprite` uses a background image when the cast entry
  provides `sprite`, otherwise the current emoji text node. A failed image load
  falls back to the emoji, so a missing asset degrades instead of rendering a
  broken image.
- **`js/events.js`**: `firstFreeDesk()` returns slot names
  (`WORKER_1`–`WORKER_4`, then `OVERFLOW_1`–`OVERFLOW_6`).
- **`js/simulation.js`**: hardcoded location names become slot names. Story
  strings stay theme-neutral.
- **`index.html`**: delete the hardcoded furniture block; add the theme toggle
  to the toolbar.
- **`css/styles.css`**: scope theme-varying colors to custom properties, add the
  jutsu and smoke keyframes.
- **`package.json`**: add `"assets/"` to `files`.

## Assets

Six generated images, produced with the Higgsfield MCP tools and committed
under `assets/themes/leaf/`.

| Asset | Dimensions | Approx. size |
| --- | --- | --- |
| `village-floor.webp` | 1600 x 1000 | 200 KB |
| `naruto.webp`, `sasuke.webp`, `kakashi.webp`, `sakura.webp`, `shikamaru.webp` | 512 x 512 | 30 KB each |

Village scenery — Hokage tower, ramen stand, training posts, scroll board,
gate — is painted into the floor image rather than shipped as separate
furniture sprites. The corresponding `furniture` entries become invisible
hotspots that carry only a label and slot coordinates, positioned to match the
painted art. This removes five generations and guarantees the scenery lines up.

Two elements stay in code rather than becoming assets:

- **Smoke puff**: CSS radial-gradient particles. Animates better than a sprite
  sheet and costs no package weight.
- **Clone variant**: `naruto.webp` at `opacity: .85` with a chakra-blue outline.

Each character has one sprite. Left-facing uses `transform: scaleX(-1)`;
up-facing and down-facing reuse the same art, matching how the emoji sprites
behave today.

Pipeline: `generate_image_batch` for all six, `remove_background` on the five
characters, then save to `assets/themes/leaf/`. Total added package weight is
roughly 350 KB.

### Intellectual property

Naruto is licensed intellectual property of Shueisha and Pierrot. Generated
lookalike sprites and canon character names are fan work: acceptable for local
and personal use, but a trademark and copyright exposure in a package published
to the public npm registry.

The theme file therefore carries a single switch:

```js
// Canon names are fan work. Set to false before publishing to npm.
const CANON_NAMES = true;
// true  -> Naruto, Sasuke, Kakashi, Sakura, Shikamaru
// false -> Hokage, Blade, Copy-nin, Petal, Shadow
```

The README documents this flag in the release checklist. The decision to
publish with canon names belongs to the repository owner.

## Shadow clone choreography

On `SUBAGENT_START`, roughly 1.15 seconds:

| Time | Action |
| --- | --- |
| 0 ms | Orchestrator cancels any walk, faces down, gains `.jutsu-seal` and a chakra glow |
| 300 ms | `say("Kage Bunshin no Jutsu!")`, reusing the existing bubble system |
| 400 ms | Smoke burst element spawns at the orchestrator's position plus a 6% x offset |
| 650 ms | Clone agent is created inside the smoke, fades in, gains `.is-clone` |
| 850 ms | Clone walks to its `WORKER_n` or `OVERFLOW_n` slot via the existing walk system |
| 1150 ms | Orchestrator is restored to its prior state |

On `SUBAGENT_STOP`, the clone plays a 250 ms smoke puff, then the existing
retire path removes it.

### Backpressure

Claude Code dispatches `Task` calls in parallel. Ten rituals played serially at
1.15 s each would run roughly eleven seconds behind reality, which defeats the
purpose of a live visualizer.

Rituals run serially through `Effects.queue`. At dequeue time, if the queue
depth exceeds two, the remaining spawns degrade to a fast poof: 350 ms, no seal
pose. Visuals therefore never lag live events by more than about one second.
Every spawn still produces its event-log row regardless of which path it takes.

Under `@media (prefers-reduced-motion: reduce)`, the smoke and seal pose are
skipped and the clone simply fades in.

## Testing

The repository has no test framework. CI (`.github/workflows/ci.yml`) runs
`node --check` per file, validates JSON, and smoke-tests the bridge. The plan
matches that bar and extends it:

1. **Fix the CI glob.** The syntax-check step iterates `js/*.js`, which does not
   match `js/themes/*.js`. Change it to a recursive `find`, otherwise the new
   theme files ship unchecked.
2. **Add a theme-contract validation script** to CI: load each registered theme
   and assert that every required slot is present, that every edge endpoint
   resolves to a known slot or waypoint, and that every referenced asset file
   exists on disk. This catches the entire class of "theme file typo, agents
   walk into walls" failures before merge.
3. **Manual browser verification** of both themes:
   - Office theme renders identically to v1.0.2.
   - Hidden Leaf theme at ten concurrent agents, the crowding case tuned in
     v1.0.2.
   - Toggling themes during a live bridge run keeps the SSE connection open and
     the event stream flowing.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Office theme regresses during the extraction from `config.js` and `index.html` | Extraction is verbatim: same coordinates, same labels. Verified by side-by-side comparison against the v1.0.2 screenshot in `docs/office.jpg`. |
| Village nav graph routes agents through painted scenery | Same discipline as the office graph: every edge is a hand-checked, obstacle-free straight line. CI validates connectivity; the manual pass validates the visuals. |
| Ritual animation falls behind live parallel dispatch | Queue depth degrades to fast poof beyond two pending spawns. |
| Missing or failed asset load | Sprites fall back to emoji; the floor image falls back to the palette background color. |
| Published package carries IP exposure | `CANON_NAMES` flag, documented in the README release checklist. |

## Open decisions deferred to implementation

None. The design is complete as specified.
