@echo off
setlocal

cd /d "%~dp0"

echo [JOJ] Killing local JOJ game processes...
echo [JOJ] Project: %CD%
echo.

for %%P in (5173 8000) do (
  for /f "tokens=5" %%I in ('netstat -ano ^| findstr /R /C:":%%P .*LISTENING"') do (
    echo [JOJ] taskkill /PID %%I on port %%P
    taskkill /PID %%I /F >nul 2>nul
  )
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$projectPath = [regex]::Escape((Get-Location).Path); " ^
  "$procIds = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | " ^
  "Where-Object { $_.Name -match '^(node|npm|npx)(\\.exe)?$' -and $_.CommandLine -match $projectPath } | " ^
  "Select-Object -ExpandProperty ProcessId -Unique; " ^
  "foreach ($procId in $procIds) { try { Stop-Process -Id $procId -Force -ErrorAction Stop; Write-Host ('[JOJ] Stopped project PID=' + $procId) } catch {} }"

timeout /t 2 /nobreak >nul

echo.
echo [JOJ] Cleanup finished.
pause
exit /b 0
