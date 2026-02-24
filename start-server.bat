@echo off
setlocal enabledelayedexpansion
echo ========================================
echo Starting ClientFlow Server
echo ========================================
echo.

REM Kill all nodemon processes
echo Checking for running nodemon processes...
tasklist /FI "IMAGENAME eq nodemon.exe" 2>NUL | find /I /N "nodemon.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo Found nodemon processes. Killing them...
    taskkill /F /IM nodemon.exe >NUL 2>&1
    timeout /t 1 /nobreak >NUL
)

REM Kill all node processes using port 3001
echo Checking for processes using port 3001...
netstat -ano | findstr :3001 >nul
if %errorlevel% == 0 (
    echo Port 3001 is in use. Finding and killing processes...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do (
        echo Killing process with PID: %%a
        taskkill /F /PID %%a >NUL 2>&1
    )
    echo Waiting 2 seconds for ports to be released...
    timeout /t 2 /nobreak >NUL
) else (
    echo Port 3001 is free.
)

echo.
echo Starting server on port 3001...
echo.
echo Keep this window open while using the application!
echo.
echo Press Ctrl+C to stop the server
echo.

cd /d "%~dp0"
npm run dev

pause
