@echo off
chcp 65001 >nul
title P-Sale Ultra Cloud - Restore Assistant
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0restore-manager.ps1"
pause
