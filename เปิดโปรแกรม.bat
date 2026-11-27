@echo off
setlocal
pushd "%~dp0"

if "%WORKLOG_SYNC%"=="1" goto :sync
if "%~1"=="--no-browser" goto :sync

if exist "app\launch.vbs" (
  start "" wscript.exe //NoLogo "app\launch.vbs"
  popd
  exit /b 0
)
if exist "scripts\launch.vbs" (
  start "" wscript.exe //NoLogo "scripts\launch.vbs"
  popd
  exit /b 0
)

:sync
set "NODE_EXE="
if exist "runtime\node.exe" set "NODE_EXE=runtime\node.exe"
if not defined NODE_EXE if exist "runtime\bin\node.exe" set "NODE_EXE=runtime\bin\node.exe"
if not defined NODE_EXE if exist "C:\Program Files\nodejs\node.exe" set "NODE_EXE=C:\Program Files\nodejs\node.exe"
if not defined NODE_EXE (
  for /f "delims=" %%I in ('where node.exe 2^>nul') do (
    if not defined NODE_EXE set "NODE_EXE=%%I"
  )
)

set "LAUNCHER_SCRIPT="
if exist "app\launcher.mjs" set "LAUNCHER_SCRIPT=app\launcher.mjs"
if not defined LAUNCHER_SCRIPT if exist "scripts\launcher.mjs" set "LAUNCHER_SCRIPT=scripts\launcher.mjs"

if not defined NODE_EXE goto :fallback
if not defined LAUNCHER_SCRIPT goto :fallback

"%NODE_EXE%" "%LAUNCHER_SCRIPT%" %*
set "EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %EXIT_CODE%

:fallback
if exist "app\launch.vbs" (
  wscript.exe //NoLogo "app\launch.vbs"
  popd
  exit /b %ERRORLEVEL%
)
if exist "scripts\launch.vbs" (
  wscript.exe //NoLogo "scripts\launch.vbs"
  popd
  exit /b %ERRORLEVEL%
)
popd
exit /b 1
