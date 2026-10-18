@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
where npm >nul 2>nul
if errorlevel 1 if exist "%ProgramFiles%\nodejs\npm.cmd" set "PATH=%ProgramFiles%\nodejs;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18 or later is required. Install it from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Reinstall Node.js and run this file again.
  pause
  exit /b 1
)

if not exist "node_modules\vite\bin\vite.js" (
  echo Installing frontend dependencies...
  call npm install
  if errorlevel 1 goto :failed
)

set "PYTHON_EXE="
set "PYTHON_ARGS="
if exist ".venv\Scripts\python.exe" (
  set "PYTHON_EXE=%CD%\.venv\Scripts\python.exe"
) else (
  where python >nul 2>nul
  if not errorlevel 1 (
    set "PYTHON_EXE=python"
  ) else (
    where py >nul 2>nul
    if not errorlevel 1 (
      set "PYTHON_EXE=py"
      set "PYTHON_ARGS=-3"
    )
  )
)
if not defined PYTHON_EXE (
  echo Python 3.10 or later is required. Install it and run this file again.
  pause
  exit /b 1
)

"%PYTHON_EXE%" %PYTHON_ARGS% -c "import fastapi, pandas, uvicorn" >nul 2>nul
if errorlevel 1 (
  echo Setting up the Python environment...
  if not exist ".venv\Scripts\python.exe" (
    "%PYTHON_EXE%" %PYTHON_ARGS% -m venv .venv
    if errorlevel 1 goto :failed
  )
  set "PYTHON_EXE=%CD%\.venv\Scripts\python.exe"
  set "PYTHON_ARGS="
  "%PYTHON_EXE%" -m pip install -r backend\requirements.txt
  if errorlevel 1 goto :failed
)

start "Northstar API" "%ComSpec%" /k ""%PYTHON_EXE%" %PYTHON_ARGS% -m uvicorn main:app --app-dir backend --reload"
start "Northstar Web" "%ComSpec%" /k "npm run dev -- --host 127.0.0.1"
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:5173"
echo Northstar is starting. Keep the API and Web windows open while using it.
exit /b 0

:failed
echo Setup failed. Check the error above, then run start-local.bat again.
pause
exit /b 1
