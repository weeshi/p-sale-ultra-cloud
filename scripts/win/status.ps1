# P-Sale Ultra Cloud - Service Status (Windows)
# Usage: .\scripts\win\status.ps1

$HEALTH_TIMEOUT = 5

Write-Host "=== P-Sale Ultra Cloud - Service Status ===" -ForegroundColor Cyan
Write-Host ""

# Check PM2 is installed
$pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
if (-not $pm2) {
    Write-Host "ERROR: pm2 not found. Install: npm install -g pm2" -ForegroundColor Red
    exit 1
}

# PM2 status
Write-Host "--- PM2 Processes ---" -ForegroundColor White
pm2 status
Write-Host ""

# Server health
Write-Host "--- Health Checks ---" -ForegroundColor White
$serverOk = $false
try {
    $resp = Invoke-WebRequest -Uri "http://localhost:3005/api/health" -TimeoutSec $HEALTH_TIMEOUT -UseBasicParsing -ErrorAction Stop
    $serverOk = $resp.StatusCode -eq 200
    $body = $resp.Content | ConvertFrom-Json
    Write-Host "OK  Server   : online (port 3005) - db: $($body.db) - uptime: $([math]::Round($body.uptime, 0))s" -ForegroundColor Green
} catch {
    Write-Host "!!  Server   : unreachable on port 3005" -ForegroundColor Red
}

# Client health
$clientOk = $false
try {
    $resp = Invoke-WebRequest -Uri "http://localhost:5175" -TimeoutSec $HEALTH_TIMEOUT -UseBasicParsing -ErrorAction Stop
    $clientOk = $resp.StatusCode -eq 200
    Write-Host "OK  Client   : online (port 5175)" -ForegroundColor Green
} catch {
    Write-Host "!!  Client   : unreachable on port 5175" -ForegroundColor Red
}

Write-Host ""

# Summary
if ($serverOk -and $clientOk) {
    Write-Host "All services healthy." -ForegroundColor Green
} elseif (-not $serverOk -and -not $clientOk) {
    Write-Host "All services down. Start: .\scripts\win\start.ps1" -ForegroundColor Red
} else {
    Write-Host "Partial outage. Restart: .\scripts\win\restart.ps1" -ForegroundColor Yellow
}
