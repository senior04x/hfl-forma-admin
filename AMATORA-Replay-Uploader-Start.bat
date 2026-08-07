@echo off
title AMATORA OBS Replay Auto-Uploader
color 0A
cls
echo =========================================================
echo ⚽ AMATORA OBS REPLAY AUTO-UPLOADER SERVICE
echo 📁 Kuzatilayotgan papka: C:\Replays
echo =========================================================
echo.
if exist "AMATORA-Replay-Uploader.exe" (
    AMATORA-Replay-Uploader.exe
) else (
    node obs-replay-uploader.js
)
pause
