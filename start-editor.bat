@echo off
setlocal
cd /d "%~dp0"

where pnpm >nul 2>&1
if errorlevel 1 (
    echo pnpm was not found. Install pnpm first, then run this file again.
    pause
    exit /b 1
)

pnpm editor
if errorlevel 1 (
    echo.
    echo The editor stopped with an error. Check the message above.
    pause
)
