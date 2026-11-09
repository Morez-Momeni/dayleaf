@echo off
cd /d "%~dp0"

if not exist "venv\Scripts\python.exe" (
    echo Virtual environment not found. Running installer...
    python setup.py
    if errorlevel 1 (
        echo.
        echo Installation failed. Please make sure Python 3.10+ is installed
        echo and the "Add Python to PATH" option was checked during installation.
        pause
        exit /b 1
    )
)

"venv\Scripts\python.exe" run.py
pause