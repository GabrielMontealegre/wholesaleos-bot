@echo off
setlocal
title WholesaleOS Local Comp Helper
set "CURSOR_NODE=%LOCALAPPDATA%\Programs\cursor\resources\app\resources\helpers\node.exe"
if exist "%CURSOR_NODE%" (
  "%CURSOR_NODE%" "%~dp0wos-local-helper.js"
) else (
  node "%~dp0wos-local-helper.js"
)
if errorlevel 1 (
  echo.
  echo The WholesaleOS helper could not start. Keep this window open and report the message above.
  pause
)
