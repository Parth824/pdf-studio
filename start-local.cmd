@echo off
cd /d "%~dp0"
if not exist node_modules call npm.cmd install
if not exist .venv\Scripts\python.exe call npm.cmd run setup:engine
.venv\Scripts\python.exe engine\office_service.py --auto-start
echo.
echo PDF Studio will be available at http://localhost:3000
echo Keep this window open while using the app. Press Ctrl+C to stop.
echo.
if exist .next\BUILD_ID (
  call npm.cmd start
) else (
  call npm.cmd run dev
)
