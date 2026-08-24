@echo off
title P-Sale Ultra Cloud - Management
color 0B

:: Pre-flight: check pm2 and ecosystem
where pm2 >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: pm2 not found. Install: npm install -g pm2
    echo.
    pause
    exit /b 1
)

if not exist "%~dp0ecosystem.config.cjs" (
    echo ERROR: ecosystem.config.cjs not found at %~dp0ecosystem.config.cjs
    echo.
    pause
    exit /b 1
)

:MENU
cls
echo ============================================
echo   P-Sale Ultra Cloud - Service Manager
echo ============================================
echo.
echo   [1] Start all services
echo   [2] Stop all services
echo   [3] Restart all services
echo   [4] Show status
echo   [5] View logs (pm2 logs)
echo   [6] PM2 dashboard (pm2 monit)
echo.
echo   [0] Exit
echo.
echo ============================================
set /p choice="Select: "

if "%choice%"=="1" (
    call "%~dp0scripts\win\start.ps1"
    goto WAIT
)
if "%choice%"=="2" (
    call "%~dp0scripts\win\stop.ps1"
    goto WAIT
)
if "%choice%"=="3" (
    call "%~dp0scripts\win\restart.ps1"
    goto WAIT
)
if "%choice%"=="4" (
    call "%~dp0scripts\win\status.ps1"
    goto WAIT
)
if "%choice%"=="5" (
    pm2 logs
    goto MENU
)
if "%choice%"=="6" (
    pm2 monit
    goto MENU
)
if "%choice%"=="0" (
    exit /b 0
)

echo Invalid choice.
goto WAIT

:WAIT
echo.
echo ============================================
set /p dummy="Press Enter to return to menu..."
goto MENU
