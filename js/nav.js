/*
 * nav.js
 * Office navigation: builds the waypoint graph from config and answers
 * "how do I walk from here to LOCATION_X without crossing furniture?".
 *
 * Deliberately simple (Dijkstra over a hand-authored graph). Because every
 * graph edge is a desk-free straight line, any route made only of graph edges
 * is automatically obstacle-free. Swapping in a real planner later means
 * replacing `route()` — nothing else in the app needs to change.
 */
(function (OV) {
  'use strict';

  // Merge named locations and hallway waypoints into one node table.
  const nodes = {};
  Object.keys(OV.LOCATIONS).forEach(function (name) {
    nodes[name] = { x: OV.LOCATIONS[name].x, y: OV.LOCATIONS[name].y };
  });
  Object.keys(OV.WAYPOINTS).forEach(function (name) {
    nodes[name] = { x: OV.WAYPOINTS[name].x, y: OV.WAYPOINTS[name].y };
  });

  // Undirected adjacency list.
  const adj = {};
  Object.keys(nodes).forEach(function (n) { adj[n] = []; });
  OV.EDGES.forEach(function (pair) {
    const a = pair[0];
    const b = pair[1];
    if (!nodes[a] || !nodes[b]) {
      console.warn('nav: edge references unknown node', pair);
      return;
    }
    if (adj[a].indexOf(b) === -1) adj[a].push(b);
    if (adj[b].indexOf(a) === -1) adj[b].push(a);
  });

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

  // Dijkstra shortest path (by euclidean edge length). Returns an array of node
  // names from `start` to `goal` inclusive, or [goal] if unreachable/same.
  function findPath(start, goal) {
    if (start === goal) return [goal];
    const dst = {};
    const prev = {};
    const visited = {};
    Object.keys(nodes).forEach(function (n) { dst[n] = Infinity; });
    dst[start] = 0;

    while (true) {
      // pick nearest unvisited
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

  /*
   * route(currentPos, destName) -> array of {x, y} world points.
   * The agent should move through these points in order. The first point is the
   * agent's current position (so movement starts smoothly from wherever it is),
   * the last is the destination location.
   */
  function route(currentPos, destName) {
    if (!nodes[destName]) {
      console.warn('nav: unknown destination', destName);
      return [{ x: currentPos.x, y: currentPos.y }];
    }
    const start = nearestNode(currentPos);
    const names = findPath(start, destName);
    const pts = names.map(function (n) { return { x: nodes[n].x, y: nodes[n].y }; });
    // Prepend the true current position unless we're already sitting on `start`.
    if (dist(currentPos, nodes[start]) > 0.5) {
      pts.unshift({ x: currentPos.x, y: currentPos.y });
    }
    return pts;
  }

  OV.Nav = {
    nodes: nodes,
    route: route,
    findPath: findPath,
    nearestNode: nearestNode,
    dist: dist,
  };
})(window.OV = window.OV || {});
