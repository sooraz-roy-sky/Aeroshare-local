@echo off
title AeroShare File Transfer Server
echo ============================================================
echo           Starting AeroShare Local Data Transfer...
echo ============================================================
cd /d "%~dp0"

:: Start a short delay trigger to open the web browser after server initializes
echo [Info] Launching browser at http://localhost:8080...
start "" "http://localhost:8080"

:: Run the unbuffered Python web server
python -u server.py

if %errorlevel% neq 0 (
    echo.
    echo [Error] The server exited with error code %errorlevel%.
    echo Please make sure Python is installed and added to your system PATH.
    pause
)
