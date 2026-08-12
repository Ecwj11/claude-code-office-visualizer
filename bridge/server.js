#!/usr/bin/env node
/*
 * bridge/server.js
 * Zero-dependency local bridge between Claude Code hooks and the office
 * visualizer. It does three things:
 *
 *   1. Serves the visualizer static files (so one command runs everything).
 *   2. Accepts hook events via  POST /hook   (a Claude Code command hook curls
 *      the event JSON here on stdin).
 *   3. Streams those events to the browser via  GET /events  (Server-Sent
 *      Events) — the page's js/bridge.js connects here and animates the office.
 *
 * No npm install, no framework. Node's built-in http/fs only.
 *
 *   node bridge/server.js            # port 4319
 *   PORT=5000 node bridge/server.js  # custom port
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '4319', 10);
const ROOT = path.resolve(__dirname, '..'); // project root (index.html lives here)

// ---- SSE client registry -------------------------------------------------
/** @type {Set<import('http').ServerResponse>} */
const clients = new Set();
// Keep a small backlog so a page that connects mid-session can catch up.
const backlog = [];
const BACKLOG_MAX = 50;

function broadcast(event) {
  const line = 'data: ' + JSON.stringify(event) + '\n\n';
  backlog.push(event);
  if (backlog.length > BACKLOG_MAX) backlog.shift();
  for (const res of clients) {
    try { res.write(line); } catch (_) { /* dropped below on close */ }
  }
}

// ---- static file serving -------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  // prevent path traversal
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---- request routing -----------------------------------------------------
const server = http.createServer((req, res) => {
  // Permissive CORS so a page served from file:// or another port can connect.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const urlPath = req.url.split('?')[0];

  // --- SSE stream for the browser ---
  if (req.method === 'GET' && urlPath === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('retry: 2000\n\n');
    // replay recent backlog so a freshly-opened page isn't empty
    for (const ev of backlog) res.write('data: ' + JSON.stringify(ev) + '\n\n');
    res.write('data: ' + JSON.stringify({ type: 'BRIDGE_CONNECTED' }) + '\n\n');
    clients.add(res);
    const keepAlive = setInterval(() => { try { res.write(': ping\n\n'); } catch (_) {} }, 25000);
    req.on('close', () => { clearInterval(keepAlive); clients.delete(res); });
    return;
  }

  // --- hook intake from Claude Code ---
  if (req.method === 'POST' && urlPath === '/hook') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      let payload = null;
      try { payload = body ? JSON.parse(body) : {}; } catch (_) { payload = { raw: body }; }
      broadcast({ type: 'HOOK', payload: payload, at: Date.now() });
      // Respond fast & permissively — hooks must never block Claude Code.
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
      const name = payload && (payload.hook_event_name || payload.hookEventName);
      console.log('hook →', name || '(unknown)', payload && payload.tool_name ? '· ' + payload.tool_name : '');
    });
    return;
  }

  // --- health check ---
  if (req.method === 'GET' && urlPath === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, clients: clients.size }));
    return;
  }

  // --- everything else: static files ---
  if (req.method === 'GET') { serveStatic(req, res); return; }

  res.writeHead(405); res.end('Method not allowed');
});

function start(port) {
  port = port || PORT;
  server.listen(port, () => {
    console.log('Agent Office bridge running:');
    console.log('  Visualizer : http://localhost:' + port + '/');
    console.log('  SSE stream : http://localhost:' + port + '/events');
    console.log('  Hook intake: POST http://localhost:' + port + '/hook');
    console.log('Waiting for Claude Code hook events…');
  });
  return server;
}

// Run directly (`node bridge/server.js`) → start immediately.
// Required as a module (`bridge/cli.js`) → caller decides when to start.
if (require.main === module) start();

module.exports = { start: start, server: server, PORT: PORT };
