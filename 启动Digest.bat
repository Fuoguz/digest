@echo off
rem ============================================================
rem  Digest - Local Launcher  (Digest 本地启动器)
rem ------------------------------------------------------------
rem  NOTE: This file is intentionally ASCII-only. cmd.exe parses
rem  .bat files using the system ANSI/OEM codepage, so non-ASCII
rem  (Chinese) text inside a UTF-8 .bat gets garbled and can break
rem  parsing. Keep messages in ASCII for reliability.
rem
rem  It starts a local http:// server so the page (which uses ES
rem  modules) works. Double-click this file to run.
rem ============================================================
cd /d "%~dp0"
title Digest - Local Launcher

echo ============================================
echo    Digest  -  Local Launcher
echo ============================================
echo.

rem Prefer Node.js (most reliable; server.js auto-opens browser).
rem Fall back to Python if Node is missing.
rem goto-labels avoid the %errorlevel% delayed-expansion pitfall.

where node >nul 2>nul
if %errorlevel%==0 goto run_node

where py >nul 2>nul
if %errorlevel%==0 goto run_py

where python >nul 2>nul
if %errorlevel%==0 goto run_python

echo [!] Node.js or Python not found - cannot start local server.
echo.
echo Please install Node.js, then double-click this file again:
echo     https://nodejs.org/
echo.
pause
goto end

:run_node
echo Found Node.js. Starting server (browser opens automatically)...
echo Visit:  http://127.0.0.1:5180/
echo Close this window to stop the server.
echo.
node "%~dp0server.js"
goto end

:run_py
echo Found Python. Starting server...
echo Visit:  http://127.0.0.1:5180/
echo Close this window to stop the server.
echo.
start "" http://127.0.0.1:5180/
py -m http.server 5180
goto end

:run_python
echo Found Python. Starting server...
echo Visit:  http://127.0.0.1:5180/
echo Close this window to stop the server.
echo.
start "" http://127.0.0.1:5180/
python -m http.server 5180
goto end

:end
