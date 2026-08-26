/*
 * nav.js
 * Office navigation: builds the waypoint graph from config and answers
 * "how do I walk from here to LOCATION_X without crossing furniture?".
 *
 * Deliberately simple (Dijkstra over a hand-authored graph). Because every
 * graph edge is a desk-free straight line, any route made only of graph edges
 * is automatically obstacle-free. Swapping in a real planner later means
 * replacing `route()` — nothing else in the app needs to change.
 *
 * rebuild(slots, waypoints, edges) makes the graph swappable at runtime for
 * theme switching. It replaces the Nav object's node table and recalculates
 * adjacency; all route and pathfinding functions read the current graph.
 */
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
