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
