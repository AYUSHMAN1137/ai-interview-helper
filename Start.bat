@echo off
set ELECTRON_RUN_AS_NODE=
cd /d "%~dp0"

if exist "node_modules\electron\dist\electron.exe" (
    start "" "node_modules\electron\dist\electron.exe" "."
) else if exist "node_modules\.bin\electron.cmd" (
    start "" "node_modules\.bin\electron.cmd" "."
) else (
    echo.
    echo [ERROR] Application is not set up yet!
    echo Please double-click 'setup.bat' first to install required components.
    echo.
    pause
)
