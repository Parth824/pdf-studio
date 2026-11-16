@echo off
cd /d "%~dp0"
.venv\Scripts\python.exe scripts\setup-tunnel.py
if errorlevel 1 goto end
node scripts\share-local.mjs
:end
pause
