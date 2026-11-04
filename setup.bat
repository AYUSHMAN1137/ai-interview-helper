@echo off
title AI Interview Helper - Automatic Setup
color 0A
cd /d "%~dp0"

echo ===================================================
echo     AI Interview Helper - First Time Setup
echo ===================================================
echo.

:: 1. Check if Node.js is installed
echo [1/3] Checking Node.js installation...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    color 0C
    echo [ERROR] Node.js is NOT installed on this computer!
    echo.
    echo Node.js is required to run this helper.
    echo Opening https://nodejs.org in your browser...
    echo.
    start https://nodejs.org/en/download/
    echo Please install Node.js (choose the LTS version), restart your
    echo computer or terminal, and double-click setup.bat again.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo   --^> Found Node.js version: %NODE_VER% (OK)
echo.

:: 2. Ensure .env file exists
if not exist ".env" (
    if exist ".env.example" (
        echo Copying default configuration...
        copy ".env.example" ".env" >nul
    )
)

:: 3. Install packages
echo [2/3] Installing dependencies (this takes 1-2 minutes)...
echo Please wait...
call npm install
if %errorlevel% neq 0 (
    echo.
    color 0C
    echo [ERROR] npm install encountered an error.
    echo Please check your internet connection and try running setup.bat again.
    pause
    exit /b 1
)
echo   --^> Dependencies installed successfully! (OK)
echo.

:: 4. Build application
echo [3/3] Compiling application...
call npm run build
if %errorlevel% neq 0 (
    echo.
    color 0C
    echo [ERROR] Build step failed.
    pause
    exit /b 1
)
echo   --^> Build completed successfully! (OK)
echo.

:: 5. Success Banner
color 0B
echo ===================================================
echo     SETUP COMPLETE AND READY TO USE!
echo ===================================================
echo.
echo For future interviews, you NEVER need to run setup.bat again.
echo Simply double-click:
echo   - Start.bat (Starts the assistant)
echo   OR
echo   - Start.vbs (Starts completely silently in background)
echo.
echo Shortcut Reminder:
echo   - Ctrl + Up   : Increase window opacity
echo   - Ctrl + Down : Decrease window opacity
echo   - Ctrl + Shift + H : Hide / Show window
echo   - Ctrl + Shift + P : Take screenshot and solve
echo   - Ctrl + Shift + M : Toggle microphone
echo.

set /p RUN_NOW="Would you like to start the application right now? (Y/N): "
if /i "%RUN_NOW%"=="Y" (
    echo Starting...
    start "" "Start.bat"
)

exit /b 0
