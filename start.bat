@echo off
cd /d "%~dp0backend"

if not exist ".env" (
  if exist ".env.example" (
    copy ".env.example" ".env" >nul
    echo [INFO] .env created from .env.example
  )
)

if not exist ".venv" (
  echo [1/2] Creating virtual environment...
  python -m venv .venv
  echo [2/2] Installing dependencies...
  .venv\Scripts\pip install -r requirements.txt -q
  echo Done.
)

echo.
echo Server starting... visit http://localhost:8000
echo Press Ctrl+C to stop.
echo.

.venv\Scripts\python main.py
pause
