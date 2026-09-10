# P-Sale Ultra Cloud - Start Services (Windows)
# Usage: .\scripts\win\start.ps1

$HEALTH_TIMEOUT = 5

Write-Host "=== P-Sale Ultra Cloud - Starting Services ===" -ForegroundColor Cyan
Write-Host ""

# Check PM2 is installed
$pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
if (-not $pm2) {
    Write-Host "ERROR: pm2 not found. Install: npm install -g pm2" -ForegroundColor Red
    exit 1
}

# Check if already running using pm2 list text output
$pm2list = pm2 list 2>$null
$serverRunning = $pm2list | Select-String "psale-server" | Select-String "online"
$clientRunning = $pm2list | Select-String "psale-client" | Select-String "online"

if ($serverRunning -and $clientRunning) {
    Write-Host "OK  Server   : online (port 3005)" -ForegroundColor Green
    Write-Host "OK  Client   : online (port 5175)" -ForegroundColor Green
    Write-Host ""
    Write-Host "All services already running." -ForegroundColor Yellow
    exit 0
}

# Start services via ecosystem
$ecosystemPath = Join-Path $PSScriptRoot "..\..\ecosystem.config.cjs"
if (-not (Test-Path $ecosystemPath)) {
    Write-Host "ERROR: ecosystem.config.cjs not found at $ecosystemPath" -ForegroundColor Red
    exit 1
}

Write-Host "Starting services..." -ForegroundColor Yellow
pm2 start $ecosystemPath 2>&1 | Out-Null

# Wait and verify (up to 10 seconds)
$maxWait = 10
$elapsed = 0
while ($elapsed -lt $maxWait) {
    Start-Sleep -Seconds 1
    $elapsed++
    $pm2list = pm2 list 2>$null
    $srv = $pm2list | Select-String "psale-server" | Select-String "online"
    $cli = $pm2list | Select-String "psale-client" | Select-String "online"
    if ($srv -and $cli) { break }
}

# Health check server
$serverOk = $false
try {
    $resp = Invoke-WebRequest -Uri "http://localhost:3005/api/health" -TimeoutSec $HEALTH_TIMEOUT -UseBasicParsing -ErrorAction Stop
    $serverOk = $resp.StatusCode -eq 200
} catch {}

# Health check client
$clientOk = $false
try {
    $resp = Invoke-WebRequest -Uri "http://localhost:5175" -TimeoutSec $HEALTH_TIMEOUT -UseBasicParsing -ErrorAction Stop
    $clientOk = $resp.StatusCode -eq 200
} catch {}

# Report
Write-Host ""
Write-Host "=== Service Status ===" -ForegroundColor Cyan

if ($serverOk) {
    Write-Host "OK  Server   : online (port 3005)" -ForegroundColor Green
} else {
    Write-Host "!!  Server   : started but health check failed" -ForegroundColor Yellow
}

if ($clientOk) {
    Write-Host "OK  Client   : online (port 5175)" -ForegroundColor Green
} else {
    Write-Host "!!  Client   : started but health check failed" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Dashboard: pm2 monit" -ForegroundColor DarkGray
Write-Host "Logs:      pm2 logs" -ForegroundColor DarkGray
