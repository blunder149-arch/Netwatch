@echo off
title NETWATCH Launcher
color 0A
echo.
echo  ===========================================
echo    NETWATCH ^--- Network Threat Monitor
echo  ===========================================
echo.
echo  [1/2] Starting Python Backend (Port 5000)...
echo        ^(Run this script as Administrator!^)
echo.
start "NETWATCH Backend" cmd /k "cd /d %~dp0backend && python app.py"
timeout /t 2 /nobreak >nul
echo  [2/2] Starting React Frontend (Port 5173)...
start "NETWATCH Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
echo.
echo  =============================================
echo   Backend  ^-^> http://localhost:5000
echo   Frontend ^-^> http://localhost:5173
echo  =============================================
echo.
timeout /t 3 /nobreak >nul
start http://localhost:5173
