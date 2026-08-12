#!/usr/bin/env node
/*
 * bridge/cli.js
 * npx / launcher entry point. Starts the bridge server and opens the
 * visualizer in the default browser. `node bridge/server.js` stays pure
 * (no browser open) for headless / hook-only use.
 */
'use strict';

const { start, PORT } = require('./server.js');
const { spawn } = require('child_process');

start();

const url = 'http://localhost:' + PORT + '/';

function openBrowser(target) {
  const platform = process.platform;
  let cmd;
  let args;
  if (platform === 'darwin') { cmd = 'open'; args = [target]; }
  else if (platform === 'win32') { cmd = 'cmd'; args = ['/c', 'start', '', target]; }
  else { cmd = 'xdg-open'; args = [target]; }
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {
      console.log('Open this in your browser: ' + target);
    });
    child.unref();
  } catch (_) {
    console.log('Open this in your browser: ' + target);
  }
}

// Give the listener a beat, then open the browser.
setTimeout(function () { openBrowser(url); }, 500);
