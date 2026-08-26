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

  // castByType targets. A value naming a cast id that does not exist makes that
  // subagent type fall through to the unmapped-clone path instead of borrowing the
  // intended character — silently, with nothing to fail.
  const castIds = {};
  (theme.cast || []).forEach((c) => { castIds[c.id] = true; });
  Object.keys(theme.castByType || {}).forEach((type) => {
    const target = theme.castByType[type];
    if (!castIds[target]) {
      problems.push('castByType["' + type + '"] names unknown cast id: ' + target);
    }
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
