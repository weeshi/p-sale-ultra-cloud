# P-Sale Ultra Cloud - Stop Services (Windows)
# Usage: .\scripts\win\stop.ps1

Write-Host "=== P-Sale Ultra Cloud - Stopping Services ===" -ForegroundColor Cyan
Write-Host ""

# Check PM2 is installed
$pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
if (-not $pm2) {
    Write-Host "ERROR: pm2 not found. Install: npm install -g pm2" -ForegroundColor Red
    exit 1
}

# Check if anything is running
$running = pm2 jlist 2>$null | ConvertFrom-Json
$serverRunning = $running | Where-Object { $_.name -eq "psale-server" -and $_.pm2_env.status -eq "online" }
$clientRunning = $running | Where-Object { $_.name -eq "psale-client" -and $_.pm2_env.status -eq "online" }

if (-not $serverRunning -and -not $clientRunning) {
    Write-Host "All services already stopped." -ForegroundColor Yellow
    exit 0
}

# Stop both
Write-Host "Stopping psale-server..." -ForegroundColor Yellow
pm2 stop psale-server 2>&1 | Out-Null

Write-Host "Stopping psale-client..." -ForegroundColor Yellow
pm2 stop psale-client 2>&1 | Out-Null

# Verify
Start-Sleep -Seconds 2
$final = pm2 jlist 2>$null | ConvertFrom-Json
$srv = $final | Where-Object { $_.name -eq "psale-server" -and $_.pm2_env.status -eq "online" }
$cli = $final | Where-Object { $_.name -eq "psale-client" -and $_.pm2_env.status -eq "online" }

Write-Host ""
if (-not $srv -and -not $cli) {
    Write-Host "OK  All services stopped." -ForegroundColor Green
} else {
    Write-Host "WARN  Some services may still be running. Check: pm2 status" -ForegroundColor Yellow
}
