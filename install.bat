@echo off
chcp 65001 >nul
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo [Zulgap] Admin rights needed. Click YES on the security popup.
  powershell -NoProfile -Command "try { Start-Process -FilePath '%~f0' -Verb RunAs } catch { }"
  exit /b
)
echo [Zulgap] Setting up... (Korean details below)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
echo.
echo Done. Press any key to close.
pause >nul
