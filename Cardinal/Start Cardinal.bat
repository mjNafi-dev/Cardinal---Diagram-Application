@echo off
title Cardinal (browser mode)
rem Browser mode: runs Cardinal in your web browser through a tiny local server (needs Node.js, not Rust).
rem The desktop app (build.bat or the installer) is the usual way; this stays as a fallback.
cd /d "%~dp0"
if not exist dist\index.html (
  echo Building the web app first...
  if not exist node_modules call npm install --no-audit --no-fund
  call npm run build
  if errorlevel 1 ( pause & exit /b 1 )
)
node server\serve.mjs --open
if errorlevel 1 pause
