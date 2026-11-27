@echo off
setlocal
pushd "%~dp0"

set "NODE_EXE="
if exist "runtime\node.exe" set "NODE_EXE=runtime\node.exe"
if not defined NODE_EXE if exist "C:\Program Files\nodejs\node.exe" set "NODE_EXE=C:\Program Files\nodejs\node.exe"
if not defined NODE_EXE (
  for /f "delims=" %%I in ('where node.exe 2^>nul') do (
    if not defined NODE_EXE set "NODE_EXE=%%I"
  )
)

set "SCRIPT_FILE=app\shortcut.mjs"
if not exist "%SCRIPT_FILE%" set "SCRIPT_FILE=scripts\shortcut.mjs"

if not defined NODE_EXE (
  popd
  exit /b 1
)
if not exist "%SCRIPT_FILE%" (
  popd
  exit /b 1
)

"%NODE_EXE%" "%SCRIPT_FILE%" autostart-toggle %*
set "EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %EXIT_CODE%
