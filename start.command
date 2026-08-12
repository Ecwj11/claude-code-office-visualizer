#!/bin/bash
# Double-click launcher (macOS). Starts the bridge and opens the office.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required for LIVE mode. Install it from https://nodejs.org"
  echo "You can still open index.html directly for SIMULATION mode."
  read -r -p "Press Enter to close…" _
  exit 1
fi
echo "Starting Agent Office…  (press Ctrl+C to stop)"
( sleep 1; open "http://localhost:4319/" ) &
node bridge/server.js
