@echo off
title Our Little Secret - Dev Server
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please install it from https://nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [1/2] First run: installing packages...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

if not exist "public\assets\hdri\satara_night_no_lamps.hdr" (
  echo [2/2] Downloading assets, about 76 MB, one time only...
  call npm run assets
  if errorlevel 1 (
    echo [ERROR] Asset download failed. Check your network and run again.
    pause
    exit /b 1
  )
)

echo.
echo Starting... the browser will open automatically.
echo Close this window or press Ctrl+C to stop the server.
echo.
call npm run dev -- --open
pause
