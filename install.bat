@echo off
chcp 65001 >nul
echo [Zulgap] Setting up... (details below in Korean)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
echo.
echo Done. Press any key to close.
pause >nul
