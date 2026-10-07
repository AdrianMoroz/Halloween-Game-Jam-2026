@echo off
cd /d "%~dp0"
where py >nul 2>&1
if %errorlevel% equ 0 (
    py -3 serve.py
) else (
    where python >nul 2>&1
    if errorlevel 1 (
        echo Python 3 is required for this launcher.
        echo You can also serve this folder with VS Code Live Server.
        pause
        exit /b 1
    )
    python serve.py
)
pause
