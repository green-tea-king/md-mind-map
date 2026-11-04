@echo off
setlocal
if not exist "%~dp0index.html" (
  echo Cannot find index.html. Rebuild the project before starting MK2MD.
  pause
  exit /b 1
)
start "MK2MD" "%~dp0index.html"
