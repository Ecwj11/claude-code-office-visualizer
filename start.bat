@echo off
REM Double-click launcher (Windows). Starts the bridge and opens the office.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required for LIVE mode. Install it from https://nodejs.org
  echo You can still open index.html directly for SIMULATION mode.
  pause
  exit /b 1
)
echo Starting Agent Office...  (close this window to stop)
start "" "http://localhost:4319/"
node bridge\server.js
