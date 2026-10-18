@echo off
setlocal
title Cardinal - build
rem Builds the Cardinal desktop app (debug profile) and starts it.
rem Projects are saved to Documents\Cardinal, same as before.
rem First time only, install: Node.js LTS (nodejs.org), Rust (rustup.rs) and the
rem Visual Studio "Desktop development with C++" tools. The README explains each one.

cd /d "%~dp0Cardinal"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)

rem rustup puts cargo here; a window opened before installing Rust doesn't know that yet
if exist "%USERPROFILE%\.cargo\bin\cargo.exe" set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
where cargo >nul 2>nul
if errorlevel 1 (
  echo Rust is not installed. Get it from https://rustup.rs - run rustup-init.exe and accept the defaults - then run this again.
  pause
  exit /b 1
)

echo Installing / updating dependencies...
call npm install --no-audit --no-fund
if errorlevel 1 goto fail

echo Building Cardinal (debug). The first build compiles Rust and takes a few minutes; later ones are quick.
call npm run tauri build -- --debug --no-bundle
if errorlevel 1 goto fail

echo.
echo Starting Cardinal...
start "" "%~dp0Cardinal\src-tauri\target\debug\cardinal.exe"
goto end

:fail
echo.
echo BUILD FAILED - see the messages above.
pause
exit /b 1

:end
endlocal
