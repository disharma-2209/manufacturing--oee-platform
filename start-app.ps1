$root     = Split-Path -Parent $MyInvocation.MyCommand.Definition
$backend  = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$logs     = Join-Path $root "logs"

if (!(Test-Path $logs)) { New-Item -ItemType Directory -Path $logs | Out-Null }

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Manufacturing OEE Intelligence Platform" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# ── Locate Node.js ────────────────────────────────────────────────────────────
$nodePath = $null

# 1. WinGet install location
$wingetBase = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages"
if (Test-Path $wingetBase) {
    Get-ChildItem $wingetBase -Directory | Where-Object { $_.Name -like "OpenJS.NodeJS*" } | ForEach-Object {
        Get-ChildItem $_.FullName -Directory | Where-Object { $_.Name -like "node-v*" } | ForEach-Object {
            if (Test-Path (Join-Path $_.FullName "node.exe")) { $nodePath = $_.FullName }
        }
    }
}

# 2. Common install paths
if (!$nodePath) {
    foreach ($p in @(
        "C:\Program Files\nodejs",
        "$env:LOCALAPPDATA\Programs\nodejs",
        "$env:APPDATA\nvm\current"
    )) {
        if (Test-Path (Join-Path $p "node.exe")) { $nodePath = $p; break }
    }
}

# 3. Already on PATH
if (!$nodePath) {
    $found = Get-Command node -ErrorAction SilentlyContinue
    if ($found) { $nodePath = Split-Path $found.Source }
}

if (!$nodePath) {
    Write-Host "[ERROR] Node.js not found. Install from https://nodejs.org/" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

$env:PATH = "$nodePath;$env:PATH"
$npm = Join-Path $nodePath "npm.cmd"
Write-Host "[OK] Node.js found at: $nodePath" -ForegroundColor Green
Write-Host ""

# ── Copy .env if missing ──────────────────────────────────────────────────────
$envFile = Join-Path $backend ".env"
if (!(Test-Path $envFile)) {
    $envExample = Join-Path $root ".env.example"
    if (Test-Path $envExample) { Copy-Item $envExample $envFile }
    Write-Host "[WARN] backend\.env created - please set JWT_SECRET and ANTHROPIC_API_KEY" -ForegroundColor Yellow
}

# ── Install deps if missing ───────────────────────────────────────────────────
if (!(Test-Path (Join-Path $backend "node_modules"))) {
    Write-Host "[INFO] Installing backend dependencies..." -ForegroundColor Cyan
    Start-Process $npm "install" -WorkingDirectory $backend -Wait -WindowStyle Hidden
}
if (!(Test-Path (Join-Path $frontend "node_modules"))) {
    Write-Host "[INFO] Installing frontend dependencies..." -ForegroundColor Cyan
    Start-Process $npm "install" -WorkingDirectory $frontend -Wait -WindowStyle Hidden
}

# ── Free ports 3001 and 5178 ─────────────────────────────────────────────────
foreach ($port in @(3001, 5174, 5176, 5178)) {
    $lines = netstat -ano | Select-String ":$port\s"
    foreach ($line in $lines) {
        $procId = ($line.ToString().Trim() -split '\s+')[-1]
        if ($procId -match '^\d+$' -and $procId -ne '0') {
            Stop-Process -Id ([int]$procId) -Force -ErrorAction SilentlyContinue
            Write-Host "[INFO] Freed port $port (PID $procId)" -ForegroundColor Gray
        }
    }
}
Start-Sleep -Seconds 1

# ── Start backend (hidden background process) ─────────────────────────────────
Write-Host "[INFO] Starting backend on http://localhost:3001 ..." -ForegroundColor Cyan
$beOut = Join-Path $logs "backend.log"
$beErr = Join-Path $logs "backend-err.log"
$beProc = Start-Process $npm "run dev" -WorkingDirectory $backend -WindowStyle Hidden `
    -RedirectStandardOutput $beOut -RedirectStandardError $beErr -PassThru
$beProc.Id | Set-Content (Join-Path $logs "backend.pid")

# ── Wait for backend (poll /api/health up to 20s) ────────────────────────────
Write-Host "[INFO] Waiting for backend..." -ForegroundColor Gray
$backendReady = $false
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    try {
        Invoke-WebRequest "http://localhost:3001/api/health" -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop | Out-Null
        $backendReady = $true
        break
    } catch {}
}
if ($backendReady) {
    Write-Host "[OK] Backend is ready." -ForegroundColor Green
} else {
    Write-Host "[WARN] Backend did not respond in 20s - check logs\backend-err.log" -ForegroundColor Yellow
}

# ── Clear Vite cache to prevent stale module errors ─────────────────────────
$viteCache = Join-Path $frontend "node_modules\.vite"
if (Test-Path $viteCache) {
    Remove-Item -Recurse -Force $viteCache -ErrorAction SilentlyContinue
    Write-Host "[INFO] Cleared Vite cache" -ForegroundColor Gray
}

# ── Start frontend (hidden background process) ────────────────────────────────
Write-Host "[INFO] Starting frontend on http://localhost:5178 ..." -ForegroundColor Cyan
$feOut = Join-Path $logs "frontend.log"
$feErr = Join-Path $logs "frontend-err.log"
$feProc = Start-Process $npm "exec -- vite --port 5178 --force" -WorkingDirectory $frontend -WindowStyle Hidden `
    -RedirectStandardOutput $feOut -RedirectStandardError $feErr -PassThru
$feProc.Id | Set-Content (Join-Path $logs "frontend.pid")

# ── Wait for frontend (poll http://localhost:5178 up to 30s) ─────────────────
Write-Host "[INFO] Waiting for frontend..." -ForegroundColor Gray
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    try {
        Invoke-WebRequest "http://localhost:5178" -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop | Out-Null
        break
    } catch {}
}

# ── Open browser ──────────────────────────────────────────────────────────────
Write-Host "[INFO] Opening http://localhost:5178 in your browser..." -ForegroundColor Green
Start-Process "http://localhost:5178"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  App running at http://localhost:5178" -ForegroundColor Green
Write-Host "  Logs: $logs" -ForegroundColor Gray
Write-Host "  To stop servers: double-click 'Stop App.bat'" -ForegroundColor Gray
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to close this window (servers keep running in background)"
