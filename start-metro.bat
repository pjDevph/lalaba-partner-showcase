@echo off
set "PROJECT_DIR=%~dp0"
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"
set "EXPO_PROJECT_ROOT=%PROJECT_DIR%"
cd /d "%PROJECT_DIR%"
echo.
echo Starting from: %CD%
echo EXPO_PROJECT_ROOT: %EXPO_PROJECT_ROOT%
echo.
npx expo start "%PROJECT_DIR%" --clear
