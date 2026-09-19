@echo off
setlocal
title WholesaleOS Local Comp Helper
set "CURSOR_NODE=%LOCALAPPDATA%\Programs\cursor\resources\app\resources\helpers\node.exe"
if exist "%CURSOR_NODE%" (
  set "WOS_NODE=%CURSOR_NODE%"
) else (
  set "WOS_NODE=node"
)
"%WOS_NODE%" "%~dp0wos-local-helper.js" --print-config-directory
if errorlevel 1 goto helper_failed
"%WOS_NODE%" "%~dp0wos-local-helper.js"
if errorlevel 1 goto helper_failed
exit /b 0

:helper_failed
echo.
echo The WholesaleOS helper could not start. The message above lists every attempted folder.
echo Set WOS_HELPER_HOME to a folder you can write to, then start this file again.
pause
exit /b 1
