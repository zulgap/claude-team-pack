@echo off
chcp 65001 >nul
echo 줄갭 팀원 Claude Code 셋업을 시작합니다...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
echo.
echo 설치 창을 닫으려면 아무 키나 누르세요.
pause >nul
