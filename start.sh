#!/bin/bash
# Launcher (Linux / macOS terminal). Starts the bridge and opens the office.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required for LIVE mode. Install it from https://nodejs.org"
  echo "You can still open index.html directly for SIMULATION mode."
  exit 1
fi
open_cmd="xdg-open"
command -v open >/dev/null 2>&1 && open_cmd="open"
echo "Starting Agent Office…  (press Ctrl+C to stop)"
( sleep 1; "$open_cmd" "http://localhost:4319/" >/dev/null 2>&1 ) &
node bridge/server.js
