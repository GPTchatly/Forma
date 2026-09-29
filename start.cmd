@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 18.17 or newer. See README.md.
  pause
  exit /b 1
)
node server\index.mjs --open
if errorlevel 1 pause
