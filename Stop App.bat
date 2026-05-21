@echo off
title Manufacturing OEE Platform - Stop
color 4F

echo ============================================================
echo   Stopping Manufacturing OEE Intelligence Platform
echo ============================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$logs = '%~dp0logs'; ^
   $stopped = 0; ^
   foreach ($pidFile in @('backend.pid','frontend.pid')) { ^
     $f = Join-Path $logs $pidFile; ^
     if (Test-Path $f) { ^
       $id = Get-Content $f -ErrorAction SilentlyContinue; ^
       if ($id -match '^\d+$') { ^
         Stop-Process -Id $id -Force -ErrorAction SilentlyContinue; ^
         Write-Host \"[OK] Stopped process $id ($pidFile)\" -ForegroundColor Green; ^
         $stopped++ ^
       } ^
       Remove-Item $f -Force -ErrorAction SilentlyContinue ^
     } ^
   } ^
   foreach ($port in @(3001, 5174)) { ^
     $pids = (netstat -ano | Select-String \":$port \") | ForEach-Object { ($_ -split '\s+')[-1] } | Sort-Object -Unique; ^
     foreach ($pid in $pids) { ^
       if ($pid -match '^\d+$' -and $pid -ne '0') { ^
         Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue; ^
         Write-Host \"[OK] Freed port $port (PID $pid)\" -ForegroundColor Green; ^
         $stopped++ ^
       } ^
     } ^
   } ^
   if ($stopped -eq 0) { Write-Host '[INFO] No running servers found.' -ForegroundColor Gray } ^
   Write-Host ''; ^
   Write-Host 'All servers stopped.' -ForegroundColor Green; ^
   Start-Sleep -Seconds 2"
