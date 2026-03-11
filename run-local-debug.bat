@echo off
setlocal

cd /d "%~dp0"

echo [JOJ] Local debug launcher (Windows)
echo [JOJ] Project: %CD%
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not in PATH.
  echo [HINT] Install Node.js LTS and reopen CMD/PowerShell.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm is not available in PATH.
  echo [HINT] Reinstall Node.js or reopen terminal after install.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [JOJ] node_modules not found. Running npm install...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
  echo.
)

if not defined FRONTEND_ORIGIN (
  set "FRONTEND_ORIGIN=http://localhost:5173"
)

echo [JOJ] Cleaning up old local debug listeners on ports 5173 and 8000...
for %%P in (5173 8000) do (
  for /f "tokens=5" %%I in ('netstat -ano ^| findstr /R /C:":%%P .*LISTENING"') do (
    echo [JOJ] taskkill /PID %%I on port %%P
    taskkill /PID %%I /F >nul 2>nul
  )
)
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ports = @(5173,8000); $listenerIds = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $ports -contains $_.LocalPort } | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($procId in $listenerIds) { try { Stop-Process -Id $procId -Force -ErrorAction Stop; Write-Host ('[JOJ] Stopped listener PID=' + $procId) } catch {} }; $projectPath = [regex]::Escape((Get-Location).Path); $nodeProcIds = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^(node|npm|npx)(\\.exe)?$' -and $_.CommandLine -match $projectPath } | Select-Object -ExpandProperty ProcessId -Unique; foreach ($procId in $nodeProcIds) { try { Stop-Process -Id $procId -Force -ErrorAction Stop; Write-Host ('[JOJ] Stopped project PID=' + $procId) } catch {} }"
timeout /t 2 /nobreak >nul

echo [JOJ] Starting local debug servers...
echo [JOJ] Web:    http://localhost:5173
echo [JOJ] Admin:  http://localhost:5173/admin
echo [JOJ] Server: http://localhost:8000/api/health
if defined ADMIN_TOKEN (
  echo [JOJ] Admin auth: enabled from current environment
) else (
  echo [JOJ] Admin auth: will be resolved by server from .env or current environment
)
echo.
echo [JOJ] Press Ctrl+C to stop.
echo.

call npm run dev:full
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%EXIT_CODE%"=="0" (
  echo [JOJ] Launcher exited with code %EXIT_CODE%.
) else (
  echo [JOJ] Launcher stopped.
)

pause
exit /b %EXIT_CODE%
